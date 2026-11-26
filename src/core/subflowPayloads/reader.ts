import type {
  InvocationPayloadLoad, NotLoadedWhy, PayloadHolder, PayloadMarks, PayloadSide, StepPayload, StepPayloadReader,
} from './types.js';

const NONE: StepPayload = Object.freeze({ state: 'none' });
const NO_MARKS: PayloadMarks = new Map();

export interface StepPayloadReaderInput {
  /** The base row's marks (`readPayloadMarks`). */
  readonly marks?: PayloadMarks;
  /** Loads by mount runtime id. */
  readonly loads?: ReadonlyMap<string, InvocationPayloadLoad>;
  /** Mount runtime ids a recording source here can load. */
  readonly loadable?: ReadonlySet<string>;
}

/**
 * The one reading of a boundary payload. In order: a payload in the row is
 * recorded; a payload marked as living with its invocation is read from that
 * invocation's loaded reply, or is not loaded (and why), or unavailable (and
 * the reply's reason); anything else was not recorded.
 */
export function stepPayloadReader(input: StepPayloadReaderInput = {}): StepPayloadReader {
  const marks = input.marks ?? NO_MARKS;
  /** A payload not in the row that the row (or the step graph) says lives with its invocation. */
  const isMarked = (holder: PayloadHolder, side: PayloadSide): boolean => {
    if ((side === 'entry' ? holder.entryPayload : holder.exitPayload) !== undefined) return false;
    const key = holder.runtimeStageId;
    return (typeof key === 'string' && marks.get(key)?.[side] === true)
      || (side === 'entry' ? holder.entryPayloadWith : holder.exitPayloadWith) === 'invocation';
  };
  const read = (holder: PayloadHolder | undefined, side: PayloadSide): StepPayload => {
    if (holder === undefined) return NONE;
    const value = side === 'entry' ? holder.entryPayload : holder.exitPayload;
    if (value !== undefined) return { state: 'recorded', value };
    if (!isMarked(holder, side)) return NONE;
    const key = holder.runtimeStageId;
    if (typeof key !== 'string') return { state: 'not-loaded', invocation: '', why: 'no-source' };
    const load = input.loads?.get(key);
    if (load?.status === 'ready') {
      const slot = load.payloads?.[side];
      if (slot?.status === 'ready') return { state: 'recorded', value: slot.value };
      if (slot?.status === 'unavailable') return { state: 'unavailable', invocation: key, reason: slot.reason };
      return { state: 'not-loaded', invocation: key, why: 'not-sent' };
    }
    const why: NotLoadedWhy = load?.status === 'loading' || load?.status === 'preparing' ? 'loading'
      : load?.status === 'error' ? 'load-failed'
        : input.loadable?.has(key) ? 'not-requested' : 'no-source';
    return { state: 'not-loaded', invocation: key, why };
  };
  return {
    read,
    wanted(shown, limit = Infinity) {
      const out: string[] = [];
      for (const [holder, side] of shown) {
        const key = holder?.runtimeStageId;
        if (holder === undefined || typeof key !== 'string' || !isMarked(holder, side) || out.includes(key)) continue;
        if (out.length >= limit) return out;
        out.push(key);
      }
      return out;
    },
  };
}

let rowOnly: StepPayloadReader | undefined;
const rowOnlyReader = (): StepPayloadReader => (rowOnly ??= stepPayloadReader());

/**
 * No row marks and no loads: every payload is what the step holds (the
 * reading before payloads could move), except one a step graph itself marks
 * as living with its invocation, which reads as not loaded. Built on first
 * use, so importing this module runs nothing.
 */
export const ROW_ONLY_PAYLOADS: StepPayloadReader = {
  read: (holder, side) => rowOnlyReader().read(holder, side),
  wanted: (shown, limit) => rowOnlyReader().wanted(shown, limit),
};
