/**
 * viaStructureRecorder — empirical chart-shape inventory.
 *
 * Runs the explainable-ui structure recorder against EVERY agentfootprint
 * composition + pattern and reports the resulting TraceGraph shape:
 *   - node count
 *   - edge count
 *   - distinct edge kinds
 *   - distinct subflow descriptions (the existing primitive "tag")
 *
 * Purpose: answer the architectural question "do existing subflow IDs /
 * names / descriptions already carry enough semantic signal for lens to
 * render rich nodes without per-kind translators?" Empirical evidence
 * over speculation.
 */

import { describe, it, expect } from 'vitest';
import { LLMCall, Agent, Sequence, Parallel, Loop, Conditional, defineTool, type LLMProvider } from 'agentfootprint'
import { MockProvider } from 'agentfootprint/providers';
import { lensStructureRecorder } from './viaStructureRecorder.js';

function mockReply(reply: string): LLMProvider {
  return new MockProvider({ reply });
}

interface ShapeReport {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly edgeKinds: readonly string[];
  readonly subflowDescriptions: readonly string[];
  readonly subflowIds: readonly string[];
  readonly nodeLabels: readonly string[];
}

function inspectGraph(getGraph: () => ReturnType<ReturnType<typeof lensStructureRecorder>['getGraph']>): ShapeReport {
  const graph = getGraph();
  const edgeKinds = new Set<string>();
  for (const e of graph.edges) {
    const k = (e.data as { kind?: string } | undefined)?.kind;
    if (k) edgeKinds.add(k);
  }
  const subflowDescriptions = new Set<string>();
  const subflowIds = new Set<string>();
  const nodeLabels: string[] = [];
  for (const n of graph.nodes) {
    const data = n.data as { isSubflow?: boolean; subflowId?: string; description?: string; label?: string };
    if (data.isSubflow) {
      if (data.subflowId) subflowIds.add(data.subflowId);
      if (data.description) subflowDescriptions.add(data.description);
    }
    if (data.label) nodeLabels.push(data.label);
  }
  return {
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    edgeKinds: Array.from(edgeKinds).sort(),
    subflowDescriptions: Array.from(subflowDescriptions).sort(),
    subflowIds: Array.from(subflowIds).sort(),
    nodeLabels,
  };
}

describe('agentfootprint chart shape inventory — for two-primitive design', () => {
  it('LLMCall — atomic primitive', () => {
    const lensRec = lensStructureRecorder();
    LLMCall.create({
      provider: mockReply('hi'),
      model: 'mock',
      structureRecorders: [lensRec.recorder],
    })
      .system('')
      .build();

    const r = inspectGraph(lensRec.getGraph);
    process.stdout.write(`\n[LLMCall] shape: ${JSON.stringify(r, null, 2)}\n`);
    expect(r.nodeCount).toBeGreaterThan(0);
  });

  it('Sequence of 2 LLMCalls', () => {
    const lensRec = lensStructureRecorder();
    Sequence.create({ structureRecorders: [lensRec.recorder] })
      .step('a', LLMCall.create({ provider: mockReply('A'), model: 'm' }).system('').build())
      .step('b', LLMCall.create({ provider: mockReply('B'), model: 'm' }).system('').build())
      .build();

    const r = inspectGraph(lensRec.getGraph);
    process.stdout.write(`\n[Sequence] shape: ${JSON.stringify(r, null, 2)}\n`);
    expect(r.nodeCount).toBeGreaterThan(0);
  });

  it('Parallel of 2 LLMCalls', () => {
    const lensRec = lensStructureRecorder();
    Parallel.create({ structureRecorders: [lensRec.recorder] })
      .branch('a', LLMCall.create({ provider: mockReply('A'), model: 'm' }).system('').build())
      .branch('b', LLMCall.create({ provider: mockReply('B'), model: 'm' }).system('').build())
      // Parallel requires a merge strategy at build time.
      .mergeWithFn((r) => Object.values(r).join(' / '))
      .build();

    const r = inspectGraph(lensRec.getGraph);
    process.stdout.write(`\n[Parallel] shape: ${JSON.stringify(r, null, 2)}\n`);
    expect(r.nodeCount).toBeGreaterThan(0);
  });

  it('Loop over LLMCall', () => {
    const lensRec = lensStructureRecorder();
    Loop.create({ structureRecorders: [lensRec.recorder] })
      .repeat(LLMCall.create({ provider: mockReply('iter'), model: 'm' }).system('').build())
      .times(2)
      .build();

    const r = inspectGraph(lensRec.getGraph);
    process.stdout.write(`\n[Loop] shape: ${JSON.stringify(r, null, 2)}\n`);
    expect(r.nodeCount).toBeGreaterThan(0);
  });

  it('Conditional with 2 branches', () => {
    const lensRec = lensStructureRecorder();
    Conditional.create({ structureRecorders: [lensRec.recorder] })
      .when('isA', () => true, LLMCall.create({ provider: mockReply('A'), model: 'm' }).system('').build())
      .otherwise('else', LLMCall.create({ provider: mockReply('else'), model: 'm' }).system('').build())
      .build();

    const r = inspectGraph(lensRec.getGraph);
    process.stdout.write(`\n[Conditional] shape: ${JSON.stringify(r, null, 2)}\n`);
    expect(r.nodeCount).toBeGreaterThan(0);
  });

  it('Agent with no tools (ReAct loop only)', () => {
    const lensRec = lensStructureRecorder();
    Agent.create({
      provider: mockReply('done'),
      model: 'mock',
      structureRecorders: [lensRec.recorder],
    }).build();

    const r = inspectGraph(lensRec.getGraph);
    process.stdout.write(`\n[Agent (no tools)] shape: ${JSON.stringify(r, null, 2)}\n`);
    expect(r.nodeCount).toBeGreaterThan(0);
  });

  it('Agent WITH one tool', () => {
    const lensRec = lensStructureRecorder();
    const noopTool = defineTool({
      name: 'noop',
      description: 'no-op',
      inputSchema: { type: 'object' as const, properties: {} },
      execute: () => 'ok',
    });
    Agent.create({
      provider: mockReply('done'),
      model: 'mock',
      structureRecorders: [lensRec.recorder],
    })
      .tools([noopTool])
      .build();

    const r = inspectGraph(lensRec.getGraph);
    process.stdout.write(`\n[Agent + 1 tool] shape: ${JSON.stringify(r, null, 2)}\n`);
    expect(r.nodeCount).toBeGreaterThan(0);
  });
});
