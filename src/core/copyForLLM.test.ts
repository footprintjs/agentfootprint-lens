import { describe, expect, it } from 'vitest';
import type { StepGraph } from 'agentfootprint/observe';
import type { LensRecorder } from './LensRecorder.js';
import { buildLLMText } from './copyForLLM.js';

describe('copy for AI: stored results are not model-input evidence', () => {
  it('labels retained rows without claiming the model received them', () => {
    const recorder = {
      selectSummary: () => ({
        status: 'completed', durationMs: 1, llmCallCount: 0, toolCallCount: 1,
        iterationCount: 0, totalTokens: { input: 0, output: 0 }, permissionDenials: 0,
      }),
      selectEventLog: () => [],
    } as unknown as LensRecorder;
    const stepGraph = {
      nodes: [{ id: 'result', kind: 'tool->llm', label: 'lookup', subflowPath: [],
        startOffsetMs: 0, toolResult: { rows: [{ name: 'stored-row' }] } }],
      edges: [],
    } as unknown as StepGraph;
    const text = buildLLMText({ recorder, stepGraph });
    expect(text).toContain('Stored tool result');
    expect(text).toContain('stored-row');
    expect(text).not.toContain('Tool result sent to LLM');
  });
});
