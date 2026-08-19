/**
 * `selectSkillFrameContext` — pairing a routing beat with the call it prepared.
 *
 * The interesting cases are all about NOT over-claiming: a beat with no call
 * after it must say "not paired" rather than borrow the previous beat's
 * context, and a paired call with no engineered injections must stay
 * distinguishable from an unpaired one. The window's upper bound (the next
 * beat) is what keeps beat N from claiming beat N+1's call.
 */

import { describe, it, expect } from 'vitest';
import type { ContextInjection, StepGraph, StepNode } from 'agentfootprint/observe';

import { selectSkillFrameContext } from './selectSkillFrameContext.js';
import type { SkillBeat } from './selectSkillBeats.js';

function beat(runtimeStageId: string | undefined, index = 0): SkillBeat {
  return {
    index,
    turnIndex: 0,
    iteration: index + 1,
    ...(runtimeStageId !== undefined ? { runtimeStageId } : {}),
    hop: {
      turnIndex: 0,
      iteration: index + 1,
      moved: false,
      activeIds: [],
      supersededIds: [],
      refusals: [],
      conflicts: [],
      superseded: [],
      toolsAsSent: [],
      skillInjections: [],
    },
    moved: false,
    refusedIds: [],
    visited: [],
    label: `Iteration ${index + 1}`,
    headline: '',
    notes: [],
  };
}

function injection(source: string, slot = 'system-prompt'): ContextInjection {
  return { source, slot, contentSummary: `${source} content` } as unknown as ContextInjection;
}

function step(
  runtimeStageId: string,
  kind: StepNode['kind'],
  injections?: readonly ContextInjection[],
): StepNode {
  return {
    id: `step-${runtimeStageId}`,
    kind,
    label: kind,
    startOffsetMs: 0,
    subflowPath: [],
    runtimeStageId,
    ...(injections !== undefined ? { injections } : {}),
  } as StepNode;
}

const graph = (nodes: readonly StepNode[]): Pick<StepGraph, 'nodes'> => ({ nodes });

describe('selectSkillFrameContext', () => {
  it('pairs a beat with the first LLM call after its evaluate stage', () => {
    const ctx = selectSkillFrameContext({
      graph: graph([
        step('call-llm#5', 'user->llm', [injection('base'), injection('skill'), injection('rag')]),
        step('call-llm#42', 'tool->llm', [injection('memory')]),
      ]),
      beat: beat('sf-injection-engine/evaluate#3', 0),
      nextBeat: beat('sf-injection-engine/evaluate#26', 1),
    });
    expect(ctx.paired).toBe(true);
    expect(ctx.stepRuntimeStageId).toBe('call-llm#5');
    // `base` is baseline, not engineered — the filter is the shipped one.
    expect(ctx.injections.map((i) => i.source)).toEqual(['skill', 'rag']);
    expect(ctx.totalInjections).toBe(3);
  });

  it('does not reach past the next beat for a call', () => {
    const ctx = selectSkillFrameContext({
      graph: graph([step('call-llm#42', 'tool->llm', [injection('skill')])]),
      beat: beat('sf-injection-engine/evaluate#3', 0),
      nextBeat: beat('sf-injection-engine/evaluate#26', 1),
    });
    expect(ctx.paired).toBe(false);
    expect(ctx.stepRuntimeStageId).toBeUndefined();
    expect(ctx.injections).toEqual([]);
  });

  it('takes the next call when there is no next beat (the last iteration)', () => {
    const ctx = selectSkillFrameContext({
      graph: graph([step('call-llm#42', 'tool->llm', [injection('skill')])]),
      beat: beat('sf-injection-engine/evaluate#26', 1),
    });
    expect(ctx.paired).toBe(true);
    expect(ctx.stepRuntimeStageId).toBe('call-llm#42');
  });

  it('keeps "no call recorded" distinct from "the call carried nothing"', () => {
    const nothingRecorded = selectSkillFrameContext({
      graph: graph([]),
      beat: beat('sf-injection-engine/evaluate#3'),
    });
    expect(nothingRecorded).toEqual({ paired: false, injections: [], totalInjections: 0 });

    const callWithNothing = selectSkillFrameContext({
      graph: graph([step('call-llm#5', 'user->llm', [])]),
      beat: beat('sf-injection-engine/evaluate#3'),
    });
    expect(callWithNothing.paired).toBe(true);
    expect(callWithNothing.injections).toEqual([]);
  });

  it('ignores steps that are not LLM calls', () => {
    const ctx = selectSkillFrameContext({
      graph: graph([
        step('tool-calls#4', 'llm->tool', [injection('skill')]),
        step('call-llm#8', 'user->llm', [injection('memory')]),
      ]),
      beat: beat('sf-injection-engine/evaluate#3'),
    });
    expect(ctx.stepRuntimeStageId).toBe('call-llm#8');
    expect(ctx.injections.map((i) => i.source)).toEqual(['memory']);
  });

  it('never throws on ids it cannot parse', () => {
    const ctx = selectSkillFrameContext({
      graph: graph([step('no-index', 'user->llm', [injection('skill')])]),
      beat: beat(undefined),
    });
    expect(ctx.paired).toBe(false);
  });

  it('does not mutate the graph it was given', () => {
    const nodes = [step('call-llm#5', 'user->llm', [injection('skill'), injection('base')])];
    const before = JSON.stringify(nodes);
    const ctx = selectSkillFrameContext({ graph: graph(nodes), beat: beat('evaluate#1') });
    (ctx.injections as ContextInjection[]).push(injection('injected'));
    expect(JSON.stringify(nodes)).toBe(before);
  });
});
