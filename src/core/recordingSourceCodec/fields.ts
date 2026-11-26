import { buildRuntimeStageId, isExecutionKey, parseRuntimeStageId } from 'foottrace';
import { presentationBudget, stageTreesAt, type OwnedPlace } from '../recordedContext/ownJson.js';
import { ContextPresentationError } from '../recordedContext/types.js';
import type { RecordedInvocation, RecordingSourceRead } from './types.js';

export type Reason = Extract<RecordingSourceRead<never>, { status: 'unavailable' }>['reason'];
export type OwnRecord = Record<string, unknown>;
export const SOURCE_SCHEMA = 'agentfootprint-lens.recording-source/v1' as const;
export const MAX_INVOCATIONS = 4096;
const MAX_NAME = 4096, MAX_PATH = 128, MAX_PATH_CHARS = 8192;

export class SourceReadError extends Error {
  constructor(readonly reason: Reason) { super(reason); }
}
export function refuse(reason: Reason): never { throw new SourceReadError(reason); }
export function unavailable(error: unknown, fallback: Reason = 'invalid-recording'): Extract<RecordingSourceRead<never>, { status: 'unavailable' }> {
  const reason = error instanceof SourceReadError ? error.reason
    : error instanceof ContextPresentationError && error.reason === 'presentation-limit' ? 'recording-limit' : fallback;
  return { status: 'unavailable', reason };
}
export function record(value: unknown, reason: Reason = 'invalid-recording'): OwnRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return refuse(reason);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return refuse(reason);
  return value as OwnRecord;
}
export function field(value: OwnRecord, key: string, reason: Reason = 'invalid-recording'): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return undefined;
  if (!descriptor.enumerable || !('value' in descriptor)) return refuse(reason);
  return descriptor.value;
}
export function entries(value: OwnRecord, reason: Reason = 'invalid-recording'): readonly (readonly [string, unknown])[] {
  const keys = Reflect.ownKeys(value);
  if (keys.length > 200_000) return refuse('recording-limit');
  return keys.map(key => {
    if (typeof key !== 'string') return refuse(reason);
    return [key, field(value, key, reason)] as const;
  });
}
export function name(value: unknown, reason: Reason): string {
  if (typeof value !== 'string' || !value.length) return refuse(reason);
  if (value.length > MAX_NAME) return refuse('recording-limit');
  return value;
}
export function runtime(value: unknown, reason: Reason): string {
  const id = name(value, reason);
  if (!isExecutionKey(id)) return refuse(reason);
  const parsed = parseRuntimeStageId(id);
  if (!parsed.stageId || !Number.isSafeInteger(parsed.executionIndex) || parsed.executionIndex < 0 ||
    buildRuntimeStageId(parsed.stageId, parsed.executionIndex, parsed.subflowPath) !== id) return refuse(reason);
  return id;
}
/**
 * Where this codec's own DTOs hold an execution tree, by the full schema path
 * from the owned value's root, never by a key's name: the root reply's
 * `recording.snapshot.executionTree` and a child unit's
 * `treeContext.stageContexts`. Only there does `next` add no depth.
 */
export const ROOT_TREE: OwnedPlace = /* @__PURE__ */ stageTreesAt(['recording', 'snapshot', 'executionTree']);
export const CHILD_TREE: OwnedPlace = /* @__PURE__ */ stageTreesAt(['treeContext', 'stageContexts']);
export function own<T>(value: unknown, places?: OwnedPlace): T { return presentationBudget().own(value, places) as T; }
/** Opaque array address key, not a native ID parser and never a toJSON call. */
export function pathKey(path: readonly string[]): string {
  let key = '';
  for (const segment of path) key += `${segment.length}:${segment}`;
  return key;
}
export function readPath(path: unknown, reason: Reason, allowEmpty = false): readonly string[] {
  if (!Array.isArray(path) || (!allowEmpty && !path.length)) return refuse(reason);
  if (path.length > MAX_PATH) return refuse('recording-limit');
  let chars = 0;
  const segments: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const segment = runtime(field(path as unknown as OwnRecord, String(i), reason), reason);
    chars += segment.length;
    if (chars > MAX_PATH_CHARS) return refuse('recording-limit');
    segments.push(segment);
  }
  // Dense array ownership rejects holes, accessors and extra properties.
  own(path);
  return segments;
}
export function invocation(value: unknown, reason: Reason): RecordedInvocation {
  const item = record(value, reason), keys = entries(item, reason).map(([key]) => key);
  if (keys.some(key => !['invocationPath', 'mountRuntimeStageId', 'subflowId', 'runId'].includes(key))) return refuse(reason);
  const segments = readPath(field(item, 'invocationPath', reason), reason);
  const mountRuntimeStageId = runtime(field(item, 'mountRuntimeStageId', reason), reason);
  const subflowId = name(field(item, 'subflowId', reason), reason);
  if (segments[segments.length - 1] !== mountRuntimeStageId) return refuse(reason);
  const nativeRun = field(item, 'runId', reason);
  const runId = nativeRun === undefined ? undefined : name(nativeRun, reason);
  return { invocationPath: segments, mountRuntimeStageId, subflowId, ...(runId === undefined ? {} : { runId }) };
}
export function boundedPath(path: readonly string[]): void {
  if (path.length > MAX_PATH || path.reduce((n, part) => n + part.length, 0) > MAX_PATH_CHARS) refuse('recording-limit');
}
