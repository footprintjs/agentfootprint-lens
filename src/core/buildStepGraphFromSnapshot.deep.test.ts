/**
 * A long linear run — the step graph builder walks `next` as a loop (0.58.2).
 *
 * Test types: Capability (a 20 000-stage `next` chain builds where a recursive
 * visit overflowed the engine's stack) · Contract (every primitive stage
 * becomes a node and consecutive primitives are joined by a `next` edge).
 */
import { describe, expect, it } from 'vitest';
import { buildStepGraphFromSnapshot } from './buildStepGraphFromSnapshot.js';

describe('buildStepGraphFromSnapshot on a long linear run', () => {
  it('walks a 20 000-stage next chain without recursion, one node per primitive stage', () => {
    type Stage = { id: string; runtimeStageId: string; name: string; description?: string; next?: Stage };
    let chain: Stage | undefined;
    let primitives = 0;
    for (let i = 19_999; i >= 0; i--) {
      const primitive = i % 100 === 0;
      if (primitive) primitives += 1;
      chain = {
        id: `s${i}`,
        runtimeStageId: `s${i}#${i}`,
        name: `S${i}`,
        ...(primitive ? { description: 'LLMCall: a model call' } : {}),
        ...(chain !== undefined ? { next: chain } : {}),
      };
    }
    const graph = buildStepGraphFromSnapshot({ executionTree: chain, commitLog: [] } as never);
    expect(graph.nodes.length).toBe(primitives);
    expect(graph.edges.filter((e) => e.kind === 'next').length).toBe(primitives - 1);
    expect(graph.nodes[0]!.runtimeStageId).toBe('s0#0');
  });
});
