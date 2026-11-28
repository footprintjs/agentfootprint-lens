import * as native from 'footprint-explainable-ui';
import type { RecordingSource, RecordingSourceOptions, SubflowLoadState } from 'footprint-explainable-ui';
import { observeRecordingWithSnapshot, type RecordedSnapshot, type Recording } from '../../core/observeRecording.js';
import { structureGraphFromRunner } from '../../core/collapser/structureGraphFromRunner.js';
import { scrubAxisFor } from '../../core/group/scrubAxisFor.js';
import { readRecordingSourceRoot, type RecordedInvocation, type RecordedSubflowReply } from '../../core/recordingSourceCodec/index.js';
import { createPayloadCache, MAX_CACHED_PAYLOADS, replyBelongsTo, splitReply } from './payloadCache.js';
import type { RuntimeOverlay } from 'footprint-explainable-ui/flowchart';
import type { CursorPosition } from '../../core/group/cursorPositionsAtDrill.js';
import type { LensRecordedModelInputReader, LensRecordingLoad, LensRecordingSource, LensRecordingSourceSnapshot } from './types.js';
import { recordedModelCallAddress } from '../../core/recordedModelInput/address.js';
import { isReceiptShaped } from '../../core/served/receiptShape.js';
import { verify } from '../../core/served/verify.js';

export interface LensRecordingSourceOptions {
  readonly root: unknown;
  /**
   * The host's child read. A reply may carry `payloads` (the invocation's
   * boundary payloads, when the recording stores them with it); Lens admits
   * and keeps them, and hands the rest of the reply to the renderer unchanged.
   * Lens also calls it to read only those payloads (`loadPayloads`); that read
   * keeps the payloads and drops the result, and never enters the renderer's
   * set of loaded children.
   */
  readonly loadSubflow: (request: RecordedInvocation, options: { readonly signal: AbortSignal }) => RecordedSubflowReply | Promise<RecordedSubflowReply>;
  readonly readModelInput?: LensRecordedModelInputReader;
  readonly prepareSubflow?: RecordingSourceOptions['prepareSubflow'];
  readonly maxCachedSubflows?: number;
  /** Invocations whose payloads are kept once no view shows them. Default `MAX_CACHED_PAYLOADS` (64). */
  readonly maxCachedPayloads?: number;
}

