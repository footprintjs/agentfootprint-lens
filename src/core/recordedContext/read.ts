import { presentationBudget } from './ownJson.js';
import { ContextPresentationError, type RecordedContextCall, type RecordedContextView } from './types.js';

function own(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor && !('value' in descriptor)) throw new ContextPresentationError('invalid-context');
  return descriptor?.value;
}
const integer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((part) => typeof part === 'string');

/** Raw encoded records must go through the producer's bounded reader first. */
export function isEncodedContext(input: unknown): boolean {
  const marker = own(input, 'format');
  return typeof marker === 'string' &&
    (marker.startsWith('foottrace.value-record.') || marker.startsWith('agentfootprint.context-recording.'));
}

/** Resolve explicit call IDs only, once each. Never scan literal data for reference shapes. */
export function readDecodedContext(input: unknown):
  { readonly recording: unknown; readonly context?: RecordedContextView } | undefined {
  try {
    if (input === null || typeof input !== 'object' || !Object.hasOwn(input, 'calls') ||
        !Object.hasOwn(input, 'recording')) return undefined;
    const budget = presentationBudget();
    const rawCalls = own(input, 'calls');
    if (!Array.isArray(rawCalls) || rawCalls.length > 10_000)
      throw new ContextPresentationError('presentation-limit');
    const calls = budget.own(rawCalls) as readonly RecordedContextCall[];
    const values = own(input, 'values');
    const droppedEvents = optionalCount(own(input, 'droppedEvents'));
    const firstRetainedEventIndex = optionalCount(own(input, 'firstRetainedEventIndex'));
    if (calls.length === 0 && values === undefined && droppedEvents === undefined && firstRetainedEventIndex === undefined)
      return { recording: own(input, 'recording') };
    if (values !== undefined && (values === null || typeof values !== 'object'))
      throw new ContextPresentationError('invalid-context');
    // This is the explicit executable adapter port, not JSON data. Use its
    // public method so class instances and binding Proxies retain their contract.
    const resolve: unknown = values !== undefined ? Reflect.get(values as object, 'resolve') : undefined;
    if (calls.length > 0 && typeof resolve !== 'function') throw new ContextPresentationError('invalid-context');
    const dictionary = new Map<string, unknown>();
    for (const call of calls) {
      validateCall(call);
      for (const id of [...call.added, ...call.removed]) {
        if (dictionary.has(id)) continue;
        if (dictionary.size >= 100_000) throw new ContextPresentationError('presentation-limit');
        try { dictionary.set(id, budget.own((resolve as (reference: unknown) => unknown).call(values, { ref: id }))); }
        catch (error) {
          if (error instanceof ContextPresentationError) throw error;
          throw new ContextPresentationError('unreadable-value');
        }
      }
    }
    return { recording: own(input, 'recording'), context: Object.freeze({
      calls, dictionary: Object.freeze([...dictionary].map(([id, value]) => Object.freeze({ id, value }))),
      ...(droppedEvents !== undefined ? { droppedEvents } : {}),
      ...(firstRetainedEventIndex !== undefined ? { firstRetainedEventIndex } : {}),
    }) };
  } catch (error) {
    if (error instanceof ContextPresentationError) throw error;
    throw new ContextPresentationError('invalid-context');
  }
}

function optionalCount(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (!integer(value)) throw new ContextPresentationError('invalid-context');
  return value;
}

function validateCall(call: RecordedContextCall): void {
  if (!call || typeof call !== 'object' || !call.meta || typeof call.meta.runId !== 'string' ||
      (call.meta.compositionPath !== undefined && !strings(call.meta.compositionPath)) ||
      (call.meta.subflowPath !== undefined && !strings(call.meta.subflowPath)) ||
      (call.meta.runtimeStageId !== undefined && typeof call.meta.runtimeStageId !== 'string') ||
      !integer(call.call) || call.call === 0 || !integer(call.iteration) || !integer(call.eventIndex) ||
      !integer(call.unchanged) || !strings(call.added) || !strings(call.removed) ||
      !call.counts || typeof call.counts !== 'object' || Array.isArray(call.counts) ||
      !Object.values(call.counts).every(integer) ||
      (call.order !== undefined && (!Array.isArray(call.order) || !call.order.every(integer))))
    throw new ContextPresentationError('invalid-context');
}
