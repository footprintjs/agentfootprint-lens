import * as native from 'footprint-explainable-ui';
import type { RecordingSource, RecordingSourceOptions, SubflowLoadState } from 'footprint-explainable-ui';
import { observeRecordingWithSnapshot, type RecordedSnapshot, type Recording } from '../../core/observeRecording.js';
import { structureGraphFromRunner } from '../../core/collapser/structureGraphFromRunner.js';
import { scrubAxisFor } from '../../core/group/scrubAxisFor.js';
import { readRecordingSourceRoot, type RecordedInvocation } from '../../core/recordingSourceCodec/index.js';
import type { RuntimeOverlay } from 'footprint-explainable-ui/flowchart';
import type { CursorPosition } from '../../core/group/cursorPositionsAtDrill.js';
import type { LensRecordingLoad, LensRecordingSource, LensRecordingSourceSnapshot } from './types.js';

export interface LensRecordingSourceOptions {
  readonly root: unknown;
  readonly loadSubflow: (request: RecordedInvocation, options: { readonly signal: AbortSignal }) => { readonly result: unknown } | Promise<{ readonly result: unknown }>;
  readonly prepareSubflow?: RecordingSourceOptions['prepareSubflow'];
  readonly maxCachedSubflows?: number;
}

/** A native data source paired with one stable event replay. No cursor lives here. */
export function createLensRecordingSource(options: LensRecordingSourceOptions): LensRecordingSource {
  const checked = readRecordingSourceRoot(options.root);
  if (checked.status !== 'ready') throw new Error('The lazy recording descriptor could not be read.');
  // The optional door may be imported beside older supported renderer peers;
  // invoking this feature, rather than importing an ordinary Lens, needs 1.0.1.
  if (typeof native.createRecordingSource !== 'function') throw new Error('Lazy recording sources require footprint-explainable-ui 1.0.1 or newer.');
  const root = checked.value;
  // The codec already validated, copied and froze all replay data. The native
  // loader checks the original tree and history and owns subsequent child results.
  const base = root.recording.snapshot as RecordedSnapshot & RecordingSourceOptions['snapshot'];
  let currentSnapshot = base;
  const overlayChildren = (loaded: RecordingSourceOptions['snapshot']) =>
    Object.freeze({ ...base, ...(loaded.subflowResults !== undefined && { subflowResults: loaded.subflowResults }) });
  const observed = observeRecordingWithSnapshot(root.recording, { debug: false }, () => currentSnapshot);
  const graph = observed.runner === undefined ? { nodes: [], edges: [] } : structureGraphFromRunner(observed.runner);
  const readNarrative = native.narrativeFromSnapshot;
  let source: RecordingSource;
  try {
    source = native.createRecordingSource({
      snapshot: {
        runId: base.runId, executionTree: base.executionTree, commitLog: base.commitLog,
        sharedState: base.sharedState,
        ...(typeof readNarrative !== 'function' && { recorders: base.recorders }),
      },
      graph,
      ...(typeof readNarrative === 'function' && { narrativeEntries: readNarrative(base) ?? [] }),
      loadSubflow: (request, interest) => {
        // Native admission supplied an owned exact request before this host
        // capability is consulted. Never inspect caller accessors ourselves.
        const selected = root.invocations.find(value => value.mountRuntimeStageId === request.mountRuntimeStageId
          && value.subflowId === request.subflowId && value.runId === request.runId
          && value.invocationPath.length === request.invocationPath.length
          && value.invocationPath.every((id, index) => id === request.invocationPath[index]));
        if (selected === undefined) throw new Error('The recorded invocation is unavailable.');
        return options.loadSubflow(selected, interest);
      },
      ...(options.prepareSubflow !== undefined && { prepareSubflow: options.prepareSubflow }),
      ...(options.maxCachedSubflows !== undefined && { maxCachedSubflows: options.maxCachedSubflows }),
    });
  } catch {
    observed.recorder.detach();
    throw new Error('The recording cannot be opened as a lazy source.');
  }
  let loaderSnapshot = source.getSnapshot().snapshot;
  currentSnapshot = overlayChildren(loaderSnapshot);
  const byPath = new Map(root.invocations.map(value => [source.getKey(value.invocationPath), value]));
  let recording: Recording = Object.freeze({ ...root.recording, snapshot: currentSnapshot });
  let disposed = false;
  const axes = new Map<string, readonly CursorPosition[]>();
  const overlays = new Map<string, RuntimeOverlay>();
  const listeners = new Set<() => void>();
  const readLoads = (states: ReadonlyMap<string, SubflowLoadState>): readonly LensRecordingLoad[] => Object.freeze(
    [...states.values()].map(value => Object.freeze({ request: value.request, status: value.status,
      ...(value.status === 'error' && { message: value.message }) })),
  );
  let snapshot: LensRecordingSourceSnapshot = Object.freeze({ revision: source.getSnapshot().revision, recording,
    invocations: root.invocations, loads: readLoads(source.getSnapshot().scopes) });
  const off = source.subscribe(() => {
    if (disposed) return;
    const next = source.getSnapshot();
    const changed = next.snapshot !== loaderSnapshot;
    if (changed) {
      axes.clear(); overlays.clear();
      loaderSnapshot = next.snapshot;
      currentSnapshot = overlayChildren(loaderSnapshot);
      recording = Object.freeze({ ...root.recording, snapshot: currentSnapshot });
    }
    snapshot = Object.freeze({ revision: next.revision, recording, invocations: root.invocations, loads: readLoads(next.scopes) });
    if (changed) observed.recorder.refreshReplaySnapshot();
    for (const listener of [...listeners]) { try { listener(); } catch { /* A presenter cannot corrupt native publication. */ } }
  });
  const controller: LensRecordingSource = {
    observed,
    getSnapshot: () => snapshot,
    subscribe(listener) { if (disposed) return () => {}; listeners.add(listener); return () => { listeners.delete(listener); }; },
    async load(request, interest) {
      if (disposed) throw new Error('The recording source was disposed.');
      // getKey delegates bounded path admission to the native source. Own data
      // reads here do not invoke a caller's property getters. Normalize to the
      // manifest before asking the host to fetch any capability.
      let selected: RecordedInvocation | undefined;
      try {
        const field = (key: string): unknown => {
          const descriptor = Object.getOwnPropertyDescriptor(request, key);
          if (descriptor && !('value' in descriptor)) throw new Error();
          return descriptor && 'value' in descriptor ? descriptor.value : undefined;
        };
        selected = byPath.get(source.getKey(field('invocationPath') as readonly string[]));
        if (selected === undefined || field('mountRuntimeStageId') !== selected.mountRuntimeStageId
          || field('subflowId') !== selected.subflowId
          || (field('runId') !== undefined && field('runId') !== selected.runId)) throw new Error();
      } catch { throw new Error('The recorded invocation is unavailable.'); }
      // Native child admission needs its recorded ancestors. Each prefix is
      // itself a complete manifest unit; source leases deduplicate shared work.
      for (let depth = 1; depth <= selected.invocationPath.length; depth++) {
        const ancestor = byPath.get(source.getKey(selected.invocationPath.slice(0, depth)));
        if (ancestor === undefined) throw new Error('The recorded invocation is unavailable.');
        await source.load(ancestor, interest);
      }
    },
    async resolveAddress(address, interest) {
      if (disposed) return undefined;
      try {
        const own = (key: string): unknown => {
          const descriptor = Object.getOwnPropertyDescriptor(address, key);
          if (descriptor && !('value' in descriptor)) throw new Error();
          return descriptor?.value;
        };
        const suppliedPath = own('drillPath');
        const pathValue = suppliedPath === undefined ? [] : suppliedPath;
        const key = source.getKey(pathValue as readonly string[]);
        const request = key === source.getKey([]) ? undefined : byPath.get(key);
        if (key !== source.getKey([]) && request === undefined) return undefined;
        const path = request?.invocationPath ?? [];
        const runtimeId = own('runtimeStageId'), index = own('commitIdx');
        if (typeof runtimeId !== 'string' || !runtimeId.length || runtimeId.length > 4096
          || typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) return undefined;
        if (request !== undefined) await controller.load(request, interest);
        if (disposed || interest?.signal?.aborted) return undefined;
        const current = currentSnapshot;
        const projection = path.length === 0 ? undefined : native.projectTraceInvocation(current, path[path.length - 1]!, { invocationPath: path });
        if (projection !== undefined && !projection.availability.ok) return undefined;
        const commits = projection?.commitLog ?? current.commitLog;
        const exact = commits[index] as { readonly runtimeStageId?: unknown } | undefined;
        if (exact?.runtimeStageId !== runtimeId) return undefined;
        const axis = controller.getAxis(path);
        const matches = axis.filter(position => position.runtimeStageId === runtimeId
          && position.commitIdx === index);
        if (matches.length !== 1) return undefined;
        return Object.freeze({ runtimeStageId: matches[0]!.runtimeStageId, commitIdx: matches[0]!.commitIdx,
          ...(path.length > 0 && { drillPath: path }) });
      } catch { return undefined; }
    },
    getAxis(path) {
      if (disposed) return [];
      try {
        const key = source.getKey(path), known = axes.get(key);
        if (known !== undefined) return known;
        if (path.length === 0) {
          const result = scrubAxisFor(observed.recorder, 'step'); axes.set(key, result); return result;
        }
        const request = byPath.get(key); if (request === undefined) return [];
        const projection = native.projectTraceInvocation(currentSnapshot, request.mountRuntimeStageId, {invocationPath: request.invocationPath});
        if (!projection.availability.ok) return [];
        const positions: CursorPosition[] = [];
        for (let index = 0; index < projection.commitLog.length; index++) {
          const commit = projection.commitLog[index] as {readonly runtimeStageId?: unknown};
          if (typeof commit.runtimeStageId !== 'string') return [];
          positions.push(Object.freeze({runtimeStageId: commit.runtimeStageId, runtimeGroupId: request.mountRuntimeStageId,
            label: commit.runtimeStageId, kind: 'commit', depth: request.invocationPath.length, commitIdx: index}));
        }
        const result = Object.freeze(positions); axes.set(key, result); return result;
      } catch { return []; }
    },
    getOverlay(path) {
      const key = source.getKey(path), known = overlays.get(key);
      if (known !== undefined) return known;
      if (path.length === 0) {
        const overlay = observed.recorder.runtime.getOverlay(); overlays.set(key, overlay); return overlay;
      }
      const request = byPath.get(key);
      const projection = request === undefined ? undefined : native.projectTraceInvocation(currentSnapshot, request.mountRuntimeStageId, {invocationPath: request.invocationPath});
      const overlay = native.overlayFromSnapshot({commitLog: projection?.availability.ok ? projection.commitLog : []});
      overlays.set(key, overlay); return overlay;
    },
    getGraph: path => source.getGraph(path),
    dispose() {
      if (disposed) return;
      disposed = true; off(); source.dispose(); observed.recorder.detach(); listeners.clear(); axes.clear(); overlays.clear();
    },
  };
  return controller;
}
