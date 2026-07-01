/**
 * structureGraphFromRunner — subflow internals materialised for drill (FIX 2).
 *
 * Each subflow's internal stages are added to the graph, path-qualified and
 * tagged `data.subflowOf`, so eui's EXISTING `filterGraphForDrill` reveals them
 * on drill (and hides them at the top level — `subflowOf === undefined` only).
 * This is what makes "click the Injection Engine box → see Gather/Evaluate/
 * Route/Delta" work by reusing eui's drill, with no custom chart-swap.
 */
import { describe, it, expect } from 'vitest';
import { Agent, defineTool } from 'agentfootprint'
import { defineInstruction } from 'agentfootprint/injection-engine'
import { mock } from 'agentfootprint/llm-providers';
import { structureGraphFromRunner } from './structureGraphFromRunner.js';

function buildAgent() {
  const echo = defineTool({
    name: 'echo',
    description: 'echo',
    inputSchema: { type: 'object', properties: { m: { type: 'string' } } },
    execute: async ({ m }: { m: string }) => `echoed ${m}`,
  });
  return Agent.create({
    provider: mock({ replies: [{ content: 'done' }] }),
    model: 'mock',
    maxIterations: 2,
    reactMode: 'dynamic',
  })
    .system('be terse')
    .instruction(defineInstruction({ id: 'sp', prompt: 'cite' }))
    .tool(echo)
    .build();
}

const subflowOf = (n: { data: unknown }): unknown => (n.data as { subflowOf?: unknown }).subflowOf;
const localOf = (id: string): string => id.split('#')[0]!.split('/').pop()!;

describe('structureGraphFromRunner — subflow internals for drill', () => {
  it('top-level nodes are unchanged (internals tagged subflowOf, hidden at top by eui drill)', () => {
    const g = structureGraphFromRunner(buildAgent() as never);
    const topLevel = g.nodes.filter((n) => !subflowOf(n)).map((n) => n.id);
    // The familiar top-level shape is preserved (Injection Engine is ONE box).
    expect(topLevel).toContain('sf-injection-engine');
    expect(topLevel).toContain('call-llm');
    // None of the injection-engine internals leak to the top level.
    expect(topLevel.some((id) => /gather|evaluate|delta/.test(id))).toBe(false);
  });

  it('emits no duplicate node/edge ids when merging materialised internals', () => {
    const g = structureGraphFromRunner(buildAgent() as never);
    expect(g.nodes.length).toBe(new Set(g.nodes.map((n) => n.id)).size);
    expect(g.edges.length).toBe(new Set(g.edges.map((e) => e.id)).size);
  });

  it('materialises the Injection Engine internals, tagged + path-qualified', () => {
    const g = structureGraphFromRunner(buildAgent() as never);
    const ieInternals = g.nodes.filter((n) => subflowOf(n) === 'sf-injection-engine');
    const locals = new Set(ieInternals.map((n) => localOf(n.id)));
    expect(locals.has('gather')).toBe(true);
    expect(locals.has('evaluate')).toBe(true);
    expect(locals.has('route')).toBe(true);
    expect(locals.has('delta')).toBe(true);
    // path-qualified (so the runtime overlay lights them on scrub)
    for (const n of ieInternals) expect(n.id.startsWith('sf-injection-engine/')).toBe(true);
  });

  it('internal edges connect the qualified internal stages', () => {
    const g = structureGraphFromRunner(buildAgent() as never);
    const internalEdges = g.edges.filter((e) => e.source.startsWith('sf-injection-engine/'));
    expect(internalEdges.length).toBeGreaterThan(0);
    // e.g. gather → evaluate
    expect(
      internalEdges.some(
        (e) => localOf(e.source) === 'gather' && localOf(e.target) === 'evaluate',
      ),
    ).toBe(true);
  });
});
