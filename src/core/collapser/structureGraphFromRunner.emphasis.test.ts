/**
 * structureGraphFromRunner — hero/plumbing emphasis enrichment.
 *
 * The fine-grained bridge stamps each node with a generic `data.emphasis`
 * ('hero' | 'muted') derived from agentfootprint's `stageRole`, plus a hero
 * icon. The renderer (explainable-ui StageNode) styles purely off `emphasis`,
 * so this test pins the bridge's classification → the visual hierarchy.
 */

import { describe, it, expect } from 'vitest';
import { Agent, MockProvider, defineTool } from 'agentfootprint';
import { structureGraphFromRunner } from './structureGraphFromRunner.js';

function buildAgentRunner() {
  const echo = defineTool({
    name: 'echo',
    description: 'echo',
    inputSchema: { type: 'object' },
    execute: () => 'ok',
  });
  return Agent.create({ provider: new MockProvider({ reply: 'done' }), model: 'mock' })
    .system('bot')
    .tool(echo)
    .build();
}

describe('structureGraphFromRunner — hero/plumbing emphasis', () => {
  const graph = structureGraphFromRunner(buildAgentRunner());

  /** Find a node by its LOCAL id (works whether or not it's path-qualified). */
  const byLocal = (local: string) =>
    graph.nodes.find((n) => n.id === local || n.id.endsWith('/' + local));
  const emphasisOf = (local: string) =>
    (byLocal(local)?.data as { emphasis?: string } | undefined)?.emphasis;
  const iconOf = (local: string) =>
    (byLocal(local)?.data as { icon?: string } | undefined)?.icon;

  it('marks the 3 context slots as hero', () => {
    expect(emphasisOf('sf-system-prompt')).toBe('hero');
    expect(emphasisOf('sf-messages')).toBe('hero');
    expect(emphasisOf('sf-tools')).toBe('hero');
  });

  it('marks the LLM call as hero', () => {
    expect(emphasisOf('call-llm')).toBe('hero');
  });

  it('marks mechanism stages as muted', () => {
    expect(emphasisOf('sf-injection-engine')).toBe('muted');
    expect(emphasisOf('sf-cache')).toBe('muted');
  });

  it('gives heroes a semantic icon', () => {
    expect(iconOf('call-llm')).toBe('llm');
    expect(iconOf('sf-system-prompt')).toBe('system-prompt');
    expect(iconOf('sf-messages')).toBe('messages');
    expect(iconOf('sf-tools')).toBe('tool');
  });
});

describe('structureGraphFromRunner — footprintjs-level view (decorate: false)', () => {
  const raw = structureGraphFromRunner(buildAgentRunner(), { decorate: false });
  const decorated = structureGraphFromRunner(buildAgentRunner());

  const byLocal = (g: typeof raw, local: string) =>
    g.nodes.find((n) => n.id === local || n.id.endsWith('/' + local));

  it('keeps the SAME raw subflow structure as the decorated graph (same node ids)', () => {
    expect(raw.nodes.map((n) => n.id).sort()).toEqual(decorated.nodes.map((n) => n.id).sort());
    // The real request-assembly subflows are present as plain boxes.
    expect(byLocal(raw, 'sf-system-prompt')).toBeDefined();
    expect(byLocal(raw, 'sf-messages')).toBeDefined();
    expect(byLocal(raw, 'sf-tools')).toBeDefined();
  });

  it('drops ALL agent decoration — no emphasis, no slot pills', () => {
    for (const n of raw.nodes) {
      const data = (n.data ?? {}) as { emphasis?: string; slotKind?: string };
      expect(data.emphasis).toBeUndefined();
      expect(data.slotKind).toBeUndefined();
      expect((n as { type?: string }).type).not.toBe('slotPill');
    }
    // Sanity: the DECORATED graph DOES flip the slots to pills — proving the
    // flag is what suppresses it, not a missing role.
    expect((byLocal(decorated, 'sf-system-prompt') as { type?: string }).type).toBe('slotPill');
  });
});
