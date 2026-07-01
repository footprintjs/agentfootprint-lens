/**
 * viaStructureRecorder — A/B scouting test.
 *
 * Goal: prove that explainable-ui's `createTraceStructureRecorder`
 * works when attached to agentfootprint compositions, and measure
 * the GAP between the resulting TraceGraph and the current
 * `lensGroupTranslator` output.
 *
 * The gap motivates the "agent decorator" work that turns the new
 * path into a viable migration target. See `viaStructureRecorder.ts`
 * for the full architectural rationale.
 */

import { describe, it, expect } from 'vitest';
import { LLMCall, Sequence } from 'agentfootprint'
import { MockProvider } from 'agentfootprint/llm-providers';
import { lensStructureRecorder } from './viaStructureRecorder.js';
import { lensGroupTranslator } from './lensGroupTranslator.js';

describe('viaStructureRecorder — bridge proof', () => {
  it('produces a non-empty TraceGraph when wired to LLMCall', () => {
    const lensRec = lensStructureRecorder();
    const llm = LLMCall.create({
      provider: new MockProvider({ reply: 'hello' }),
      model: 'mock',
      structureRecorders: [lensRec.recorder],
    })
      .system('')
      .build();

    const newGraph = lensRec.getGraph();

    expect(newGraph.nodes.length).toBeGreaterThan(0);
    // LLMCall internally chains stages; at least one connecting edge
    // should exist (the slot subflows feeding into the CallLLM stage).
    expect(newGraph.edges.length).toBeGreaterThan(0);

    // Silence unused warning while keeping the binding for IDE devs
    // exploring the test interactively.
    void llm;
  });

  it('produces a non-empty TraceGraph when wired to Sequence', () => {
    const lensRec = lensStructureRecorder();
    const seq = Sequence.create({ structureRecorders: [lensRec.recorder] })
      .step(
        'a',
        LLMCall.create({ provider: new MockProvider({ reply: 'A' }), model: 'm' })
          .system('')
          .build(),
      )
      .step(
        'b',
        LLMCall.create({ provider: new MockProvider({ reply: 'B' }), model: 'm' })
          .system('')
          .build(),
      )
      .build();

    const newGraph = lensRec.getGraph();
    expect(newGraph.nodes.length).toBeGreaterThan(0);
    expect(newGraph.edges.length).toBeGreaterThan(0);
    void seq;
  });
});

describe('viaStructureRecorder — A/B gap measurement (LLMCall)', () => {
  it('new path is FINE-GRAINED vs old path COLLAPSED — confirms decorator work needed', () => {
    // Set up both paths against the SAME LLMCall.
    const lensRec = lensStructureRecorder();
    const llm = LLMCall.create({
      provider: new MockProvider({ reply: 'hello' }),
      model: 'mock',
      structureRecorders: [lensRec.recorder],
    })
      .system('')
      .build();

    // NEW path — every internal stage is a node.
    const newGraph = lensRec.getGraph();

    // OLD path — collapses to 1 LLMCall node, 0 edges.
    const oldOutput = llm.getUIGroupWith(lensGroupTranslator);

    // Architectural assertion #1 — old path collapses LLMCall to 1 node.
    expect(oldOutput).toBeDefined();
    expect(oldOutput!.nodes).toHaveLength(1);
    expect(oldOutput!.nodes[0]!.primitiveKind).toBe('LLMCall');

    // Architectural assertion #2 — new path shows fine-grained structure.
    // (The exact count depends on agentfootprint's internal stage layout,
    // but it MUST be more than 1 to demonstrate the gap.)
    expect(newGraph.nodes.length).toBeGreaterThan(1);

    // Architectural assertion #3 — new path nodes do NOT carry
    // agent-specific primitiveKind. They carry only the generic
    // StructureRecorder fields (isSubflow / isDecider / isFork / ...).
    for (const node of newGraph.nodes) {
      expect((node.data as Record<string, unknown>).primitiveKind).toBeUndefined();
    }

    // This test PASSES today — it documents the current state. The
    // next-slice work is to write an agent decorator that:
    //   (a) finds the subflow boundary matching the LLMCall's compositionPath
    //   (b) replaces its internal subgraph with one decorated node
    //   (c) carries primitiveKind: 'LLMCall' + metadata.slots
    //
    // When that decorator lands, the equivalent test asserts:
    //   decoratedGraph.nodes.length === 1
    //   decoratedGraph.nodes[0].data.primitiveKind === 'LLMCall'
  });
});
