/**
 * useToolChoice — async lazy-scoring reader (RFC-002 C7).
 *
 * Unit tier drives the hook with a fake source (read counting,
 * latest-wins, error surfacing). The functional tier reads from a REAL
 * `toolChoiceRecorder` fed with real engine event shapes (the #5
 * lesson: never fabricate field names) and proves the lazy-embed
 * contract holds through the hook.
 */

/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { EmitEvent } from 'footprintjs';
import { mockEmbedder } from 'agentfootprint/memory';
import { toolChoiceRecorder } from 'agentfootprint/observe';
import type { ToolChoiceCall, ToolChoiceSummary } from 'agentfootprint/observe';
import { useToolChoice, type ToolChoiceSource } from './useToolChoice.js';

const CALL: ToolChoiceCall = {
  runtimeStageId: 'call-llm#1',
  iteration: 1,
  offered: [{ name: 'a' }, { name: 'b' }],
  chosen: ['a'],
  toolCallIds: ['c1'],
  contextText: 'user: q',
};

const SUMMARY: ToolChoiceSummary = {
  llmCallsWithTools: 1,
  choices: 1,
  scored: 1,
  flagged: 0,
  narrow: 0,
  proxyDisagreement: 0,
  skipped: 0,
};

function fakeSource(): ToolChoiceSource & { reads: () => number } {
  let reads = 0;
  return {
    reads: () => reads,
    getCalls: async () => {
      reads++;
      return [CALL];
    },
    getSummary: async () => SUMMARY,
  };
}

describe('useToolChoice — unit', () => {
  it('undefined source → empty result, not pending', () => {
    const { result } = renderHook(() => useToolChoice(undefined, 0));
    expect(result.current.calls).toEqual([]);
    expect(result.current.summary).toBeUndefined();
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeUndefined();
  });

  it('reads calls + summary; pending flips false when the read lands', async () => {
    const source = fakeSource();
    const { result } = renderHook(() => useToolChoice(source, 0));
    expect(result.current.pending).toBe(true);
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.calls).toEqual([CALL]);
    expect(result.current.summary).toEqual(SUMMARY);
    expect(source.reads()).toBe(1);
  });

  it('revision bump triggers a re-read', async () => {
    const source = fakeSource();
    const { result, rerender } = renderHook(
      ({ rev }: { rev: number }) => useToolChoice(source, rev),
      { initialProps: { rev: 0 } },
    );
    await waitFor(() => expect(result.current.pending).toBe(false));
    rerender({ rev: 1 });
    await waitFor(() => expect(source.reads()).toBe(2));
    await waitFor(() => expect(result.current.pending).toBe(false));
  });

  it('same revision does NOT re-read on unrelated re-renders', async () => {
    const source = fakeSource();
    const { result, rerender } = renderHook(
      ({ rev }: { rev: number }) => useToolChoice(source, rev),
      { initialProps: { rev: 0 } },
    );
    await waitFor(() => expect(result.current.pending).toBe(false));
    rerender({ rev: 0 });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(source.reads()).toBe(1);
  });

  it('surfaces a read error and keeps prior data', async () => {
    let fail = false;
    const source: ToolChoiceSource = {
      getCalls: async () => {
        if (fail) throw new Error('embedder unreachable');
        return [CALL];
      },
      getSummary: async () => SUMMARY,
    };
    const { result, rerender } = renderHook(
      ({ rev }: { rev: number }) => useToolChoice(source, rev),
      { initialProps: { rev: 0 } },
    );
    await waitFor(() => expect(result.current.calls).toHaveLength(1));
    fail = true;
    rerender({ rev: 1 });
    await waitFor(() =>
      expect(result.current.error).toBe('embedder unreachable'),
    );
    // Prior data survives the failed refresh — the panel can keep
    // rendering the last good read alongside the error line.
    expect(result.current.calls).toEqual([CALL]);
    expect(result.current.summary).toEqual(SUMMARY);
    expect(result.current.pending).toBe(false);
  });
});

// ── functional: a REAL toolChoiceRecorder behind the hook ───────────

const TURN_START = 'agentfootprint.agent.turn_start';
const LLM_START = 'agentfootprint.stream.llm_start';
const TOOL_START = 'agentfootprint.stream.tool_start';

function ev(name: string, payload: unknown, runtimeStageId = 'call-llm#1'): EmitEvent {
  return {
    name,
    payload,
    stageName: 'call-llm',
    runtimeStageId,
    subflowPath: [],
    pipelineId: 'run-1',
    timestamp: 0,
  };
}

describe('useToolChoice — functional (real recorder, mock embedder)', () => {
  it('reads scored margins lazily through the hook', async () => {
    const rec = toolChoiceRecorder({ embedder: mockEmbedder() });
    rec.onRunStart({ traversalContext: { runId: 'r1' } });
    rec.onEmit(ev(TURN_START, { turnIndex: 0, userPrompt: 'is the port registered?' }));
    rec.onEmit(
      ev(LLM_START, {
        iteration: 1,
        provider: 'mock',
        model: 'mock',
        systemPromptChars: 10,
        messageCount: 1,
        tools: [
          { name: 'get_fcns_database', description: 'live name server registrations' },
          { name: 'send_email', description: 'send a notification email' },
        ],
      }),
    );
    rec.onEmit(
      ev(TOOL_START, { toolName: 'get_fcns_database', toolCallId: 'c1', args: {} }),
    );
    rec.onRunEnd({ traversalContext: { runId: 'r1' } });

    const { result } = renderHook(() => useToolChoice(rec, 0));
    await waitFor(() => expect(result.current.pending).toBe(false));

    expect(result.current.calls).toHaveLength(1);
    const call = result.current.calls[0]!;
    expect(call.chosen).toEqual(['get_fcns_database']);
    expect(call.margin).toBeDefined();
    expect(call.margin!.scores).toHaveLength(2);
    expect(result.current.summary?.llmCallsWithTools).toBe(1);
    expect(result.current.summary?.scored).toBe(1);
  });
});
