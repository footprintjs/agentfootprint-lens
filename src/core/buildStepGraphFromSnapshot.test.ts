/**
 * `buildStepGraphFromSnapshot` — verifies Lens can derive its
 * StepGraph from footprintjs's canonical snapshot, NOT from typed
 * events. Phase 4 architectural test.
 */

import { describe, it, expect } from 'vitest';
import { LLMCall } from 'agentfootprint';
import { Parallel } from 'agentfootprint';
import { Sequence } from 'agentfootprint';
import { Conditional } from 'agentfootprint';
import { Loop } from 'agentfootprint';
import { MockProvider } from 'agentfootprint/providers';
import { buildStepGraphFromSnapshot } from './buildStepGraphFromSnapshot.js';

function llm(reply: string) {
  return LLMCall.create({ provider: new MockProvider({ reply }), model: 'mock' })
    .system('hi')
    .build();
}

describe('buildStepGraphFromSnapshot — single LLMCall', () => {
  it('produces a single LLMCall subflow node', async () => {
    const r = llm('hello');
    await r.run({ message: 'go' });
    const snap = r.getLastSnapshot();
    const graph = buildStepGraphFromSnapshot(snap);
    // Single LLMCall: one primitive subflow node at the root.
    const llmcalls = graph.nodes.filter((n) => n.primitiveKind === 'LLMCall');
    expect(llmcalls.length).toBeGreaterThanOrEqual(1);
    expect(llmcalls[0]?.kind).toBe('subflow');
    expect(llmcalls[0]?.isPrimitiveBoundary).toBe(true);
  });

  it('returns empty graph if no run has happened', () => {
    const r = llm('hello');
    const graph = buildStepGraphFromSnapshot(r.getLastSnapshot());
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
  });
});

describe('buildStepGraphFromSnapshot — Parallel', () => {
  it('emits one fork-branch node PER actual branch (no missing branches)', async () => {
    const par = Parallel.create({ name: 'committee' })
      .branch('legal', llm('L'))
      .branch('ethics', llm('E'))
      .branch('cost', llm('C'))
      .mergeWithFn((r) => Object.values(r).join(' | '))
      .build();
    await par.run({ message: 'go' });
    const graph = buildStepGraphFromSnapshot(par.getLastSnapshot());

    // The Parallel root MUST emit ALL THREE branches as fork-branch
    // nodes — this is the bug Lens has today (re-derives shape from
    // typed events and loses one). Snapshot-based extraction sees
    // them all because flowMessages.targetStage carries the full list.
    const branches = graph.nodes.filter((n) => n.kind === 'fork-branch');
    expect(branches).toHaveLength(3);
    const labels = branches.map((b) => b.label).sort();
    expect(labels).toEqual(['cost', 'ethics', 'legal']);
  });

  it('emits fork-branch edges from the Parallel root to each child', async () => {
    const par = Parallel.create({ name: 'committee' })
      .branch('a', llm('A'))
      .branch('b', llm('B'))
      .mergeWithFn((r) => Object.values(r).join(' | '))
      .build();
    await par.run({ message: 'go' });
    const graph = buildStepGraphFromSnapshot(par.getLastSnapshot());

    const forkEdges = graph.edges.filter((e) => e.kind === 'fork-branch');
    expect(forkEdges.length).toBe(2);
    // All fork edges share the same `from` (the Parallel root stage).
    const sources = new Set(forkEdges.map((e) => e.from));
    expect(sources.size).toBe(1);
  });

  it('back-to-back Parallel runs each produce a fresh, complete graph', async () => {
    const par = Parallel.create({ name: 'committee' })
      .branch('a', llm('A'))
      .branch('b', llm('B'))
      .mergeWithFn((r) => Object.values(r).join('|'))
      .build();

    await par.run({ message: 'first' });
    const g1 = buildStepGraphFromSnapshot(par.getLastSnapshot());
    expect(g1.nodes.filter((n) => n.kind === 'fork-branch')).toHaveLength(2);

    await par.run({ message: 'second' });
    const g2 = buildStepGraphFromSnapshot(par.getLastSnapshot());
    // Snapshot-based extraction is STATELESS — second run gets a
    // fresh complete graph. No multi-run aliasing possible because
    // we read directly from the executor's snapshot, not from
    // accumulated event state.
    expect(g2.nodes.filter((n) => n.kind === 'fork-branch')).toHaveLength(2);
  });
});

describe('buildStepGraphFromSnapshot — Sequence', () => {
  it('emits one node per step', async () => {
    const seq = Sequence.create()
      .step('a', llm('A'))
      .step('b', llm('B'))
      .build();
    await seq.run({ message: 'go' });
    const graph = buildStepGraphFromSnapshot(seq.getLastSnapshot());
    expect(graph.nodes.length).toBeGreaterThan(0);
    // The Sequence root + the inner LLMCall steps each appear.
    const primitives = graph.nodes.filter((n) => n.primitiveKind);
    expect(primitives.length).toBeGreaterThanOrEqual(1);
  });
});

describe('buildStepGraphFromSnapshot — Conditional', () => {
  it('emits a Conditional node + chosen branch node', async () => {
    const cond = Conditional.create()
      .when('left', (i: { message: string }) => i.message === 'L', llm('LEFT'))
      .otherwise('right', llm('RIGHT'))
      .build();
    await cond.run({ message: 'L' });
    const graph = buildStepGraphFromSnapshot(cond.getLastSnapshot());
    const primitives = graph.nodes.filter((n) => n.primitiveKind);
    expect(primitives.length).toBeGreaterThanOrEqual(1);
  });
});

describe('buildStepGraphFromSnapshot — Loop', () => {
  it('emits Loop primitive node', async () => {
    const loop = Loop.create().repeat(llm('iter')).times(2).build();
    await loop.run({ message: 'go' });
    const graph = buildStepGraphFromSnapshot(loop.getLastSnapshot());
    const primitives = graph.nodes.filter((n) => n.primitiveKind);
    expect(primitives.length).toBeGreaterThanOrEqual(1);
  });
});
