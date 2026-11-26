/**
 * Sub-flow payloads may arrive with the child. The same recorded turn is read
 * two ways, through the same views: payloads in the base row (today's and
 * every older recording) and payloads with their invocation (a base part that
 * moved them). After the payloads are read, every view reads the same; before,
 * a moved payload is "not loaded", never "none recorded" or "in progress".
 * Payload reads go through the host's child read directly, never through the
 * renderer's set of loaded children, which stays for the person's own drills.
 */
import React from 'react';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StepGraph, StepNode } from 'agentfootprint/observe';
import * as native from 'footprint-explainable-ui';
import { childReply, recordedTurn, withPayloadsMoved } from '../../../test/fixtures/payloadsWithInvocation.js';
import { projectRecordingSource, type RecordedInvocation, type RecordedInvocationPayloads } from '../../core/recordingSourceCodec/index.js';
import { observeRecording } from '../../core/observeRecording.js';
import { buildLLMText } from '../../core/copyForLLM.js';
import type { LensRecorder } from '../../core/LensRecorder.js';
import { readPayloadMarks, stepPayloadReader } from '../../core/subflowPayloads/index.js';
import type { SpecNode } from '../../core/buildSpecTreeFromBoundary.js';
import { NodeDetailPanel } from '../NodeDetailPanel.js';
import { useCompareBranches } from '../hooks/useCompareBranches.js';
import { CompareBranchesPanel } from '../components/CompareBranchesPanel.js';
import { createLensRecordingSource } from './controller.js';
import { useStepPayloads } from './useStepPayloads.js';
import { Lens } from '../Lens.js';
import { useSharedCursor } from '../useSharedCursor.js';
import { noBookmarkStore } from '../../core/bookmarks/index.js';
import { fireEvent } from '@testing-library/react';

type Json = Record<string, any>;
type Form = 'row' | 'moved';

function open(form: Form, override?: (payloads: RecordedInvocationPayloads) => RecordedInvocationPayloads, send = true,
  limits: { maxCachedSubflows?: number; maxCachedPayloads?: number } = {}) {
  const turn = recordedTurn();
  const { recording, moved } = form === 'moved' ? withPayloadsMoved(turn) : { recording: turn, moved: undefined };
  const projected = projectRecordingSource(recording);
  if (projected.status !== 'ready') throw new Error(`Projection refused: ${projected.reason}`);
  const loadSubflow = vi.fn(async (request: RecordedInvocation, _options?: { readonly signal: AbortSignal }) =>
    childReply(recording, request, send ? moved : undefined, override));
  const source = createLensRecordingSource({ root: projected.value, loadSubflow, ...limits });
  const flowchart = (source.observed.runner as unknown as { enable: { flowchart(): { getSnapshot(): StepGraph | undefined } } }).enable.flowchart();
  return { source, loadSubflow, graph: flowchart.getSnapshot()!, recording, invocations: projected.value.invocations };
}
const held = (opened: { source: { getSnapshot(): { subflowPayloads?: ReadonlyMap<string, unknown> } } }) =>
  opened.source.getSnapshot().subflowPayloads?.size ?? 0;
const calls = (graph: StepGraph) => graph.nodes.filter(node => node.slotBoundaries?.messages);
const modelCall = (graph: StepGraph): StepNode => graph.nodes.find(node => node.slotBoundaries?.messages)!;
const slotIds = (step: StepNode) => [step.slotBoundaries!.systemPrompt!, step.slotBoundaries!.messages!, step.slotBoundaries!.tools!]
  .map(slot => slot.runtimeStageId);

function Detail({ source, node, related }: { source: ReturnType<typeof open>['source']; node?: StepNode; related?: readonly StepNode[] }) {
  const payloads = useStepPayloads(source, undefined);
  return (
    <NodeDetailPanel {...(node ? { node } : { cursorRuntimeStageId: '__root__#0', rootPhase: 'end' as const })}
      {...(related ? { relatedNodes: related } : {})} payloads={payloads.reader} onNeedPayloads={payloads.request} />
  );
}

