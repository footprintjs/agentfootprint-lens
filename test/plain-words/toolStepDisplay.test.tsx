import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { observeRecording } from '../../src/core/observeRecording.js';
import { lensSnapshotRecorder } from '../../src/core/LensSnapshotRecorder.js';
import { selectFocusDetail } from '../../src/core/selectors/selectFocusDetail.js';
import { buildLLMText } from '../../src/core/copyForLLM.js';
import { NodeDetailPanel } from '../../src/react/NodeDetailPanel.js';
import { load } from '../served/helpers.js';

const secret = 'RAW-PROPOSAL-FOR-EXECUTION';
const projection = { region: 'public-region' };

function recordedToolRun() {
  const { recording } = load('flat-dynamic-tools');
  const start = recording.events!.find(e => e.type === 'agentfootprint.stream.tool_start')!;
  if (start.type !== 'agentfootprint.stream.tool_start') throw new Error('Missing recorded tool');
  const rawArgs = { credential: secret };
  // Two calls in the same stage on the same clock tick. The native graph is
  // built from the independent boundary recorder, which retains the actual args.
  const events = recording.events!.flatMap(e => e === start
    ? [{ ...start, payload: { ...start.payload, toolCallId: 'parallel', args: { public: 'first-call' } } },
       { ...start, payload: { ...start.payload, args: rawArgs, shownArgs: projection, hiddenArgs: ['credential'] } }]
    : [e]);
  const snapshot = recording.snapshot!;
  const recorders = snapshot.recorders!.map(r => r.name !== 'BoundaryEvents' ? r : { ...r,
    data: (r.data as Record<string, unknown>[]).flatMap(e => e.type === 'tool.start'
      ? [{ ...e, toolCallId: 'parallel', args: { public: 'first-call' } }, { ...e, args: rawArgs }] : [e]) });
  const { recorder, runner } = observeRecording({ ...recording, snapshot: { ...snapshot, recorders }, events });
  const graph = recorder.getStepGraph();
  const node = graph.nodes.find(n => n.kind === 'llm->tool' && n.id.endsWith('-c1'))!;
  return { recorder, runner, node, graph, events };
}

