import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { flowChart, FlowChartExecutor } from 'footprintjs';
import { projectTraceInvocation } from 'footprint-explainable-ui';
import { scrubAxisFor } from '../../core/group/scrubAxisFor.js';
import { createLensRecordingSource } from './controller.js';
import { useRecordingSource } from './useRecordingSource.js';
import { useSharedCursor } from '../useSharedCursor.js';
import { projectRecordingSource, readRecordingSubflow, type RecordedInvocation } from '../../core/recordingSourceCodec/index.js';

const fixture = () => JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../core/__fixtures__/recorded-turn.json'), 'utf8'));
function input() {
  const full = fixture(), projected = projectRecordingSource(full);
  expect(projected.status).toBe('ready');
  if (projected.status !== 'ready') throw Error('Native fixture cannot be projected');
  return { full, root: projected.value };
}
function child(full: unknown, request: RecordedInvocation) {
  const result = readRecordingSubflow(full, request);
  if (result.status !== 'ready') throw Error('Native fixture child cannot be selected');
  return result.value;
}

describe('creator-owned lazy recording source', () => {
  it('reports the lazy-source error when a recording has no snapshot', () => {
    const { root } = input();
    const { snapshot, ...recording } = root.recording;
    const loadSubflow = vi.fn();
    for (const record of [recording, { ...recording, snapshot: null }]) {
      expect(() => createLensRecordingSource({ root: { ...root, recording: record }, loadSubflow }))
        .toThrow(expect.objectContaining({ name: 'Error', message: 'The recording cannot be opened as a lazy source.' }));
    }
    expect(loadSubflow).not.toHaveBeenCalled();
  });

  it('observes only the root once and makes no speculative child read', () => {
    const { root } = input(); const loadSubflow = vi.fn();
    const source = createLensRecordingSource({ root, loadSubflow });
    try {
      expect(loadSubflow).not.toHaveBeenCalled();
      expect(source.getSnapshot().recording.snapshot?.subflowResults).toEqual({});
      expect(source.observed.eventsReplayed).toBe(root.recording.events?.length);
      expect(source.getSnapshot().loads).toEqual([]);
      expect(source.getGraph([]).nodes.length).toBeGreaterThan(0);
      expect(source.getSnapshot()).toBe(source.getSnapshot());
    } finally { source.dispose(); }
  });

  it('keeps a large recorder payload in replay when a child is admitted', async () => {
    const full = fixture();
    full.snapshot.recorders.push({ name: 'samples', data: Array.from({ length: 40_000 }, (_, i) => i) });
    const projected = projectRecordingSource(full);
    if (projected.status !== 'ready') throw Error('Native fixture cannot be projected');
    const root = projected.value;
    const loadSubflow = vi.fn((request: RecordedInvocation) => child(full, request));
    const source = createLensRecordingSource({ root, loadSubflow });
    try {
      const recorders = source.getSnapshot().recording.snapshot!.recorders!;
      const samples = recorders.find(entry => entry.name === 'samples')!.data;
      expect(samples).toHaveLength(40_000);
      expect(Object.isFrozen(samples)).toBe(true);
      expect(loadSubflow).not.toHaveBeenCalled();
      await source.load(root.invocations.find(value => value.invocationPath.length === 1)!);
      expect(source.getSnapshot().recording.snapshot!.recorders).toBe(recorders);
      expect(loadSubflow).toHaveBeenCalledTimes(1);
    } finally { source.dispose(); }
  });

  it('deduplicates exact children while keeping one recorder, runner and event replay', async () => {
    const { full, root } = input(); const request = root.invocations.find(value => value.invocationPath.length === 1)!;
    let release!: (value: { result: unknown }) => void;
    const loadSubflow = vi.fn(() => new Promise<{ result: unknown }>(resolve => { release = resolve; }));
    const source = createLensRecordingSource({ root, loadSubflow });
    const observed = source.observed, events = observed.recorder.selectEventLog().length;
    try {
      const first = source.load(request), second = source.load(request);
      await waitFor(() => expect(loadSubflow).toHaveBeenCalledTimes(1));
      expect(source.getSnapshot().loads[0]?.status).toBe('loading');
      release(child(full, request)); await Promise.all([first, second]);
      expect(source.observed).toBe(observed);
      expect(source.observed.recorder).toBe(observed.recorder);
      expect(source.observed.runner).toBe(observed.runner);
      expect(observed.recorder.selectEventLog()).toHaveLength(events);
      expect(source.getSnapshot().loads[0]?.status).toBe('ready');
      expect(source.getSnapshot().recording.snapshot?.subflowResults).toHaveProperty(request.mountRuntimeStageId);
      expect(observed.runner?.getLastSnapshot()).toBe(source.getSnapshot().recording.snapshot);
      await source.load(request); expect(loadSubflow).toHaveBeenCalledTimes(1);
    } finally { source.dispose(); }
  });

  it('publishes admitted children without resetting the host shared cursor', async () => {
    const { full, root } = input(); const request = root.invocations.find(value => value.invocationPath.length === 1)!;
    const source = createLensRecordingSource({ root, loadSubflow: req => child(full, req) });
    const hook = renderHook(() => ({ snapshot: useRecordingSource(source), shared: useSharedCursor(source.observed.recorder,undefined,{scopePositions:source.getAxis}) }));
    try {
      act(() => hook.result.current.shared.forAxis('step').moveTo(0));
      const held = hook.result.current.shared.target, before = hook.result.current.shared.forAxis('step').at;
      await act(async () => { await source.load(request); });
      expect(hook.result.current.shared.target).toBe(held);
      expect(hook.result.current.shared.forAxis('step').at).toEqual(before);
      expect(hook.result.current.snapshot?.loads[0]?.status).toBe('ready');
      const exactAxis = source.getAxis(request.invocationPath);
      expect(hook.result.current.shared.forAxis('step',request.invocationPath).total).toBe(exactAxis.length);
      act(()=>hook.result.current.shared.forAxis('step',request.invocationPath).moveTo(0));
      expect(hook.result.current.shared.address).toEqual({runtimeStageId:exactAxis[0]!.runtimeStageId,commitIdx:exactAxis[0]!.commitIdx,drillPath:request.invocationPath});
    } finally { hook.unmount(); source.dispose(); }
  });

  it('does not dispose a shared source when one of its readers unmounts', async () => {
    const { full, root } = input(); const request = root.invocations.find(value => value.invocationPath.length === 1)!;
    const source = createLensRecordingSource({ root, loadSubflow: req => child(full, req) });
    const one = renderHook(() => useRecordingSource(source)), two = renderHook(() => useRecordingSource(source));
    try {
      one.unmount(); await act(async () => { await source.load(request); });
      expect(two.result.current?.loads[0]?.status).toBe('ready');
    } finally { two.unmount(); source.dispose(); }
  });

  it('rejects a foreign request before contacting a loader and suppresses stale completion after disposal', async () => {
    const { full, root } = input(); const request = root.invocations.find(value => value.invocationPath.length === 1)!;
    let release!: (value: { result: unknown }) => void;
    const loadSubflow = vi.fn(() => new Promise<{ result: unknown }>(resolve => { release = resolve; }));
    const source = createLensRecordingSource({ root, loadSubflow });
    await expect(source.load({ ...request, runId: 'another-run' })).rejects.toThrow();
    expect(loadSubflow).not.toHaveBeenCalled();
    const pending = source.load(request); const rejected = expect(pending).rejects.toThrow();
    await waitFor(() => expect(loadSubflow).toHaveBeenCalledTimes(1));
    const before = source.getSnapshot().recording; source.dispose(); release(child(full, request)); await rejected;
    expect(source.getSnapshot().recording).toBe(before);
    await expect(source.load(request)).rejects.toThrow('disposed');
  });

  it('preserves native privacy, provenance and resume fields before and after admission', async () => {
    const full = fixture();
    Object.assign(full.snapshot, { stateValuesWithheld: true, initialState: { retained: 'resume base' },
      logAddress: { logRunId: 'recorded-log', drillPath: [] }, nestedReadTracking: true,
      resumeMetadata: { original: 'retained without reinterpretation' } });
    const projected = projectRecordingSource(full); if (projected.status !== 'ready') throw Error('Native fixture projection failed');
    const root = projected.value, request = root.invocations.find(value => value.invocationPath.length === 1)!;
    const source = createLensRecordingSource({ root, loadSubflow: req => child(full, req) });
    const assertRoot = () => {
      for (const [key, value] of Object.entries(root.recording.snapshot ?? {})) {
        expect(source.getSnapshot().recording.snapshot?.[key]).toEqual(value);
      }
      expect(source.observed.runner?.getLastSnapshot()).toBe(source.getSnapshot().recording.snapshot);
    };
    try { assertRoot(); await source.load(request); assertRoot(); }
    finally { source.dispose(); }
  });

  it('exposes a fixed native failure instead of arbitrary loader error text', async () => {
    const { root } = input(); const request = root.invocations.find(value => value.invocationPath.length === 1)!;
    const source = createLensRecordingSource({ root, loadSubflow: () => { throw Error('private-host-token'); } });
    try {
      await expect(source.load(request)).rejects.toThrow('Recorded subflow could not be loaded.');
      expect(source.getSnapshot().loads[0]?.message).toBe('Recorded subflow could not be loaded.');
      expect(JSON.stringify(source.getSnapshot().loads)).not.toContain('private-host-token');
    } finally { source.dispose(); }
  });
  it('keeps expensive replay data stable for load/preparation status and publishes coherent admitted data', async () => {
    const { full, root } = input(), request = root.invocations[0]!;
    let release!: (value: {result: unknown}) => void;
    const source = createLensRecordingSource({root, loadSubflow: () => new Promise(resolve => { release = resolve; })});
    const before = source.getSnapshot().recording, version = source.observed.recorder.getVersion();
    const overlay = source.getOverlay([]), axis = source.getAxis([]);
    const seen: boolean[] = [];
    const off = source.observed.recorder.subscribe(() => seen.push(source.observed.runner?.getLastSnapshot() === source.getSnapshot().recording.snapshot));
    try {
      const pending = source.load(request); await waitFor(() => expect(release).toBeTypeOf('function'));
      expect(source.getSnapshot().recording).toBe(before);
      expect(source.getOverlay([])).toBe(overlay); expect(source.getAxis([])).toBe(axis);
      expect(source.observed.recorder.getVersion()).toBe(version);
      release(child(full, request)); await pending;
      expect(source.getSnapshot().recording).not.toBe(before);
      expect(seen.length).toBeGreaterThan(0); expect(seen.every(Boolean)).toBe(true);
    } finally { off(); source.dispose(); }
  });

  it('rejects accessor metadata without running it or contacting the host', async () => {
    const {root} = input(), request = root.invocations[0]!;
    const loadSubflow = vi.fn(), getter = vi.fn(() => request.runId);
    const source = createLensRecordingSource({root, loadSubflow});
    const supplied = Object.defineProperty({...request}, 'runId', {get: getter});
    try { await expect(source.load(supplied)).rejects.toThrow('unavailable'); expect(getter).not.toHaveBeenCalled(); expect(loadSubflow).not.toHaveBeenCalled(); }
    finally { source.dispose(); }
  });

  it('loads genuine nested engine ancestors in order using their exact native identities', async () => {
    const leaf = flowChart('Write', () => {}, 'write').build();
    const middle = flowChart('Middle', () => {}, 'middle').addSubFlowChartNext('leaf', leaf, 'Leaf').build();
    const rootFlow = flowChart('Root', () => {}, 'root').addSubFlowChartNext('outer', middle, 'Outer').build();
    const execution = new FlowChartExecutor(rootFlow); await execution.run();
    const full = {snapshot: execution.getSnapshot(), events: []};
    const projected = projectRecordingSource(full); if (projected.status !== 'ready') throw Error('Native nested projection failed');
    const calls: RecordedInvocation[] = [];
    const source = createLensRecordingSource({root: projected.value, loadSubflow: request => {calls.push(request);return child(full, request);}});
    try {
      const nested = projected.value.invocations.find(value => value.invocationPath.length === 2)!;
      expect(nested.subflowId).toBe('outer/leaf');
      await source.load(nested);
      expect(calls.map(value => value.invocationPath)).toEqual([nested.invocationPath.slice(0,1), nested.invocationPath]);
      expect(source.getSnapshot().loads.filter(value => value.status === 'ready')).toHaveLength(2);
    } finally { source.dispose(); }
  });

  it('resolves a native child stop to the exact existing step axis and refuses wrong coordinates', async () => {
    const {full,root} = input(), request = root.invocations.find(value => value.subflowId === 'sf-injection-engine')!;
    const source = createLensRecordingSource({root,loadSubflow: value => child(full,value)});
    try {
      await source.load(request);
      const projected = projectTraceInvocation(source.getSnapshot().recording.snapshot as never, request.mountRuntimeStageId, {invocationPath:request.invocationPath});
      expect(projected.availability.ok).toBe(true);
      const axis = source.getAxis(request.invocationPath);
      const overlay = source.getOverlay(request.invocationPath);
      expect(overlay.executionOrder.map(row=>row.runtimeStageId)).toEqual(axis.map(row=>row.runtimeStageId));
      expect(source.getOverlay(request.invocationPath)).toBe(overlay);
      const commits = projected.commitLog as readonly {runtimeStageId?:string}[];
      const index = commits.findIndex(commit => axis.some(row => row.runtimeStageId === commit.runtimeStageId));
      expect(index).toBeGreaterThanOrEqual(0);
      const runtimeStageId = commits[index]!.runtimeStageId!;
      const exact = axis.find(row => row.runtimeStageId === runtimeStageId)!;
      const resolved = await source.resolveAddress({runtimeStageId,commitIdx:index,drillPath:request.invocationPath});
      expect(resolved).toEqual({runtimeStageId,commitIdx:exact.commitIdx,drillPath:request.invocationPath});
      expect(await source.resolveAddress({runtimeStageId:'wrong#1',commitIdx:index,drillPath:request.invocationPath})).toBeUndefined();
      expect(await source.resolveAddress({runtimeStageId,commitIdx:index,drillPath:['foreign#1']})).toBeUndefined();
      const aborted = new AbortController(); aborted.abort();
      expect(await source.resolveAddress({runtimeStageId,commitIdx:index,drillPath:request.invocationPath},{signal:aborted.signal})).toBeUndefined();
    } finally {source.dispose();}
  });

});
