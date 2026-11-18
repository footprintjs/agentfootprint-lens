import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildRuntimeStageId } from 'foottrace';
import { flowChart, FlowChartExecutor } from 'footprintjs';
import { projectRecordingSource, readRecordingSourceRoot, readRecordingSubflow } from './index.js';
import type { RecordingSourceRead, RecordingSourceRoot } from './types.js';

type Json = Record<string, any>;
const ready = <T>(read: RecordingSourceRead<T>): T => {
  expect(read.status).toBe('ready');
  if (read.status !== 'ready') throw new Error(`Expected ready, received ${read.reason}`);
  return read.value;
};
const fixture = (): Json => JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../__fixtures__/recorded-turn.json'), 'utf8'));
const rid = (id: string, index: number) => buildRuntimeStageId(id, index);
function unit(subflowId: string, value: unknown): Json {
  return { subflowId, subflowName: `Recorded ${subflowId}`, parentStageId: 'Original parent label',
    treeContext: { globalContext: { value }, stageContexts: { id: `${subflowId}/work`, runtimeStageId: rid(`${subflowId}/work`, 8), stageWrites: { value } },
      history: [{ idx: 0, runtimeStageId: rid(`${subflowId}/work`, 8), patch: { value }, trace: [] }],
      writeProvenance: { value: { source: 'original native field' } } },
    attention: [{ kind: 'recorded' }] };
}
function recording(): Json {
  const first = unit('worker', 'earlier exact visit'), latest = unit('worker', 'latest alias');
  return { marker: { full: 'retained root field' }, events: [{ type: 'recorded', data: { exact: true } }], structure: { id: 'Root', children: [] },
    snapshot: { runId: 'native-run', sharedState: { result: 'root' }, commitLog: [], writeProvenance: { root: 'keep' },
      executionTree: { id: 'worker', runtimeStageId: rid('worker', 1), subflowId: 'worker', next: { id: 'worker', runtimeStageId: rid('worker', 2), subflowId: 'worker' } },
      subflowResults: { worker: latest, [rid('worker', 1)]: first, [rid('worker', 2)]: latest } } };
}
const descriptor = (root: RecordingSourceRoot, at = 0) => root.invocations[at]!;