describe('a model-call step’s detail: up to three slot children', () => {
  it('shows the same slots for payloads in the row and payloads with the invocation, after reading only those three', async () => {
    const row = open('row'), moved = open('moved');
    try {
      const step = modelCall(row.graph);
      expect(modelCall(moved.graph).id).toBe(step.id);
      const shown = render(<Detail source={row.source} related={[step]} />);
      expect(shown.container.textContent).toContain('Messages (composed)');
      const rowText = shown.container.textContent; shown.unmount();
      expect(row.loadSubflow).not.toHaveBeenCalled();

      const pending = render(<Detail source={moved.source} related={[modelCall(moved.graph)]} />);
      expect(screen.getAllByRole('status').map(node => node.textContent)).toEqual(
        expect.arrayContaining([expect.stringMatching(/^(Not loaded yet|Loading)\. It is stored with its sub-flow invocation\.$/)]));
      expect(pending.container.textContent).not.toMatch(/none recorded|no data recorded|in progress/i);
      await waitFor(() => expect(moved.loadSubflow).toHaveBeenCalledTimes(3));
      expect(moved.loadSubflow.mock.calls.map(([request]) => request.mountRuntimeStageId)).toEqual(slotIds(step));
      await waitFor(() => expect(pending.container.textContent).toBe(rowText));
      // Payload reads never enter the renderer's set of loaded children.
      expect(moved.source.getSnapshot().loads).toEqual([]);
      pending.unmount();
    } finally { row.source.dispose(); moved.source.dispose(); }
  });

  it('shows the same related cards at the run’s end, reading at most nine slot children', async () => {
    const row = open('row'), moved = open('moved');
    try {
      const shown = render(<Detail source={row.source} related={row.graph.nodes} />);
      const rowText = shown.container.textContent; shown.unmount();
      const pending = render(<Detail source={moved.source} related={moved.graph.nodes} />);
      await waitFor(() => expect(moved.loadSubflow).toHaveBeenCalledTimes(9));
      await waitFor(() => expect(held(moved)).toBe(9));
      const count = calls(moved.graph).length;
      expect(count).toBeGreaterThan(3);
      // The cards beyond the first three model calls say exactly that they are not loaded yet.
      const notices = screen.getAllByRole('status').map(node => node.textContent);
      expect(notices).toHaveLength((count - 3) * 3);
      expect(new Set(notices)).toEqual(new Set(['Not loaded yet. It is stored with its sub-flow invocation.']));
      expect(pending.container.textContent).not.toBe(rowText);
      pending.unmount();
    } finally { row.source.dispose(); moved.source.dispose(); }
  });

  it('shows an unavailable payload’s reason for that slot only', async () => {
    const messages = (step: StepNode) => step.slotBoundaries!.messages!.runtimeStageId;
    const row = open('row'), probe = modelCall(row.graph); row.source.dispose();
    const moved = open('moved', payloads => payloads);
    moved.loadSubflow.mockImplementation(async (request: RecordedInvocation) => childReply(moved.recording, request, withPayloadsMoved(recordedTurn()).moved,
      payloads => request.mountRuntimeStageId === messages(probe) ? { ...payloads, exit: { status: 'unavailable', reason: 'part-changed' } } : payloads));
    try {
      render(<Detail source={moved.source} related={[modelCall(moved.graph)]} />);
      await waitFor(() => expect(held(moved)).toBe(3));
      await waitFor(() => expect(screen.getAllByRole('status')).toHaveLength(1));
      expect(screen.getByRole('status').textContent).toBe('Unavailable: part-changed. It is stored with its sub-flow invocation, which could not supply it.');
      expect(screen.getByText('System prompt (composed)')).toBeDefined();
      expect(screen.getByText('Tools (composed)')).toBeDefined();
    } finally { moved.source.dispose(); }
  });

  it('says "not loaded" when a host route replies without the payloads, and when no source can load them', async () => {
    const older = open('moved', undefined, false);
    const first = render(<Detail source={older.source} related={[modelCall(older.graph)]} />);
    try {
      await waitFor(() => expect(held(older)).toBe(3));
      await waitFor(() => expect(screen.getAllByRole('status').map(node => node.textContent)).toEqual(
        Array(3).fill('Not loaded: the reply for its sub-flow invocation did not include it.')));
    } finally { first.unmount(); older.source.dispose(); }

    const { recording } = withPayloadsMoved(recordedTurn());
    const observed = observeRecording(recording, { debug: false });
    try {
      const graph = (observed.runner as unknown as { enable: { flowchart(): { getSnapshot(): StepGraph } } }).enable.flowchart().getSnapshot();
      function NoSource() {
        const payloads = useStepPayloads(undefined, recording.snapshot);
        return <NodeDetailPanel relatedNodes={[modelCall(graph)]} cursorRuntimeStageId="__root__#0" rootPhase="end"
          payloads={payloads.reader} onNeedPayloads={payloads.request} />;
      }
      const shown = render(<NoSource />);
      expect(screen.getAllByRole('status').map(node => node.textContent)).toEqual(
        Array(3).fill('Not loaded: it is stored with its sub-flow invocation, which this view cannot load.'));
      shown.unmount();
    } finally { observed.recorder.detach(); }
  });
});

