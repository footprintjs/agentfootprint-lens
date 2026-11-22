import { own } from '../cursor/sourcePosition.js';
import type { HonestyEventAddress, RecordedTurnEvent } from './readTurnEvents.js';
import { readCallOccurrence } from './callOccurrence.js';
import type { ToolLedger } from './readToolLedger.js';

const started = 'agentfootprint.stream.tool_start';
const ended = 'agentfootprint.stream.tool_end';
const decision = 'agentfootprint.middleware.decision';

type Execution = 'ran' | 'not-run' | 'not-recorded';
type Outcome = 'returned' | 'failed' | 'refused' | 'skipped' | 'kept-out' | 'not-recorded';

const outcomes = new Map<string, string>([
  ['success', 'The tool reported success.'],
  ['failure', 'The tool reported failure.'],
  ['denied', 'The tool reported a denial.'],
  ['invalid', 'The tool reported an invalid request.'],
  ['partial', 'The tool reported a partial result.'],
  ['pending', 'The tool reported that its result was pending.'],
  ['absent', 'The tool reported no match within its search.'],
]);

export interface HonestyToolActivity {
  readonly name?: string;
  readonly request?: HonestyEventAddress;
  readonly end?: HonestyEventAddress;
  /** Position that supplied a committed fact used in this row. */
  readonly proof?: HonestyEventAddress;
  readonly execution: Execution;
  readonly outcome: Outcome;
  readonly sentence: string;
}

function identifier(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 ? value : undefined;
}

function skippedBeforeExecution(payload: object): boolean {
  const value = own(payload, 'notDispatched');
  if (value === null || typeof value !== 'object') return false;
  const paused = own(value, 'pausedCall');
  return paused !== null && typeof paused === 'object' &&
    identifier(own(paused, 'toolCallId')) !== undefined && identifier(own(paused, 'toolName')) !== undefined;
}

function requested(event: RecordedTurnEvent): HonestyToolActivity {
  const name = identifier(own(event.payload, 'toolName'));
  const skipped = skippedBeforeExecution(event.payload);
  return {
    ...(name !== undefined && { name }),
    request: event.address,
    execution: skipped ? 'not-run' : 'not-recorded',
    outcome: skipped ? 'skipped' : 'not-recorded',
    sentence: !skipped
      ? 'The tool was requested. The recording does not say whether it ran.'
      : 'The recording says the tool was skipped before execution.',
  };
}

function endedAt(event: RecordedTurnEvent, start?: HonestyToolActivity): HonestyToolActivity {
  if (start?.outcome === 'kept-out') return start;
  const addresses = { ...start, end: event.address };
  if (skippedBeforeExecution(event.payload)) {
    return { ...addresses, execution: 'not-run', outcome: 'skipped',
      sentence: 'The recording says the tool was skipped before execution.' };
  }
  if (own(event.payload, 'notExecuted') === true) {
    return { ...addresses, execution: 'not-run', outcome: 'refused',
      sentence: 'A rule refused the tool call before it ran.' };
  }
  const execution = own(event.payload, 'entered') === true ? 'ran' : 'not-recorded';
  if (own(event.payload, 'error') === true) {
    return { ...addresses, execution, outcome: 'failed',
      sentence: execution === 'ran' ? 'The tool ran and reported an error.' : 'The call failed. The recording does not say whether the tool ran.' };
  }
  const status = own(event.payload, 'status');
  const declared = typeof status === 'string' ? outcomes.get(status) : undefined;
  return {
    ...addresses, execution, outcome: 'returned',
    sentence: declared ?? (execution === 'ran' ? 'The tool ran and its result was recorded.' :
      'A return was recorded. The recording does not say whether the tool ran.'),
  };
}

function deniedResult(event: RecordedTurnEvent): boolean {
  return event.type === decision && own(event.payload, 'outcome') === 'deny' &&
    (own(event.payload, 'moment') === 'after-tool' ||
      (own(event.payload, 'at') === 'tool' && own(event.payload, 'phase') === 'output'));
}

