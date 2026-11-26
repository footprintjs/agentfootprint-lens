import type { RecordingSourceRead, RecordingSourceRoot } from './types.js';
import { CHILD_TREE, entries, field, invocation, MAX_INVOCATIONS, own, pathKey, record, refuse, ROOT_TREE, SOURCE_SCHEMA, unavailable } from './fields.js';
import { completeUnit, indexNativeRecording, nativeRoot, scopeMounts, strippedRoot } from './nativeIndex.js';
export type { RecordedInvocation, RecordedInvocationPayloads, RecordedPayloadSlot, RecordedSubflowReply, RecordingSourceRead, RecordingSourceRoot } from './types.js';
export { readRecordingSubflowPayloads } from './reply.js';

/** Detached root plus exact native invocation addresses; child payloads remain in storage. */
export function projectRecordingSource(input: unknown): RecordingSourceRead<RecordingSourceRoot> {
  try {
    const indexed = indexNativeRecording(input);
    return { status: 'ready', value: own({ schema: SOURCE_SCHEMA, recording: strippedRoot(indexed), invocations: indexed.invocations }, ROOT_TREE) };
  } catch (error) { return unavailable(error); }
}

/** Admit an already projected source descriptor at a transport boundary. */
export function readRecordingSourceRoot(input: unknown): RecordingSourceRead<RecordingSourceRoot> {
  try {
    // Reject an embedded full map before ownership: admission must not copy
    // every sibling payload merely to refuse a non-source DTO.
    const raw = record(input), keys = entries(raw).map(([key]) => key);
    if (keys.length !== 3 || keys.some(key => !['schema', 'recording', 'invocations'].includes(key))) return refuse('invalid-recording');
    if (field(raw, 'schema') !== SOURCE_SCHEMA) return refuse('unsupported-recording');
    const preflight = nativeRoot(field(raw, 'recording'));
    if (Object.prototype.hasOwnProperty.call(preflight.snapshot, 'subflowResults')) return refuse('invalid-recording');
    const rawInvocations = field(raw, 'invocations');
    if (!Array.isArray(rawInvocations)) return refuse('invalid-recording');
    if (rawInvocations.length > MAX_INVOCATIONS) return refuse('recording-limit');
    const value = own<Record<string, unknown>>(raw, ROOT_TREE), dto = record(value);
    const root = nativeRoot(field(dto, 'recording'));
    const addresses = (field(dto, 'invocations') as unknown[]).map(value => invocation(value, 'invalid-recording'));
    let remaining = 200_000;
    const mounts = scopeMounts(root.tree, () => { if (--remaining < 0) refuse('recording-limit'); });
    const rootMounts = new Map(mounts.map(mount => [mount.runtimeStageId, mount.subflowId]));
    const keysSeen = new Set<string>(), runtimeSeen = new Set<string>();
    for (const address of addresses) {
      const key = pathKey(address.invocationPath);
      if (keysSeen.has(key) || runtimeSeen.has(address.mountRuntimeStageId)) return refuse('ambiguous-invocation');
      keysSeen.add(key); runtimeSeen.add(address.mountRuntimeStageId);
      if (address.runId !== root.runId) return refuse('invalid-recording');
      const first = address.invocationPath[0]!;
      if (!rootMounts.has(first) || (address.invocationPath.length === 1 && rootMounts.get(first) !== address.subflowId)) return refuse('invocation-not-recorded');
    }
    for (const address of addresses) for (let i = 1; i < address.invocationPath.length; i++)
      if (!keysSeen.has(pathKey(address.invocationPath.slice(0, i)))) return refuse('invocation-not-recorded');
    for (const mount of mounts) if (!keysSeen.has(pathKey([mount.runtimeStageId]))) return refuse('invocation-not-recorded');
    return { status: 'ready', value: value as unknown as RecordingSourceRoot };
  } catch (error) { return unavailable(error); }
}

/** Return only the complete native child unit identified by the recorded address. */
export function readRecordingSubflow(input: unknown, request: unknown): RecordingSourceRead<{ readonly result: unknown }> {
  try {
    let address;
    try { address = invocation(request, 'invalid-request'); } catch (error) { return unavailable(error, 'invalid-request'); }
    const indexed = indexNativeRecording(input);
    if (address.runId !== indexed.runId) return refuse('invalid-request');
    const key = pathKey(address.invocationPath), expected = indexed.invocations.find(item => pathKey(item.invocationPath) === key);
    if (!expected) return refuse('invocation-not-recorded');
    if (expected.subflowId !== address.subflowId || expected.mountRuntimeStageId !== address.mountRuntimeStageId) return refuse('invalid-request');
    const result = own(indexed.units.get(key), CHILD_TREE);
    completeUnit(result, address.subflowId, address.invocationPath, indexed.logAddress);
    return { status: 'ready', value: Object.freeze({ result }) };
  } catch (error) { return unavailable(error); }
}