describe('compare branches: columns from slot exit payloads', () => {
  const spec = (graph: StepGraph): SpecNode => {
    const branch = modelCall(graph).subflowPath[0]!;
    return { name: 'fan', description: 'Parallel: 1-way', children: [{ name: branch, description: '', subflowId: branch }] };
  };
  function columns(form: Form) {
    const opened = open(form);
    const hook = renderHook(() => {
      const payloads = useStepPayloads(opened.source, undefined);
      return useCompareBranches(spec(opened.graph), opened.graph, payloads);
    });
    return { ...opened, hook };
  }

  it('builds the same columns from either recording, loading the last three slot invocations per branch', async () => {
    const row = columns('row'), moved = columns('moved');
    try {
      const expected = row.hook.result.current![0]!;
      expect(expected.sections).toEqual({ systemPrompt: { state: 'recorded' }, messages: { state: 'recorded' }, tools: { state: 'recorded' } });
      expect(row.loadSubflow).not.toHaveBeenCalled();

      const last = [...moved.graph.nodes].reverse().find(node => node.slotBoundaries?.messages)!;
      const first = moved.hook.result.current![0]!;
      expect(first.sections!.messages).toMatchObject({ state: 'not-loaded', invocation: last.slotBoundaries!.messages!.runtimeStageId });
      const panel = render(<CompareBranchesPanel columns={moved.hook.result.current!} />);
      expect(screen.getAllByRole('status')).toHaveLength(3);
      panel.unmount();
      await waitFor(() => expect(moved.loadSubflow).toHaveBeenCalledTimes(3));
      expect(moved.loadSubflow.mock.calls.map(([request]) => request.mountRuntimeStageId)).toEqual(slotIds(last));
      await waitFor(() => expect(moved.hook.result.current![0]).toEqual(expected));
    } finally { row.source.dispose(); moved.source.dispose(); row.hook.unmount(); moved.hook.unmount(); }
  });
});