describe('native recording source codec', () => {
  it('projects the real native fixture without child payloads or root data loss', () => {
    const input = fixture(), originalMap = input.snapshot.subflowResults;
    const root = ready(projectRecordingSource(input));
    expect(root.schema).toBe('agentfootprint-lens.recording-source/v1');
    expect(root.invocations).toHaveLength(25);
    expect(Object.prototype.hasOwnProperty.call(root.recording.snapshot!, 'subflowResults')).toBe(false);
    const expected = { ...input, snapshot: { ...input.snapshot } }; delete expected.snapshot.subflowResults;
    expect(root.recording).toEqual(expected);
    expect(input.snapshot.subflowResults).toBe(originalMap);
    expect(root.invocations.every(item => item.runId === input.snapshot.runId && item.invocationPath.length === 1)).toBe(true);
  });

  it('reads the exact complete invocation rather than the latest definition alias', () => {
    const input = recording(), root = ready(projectRecordingSource(input));
    expect(root.invocations).toHaveLength(2);
    const first = ready(readRecordingSubflow(input, descriptor(root)));
    expect(first.result).toEqual(input.snapshot.subflowResults[rid('worker', 1)]);
    expect(first.result).not.toBe(input.snapshot.subflowResults[rid('worker', 1)]);
    expect((first.result as Json).treeContext.globalContext.value).toBe('earlier exact visit');
    expect((first.result as Json).treeContext.writeProvenance).toEqual({ value: { source: 'original native field' } });
    expect(Object.isFrozen(first)).toBe(true); expect(Object.isFrozen(first.result)).toBe(true);
    expect(Object.isFrozen((first.result as Json).treeContext.globalContext)).toBe(true);
  });

  it('indexes nested native scope paths and preserves absent run identity', () => {
    const input = recording(); delete input.snapshot.runId;
    const inner = unit('inner', 'nested complete value');
    input.snapshot.executionTree = { runtimeStageId: rid('outer', 1), subflowId: 'outer' };
    const outer = unit('outer', 'outer complete value');
    outer.treeContext.stageContexts = { runtimeStageId: rid('outer/inner', 2), subflowId: 'inner' };
    input.snapshot.subflowResults = { outer, [rid('outer', 1)]: outer, inner, [rid('outer/inner', 2)]: inner };
    const root = ready(projectRecordingSource(input));
    expect(root.invocations.map(item => item.invocationPath)).toEqual([[rid('outer', 1)], [rid('outer', 1), rid('outer/inner', 2)]]);
    expect(root.invocations.every(item => !Object.prototype.hasOwnProperty.call(item, 'runId'))).toBe(true);
    expect(ready(readRecordingSubflow(input, descriptor(root, 1))).result).toEqual(inner);
  });

  it('admits a detached frozen wire root without needing its intentionally omitted child map', () => {
    const projected = ready(projectRecordingSource(recording()));
    const admitted = ready(readRecordingSourceRoot(projected));
    expect(admitted).toEqual(projected); expect(admitted).not.toBe(projected);
    expect(Object.isFrozen(admitted.recording.snapshot)).toBe(true);
    expect(Object.isFrozen(admitted.invocations[0]?.invocationPath)).toBe(true);
  });

  it('refuses missing exact units, duplicate mounts and unrecorded runtime units as whole lanes', () => {
    const missing = recording(); delete missing.snapshot.subflowResults[rid('worker', 1)];
    expect(projectRecordingSource(missing)).toEqual({ status: 'unavailable', reason: 'unsupported-recording' });
    const duplicate = recording(); duplicate.snapshot.executionTree.next.runtimeStageId = rid('worker', 1);
    expect(projectRecordingSource(duplicate)).toEqual({ status: 'unavailable', reason: 'ambiguous-invocation' });
    const orphan = recording(); orphan.snapshot.subflowResults[rid('unrecorded', 40)] = unit('unrecorded', 'not a recorded scope');
    expect(projectRecordingSource(orphan)).toEqual({ status: 'unavailable', reason: 'invocation-not-recorded' });
  });

  it('refuses mutated addresses, cross-run reads, aliases and extra request fields', () => {
    const input = recording(), root = ready(projectRecordingSource(input)), d = descriptor(root);
    for (const request of [{ ...d, runId: 'foreign-run' }, { ...d, subflowId: 'other' }, { ...d, invocationPath: [rid('worker', 2)] },
      { ...d, mountRuntimeStageId: 'worker', invocationPath: ['worker'] }, { ...d, ref: 'invented transport ticket' }]) {
      expect(readRecordingSubflow(input, request)).toEqual({ status: 'unavailable', reason: 'invalid-request' });
    }
    expect(readRecordingSubflow(input, { ...d, mountRuntimeStageId: rid('unrecorded', 9), invocationPath: [rid('unrecorded', 9)] }))
      .toEqual({ status: 'unavailable', reason: 'invocation-not-recorded' });
  });

  it('refuses forged root membership, duplicate descriptors and embedded child maps at wire admission', () => {
    const input = recording(), root = ready(projectRecordingSource(input));
    const forged = { ...descriptor(root), mountRuntimeStageId: rid('forged', 1), invocationPath: [rid('forged', 1)] };
    expect(readRecordingSourceRoot({ ...root, invocations: [forged] })).toEqual({ status: 'unavailable', reason: 'invocation-not-recorded' });
    expect(readRecordingSourceRoot({ ...root, invocations: [descriptor(root), descriptor(root)] })).toEqual({ status: 'unavailable', reason: 'ambiguous-invocation' });
    expect(readRecordingSourceRoot({ ...root, recording: input })).toEqual({ status: 'unavailable', reason: 'invalid-recording' });
  });

  it('does not invoke getters or toJSON, rejects cycles/classes/holes, and preserves input references', () => {
    let calls = 0;
    const getter = recording(); Object.defineProperty(getter, 'events', { enumerable: true, get() { calls++; return []; } });
    expect(projectRecordingSource(getter)).toEqual({ status: 'unavailable', reason: 'invalid-recording' });
    const coercive = recording(); coercive.marker.toJSON = () => { calls++; return {}; };
    expect(projectRecordingSource(coercive)).toEqual({ status: 'unavailable', reason: 'invalid-recording' });
    const circular = recording(); circular.marker.self = circular;
    expect(projectRecordingSource(circular)).toEqual({ status: 'unavailable', reason: 'invalid-recording' });
    const instance = recording(); instance.marker = new Date();
    expect(projectRecordingSource(instance)).toEqual({ status: 'unavailable', reason: 'invalid-recording' });
    const sparse = recording(); sparse.events = new Array(1);
    expect(projectRecordingSource(sparse)).toEqual({ status: 'unavailable', reason: 'invalid-recording' });
    expect(calls).toBe(0);
  });

  it('validates and copies only the selected complete unit body', () => {
    const input = recording(), root = ready(projectRecordingSource(input)); let calls = 0;
    Object.defineProperty(input.snapshot.subflowResults[rid('worker', 2)].treeContext.globalContext, 'secret', { enumerable: true, get() { calls++; return 'never'; } });
    expect(ready(readRecordingSubflow(input, descriptor(root))).result).toEqual(input.snapshot.subflowResults[rid('worker', 1)]);
    expect(readRecordingSubflow(input, descriptor(root, 1))).toEqual({ status: 'unavailable', reason: 'invalid-recording' });
    expect(calls).toBe(0);
  });

  it('bounds invocation names, paths, counts and copied JSON without a partial result', () => {
    const input = recording(), root = ready(projectRecordingSource(input)), d = descriptor(root);
    expect(readRecordingSubflow(input, { ...d, subflowId: 'x'.repeat(4097) })).toEqual({ status: 'unavailable', reason: 'recording-limit' });
    expect(readRecordingSubflow(input, { ...d, invocationPath: Array.from({ length: 129 }, () => rid('a', 1)) })).toEqual({ status: 'unavailable', reason: 'recording-limit' });
    expect(readRecordingSubflow(input, { ...d, invocationPath: [rid('a'.repeat(3000), 1), rid('b'.repeat(3000), 2), rid('c'.repeat(3000), 3)] }))
      .toEqual({ status: 'unavailable', reason: 'recording-limit' });
    expect(readRecordingSourceRoot({ ...root, invocations: Array.from({ length: 4097 }, () => d) })).toEqual({ status: 'unavailable', reason: 'recording-limit' });
    const wide = recording(); wide.marker = { values: Array.from({ length: 200_001 }, () => 1) };
    expect(projectRecordingSource(wide)).toEqual({ status: 'unavailable', reason: 'recording-limit' });
  });

  it('admits 4096 invocations independently of the renderer 64-scope cache', () => {
    const input = recording(), children = [], map: Json = {};
    for (let i = 1; i <= 4096; i++) {
      const key = rid('worker', i);
      children.push({ runtimeStageId: key, subflowId: 'worker' }); map[key] = unit('worker', i);
    }
    input.snapshot.executionTree = { runtimeStageId: rid('root', 0), children }; input.snapshot.subflowResults = map;
    const root = ready(projectRecordingSource(input));
    expect(root.invocations).toHaveLength(4096);
    expect(ready(readRecordingSourceRoot(root)).invocations).toHaveLength(4096);
    expect((ready(readRecordingSubflow(input, descriptor(root, 4095))).result as Json).treeContext.globalContext.value).toBe(4096);
    children.push({ runtimeStageId: rid('worker', 4097), subflowId: 'worker' }); map[rid('worker', 4097)] = unit('worker', 4097);
    expect(projectRecordingSource(input)).toEqual({ status: 'unavailable', reason: 'recording-limit' });
  });

  it('uses real native nested units and refuses a provided misbound log address', async () => {
    const leaf = flowChart<{ value?: number }>('Leaf', scope => { scope.value = 1; }, 'leaf').build();
    const child = flowChart('Child', () => {}, 'child').addSubFlowChart('sf-leaf', leaf).build();
    const chart = flowChart('Root', () => {}, 'root').addSubFlowChart('sf-child', child).build();
    const executor = new FlowChartExecutor(chart); await executor.run();
    const input = { snapshot: JSON.parse(JSON.stringify(executor.getSnapshot())), events: [] };
    const root = ready(projectRecordingSource(input)), nested = root.invocations.find(item => item.invocationPath.length === 2)!;
    expect(nested).toBeDefined();
    const result = ready(readRecordingSubflow(input, nested)).result as Json;
    expect(result).toEqual(input.snapshot.subflowResults[nested.mountRuntimeStageId]);
    expect(result.treeContext.logAddress.drillPath).toEqual(nested.invocationPath);
    expect(result.treeContext.logAddress.logRunId).toBe(input.snapshot.logAddress.logRunId);
    input.snapshot.subflowResults[nested.mountRuntimeStageId].treeContext.logAddress.drillPath = [nested.mountRuntimeStageId];
    expect(projectRecordingSource(input)).toEqual({ status: 'unavailable', reason: 'invalid-recording' });
  });

  it('keeps resumed engine identity distinct from the original native log owner', () => {
    const input = recording(), base = ready(projectRecordingSource(input));
    input.snapshot.runId = 'resumed-engine-leg'; input.snapshot.logAddress = { logRunId: 'original-log-owner', drillPath: [] };
    for (const d of base.invocations) input.snapshot.subflowResults[d.mountRuntimeStageId].treeContext.logAddress = {
      logRunId: 'original-log-owner', drillPath: [...d.invocationPath] };
    const root = ready(projectRecordingSource(input)), d = descriptor(root);
    expect(d.runId).toBe('resumed-engine-leg');
    expect((ready(readRecordingSubflow(input, d)).result as Json).treeContext.logAddress.logRunId).toBe('original-log-owner');
    expect(readRecordingSubflow(input, { ...d, runId: 'original-log-owner' })).toEqual({ status: 'unavailable', reason: 'invalid-request' });
    input.snapshot.subflowResults[d.mountRuntimeStageId].treeContext.logAddress.logRunId = 'foreign-log-owner';
    expect(projectRecordingSource(input)).toEqual({ status: 'unavailable', reason: 'invalid-recording' });
  });

  it('rejects oversized/deep owned values but does not clone unrelated child payloads', () => {
    const input = recording(), d = descriptor(ready(projectRecordingSource(input)));
    input.snapshot.subflowResults[rid('worker', 2)].treeContext.globalContext.value = Array.from({ length: 200_001 }, () => 1);
    expect(projectRecordingSource(input).status).toBe('ready');
    expect(readRecordingSubflow(input, d).status).toBe('ready');
    const root = ready(projectRecordingSource(input));
    expect(readRecordingSourceRoot({ ...root, recording: input })).toEqual({ status: 'unavailable', reason: 'invalid-recording' });
    expect(readRecordingSubflow(input, descriptor(root, 1))).toEqual({ status: 'unavailable', reason: 'recording-limit' });
    input.marker = { value: 'x'.repeat(64 * 1024 * 1024 + 1) };
    expect(projectRecordingSource(input)).toEqual({ status: 'unavailable', reason: 'recording-limit' });
    const deep = recording(); let cursor = deep.marker;
    for (let i = 0; i < 101; i++) { cursor.next = {}; cursor = cursor.next; }
    expect(projectRecordingSource(deep)).toEqual({ status: 'unavailable', reason: 'recording-limit' });
  });

  it('refuses request and DTO accessors without calling them', () => {
    const input = recording(), root = ready(projectRecordingSource(input)); let calls = 0;
    const request = { ...descriptor(root) };
    Object.defineProperty(request, 'runId', { enumerable: true, get() { calls++; return 'native-run'; } });
    expect(readRecordingSubflow(input, request)).toEqual({ status: 'unavailable', reason: 'invalid-request' });
    const dto = { ...root };
    Object.defineProperty(dto, 'recording', { enumerable: true, get() { calls++; return input; } });
    expect(readRecordingSourceRoot(dto)).toEqual({ status: 'unavailable', reason: 'invalid-recording' });
    expect(calls).toBe(0);
  });

  it('refuses a mismatched provided unit identity instead of treating it as legacy support', () => {
    const input = recording(); input.snapshot.subflowResults[rid('worker', 1)].subflowId = 'different-recorded-scope';
    expect(projectRecordingSource(input)).toEqual({ status: 'unavailable', reason: 'invalid-recording' });
  });
});