describe('protected arguments in the step drawer', () => {
  it('drops the saved native graph on clear and projects subsequent events with reused call IDs independently', () => {
    const { recorder, runner, node, events } = recordedToolRun();
    expect(node.toolArgs).toEqual(projection);
    recorder.clear();
    expect(recorder.getStepGraph().nodes).toEqual([]);

    const start = events.find(e => e.type === 'agentfootprint.stream.tool_start' && e.payload.toolCallId === 'c1')!;
    if (start.type !== 'agentfootprint.stream.tool_start') throw new Error('Missing recorded tool');
    const next = { ...start, meta: { ...start.meta, runId: 'next-run' },
      payload: { toolName: start.payload.toolName, toolCallId: 'c1', args: { city: 'next-city' } } };
    (runner as unknown as { emit(event: typeof next): void }).emit(next);
    expect(recorder.getStepGraph().nodes.filter(n => n.kind === 'llm->tool')).toMatchObject([
      { id: node.id, toolArgs: { city: 'next-city' } },
    ]);
  });
  it('withholds reused legacy IDs in a supplied native graph and its copy without masking other calls', () => {
    const { recorder, runner, node, events } = recordedToolRun();
    recorder.clear();
    const start = events.find(e => e.type === 'agentfootprint.stream.tool_start')!;
    if (start.type !== 'agentfootprint.stream.tool_start') throw new Error('Missing recorded tool');
    const emit = (callId: string, name: string) => {
      const event = { ...start, payload: { toolName: name, toolCallId: callId, args: { name } } };
      (runner as unknown as { emit(e: typeof event): void }).emit(event);
    };
    emit('c1', 'first');
    emit('other', 'independent');
    const duplicate = { ...node, toolName: 'different', toolArgs: { value: 'ambiguous-raw-value' } };
    const unique = { ...node, id: node.id.replace(/-c1$/, '-other'), toolArgs: { name: 'independent' } };
    const supplied = { nodes: [duplicate, unique], edges: [] };
    expect(recorder.getStepGraph(supplied)).toBe(supplied);

    emit('c1', 'different');
    const graph = recorder.getStepGraph(supplied);
    expect(graph.nodes[0]?.toolArgs).toBeUndefined();
    expect(graph.nodes[1]).toBe(unique);
    expect(buildLLMText({ recorder, stepGraph: supplied })).not.toContain('ambiguous-raw-value');
    expect(duplicate.toolArgs).toEqual({ value: 'ambiguous-raw-value' });
  });
  it('keeps a known duplicate withheld after its protected start leaves the bounded event log', () => {
    const { events, node } = recordedToolRun();
    const first = events.find(e => e.type === 'agentfootprint.stream.tool_start' && e.payload.toolCallId === 'c1')!;
    if (first.type !== 'agentfootprint.stream.tool_start') throw new Error('Missing recorded tool');
    const last = { ...first, payload: { toolName: 'different', toolCallId: 'c1', args: { token: secret } } };
    const { recorder } = observeRecording({ events: [first, last] }, { maxEvents: 1 });
    const raw = { ...node, toolName: last.payload.toolName, toolArgs: last.payload.args };
    const historical = { ...raw, id: 'historical-step' };
    const [step, unbound] = recorder.getStepGraph({ nodes: [raw, historical], edges: [] }).nodes;
    const retained = recorder.selectEventLog();
    expect(recorder.getDiagnostics().droppedEvents).toBe(1);
    expect(retained.map(entry => entry.seq)).toEqual([1]);
    expect(step?.toolArgs).toBeUndefined();
    expect(selectFocusDetail(step, retained)?.toolArgs).toBeUndefined();
    expect(selectFocusDetail(unbound, retained)?.toolArgs).toBeUndefined();
    // A consumer can also supply a filtered log with the same missing evidence in the middle.
    const earlier = { ...first, payload: { ...first.payload, toolCallId: 'unrelated' } };
    const filtered = [{ ...retained[0]!, event: earlier, seq: 0 }, { ...retained[0]!, seq: 2 }];
    expect(selectFocusDetail(unbound, filtered)?.toolArgs).toBeUndefined();
  });
  it('retains later display evidence for a supplied graph already viewed before its tool start arrived', () => {
    const { recorder, runner, node, events } = recordedToolRun();
    const stage = 'late-stage#1';
    const next = { ...node, runtimeStageId: stage, id: 'step-tool-start-late-stage#1-late',
      toolArgs: { credential: secret } };
    const supplied = { nodes: [next], edges: [] };
    expect(recorder.getStepGraph(supplied)).toBe(supplied);
    const start = events.find(e => e.type === 'agentfootprint.stream.tool_start' && e.payload.toolCallId === 'c1')!;
    if (start.type !== 'agentfootprint.stream.tool_start') throw new Error('Missing recorded tool');
    const late = { ...start, meta: { ...start.meta, runtimeStageId: stage },
      payload: { ...start.payload, toolCallId: 'late' } };
    (runner as unknown as { emit(event: typeof late): void }).emit(late);
    recorder.clear();
    expect(recorder.getStepGraph(supplied).nodes[0]?.toolArgs).toEqual(projection);
  });
  it('decorates the live local snapshot with the same safe proposal', () => {
    const { events } = recordedToolRun();
    const starts = events.filter(e => e.type === 'agentfootprint.stream.tool_start');
    const start = starts[starts.length - 1]!;
    const snapshot = lensSnapshotRecorder();
    snapshot.onSubflowEntry({ name: 'tool', subflowId: 'tool', description: 'Agent: lookup',
      traversalContext: { runId: 'engine-run', runtimeStageId: start.meta.runtimeStageId, stageId: 'tool', stageName: 'tool', depth: 0 } });
    const off = snapshot.subscribePayload({ on(type, listener) {
      if (type === start.type) listener(start as never);
      return () => {};
    } });
    try {
      const live = snapshot.getNode(start.meta.runtimeStageId)!;
      expect(live).toMatchObject({ toolArgs: projection, hiddenArgs: ['credential'] });
      const { container } = render(<NodeDetailPanel node={live} relatedNodes={[live]} />);
      expect(container.textContent).toContain('public-region');
      expect(container.textContent).toContain('Hidden arguments');
      expect(container.textContent).not.toContain(secret);
    } finally { off(); }
  });
  it('shows the recorded proposal and hidden names in the focused and related cards and the copy', () => {
    const { recorder, node, graph, events } = recordedToolRun();
    expect(node).toBeDefined();
    const other = graph.nodes.find(n => n.id.endsWith('-parallel'))!;
    expect(other.toolArgs).toEqual({ public: 'first-call' });
    const { container } = render(<NodeDetailPanel node={node} relatedNodes={[node, other]} />);
    const text = container.textContent!;
    expect(text).not.toContain(secret);
    expect(text.match(/public-region/g)).toHaveLength(2);
    expect(text.match(/Hidden arguments/gi)).toHaveLength(2);
    expect(text).toContain('credential');
    const copied = buildLLMText({ recorder, stepGraph: { nodes: [node, other], edges: [] } });
    expect(copied).not.toContain(secret);
    expect(copied).toContain('public-region');
    expect(copied).toMatch(/Hidden arguments/i);
    expect(copied).toContain('credential');
    const original = events.find(e => e.type === 'agentfootprint.stream.tool_start' && e.payload.toolCallId === 'c1');
    expect(original?.payload).toMatchObject({ args: { credential: secret } });
  });

  it('resolves same-tick parallel calls by recorded identity and withholds an ambiguous legacy lookup', () => {
    const { recorder, node } = recordedToolRun();
    const starts = recorder.selectEventLog().filter(e => e.event.type === 'agentfootprint.stream.tool_start');
    const sameTick = starts.map(e => ({ ...e, runOffsetMs: node.startOffsetMs }));
    expect(selectFocusDetail(node, sameTick)).toMatchObject({ toolArgs: projection, hiddenArgs: ['credential'] });
    const ambiguous = { ...node, id: 'historical-step' };
    expect(selectFocusDetail(ambiguous, sameTick)?.toolArgs).toBeUndefined();
    const duplicated = sameTick.map(e => e.event.type === 'agentfootprint.stream.tool_start'
      ? { ...e, event: { ...e.event, payload: { ...e.event.payload, toolCallId: 'c1' } } } : e);
    expect(selectFocusDetail(node, duplicated)?.toolArgs).toBeUndefined();
  });
  it('sanitizes supplied graphs and direct copies without modifying native args, across nested traversal ids', () => {
    const { recorder, node } = recordedToolRun();
    const native = { ...node, toolArgs: { credential: secret } };
    const supplied = { nodes: [native], edges: [] };
    const traversal = (runId: string) => ({
      traversalContext: { runId, runtimeStageId: 'root#0' } as Parameters<typeof recorder.snapshot.onRunStart>[0]['traversalContext'],
    });
    recorder.snapshot.onRunStart(traversal('parent'));
    recorder.snapshot.onRunStart(traversal('nested'));
    expect(recorder.getStepGraph(supplied).nodes[0]?.toolArgs).toEqual(projection);
    const forged = { ...native, id: 'step-tool-start-tool-calls#22-other' };
    expect(recorder.getStepGraph({ nodes: [forged], edges: [] }).nodes[0]?.toolArgs).toBeUndefined();
    const copy = buildLLMText({ recorder, stepGraph: supplied });
    expect(copy).not.toContain(secret);
    expect(copy).toContain('public-region');
    expect(native.toolArgs).toEqual({ credential: secret });
    recorder.clear();
    expect(recorder.getStepGraph(supplied).nodes[0]?.toolArgs).toEqual(projection);
    expect(buildLLMText({ recorder, stepGraph: supplied })).not.toContain(secret);
    const next = { nodes: [{ ...native, toolArgs: { city: 'next-city' } }], edges: [] };
    expect(recorder.getStepGraph(next)).toBe(next);
  });
});
