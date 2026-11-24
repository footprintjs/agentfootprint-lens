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
  const settlement = ledger.settlements.get(key);
  const proof = ledger.address;
  if (settlement?.withheld === true) return withheld({ ...row, proof }, 'ran');
  if (row.outcome === 'kept-out') {
    const proved = ledger.entered.has(key) || settlement?.execution === 'returned' ||
      settlement?.execution === 'returned-unserved' || settlement?.execution === 'threw';
    return proved && row.execution !== 'ran' ? withheld({ ...row, proof }, 'ran') : row;
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

interface CallPart {
  readonly event: RecordedTurnEvent;
  readonly role: 'start' | 'end' | 'denial';
}

interface CallGroup {
  readonly parts: CallPart[];
  readonly occurrence?: string;
  readonly legacy?: string;
}

function legacyBracket(event: RecordedTurnEvent): string | undefined {
  const id = identifier(own(event.payload, 'toolCallId'));
  const stage = identifier(event.address.runtimeStageId);
  return id === undefined || stage === undefined || stage === 'unknown#0'
    ? undefined : JSON.stringify([stage, id]);
}

function namesAgree(start: RecordedTurnEvent, end: RecordedTurnEvent): boolean {
  const before = identifier(own(start.payload, 'toolName'));
  const after = identifier(own(end.payload, 'toolName'));
  return before === undefined || after === undefined || before === after;
}

function withheld(
  addresses: Pick<HonestyToolActivity, 'request' | 'end' | 'proof'>,
  execution: Execution = 'not-recorded',
): HonestyToolActivity {
  return {
    ...(addresses.request !== undefined && { request: addresses.request }),
    ...(addresses.end !== undefined && { end: addresses.end }),
    ...(addresses.proof !== undefined && { proof: addresses.proof }),
    execution,
    outcome: 'kept-out',
    sentence: 'A result was kept out by a rule.',
  };
}

function standalone(part: CallPart): HonestyToolActivity {
  if (part.role === 'denial') return withheld({ end: part.event.address });
  return part.role === 'start' ? requested(part.event) : endedAt(part.event);
}

function paired(group: CallGroup): HonestyToolActivity | undefined {
  const starts = group.parts.filter(part => part.role === 'start');
  const ends = group.parts.filter(part => part.role === 'end');
  const [start] = starts;
  const [end] = ends;
  const denial = group.parts.find(part => part.role === 'denial');
  // A reused legacy identifier with multiple starts or ends cannot prove the
  // next bracket, even if only one request is still open at this prefix.
  if (starts.length > 1 || ends.length > 1 ||
      (start !== undefined && end !== undefined &&
        (start.event.address.eventIndex >= end.event.address.eventIndex || !namesAgree(start.event, end.event)))) return;
  const request = start === undefined ? undefined : requested(start.event);
  const settled = end === undefined ? request : endedAt(end.event, request);
  if (denial === undefined) return settled;
  return withheld({
    request: request?.request,
    end: settled?.end ?? denial.event.address,
  }, settled?.execution === 'ran' ? 'ran' : 'not-recorded');
}

/** Pair only exact recorded occurrences or unambiguous legacy stage brackets. */
export function readToolActivity(events: readonly RecordedTurnEvent[], ledger?: ToolLedger): readonly HonestyToolActivity[] {
  const groups = new Map<string, CallGroup>();
  const blockedLegacy = new Set<string>();
  const rows: HonestyToolActivity[] = [];
  for (const event of events) {
    const role = event.type === started ? 'start' :
      event.type === ended ? 'end' : deniedResult(event) ? 'denial' : undefined;
    if (role === undefined) continue;
    const part: CallPart = { event, role };
    const occurrence = readCallOccurrence(event.payload);
    const legacy = legacyBracket(event);
    if (occurrence !== undefined && legacy !== undefined) blockedLegacy.add(legacy);
    const groupKey = typeof occurrence === 'string' ? `occurrence:${occurrence}` :
      occurrence === undefined && legacy !== undefined ? `legacy:${legacy}` : undefined;
    if (groupKey === undefined) {
      rows.push(standalone(part));
      continue;
    }
    const group = groups.get(groupKey);
    if (group === undefined) {
      groups.set(groupKey, {
        parts: [part],
        ...(typeof occurrence === 'string' ? { occurrence } : { legacy }),
      });
    } else {
      group.parts.push(part);
    }
  }

  for (const group of groups.values()) {
    const joined = group.legacy !== undefined && blockedLegacy.has(group.legacy) ? undefined : paired(group);
    if (joined === undefined) {
      for (const part of group.parts) rows.push(standalone(part));
    } else {
      rows.push(ledger !== undefined && group.occurrence !== undefined
        ? withLedger(joined, group.occurrence, ledger)
        : joined);
    }
  }
  const order = (row: HonestyToolActivity) => row.request?.eventIndex ?? row.end?.eventIndex ?? Infinity;
  return rows.sort((left, right) => order(left) - order(right));
}
