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
  it('prints a model ticket separately from stored rows without pairing them by step position', () => {
    const recorder = { selectSummary: () => ({ status: 'completed', llmCallCount: 1,
      toolCallCount: 1, iterationCount: 1, totalTokens: { input: 0, output: 0 }, permissionDenials: 0 }),
      selectEventLog: () => [] } as unknown as LensRecorder;
    const stepGraph = { nodes: [{ id: 'unrelated-step', kind: 'tool->llm', label: 'lookup', subflowPath: [],
      toolResult: { rows: ['stored-only-row'] } }], edges: [] } as unknown as StepGraph;
    const ticket = JSON.stringify({ collapsed: true, standing: 'noise', toolCallId: 'native-tool' });
    const text = buildLLMText({ recorder, stepGraph, context: { dictionary: [], calls: [{
      meta: { runId: 'native-run' }, iteration: 1, call: 1, eventIndex: 2,
      added: [], removed: [], unchanged: 0, counts: {},
    }], toolInputs: [{ status: 'available', epoch: 1, gaps: [], messages: [{
      toolCallId: 'native-tool', content: ticket, ticket: true, status: 'verified',
    }] }] } });
    expect(text).toContain('Model-call input (verified receipt) · tool call "native-tool" · ticket-shaped input');
    expect(text).toContain('stored-only-row'); expect(text).toContain('Stored tool result');
    expect(text.indexOf('ticket-shaped input')).toBeLessThan(text.indexOf('# Steps'));
    expect(text.slice(text.indexOf('# Steps'))).not.toContain('native-tool');
  });

  it('stores unchanged annotations once even when each call adds a message', () => {
    const recorder = { selectSummary: () => ({ status: 'completed', llmCallCount: 2,
      toolCallCount: 1, iterationCount: 2, totalTokens: { input: 0, output: 0 }, permissionDenials: 0 }),
      selectEventLog: () => [] } as unknown as LensRecorder;
    const base = { slot: 'system-prompt', source: 'base', contentSummary: 'unique unchanged rule summary' };
    const tool = { slot: 'tools', source: 'registry', sourceId: 'lookup', contentSummary: 'unique tool summary' };
    const next = { slot: 'messages', source: 'tool-result', sourceId: 'result', contentSummary: 'new message summary' };
    const stepGraph = { nodes: [
      { id: 'one', kind: 'user->llm', label: 'one', subflowPath: [], injections: [base, tool] },
      { id: 'two', kind: 'tool->llm', label: 'two', subflowPath: [], injections: [tool, next, base] },
    ], edges: [] } as unknown as StepGraph;
    const text = buildLLMText({ recorder, stepGraph, context: { dictionary: [], calls: [] } });
    expect(text.split('unique unchanged rule summary')).toHaveLength(2);
    expect(text.split('unique tool summary')).toHaveLength(2);
    expect(text).toContain('Annotation order: 1.2, 2.2, 1.1');
    expect(text).toContain('2.2: - [messages] tool-result:result');
    expect(text).toContain('new message summary');
    const legacy = buildLLMText({ recorder, stepGraph });
    expect(legacy.split('unique unchanged rule summary')).toHaveLength(3);
  });

});
