/**
 * Sub-flow payloads may arrive with the child. The same recorded turn is read
 * two ways, through the same views: payloads in the base row (today's and
 * every older recording) and payloads with their invocation (a base part that
 * moved them). After the children load, every view reads the same; before,
 * a moved payload is "not loaded", never "none recorded" or "in progress".
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
import { createLensRecordingSource, splitReply } from './controller.js';
import { useStepPayloads } from './useStepPayloads.js';
import { Lens } from '../Lens.js';
import { useSharedCursor } from '../useSharedCursor.js';
import { noBookmarkStore } from '../../core/bookmarks/index.js';
import { fireEvent } from '@testing-library/react';

type Json = Record<string, any>;
type Form = 'row' | 'moved';

function open(form: Form, override?: (payloads: RecordedInvocationPayloads) => RecordedInvocationPayloads, send = true) {
  const turn = recordedTurn();
  const { recording, moved } = form === 'moved' ? withPayloadsMoved(turn) : { recording: turn, moved: undefined };
  const projected = projectRecordingSource(recording);
  if (projected.status !== 'ready') throw new Error(`Projection refused: ${projected.reason}`);
  const loadSubflow = vi.fn(async (request: RecordedInvocation) => childReply(recording, request, send ? moved : undefined, override));
  const source = createLensRecordingSource({ root: projected.value, loadSubflow });
  const flowchart = (source.observed.runner as unknown as { enable: { flowchart(): { getSnapshot(): StepGraph | undefined } } }).enable.flowchart();
  return { source, loadSubflow, graph: flowchart.getSnapshot()!, recording };
}
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
  it('shows the same slots for payloads in the row and payloads with the invocation, after loading only those three', async () => {
    const row = open('row'), moved = open('moved');
    try {
      const step = modelCall(row.graph);
      expect(modelCall(moved.graph).id).toBe(step.id);
      const shown = render(<Detail source={row.source} node={step} />);
      expect(shown.container.textContent).toContain('Messages (composed)');
      const rowText = shown.container.textContent; shown.unmount();
      expect(row.loadSubflow).not.toHaveBeenCalled();

      const pending = render(<Detail source={moved.source} node={modelCall(moved.graph)} />);
      expect(screen.getAllByRole('status').map(node => node.textContent)).toEqual(
        expect.arrayContaining([expect.stringMatching(/^(Not loaded yet|Loading)\. It is stored with its sub-flow invocation\.$/)]));
      expect(pending.container.textContent).not.toMatch(/none recorded|no data recorded|in progress/i);
      await waitFor(() => expect(moved.loadSubflow).toHaveBeenCalledTimes(3));
      expect(moved.loadSubflow.mock.calls.map(([request]) => request.mountRuntimeStageId)).toEqual(slotIds(step));
      await waitFor(() => expect(pending.container.textContent).toBe(rowText));
      pending.unmount();
    } finally { row.source.dispose(); moved.source.dispose(); }
  });

  it('shows the same related cards at the run’s end, loading at most nine slot children', async () => {
    const row = open('row'), moved = open('moved');
    try {
      const shown = render(<Detail source={row.source} related={row.graph.nodes} />);
      const rowText = shown.container.textContent; shown.unmount();
      const pending = render(<Detail source={moved.source} related={moved.graph.nodes} />);
      await waitFor(() => expect(moved.loadSubflow).toHaveBeenCalledTimes(9));
      await waitFor(() => expect(moved.source.getSnapshot().loads.filter(load => load.status === 'ready')).toHaveLength(9));
      const calls = moved.graph.nodes.filter(node => node.slotBoundaries).length;
      expect(calls).toBeGreaterThan(3);
      // The cards beyond the first three model calls say exactly that they are not loaded yet.
      const notices = screen.getAllByRole('status').map(node => node.textContent);
      expect(notices).toHaveLength((calls - 3) * 3);
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
      render(<Detail source={moved.source} node={modelCall(moved.graph)} />);
      await waitFor(() => expect(moved.source.getSnapshot().loads.filter(load => load.status === 'ready')).toHaveLength(3));
      await waitFor(() => expect(screen.getAllByRole('status')).toHaveLength(1));
      expect(screen.getByRole('status').textContent).toBe('Unavailable: part-changed. It is stored with its sub-flow invocation, which could not supply it.');
      expect(screen.getByText('System prompt (composed)')).toBeDefined();
      expect(screen.getByText('Tools (composed)')).toBeDefined();
    } finally { moved.source.dispose(); }
  });

  it('says "not loaded" when a host route replies without the payloads, and when no source can load them', async () => {
    const older = open('moved', undefined, false);
    const first = render(<Detail source={older.source} node={modelCall(older.graph)} />);
    try {
      await waitFor(() => expect(older.source.getSnapshot().loads.filter(load => load.status === 'ready')).toHaveLength(3));
      await waitFor(() => expect(screen.getAllByRole('status').map(node => node.textContent)).toEqual(
        Array(3).fill('Not loaded: the reply for its sub-flow invocation did not include it.')));
    } finally { first.unmount(); older.source.dispose(); }

    const { recording } = withPayloadsMoved(recordedTurn());
    const observed = observeRecording(recording, { debug: false });
    try {
      const graph = (observed.runner as unknown as { enable: { flowchart(): { getSnapshot(): StepGraph } } }).enable.flowchart().getSnapshot();
      function NoSource() {
        const payloads = useStepPayloads(undefined, recording.snapshot);
        return <NodeDetailPanel node={modelCall(graph)} payloads={payloads.reader} onNeedPayloads={payloads.request} />;
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
    expect(buildLLMText({ recorder, stepGraph: graph(step()) })).not.toContain('Boundary input');

    const loaded = buildLLMText({ recorder, stepGraph: graph(step()), payloads: stepPayloadReader({ marks, loads: new Map([['sf-plan#4', {
      status: 'ready', payloads: { entry: { status: 'ready', value: { ask: 'plan' } }, exit: { status: 'ready', value: { plan: 'done' } } } }]]) }) });
    expect(loaded).toBe(inRow);
    const unavailable = buildLLMText({ recorder, stepGraph: graph(step()), payloads: stepPayloadReader({ marks, loads: new Map([['sf-plan#4', {
      status: 'ready', payloads: { entry: { status: 'ready', value: { ask: 'plan' } }, exit: { status: 'unavailable', reason: 'too-large' } } }]]) }) });
    expect(unavailable).toContain('"ask": "plan"');
    expect(unavailable).toContain('- Step 1 (`sf-plan#4`), output: Unavailable: too-large.');
  });

  it('reads the recorded turn the same either way once its children are loaded', async () => {
    const row = open('row'), moved = open('moved');
    try {
      for (const request of moved.source.getSnapshot().invocations) await moved.source.load(request);
      const reader = (opened: ReturnType<typeof open>) => renderHook(() => useStepPayloads(opened.source, undefined)).result.current.reader;
      const text = (opened: ReturnType<typeof open>) => buildLLMText({ recorder, stepGraph: opened.graph, payloads: reader(opened) });
      expect(text(moved)).toBe(text(row));
    } finally { row.source.dispose(); moved.source.dispose(); }
  });
});

describe('the lazy source keeps a reply’s payloads beside the renderer’s child', () => {
  it('hands the renderer the reply without payloads, and serves the admitted payloads once the child is ready', async () => {
    const turn = recordedTurn(), { recording, moved } = withPayloadsMoved(turn);
    const projected = projectRecordingSource(recording); if (projected.status !== 'ready') throw new Error('refused');
    const seen: unknown[] = [];
    const source = createLensRecordingSource({ root: projected.value,
      loadSubflow: request => childReply(recording, request, moved),
      prepareSubflow: (value, request, options) => { seen.push(value); return native.prepareSubflow(value, request, options); } });
    try {
      const request = projected.value.invocations[0]!;
      expect(source.getSnapshot().subflowPayloads.size).toBe(0);
      await act(async () => { await source.load(request); });
      expect(seen).toHaveLength(1);
      expect(Object.keys(seen[0] as object)).toEqual(['result']);
      const payloads = source.getSnapshot().subflowPayloads.get(request.mountRuntimeStageId)!;
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
      expect(source.getSnapshot().subflowPayloads.get(request.mountRuntimeStageId)).toBeNull();
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
      expect(source.getSnapshot().subflowPayloads.size).toBe(0);
    } finally { source.dispose(); }
  });
});

describe('the Lens wires the payload reader into its detail panel', () => {
  async function runEnd(form: Form) {
    const opened = open(form);
    function Host() {
      const shared = useSharedCursor(opened.source.observed.recorder);
      return <Lens recorder={opened.source.observed.recorder} runner={opened.source.observed.runner} recordingSource={opened.source}
        shared={shared} bookmarkStore={noBookmarkStore()} />;
    }
    const mounted = render(<Host />);
    // Every moment is listed at the latest step; the first model call's detail shows its three slots.
    fireEvent.click(screen.getByRole('button', { name: 'Jump to latest' }));
    fireEvent.click(await screen.findByRole('option', { name: /call-llm 1$/ }));
    return { ...opened, mounted };
  }

  it('loads the shown slot children for a moved recording and none for a recording with payloads in the row', async () => {
    const row = await runEnd('row');
    try {
      await waitFor(() => expect(screen.getAllByText('Messages (composed)').length).toBeGreaterThan(0));
      expect(row.loadSubflow).not.toHaveBeenCalled();
      expect(screen.queryAllByText(/It is stored with its sub-flow invocation/)).toEqual([]);
    } finally { row.mounted.unmount(); row.source.dispose(); }
    const moved = await runEnd('moved');
    try {
      expect(screen.getAllByText(/^(Not loaded yet|Loading)\. It is stored with its sub-flow invocation\.$/).length).toBe(3);
      await waitFor(() => expect(moved.loadSubflow).toHaveBeenCalledTimes(3));
      await waitFor(() => expect(screen.queryAllByText(/It is stored with its sub-flow invocation/)).toEqual([]));
      expect(screen.getAllByText('Messages (composed)').length).toBeGreaterThan(0);
      expect(screen.queryAllByText(/no data recorded/)).toEqual([]);
    } finally { moved.mounted.unmount(); moved.source.dispose(); }
  });
});

describe('splitReply — only the payloads member is taken out', () => {
  it('returns a reply without payloads as the same object, and copies the rest of one with payloads', () => {
    const plain = { result: { a: 1 }, graph: { nodes: [] } };
    expect(splitReply(plain)).toEqual({ forward: plain, payloads: null });
    expect(splitReply(plain).forward).toBe(plain);
    let calls = 0;
    const withPayloads = { result: { a: 1 }, graph: { nodes: [] }, payloads: { exit: { status: 'ready', value: 'x' } } };
    Object.defineProperty(withPayloads, 'narrativeEntries', { enumerable: true, get() { calls++; return []; } });
    const split = splitReply(withPayloads);
    expect(Object.keys(split.forward as object)).toEqual(['result', 'graph', 'narrativeEntries']);
    expect((split.forward as { result: unknown }).result).toBe(withPayloads.result);
    expect(Object.getOwnPropertyDescriptor(split.forward, 'narrativeEntries')?.get).toBeTypeOf('function');
    expect(split.payloads).toEqual({ exit: { status: 'ready', value: 'x' } });
    expect(calls).toBe(0);
    const accessor = { result: 1 } as Record<string, unknown>;
    Object.defineProperty(accessor, 'payloads', { enumerable: true, get() { calls++; return {}; } });
    expect(() => splitReply(accessor)).toThrow('The recorded invocation reply could not be read.');
    expect(calls).toBe(0);
  });
});

describe('useStepPayloads — asking for children', () => {
  it('does not ask again for a child whose load failed, or for one outside the manifest', async () => {
    const full = recordedTurn(), projected = projectRecordingSource(full); if (projected.status !== 'ready') throw new Error('refused');
    const loadSubflow = vi.fn(() => { throw new Error('host refused'); });
    const real = createLensRecordingSource({ root: projected.value, loadSubflow });
    const source = { ...real, load: vi.fn(real.load) };
    try {
      const id = projected.value.invocations[0]!.mountRuntimeStageId;
      const { result } = renderHook(() => useStepPayloads(source, undefined));
      act(() => result.current.request([id, 'not-a-mount#99']));
      await waitFor(() => expect(real.getSnapshot().loads.map(load => load.status)).toEqual(['error']));
      act(() => result.current.request([id]));
      expect(source.load).toHaveBeenCalledTimes(1);
      expect(loadSubflow).toHaveBeenCalledTimes(1);
    } finally { real.dispose(); }
  });
});
