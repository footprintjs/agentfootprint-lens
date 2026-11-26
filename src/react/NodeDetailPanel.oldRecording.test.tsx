/**
 * An old recording (payloads in the base row) renders exactly as it did on
 * agentfootprint-lens 0.89.0. `test/fixtures/old-recording-detail.main.json`
 * holds what 0.89.0 (`a86ac1b`) rendered for the recorded turn: each of its 21
 * steps alone in `NodeDetailPanel`, the run's end with every step as a related
 * card, and `buildLLMText`. It was written by rendering those same calls on
 * that commit; regenerate it only from a released version.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StepGraph, StepNode } from 'agentfootprint/observe';
import { childReply, recordedTurn } from '../../test/fixtures/payloadsWithInvocation.js';
import { observeRecording } from '../core/observeRecording.js';
import { buildLLMText } from '../core/copyForLLM.js';
import { projectRecordingSource, type RecordedInvocation } from '../core/recordingSourceCodec/index.js';
import { NodeDetailPanel } from './NodeDetailPanel.js';
import { createLensRecordingSource } from './recordingSource/controller.js';
import { useStepPayloads } from './recordingSource/useStepPayloads.js';

const golden = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../test/fixtures/old-recording-detail.main.json'), 'utf8')) as {
  readonly steps: number; readonly panels: Record<string, string>; readonly runEnd: string; readonly copy: string;
};
const graphOf = (runner: unknown) => (runner as { enable: { flowchart(): { getSnapshot(): StepGraph } } }).enable.flowchart().getSnapshot();
const html = (element: React.ReactElement) => { const shown = render(element); const out = shown.container.innerHTML; shown.unmount(); return out; };

describe('an old recording renders exactly as on 0.89.0', () => {
  it('renders all 21 steps, the run’s end and the LLM copy identically, with the default reader and with a lazy source', () => {
    const observed = observeRecording(recordedTurn(), { debug: false });
    const projected = projectRecordingSource(recordedTurn());
    if (projected.status !== 'ready') throw new Error('refused');
    const loadSubflow = vi.fn((request: RecordedInvocation) => childReply(recordedTurn(), request));
    const source = createLensRecordingSource({ root: projected.value, loadSubflow });
    function WithSource(props: { node?: StepNode; related?: readonly StepNode[] }) {
      const payloads = useStepPayloads(source, undefined);
      return <NodeDetailPanel {...(props.node ? { node: props.node } : { relatedNodes: props.related!, cursorRuntimeStageId: '__root__#0', rootPhase: 'end' as const })}
        payloads={payloads.reader} onNeedPayloads={payloads.request} />;
    }
    try {
      const graph = graphOf(observed.runner), lazy = graphOf(source.observed.runner);
      expect(graph.nodes).toHaveLength(golden.steps);
      expect(golden.steps).toBe(21);
      expect(lazy.nodes.map(node => node.id)).toEqual(graph.nodes.map(node => node.id));
      let identical = 0;
      graph.nodes.forEach((node, at) => {
        const expected = golden.panels[node.id];
        expect(html(<NodeDetailPanel node={node} />)).toBe(expected);
        expect(html(<WithSource node={lazy.nodes[at]!} />)).toBe(expected);
        identical++;
      });
      expect(identical).toBe(21);
      expect(html(<NodeDetailPanel relatedNodes={graph.nodes} cursorRuntimeStageId="__root__#0" rootPhase="end" />)).toBe(golden.runEnd);
      expect(html(<WithSource related={lazy.nodes} />)).toBe(golden.runEnd);
      expect(buildLLMText({ recorder: observed.recorder, stepGraph: graph })).toBe(golden.copy);
      expect(loadSubflow).not.toHaveBeenCalled();
    } finally { observed.recorder.detach(); source.dispose(); }
  });
});
