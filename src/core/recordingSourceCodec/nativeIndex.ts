import { isExecutionKey } from 'foottrace';
import type { LogAddress } from 'foottrace';
import type { RecordedInvocation } from './types.js';
import { boundedPath, entries, field, MAX_INVOCATIONS, name, pathKey, readPath, record, refuse, runtime, type OwnRecord } from './fields.js';

export interface NativeRoot {
  readonly recording: OwnRecord;
  readonly snapshot: OwnRecord;
  readonly tree: OwnRecord | null;
  readonly runId?: string;
  readonly logAddress?: LogAddress;
}
export interface NativeIndex extends NativeRoot {
  readonly invocations: readonly RecordedInvocation[];
  readonly units: ReadonlyMap<string, OwnRecord>;
}
export function nativeRoot(input: unknown): NativeRoot {
  const recording = record(input);
  entries(recording); // Reject own accessors without reading their values.
  const rawSnapshot = field(recording, 'snapshot');
  if (rawSnapshot === undefined || rawSnapshot === null) return refuse('unsupported-recording');
  const snapshot = record(rawSnapshot); entries(snapshot);
  const rawTree = field(snapshot, 'executionTree');
  if (rawTree === undefined) return refuse('unsupported-recording');
  const tree = rawTree === null ? null : record(rawTree);
  const nativeRun = field(snapshot, 'runId');
  const runId = nativeRun === undefined ? undefined : name(nativeRun, 'invalid-recording');
  const events = field(recording, 'events');
  if (events !== undefined && events !== null && !Array.isArray(events)) return refuse('invalid-recording');
  const rawAddress = field(snapshot, 'logAddress');
  const logAddress = rawAddress === undefined ? undefined : readLogAddress(rawAddress);
  return { recording, snapshot, tree, ...(runId === undefined ? {} : { runId }), ...(logAddress === undefined ? {} : { logAddress }) };
}
function readLogAddress(value: unknown): LogAddress {
  const address = record(value);
  return { logRunId: name(field(address, 'logRunId'), 'invalid-recording'), drillPath: readPath(field(address, 'drillPath'), 'invalid-recording', true) };
}
/** Traverses execution links only. Value payloads remain untouched until ownership. */
export function scopeMounts(tree: OwnRecord | null, spend: () => void): readonly { runtimeStageId: string; subflowId: string }[] {
  const pending: unknown[] = tree === null ? [] : [tree], seen = new Set<object>(), mounts = new Set<string>();
  const output: { runtimeStageId: string; subflowId: string }[] = [];
  while (pending.length) {
    spend(); const node = record(pending.pop());
    if (seen.has(node)) return refuse('ambiguous-invocation');
    seen.add(node);
    const subflow = field(node, 'subflowId');
    if (subflow !== undefined) {
      const subflowId = name(subflow, 'invalid-recording'), runtimeStageId = runtime(field(node, 'runtimeStageId'), 'unsupported-recording');
      if (mounts.has(runtimeStageId)) return refuse('ambiguous-invocation');
      if (output.length >= MAX_INVOCATIONS) return refuse('recording-limit');
      mounts.add(runtimeStageId); output.push({ runtimeStageId, subflowId });
    }
    const children = field(node, 'children');
    if (children !== undefined && children !== null) {
      if (!Array.isArray(children)) return refuse('invalid-recording');
      if (children.length > 200_000) return refuse('recording-limit');
      for (let i = children.length - 1; i >= 0; i--) pending.push(field(children as unknown as OwnRecord, String(i)));
    }
    const next = field(node, 'next');
    if (next !== undefined && next !== null) pending.push(next);
  }
  return output;
}
export function completeUnit(value: unknown, subflowId: string, path: readonly string[], rootAddress?: LogAddress): OwnRecord {
  const result = record(value);
  if (field(result, 'subflowId') !== subflowId) return refuse('invalid-recording');
  name(field(result, 'subflowName'), 'unsupported-recording');
  name(field(result, 'parentStageId'), 'unsupported-recording');
  const context = record(field(result, 'treeContext'), 'unsupported-recording');
  record(field(context, 'globalContext'), 'unsupported-recording');
  record(field(context, 'stageContexts'), 'unsupported-recording');
  if (!Array.isArray(field(context, 'history'))) return refuse('unsupported-recording');
  const rawAddress = field(context, 'logAddress');
  if (rawAddress !== undefined) {
    const address = readLogAddress(rawAddress), expected = [...(rootAddress?.drillPath ?? []), ...path];
    boundedPath(expected);
    if (address.drillPath.length !== expected.length || address.drillPath.some((part, i) => part !== expected[i]) ||
      (rootAddress !== undefined && address.logRunId !== rootAddress.logRunId)) return refuse('invalid-recording');
  }
  return result;
}
export function indexNativeRecording(input: unknown): NativeIndex {
  const root = nativeRoot(input), rawMap = field(root.snapshot, 'subflowResults');
  const sourceMap = rawMap === undefined ? undefined : record(rawMap);
  const map = new Map<string, unknown>();
  let remaining = 200_000;
  const spend = () => { if (--remaining < 0) refuse('recording-limit'); };
  if (sourceMap) for (const [key, value] of entries(sourceMap)) {
    spend(); name(key, 'invalid-recording');
    if (isExecutionKey(key)) map.set(runtime(key, 'invalid-recording'), value);
  }
  const invocations: RecordedInvocation[] = [], units = new Map<string, OwnRecord>(), mountedKeys = new Set<string>();
  const walk = (tree: OwnRecord | null, ancestors: readonly string[]) => {
    for (const mount of scopeMounts(tree, spend)) {
      const path = [...ancestors, mount.runtimeStageId]; boundedPath(path);
      if (mountedKeys.has(mount.runtimeStageId)) return refuse('ambiguous-invocation');
      mountedKeys.add(mount.runtimeStageId);
      if (invocations.length >= MAX_INVOCATIONS) return refuse('recording-limit');
      const rawUnit = map.get(mount.runtimeStageId);
      if (rawUnit === undefined) return refuse('unsupported-recording');
      const result = completeUnit(rawUnit, mount.subflowId, path, root.logAddress);
      const address: RecordedInvocation = { invocationPath: path, mountRuntimeStageId: mount.runtimeStageId,
        subflowId: mount.subflowId, ...(root.runId === undefined ? {} : { runId: root.runId }) };
      invocations.push(address); units.set(pathKey(path), result);
      const child = record(field(result, 'treeContext'));
      walk(record(field(child, 'stageContexts')), path);
    }
  };
  walk(root.tree, []);
  if ([...map.keys()].some(key => !mountedKeys.has(key))) return refuse('invocation-not-recorded');
  return { ...root, invocations, units };
}
export function strippedRoot(root: NativeRoot): OwnRecord {
  const snapshot = Object.create(null) as OwnRecord;
  for (const [key, value] of entries(root.snapshot)) if (key !== 'subflowResults')
    Object.defineProperty(snapshot, key, { value, enumerable: true });
  const recording = Object.create(null) as OwnRecord;
  for (const [key, value] of entries(root.recording))
    Object.defineProperty(recording, key, { value: key === 'snapshot' ? snapshot : value, enumerable: true });
  return recording;
}
