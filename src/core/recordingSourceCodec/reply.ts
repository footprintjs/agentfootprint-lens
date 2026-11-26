import { presentationBudget } from '../recordedContext/ownJson.js';
import { entries, field, record, refuse, unavailable } from './fields.js';
import type { RecordedInvocationPayloads, RecordedPayloadSlot, RecordingSourceRead } from './types.js';

const SIDES = ['entry', 'exit'] as const;
/** An unavailable slot's reason is a code (as the recording reader's are), never free text that could forge lines. */
const REASON = /^[a-z][a-z0-9-]{0,63}$/;

/**
 * Admit the `payloads` member of a child reply (`{ result, payloads? }`):
 * `{ entry?, exit? }`, at least one side, each `{ status: 'ready', value }` or
 * `{ status: 'unavailable', reason }` (a code: lower-case letters, digits and
 * hyphens, at most 64). Every value is copied and frozen under
 * one JSON budget with the ordinary depth limit of 100 (it is app data, not an
 * execution tree). Unknown keys, an empty object, a slot of any other shape,
 * an accessor or an over-budget value refuse the whole member: no partial
 * payload is shown.
 */
export function readRecordingSubflowPayloads(input: unknown): RecordingSourceRead<RecordedInvocationPayloads> {
  try {
    const raw = record(input), sides = entries(raw).map(([key]) => key);
    if (!sides.length || sides.some(key => !(SIDES as readonly string[]).includes(key))) return refuse('invalid-recording');
    const budget = presentationBudget();
    const payloads: { entry?: RecordedPayloadSlot; exit?: RecordedPayloadSlot } = {};
    for (const side of SIDES) if (sides.includes(side)) payloads[side] = slot(field(raw, side), budget.own);
    return { status: 'ready', value: Object.freeze(payloads) };
  } catch (error) { return unavailable(error); }
}

function slot(value: unknown, own: (value: unknown) => unknown): RecordedPayloadSlot {
  const item = record(value), keys = entries(item).map(([key]) => key).sort().join(',');
  const status = field(item, 'status');
  if (status === 'ready' && keys === 'status,value') return Object.freeze({ status, value: own(field(item, 'value')) });
  const reason = field(item, 'reason');
  if (status === 'unavailable' && keys === 'reason,status' && typeof reason === 'string' && REASON.test(reason)) return Object.freeze({ status, reason });
  return refuse('invalid-recording');
}