describe('compare branches: a loaded slot exit fills its column', () => {
  it('reads raw slot values from the loaded children, and says which are not loaded until then', async () => {
    const slot = (id: string) => ({ runtimeStageId: id });
    const call = { id: 'call#5', kind: 'user->llm', label: 'call', startOffsetMs: 0, subflowPath: ['branch-a'], runtimeStageId: 'call#5',
      slotBoundaries: { systemPrompt: slot('sp#2'), messages: slot('msg#3'), tools: slot('tools#4') } } as unknown as StepNode;
    const graph = { nodes: [call], edges: [] } as unknown as StepGraph;
    const spec: SpecNode = { name: 'fan', description: 'Parallel: 1-way', children: [{ name: 'branch-a', description: '', subflowId: 'branch-a' }] };
    const marks = readPayloadMarks({ recorders: [{ name: 'BoundaryEvents', data: ['sp#2', 'msg#3', 'tools#4']
      .map(runtimeStageId => ({ type: 'subflow.exit', runtimeStageId, payloadWith: 'invocation' })) }] });
    const values: Record<string, unknown> = { 'sp#2': 'You are helpful.', 'msg#3': [{ role: 'user', content: 'hi' }], 'tools#4': [{ name: 'search', description: 'web' }] };
    const request = vi.fn();
    const { result, rerender } = renderHook(({ ready }: { ready: boolean }) => useCompareBranches(spec, graph, {
      reader: stepPayloadReader({ marks, loadable: new Set(Object.keys(values)), ...(ready && { loads: new Map(Object.entries(values)
        .map(([id, value]) => [id, { status: 'ready' as const, payloads: { exit: { status: 'ready' as const, value } } }])) }) }),
      request }), { initialProps: { ready: false } });
    expect(request).toHaveBeenCalledWith(['sp#2', 'msg#3', 'tools#4']);
    expect(result.current![0]!.sections!.tools).toEqual({ state: 'not-loaded', invocation: 'tools#4', why: 'not-requested' });
    rerender({ ready: true });
    expect(result.current![0]).toMatchObject({ systemPrompt: 'You are helpful.', messages: [{ role: 'user', content: 'hi' }],
      tools: [{ name: 'search', description: 'web' }], sections: { systemPrompt: { state: 'recorded' }, messages: { state: 'recorded' }, tools: { state: 'recorded' } } });
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe('copy for an LLM: every step', () => {
  const recorder = { selectSummary: () => ({ status: 'completed', llmCallCount: 0, toolCallCount: 0, iterationCount: 0,
    totalTokens: { input: 0, output: 0 }, permissionDenials: 0 }), selectEventLog: () => [] } as unknown as LensRecorder;
  const step = (payloads: Json = {}) => ({ id: 'sf-plan#4', runtimeStageId: 'sf-plan#4', kind: 'subflow', label: 'Plan',
    primitiveKind: 'LLMCall', startOffsetMs: 0, subflowPath: ['__root__', 'sf-plan'], ...payloads }) as unknown as StepNode;
  const graph = (node: StepNode) => ({ nodes: [node], edges: [] }) as unknown as StepGraph;
  const marks = readPayloadMarks({ recorders: [{ name: 'BoundaryEvents', data: [
    { type: 'subflow.entry', runtimeStageId: 'sf-plan#4', payloadWith: 'invocation' },
    { type: 'subflow.exit', runtimeStageId: 'sf-plan#4', payloadWith: 'invocation' }] }] });

  it('writes a moved payload as not loaded and lists the step, then reads the same as the row once loaded', () => {
    const inRow = buildLLMText({ recorder, stepGraph: graph(step({ entryPayload: { ask: 'plan' }, exitPayload: { plan: 'done' } })) });
    expect(inRow).toContain('"ask": "plan"');
    expect(inRow).not.toContain('Payloads not loaded');

    const notLoaded = buildLLMText({ recorder, stepGraph: graph(step()), payloads: stepPayloadReader({ marks, loadable: new Set(['sf-plan#4']) }) });
    expect(notLoaded).toContain('**Boundary input** (inputMapper result): Not loaded yet. It is stored with its sub-flow invocation.');
    expect(notLoaded).toContain('# Payloads not loaded');
    expect(notLoaded).toContain('- Step 1 (`sf-plan#4`), input: Not loaded yet.');
    expect(notLoaded).toContain('- Step 1 (`sf-plan#4`), output: Not loaded yet.');
    // Without a reader the row's own marks still say what moved: nothing is left out.
    const fromRow = buildLLMText({ recorder, stepGraph: graph(step()), snapshot: { recorders: [{ name: 'BoundaryEvents', data: [
      { type: 'subflow.entry', runtimeStageId: 'sf-plan#4', payloadWith: 'invocation' },
      { type: 'subflow.exit', runtimeStageId: 'sf-plan#4', payloadWith: 'invocation' }] }] } });
    expect(fromRow).toContain('**Boundary input** (inputMapper result): Not loaded: it is stored with its sub-flow invocation, which this view cannot load.');
    expect(fromRow).toContain('- Step 1 (`sf-plan#4`), output: Not loaded: it is stored');
    expect(fromRow).toContain('Their content is not in this copy');
    expect(fromRow).not.toMatch(/not empty|open each step/i);
    // With no snapshot and no observed runner, no mark is known: a step with no payload prints none (as before).
    expect(buildLLMText({ recorder, stepGraph: graph(step()) })).not.toContain('Boundary input');

    const loaded = buildLLMText({ recorder, stepGraph: graph(step()), payloads: stepPayloadReader({ marks, loads: new Map([['sf-plan#4', {
      status: 'ready', payloads: { entry: { status: 'ready', value: { ask: 'plan' } }, exit: { status: 'ready', value: { plan: 'done' } } } }]]) }) });
    expect(loaded).toBe(inRow);
    const unavailable = buildLLMText({ recorder, stepGraph: graph(step()), payloads: stepPayloadReader({ marks, loads: new Map([['sf-plan#4', {
      status: 'ready', payloads: { entry: { status: 'ready', value: { ask: 'plan' } }, exit: { status: 'unavailable', reason: 'too-large' } } }]]) }) });
    expect(unavailable).toContain('"ask": "plan"');
    expect(unavailable).toContain('- Step 1 (`sf-plan#4`), output: Unavailable: too-large.');
  });

  it('reads the row marks of the recorder’s own runner by default, and prints a recorded null as recorded', () => {
    const { recording } = withPayloadsMoved(recordedTurn());
    const observed = observeRecording(recording, { debug: false });
    try {
      const moved = buildLLMText({ recorder: observed.recorder, stepGraph: graph(step()) });
      expect(moved).toBe(buildLLMText({ recorder: observed.recorder, stepGraph: graph(step()), snapshot: recording.snapshot }));
    } finally { observed.recorder.detach(); }
    const nullInRow = buildLLMText({ recorder, stepGraph: graph(step({ entryPayload: null })) });
    expect(nullInRow).toContain('**Boundary input** (inputMapper result):\n```json\nnull\n```');
    expect(buildLLMText({ recorder, stepGraph: graph(step()), payloads: stepPayloadReader({ marks, loads: new Map([['sf-plan#4', {
      status: 'ready', payloads: { entry: { status: 'ready', value: null } } }]]) }) })).toContain('**Boundary input** (inputMapper result):\n```json\nnull\n```');
  });

  it('reads the recorded turn the same either way once its children are loaded', async () => {
    const row = open('row'), moved = open('moved');
    try {
      for (const request of moved.source.getSnapshot().invocations) await moved.source.loadPayloads!(request);
      expect(moved.source.getSnapshot().loads).toEqual([]);
      const reader = (opened: ReturnType<typeof open>) => renderHook(() => useStepPayloads(opened.source, undefined)).result.current.reader;
      const text = (opened: ReturnType<typeof open>) => buildLLMText({ recorder, stepGraph: opened.graph, payloads: reader(opened) });
      expect(text(moved)).toBe(text(row));
    } finally { row.source.dispose(); moved.source.dispose(); }
  });
});

describe('the lazy source keeps a reply’s payloads beside the renderer’s child', () => {
  it('hands the renderer the reply without payloads, and keeps the admitted payloads from an explicit child load', async () => {
    const turn = recordedTurn(), { recording, moved } = withPayloadsMoved(turn);
    const projected = projectRecordingSource(recording); if (projected.status !== 'ready') throw new Error('refused');
    const seen: unknown[] = [];
    const source = createLensRecordingSource({ root: projected.value,
      loadSubflow: request => childReply(recording, request, moved),
      prepareSubflow: (value, request, options) => { seen.push(value); return native.prepareSubflow(value, request, options); } });
    try {
      const request = projected.value.invocations[0]!;
      expect(source.getSnapshot().subflowPayloads!.size).toBe(0);
      await act(async () => { await source.load(request); });
      expect(seen).toHaveLength(1);
      expect(Object.keys(seen[0] as object)).toEqual(['result']);
      const payloads = source.getSnapshot().subflowPayloads!.get(request.mountRuntimeStageId)!;
      expect(payloads).toEqual({ entry: { status: 'ready', value: moved.get(request.mountRuntimeStageId)!.entry },
        exit: { status: 'ready', value: moved.get(request.mountRuntimeStageId)!.exit } });
      expect(Object.isFrozen(payloads)).toBe(true);
    } finally { source.dispose(); }
  });

  it('forwards a reply without payloads untouched and records that it carried none', async () => {
    const full = recordedTurn(), projected = projectRecordingSource(full); if (projected.status !== 'ready') throw new Error('refused');
    const replies: unknown[] = [], seen: unknown[] = [];
    const source = createLensRecordingSource({ root: projected.value,
      loadSubflow: request => { const reply = childReply(full, request); replies.push(reply); return reply; },
      prepareSubflow: (value, request, options) => { seen.push(value); return native.prepareSubflow(value, request, options); } });
    try {
      const request = projected.value.invocations[0]!;
      await act(async () => { await source.load(request); });
      // The renderer admits its own copy; the reply reached it whole, with nothing taken out or added.
      expect(seen[0]).toEqual(replies[0]);
      expect(Object.keys(seen[0] as object)).toEqual(['result']);
      expect(source.getSnapshot().subflowPayloads!.get(request.mountRuntimeStageId)).toBeNull();
    } finally { source.dispose(); }
  });

  it('refuses a malformed payloads member as a failed load, never a partial child', async () => {
    const full = recordedTurn(), projected = projectRecordingSource(full); if (projected.status !== 'ready') throw new Error('refused');
    const source = createLensRecordingSource({ root: projected.value,
      loadSubflow: request => ({ ...childReply(full, request), payloads: { entry: { status: 'ready' } } }) as never });
    try {
      const request = projected.value.invocations[0]!;
      await expect(source.load(request)).rejects.toThrow('Recorded subflow could not be loaded.');
      expect(source.getSnapshot().loads[0]?.status).toBe('error');
      expect(source.getSnapshot().subflowPayloads!.size).toBe(0);
    } finally { source.dispose(); }
  });

  it('reads a reply with `payloads: undefined` as one without payloads', async () => {
    const { recording } = withPayloadsMoved(recordedTurn());
    const projected = projectRecordingSource(recording); if (projected.status !== 'ready') throw new Error('refused');
    const source = createLensRecordingSource({ root: projected.value,
      loadSubflow: request => ({ result: childReply(recording, request).result, payloads: undefined }) });
    try {
      const request = projected.value.invocations[0]!;
      await act(async () => { await source.loadPayloads!(request); });
      expect(source.getSnapshot().subflowPayloads!.get(request.mountRuntimeStageId)).toBeNull();
      expect(source.getSnapshot().payloadReads!.size).toBe(0);
      await act(async () => { await source.load(request); });
      expect(source.getSnapshot().loads.map(load => load.status)).toEqual(['ready']);
    } finally { source.dispose(); }
  });
});

describe('the Lens wires the payload reader into its detail panel', () => {
  async function runEnd(form: Form) {
    const opened = open(form);
    function Host() {
      const shared = useSharedCursor(opened.source.observed.recorder);
      return <Lens recorder={opened.source.observed.recorder} runner={opened.source.observed.runner} recordingSource={opened.source}
        shared={shared} granularity="group" bookmarkStore={noBookmarkStore()} />;
    }
    const mounted = render(<Host />);
    // Run · end on the grouped axis: the detail shows every model call's card.
    fireEvent.click(screen.getByRole('button', { name: 'Jump to latest' }));
    return { ...opened, mounted };
  }

  it('reads the shown slot payloads for a moved recording and none for a recording with payloads in the row', async () => {
    const row = await runEnd('row');
    try {
      await waitFor(() => expect(screen.getAllByText('Messages (composed)')).toHaveLength(calls(row.graph).length));
      expect(row.loadSubflow).not.toHaveBeenCalled();
      expect(screen.queryAllByText(/It is stored with its sub-flow invocation/)).toEqual([]);
    } finally { row.mounted.unmount(); row.source.dispose(); }
    const moved = await runEnd('moved');
    try {
      await waitFor(() => expect(moved.loadSubflow).toHaveBeenCalledTimes(9));
      await waitFor(() => expect(screen.getAllByText('Messages (composed)')).toHaveLength(calls(moved.graph).length));
      await waitFor(() => expect(screen.getAllByText('Not loaded yet. It is stored with its sub-flow invocation.'))
        .toHaveLength((calls(moved.graph).length - 3) * 3));
      expect(moved.source.getSnapshot().loads).toEqual([]);
      expect(screen.queryAllByText(/no data recorded/)).toEqual([]);
    } finally { moved.mounted.unmount(); moved.source.dispose(); }
  });
});

describe('useStepPayloads — holding payload reads', () => {
  it('shows a failed read as failed, does not read it again, skips ids outside the manifest, and never touches the renderer', async () => {
    const { recording } = withPayloadsMoved(recordedTurn());
    const projected = projectRecordingSource(recording); if (projected.status !== 'ready') throw new Error('refused');
    const loadSubflow = vi.fn((_request: RecordedInvocation) => { throw new Error('host refused'); });
    const real = createLensRecordingSource({ root: projected.value, loadSubflow });
    const source = { ...real, load: vi.fn(real.load) };
    try {
      const graph = (real.observed.runner as unknown as { enable: { flowchart(): { getSnapshot(): StepGraph } } }).enable.flowchart().getSnapshot();
      const step = modelCall(graph), id = step.slotBoundaries!.messages!.runtimeStageId;
      const { result } = renderHook(() => useStepPayloads(source, undefined));
      let release!: () => void;
      act(() => { release = result.current.request([id, 'not-a-mount#99']); });
      await waitFor(() => expect(result.current.reader.read(step.slotBoundaries!.messages, 'exit'))
        .toEqual({ state: 'not-loaded', invocation: id, why: 'load-failed' }));
      expect(real.getSnapshot().payloadReads!.get(id)).toBe('error');
      act(() => { result.current.request([id]); });
      expect(loadSubflow).toHaveBeenCalledTimes(1);
      expect(source.load).not.toHaveBeenCalled();
      release();
    } finally { real.dispose(); }
  });
});

describe('payload reads never use up the renderer’s limit on loaded children', () => {
  it('reads every model call’s payloads on a recording with more invocations than any limit, then the person’s drills still load', async () => {
    const moved = open('moved', undefined, true, { maxCachedSubflows: 4, maxCachedPayloads: 4 });
    try {
      expect(moved.invocations.length).toBeGreaterThan(4 * 2);
      // Scrub across every model call, then the run's end (nine slot children at once).
      for (const step of calls(moved.graph)) {
        const shown = render(<Detail source={moved.source} related={[step]} />);
        await waitFor(() => expect(shown.container.textContent).not.toMatch(/It is stored with its sub-flow invocation/));
        shown.unmount();
      }
      const end = render(<Detail source={moved.source} related={moved.graph.nodes} />);
      await waitFor(() => {
        expect(held(moved)).toBeGreaterThanOrEqual(9);
        expect(screen.queryAllByText(/^Loading\./)).toEqual([]);
      });
      // Nine held past a capacity of four (a shown payload is never evicted), at most four more kept
      // unheld, and nothing refused: a card past the nine is either still kept or says "not loaded yet".
      expect(held(moved)).toBeLessThanOrEqual(9 + 4);
      expect(screen.queryAllByText(/could not be loaded|Unavailable/)).toEqual([]);
      for (const notice of screen.queryAllByRole('status')) expect(notice.textContent).toBe('Not loaded yet. It is stored with its sub-flow invocation.');
      end.unmount();
      expect(held(moved)).toBe(4);
      expect(moved.source.getSnapshot().loads).toEqual([]);
      // The renderer's four are all still the person's.
      const drills = moved.invocations.slice(0, 4);
      for (const request of drills) await act(async () => { await moved.source.load(request); });
      expect(moved.source.getSnapshot().loads.map(load => load.status)).toEqual(['ready', 'ready', 'ready', 'ready']);
    } finally { moved.source.dispose(); }
  });

  it('cancels the reads a view no longer shows when the person moves', async () => {
    const turn = recordedTurn(), { recording, moved } = withPayloadsMoved(turn);
    const projected = projectRecordingSource(recording); if (projected.status !== 'ready') throw new Error('refused');
    const signals = new Map<string, AbortSignal>();
    const loadSubflow = vi.fn((request: RecordedInvocation, options: { readonly signal: AbortSignal }) => {
      signals.set(request.mountRuntimeStageId, options.signal);
      return new Promise<never>(() => {});
    });
    const source = createLensRecordingSource({ root: projected.value, loadSubflow });
    try {
      const graph = (source.observed.runner as unknown as { enable: { flowchart(): { getSnapshot(): StepGraph } } }).enable.flowchart().getSnapshot();
      const [first, second] = calls(graph);
      const shown = render(<Detail source={source} related={[first!]} />);
      await waitFor(() => expect(loadSubflow).toHaveBeenCalledTimes(3));
      shown.rerender(<Detail source={source} related={[second!]} />);
      await waitFor(() => expect(loadSubflow).toHaveBeenCalledTimes(6));
      expect(slotIds(first!).map(id => signals.get(id)!.aborted)).toEqual([true, true, true]);
      expect(slotIds(second!).map(id => signals.get(id)!.aborted)).toEqual([false, false, false]);
      expect([...source.getSnapshot().payloadReads!.keys()].sort()).toEqual([...slotIds(second!)].sort());
      shown.unmount();
      void moved;
    } finally { source.dispose(); }
  });
});