/** A native data source paired with one stable event replay. No cursor lives here. */
export function createLensRecordingSource(options: LensRecordingSourceOptions): LensRecordingSource {
  const checked = readRecordingSourceRoot(options.root);
  if (checked.status !== 'ready') {
    if (checked.reason === 'unsupported-recording') throw new Error('The recording cannot be opened as a lazy source.');
    throw new Error('The lazy recording descriptor could not be read.');
  }
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
  // Boundary payloads, by mount runtime id, in this package's own bounded
  // store: read for views without spending the renderer's set of loaded
  // children, and kept from every explicit child reply too.
  const capacity = options.maxCachedPayloads ?? MAX_CACHED_PAYLOADS;
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    observed.recorder.detach();
    throw new Error('maxCachedPayloads must be a whole number of at least 1.');
  }
  const payloads = createPayloadCache({
    capacity,
    read: (request, signal) => options.loadSubflow(request, { signal }),
    changed: () => publish(),
  });
  // An explicit drill's payloads wait until the renderer admits that child,
  // and are kept only from the requested invocation's own reply.
  const drilled = new Map<string, ReturnType<typeof splitReply>['payloads']>();
  const admitReply = (selected: RecordedInvocation, reply: unknown): unknown => {
    const split = splitReply(reply);
    if (replyBelongsTo(reply, selected)) drilled.set(selected.mountRuntimeStageId, split.payloads);
    else drilled.delete(selected.mountRuntimeStageId);
    return split.forward;
  };
  let batching = false;
  /** Keep each drilled child's payloads once the renderer admitted it; drop them if it refused. */
  const settleDrills = (states: ReadonlyMap<string, SubflowLoadState>) => {
    if (!drilled.size) return;
    const status = new Map([...states.values()].map(state => [state.request.mountRuntimeStageId, state.status]));
    batching = true;
    try {
      for (const [id, held] of [...drilled]) {
        const now = status.get(id);
        if (now === 'ready') { drilled.delete(id); payloads.put(id, held); }
        else if (now !== 'loading' && now !== 'preparing') drilled.delete(id);
      }
    } finally { batching = false; }
  };
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
        const answer: unknown = options.loadSubflow(selected, interest);
        return (isThenable(answer) ? Promise.resolve(answer).then(reply => admitReply(selected, reply))
          : admitReply(selected, answer)) as ReturnType<NonNullable<RecordingSourceOptions['loadSubflow']>>;
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
  const compose = (): LensRecordingSourceSnapshot => {
    const next = source.getSnapshot(), held = payloads.view();
    return Object.freeze({ revision: next.revision, recording, invocations: root.invocations, loads: readLoads(next.scopes),
      subflowPayloads: held.ready, payloadReads: held.reads });
  };
  let snapshot: LensRecordingSourceSnapshot = compose();
  const notify = () => { for (const listener of [...listeners]) { try { listener(); } catch { /* A presenter cannot corrupt native publication. */ } } };
  function publish() {
    if (disposed || batching) return;
    snapshot = compose(); notify();
  }
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
    settleDrills(next.scopes);
    snapshot = compose();
    if (changed) observed.recorder.refreshReplaySnapshot();
    notify();
  });
  const readModelInput = options.readModelInput;
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
    loadPayloads(request, interest) {
      if (disposed) return Promise.resolve();
      let selected: RecordedInvocation | undefined;
      try { selected = byPath.get(source.getKey(request.invocationPath)); } catch { selected = undefined; }
      if (selected === undefined || selected.mountRuntimeStageId !== request.mountRuntimeStageId || selected.subflowId !== request.subflowId)
        return Promise.reject(new Error('The recorded invocation is unavailable.'));
      return payloads.want(selected, interest?.signal);
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
    ...(readModelInput !== undefined && {
      async readModelInputAt(address, interest) {
        if (disposed || interest?.signal?.aborted) return undefined;
        try {
          const stop = await controller.resolveAddress(address, interest);
          if (!stop?.drillPath?.length || disposed || interest?.signal?.aborted) return undefined;
          const request = byPath.get(source.getKey(stop.drillPath));
          if (!request) return undefined;
          const child = currentSnapshot.subflowResults?.[request.mountRuntimeStageId];
          const exact = recordedModelCallAddress(request, stop.runtimeStageId, base, root.recording.events ?? [], child);
          if (!exact) return undefined;
          const read = await readModelInput(exact, interest ?? {});
          if (disposed || interest?.signal?.aborted || read.status !== 'ready') return undefined;
          const receipt = read.receipt;
          if (receipt !== undefined && (!isReceiptShaped(receipt) || receipt.basis.runId !== exact.engineRunId)) return undefined;
          return {
            row: {
              epoch: read.view.epoch, callRuntimeStageId: exact.runtimeStageId, commitIdx: exact.commitIdx,
              view: read.view, betweenCalls: false, ...(receipt !== undefined && { receipt }),
            },
            fold: { redacted: false, present: [] },
            checks: verify(read.view, receipt, exact.engineRunId),
          };
        } catch {
          return undefined;
        }
      },
    }),
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
      disposed = true; off(); source.dispose(); observed.recorder.detach(); listeners.clear(); axes.clear(); overlays.clear(); payloads.dispose(); drilled.clear();
    },
  };
  return controller;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (typeof value === 'object' || typeof value === 'function') && value !== null
    && typeof (value as { readonly then?: unknown }).then === 'function';
}

export { splitReply };

