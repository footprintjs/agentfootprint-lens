import { object, own } from '../cursor/sourcePosition.js';
import { resolveAdmittedSourcePrefix } from '../cursor/sourcePrefix.js';
import { readCallOccurrence } from './callOccurrence.js';
import type { HonestyEventAddress } from './readTurnEvents.js';

const maxToolFacts = 1_024;
const maxCommitIndex = 49_999;

interface Settlement {
  readonly execution: 'not-entered' | 'threw' | 'returned' | 'returned-unserved';
  readonly withheld: boolean;
  readonly failed: boolean;
  readonly refused: boolean;
}

export interface ToolLedger {
  readonly address: HonestyEventAddress;
  readonly entered: ReadonlySet<string>;
  readonly settlements: ReadonlyMap<string, Settlement>;
}

function factRows(state: object, name: string): readonly object[] {
  const list = own(state, name);
  if (!Array.isArray(list)) return [];
  const length = own(list, 'length');
  if (typeof length !== 'number' || length > maxToolFacts) return [];
  const rows: object[] = [];
  for (let index = 0; index < length; index++) {
    const item = own(list, String(index));
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) rows.push(item);
  }
  return rows;
}

function readSettlements(rows: readonly object[]): ReadonlyMap<string, Settlement> {
  const settlements = new Map<string, Settlement>();
  const seen = new Set<string>();
  for (const row of rows) {
    const key = readCallOccurrence(row);
    if (typeof key !== 'string') continue;
    const execution = own(row, 'execution');
    if (execution !== 'not-entered' && execution !== 'threw' && execution !== 'returned' &&
        execution !== 'returned-unserved') continue;
    const delivery = own(row, 'delivery');
    const outcome = own(row, 'outcome');
    if (delivery !== undefined &&
        !(execution === 'returned' && (delivery === 'native' || delivery === 'rewritten')) &&
        !((execution === 'returned' || execution === 'returned-unserved') && delivery === 'withheld')) continue;
    if (outcome !== undefined && outcome !== 'refused' && outcome !== 'failed' && outcome !== 'settled') continue;
    if (seen.has(key)) settlements.delete(key);
    else settlements.set(key, { execution, withheld: delivery === 'withheld', failed: outcome === 'failed', refused: outcome === 'refused' });
    seen.add(key);
  }
  return settlements;
}

/** Resolve the selected event's exact recorded state for every Honesty reader. */
export function readHonestyState(recording: unknown, address: HonestyEventAddress | undefined): Record<string, unknown> | undefined {
  const position = address?.sourcePosition;
  if (address === undefined || position === undefined || position.committedThroughIdx > maxCommitIndex) return;
  try {
    const prefix = resolveAdmittedSourcePrefix(own(object(recording), 'snapshot'), position);
    if (prefix.status !== 'available' || prefix.state.status !== 'available') return;
    return prefix.state.folded.state;
  } catch {
    return undefined;
  }
}

/** Read committed tool facts at the prefix the caller has already selected. */
export function readToolLedger(state: Record<string, unknown> | undefined, address: HonestyEventAddress | undefined): ToolLedger | undefined {
  if (state === undefined || address === undefined) return;
  try {
    const entered = new Set<string>();
    for (const row of factRows(state, 'enteredToolCalls')) {
      const key = readCallOccurrence(row);
      if (typeof key === 'string' && own(row, 'entered') === true) entered.add(key);
    }
    return { address, entered, settlements: readSettlements(factRows(state, 'settledToolCalls')) };
  } catch {
    // Stream events can still supply bounded evidence when the ledger is unreadable.
    return undefined;
  }
}