function withLedger(row: HonestyToolActivity, key: string, ledger: ToolLedger): HonestyToolActivity {
  if (row.outcome === 'kept-out') return row;
  const settlement = ledger.settlements.get(key);
  const proof = ledger.address;
  if (settlement?.withheld === true) {
    return {
      ...(row.request !== undefined && { request: row.request }),
      ...(row.end !== undefined && { end: row.end }),
      proof,
      execution: 'ran',
      outcome: 'kept-out',
      sentence: 'A result was kept out by a rule.',
    };
  }
  if (row.execution === 'not-run') return row;
  if (settlement?.execution === 'not-entered') {
    return settlement.refused && row.execution !== 'ran' ? {
      ...row, proof, execution: 'not-run', outcome: 'refused', sentence: 'A rule refused the tool call before it ran.',
    } : row;
  }
  if (settlement?.execution === 'threw' || settlement?.failed === true) {
    return {
      ...row, proof, execution: 'ran', outcome: 'failed', sentence: 'The tool ran and the call failed.',
    };
  }
  if (settlement?.execution === 'returned-unserved') {
    return {
      ...row, proof, execution: 'ran', outcome: 'returned', sentence: 'The tool ran. Its result was not served.',
    };
  }
  if (row.execution === 'ran' || (settlement === undefined && !ledger.entered.has(key))) return row;
  if (row.outcome === 'failed') {
    return { ...row, proof, execution: 'ran', sentence: 'The tool ran and reported an error.' };
  }
  if (row.outcome === 'returned' || settlement?.execution === 'returned') {
    return {
      ...row, proof, execution: 'ran', outcome: 'returned',
      sentence: row.outcome === 'returned' && row.sentence.startsWith('The tool reported')
        ? row.sentence : 'The tool ran and its result was recorded.',
    };
  }
  return { ...row, proof, execution: 'ran', sentence: 'The recording says the tool ran.' };
}

/** Pair requests and outcomes by recorded identity, leaving ambiguous legacy IDs unjoined. */
export function readToolActivity(events: readonly RecordedTurnEvent[], ledger?: ToolLedger): readonly HonestyToolActivity[] {
  const rows: HonestyToolActivity[] = [];
  const pending = new Map<string, Set<number>>();
  const keysAt = new Map<number, string[]>();
  const occurrences = new Map<string, Set<number>>();
  for (const event of events) {
    const denied = deniedResult(event);
    if (event.type !== started && event.type !== ended && !denied) continue;
    const occurrence = readCallOccurrence(event.payload);
    const id = identifier(own(event.payload, 'toolCallId'));
    const occurrenceKey = typeof occurrence === 'string' ? `occurrence:${occurrence}` : undefined;
    const legacyKey = id === undefined || occurrence === null ? undefined : `call:${id}`;
    if (event.type === started) {
      const index = rows.length;
      rows.push(requested(event));
      const keys = [occurrenceKey, legacyKey].filter((key): key is string => key !== undefined);
      for (const key of keys) {
        const open = pending.get(key) ?? new Set<number>();
        open.add(index);
        pending.set(key, open);
      }
      keysAt.set(index, keys);
      if (typeof occurrence === 'string') rememberOccurrence(occurrence, index);
      continue;
    }

    const key = occurrenceKey ?? legacyKey;
    const open = key === undefined ? undefined : pending.get(key);
    const index = open?.size === 1 ? open.values().next().value : undefined;
    const request = index === undefined ? undefined : rows[index];
    if (denied) {
      const withheld: HonestyToolActivity = {
        ...(request?.request !== undefined && { request: request.request }),
        end: event.address,
        execution: 'not-recorded',
        outcome: 'kept-out',
        sentence: 'A result was kept out by a rule.',
      };
      if (index === undefined) rows.push(withheld);
      else rows[index] = withheld;
      continue;
    }

    const result = endedAt(event, request);
    if (typeof occurrence === 'string') rememberOccurrence(occurrence, index ?? rows.length);
    if (index === undefined) rows.push(result);
    else {
      rows[index] = result;
      for (const key of keysAt.get(index) ?? []) pending.get(key)?.delete(index);
    }
  }
  if (ledger !== undefined) {
    for (const [key, indexes] of occurrences) {
      const index = indexes.size === 1 ? indexes.values().next().value : undefined;
      if (index !== undefined) rows[index] = withLedger(rows[index]!, key, ledger);
    }
  }
  return rows;

  function rememberOccurrence(key: string, index: number): void {
    const indexes = occurrences.get(key) ?? new Set<number>();
    indexes.add(index);
    occurrences.set(key, indexes);
  }
}
