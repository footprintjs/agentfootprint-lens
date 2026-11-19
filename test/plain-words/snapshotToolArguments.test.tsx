import React from 'react';
import type { AgentfootprintEvent } from 'agentfootprint/events';
import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { LensRecorder } from '../../src/core/LensRecorder.js';
import { NodeDetailPanel } from '../../src/react/NodeDetailPanel.js';

type ToolStart = Extract<AgentfootprintEvent, { type: 'agentfootprint.stream.tool_start' }>;

function enter(recorder: LensRecorder, stage: string, runId: string) {
  recorder.snapshot.onSubflowEntry({
    name: stage, subflowId: stage, description: 'Agent: lookup',
    traversalContext: { runId, runtimeStageId: stage, stageId: stage, stageName: stage, depth: 0 },
  });
}

function start(recorder: LensRecorder, stage: string, payload: ToolStart['payload']) {
  const event: ToolStart = { type: 'agentfootprint.stream.tool_start', payload,
    meta: { runId: 'dispatcher-run', runtimeStageId: stage, wallClockMs: 1, runOffsetMs: 1, subflowPath: [], compositionPath: [] } };
  recorder.snapshot.subscribePayload({ on(type, listener) {
    if (type === event.type) listener(event as never);
    return () => {};
  } })();
}

it('withholds a repeated call’s arguments in Run end fallback cards and retains independent legacy arguments', () => {
  const recorder = new LensRecorder();
  enter(recorder, 'ambiguous#1', 'engine-run');
  enter(recorder, 'unique#2', 'engine-run');
  start(recorder, 'ambiguous#1', {
    toolCallId: 'same', toolName: 'first', args: { token: 'first-private' },
    shownArgs: { display: 'first-projection' }, hiddenArgs: ['token'],
  });
  start(recorder, 'ambiguous#1', { toolCallId: 'same', toolName: 'second', args: { data: 'second-private' } });
  start(recorder, 'unique#2', { toolCallId: 'same', toolName: 'second', args: { data: 'independent-value' } });

  const runEnd = () => <NodeDetailPanel cursorRuntimeStageId="__root__#0" rootPhase="end"
    relatedNodes={recorder.getStepGraph().nodes} />;
  const view = render(runEnd());
  expect(view.getByText('All steps in this scope')).toBeTruthy();
  expect(view.container.textContent).toContain('independent-value');
  expect(view.container.textContent).not.toContain('second-private');
  expect(view.container.textContent).not.toContain('first-private');
  expect(view.container.textContent).not.toContain('first-projection');
  expect(view.container.textContent).not.toContain('Hidden arguments');

  // A fresh run may reuse both coordinates.
  enter(recorder, 'ambiguous#1', 'next-engine-run');
  start(recorder, 'ambiguous#1', { toolCallId: 'same', toolName: 'first', args: { data: 'next-run-value' } });
  view.rerender(runEnd());
  expect(view.container.textContent).toContain('next-run-value');
  expect(view.container.textContent).not.toContain('independent-value');
});

it('counts an early protected start even if another call decorates the node before its duplicate', () => {
  const recorder = new LensRecorder();
  start(recorder, 'stage#1', {
    toolCallId: 'a', toolName: 'first', args: {}, hiddenArgs: ['token'],
  });
  enter(recorder, 'stage#1', 'engine-run');
  start(recorder, 'stage#1', { toolCallId: 'b', toolName: 'other', args: { value: 'unrelated' } });
  start(recorder, 'stage#1', {
    toolCallId: 'a', toolName: 'later',
    get args(): never { throw new Error('Ambiguous arguments were read'); },
  });
  expect(recorder.getStepGraph().nodes[0]).toMatchObject({ toolName: 'later' });
  expect(recorder.getStepGraph().nodes[0]).not.toHaveProperty('toolArgs');
  expect(recorder.getStepGraph().nodes[0]).not.toHaveProperty('hiddenArgs');
});
