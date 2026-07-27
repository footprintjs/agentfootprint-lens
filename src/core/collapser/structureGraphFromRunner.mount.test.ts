/**
 * structureGraphFromSpec — the order the mount events go out in.
 *
 * The spec walker announces a nested subflow BEFORE it yields that mount node's
 * own stage, and explainable-ui's structure recorder can only stamp a mount onto
 * a node it already holds — so walk order made it warn "unknown rootStageId" and
 * drop the mount, seven times per agent chart. The bridge holds each mount until
 * its stage lands; these pin that, and pin that nothing else about the graph
 * moved when it did.
 *
 * Which case is which: the FIRST one (no `unknown rootStageId` warnings) is the
 * behaviour pin — it fails on the old code. The other three are regression
 * guards: they pass on the old code too, and their job is to catch the graph
 * changing shape as a side effect of the reorder. (It did not: the emitted
 * TraceGraph is byte-identical before and after.)
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { structureGraphFromSpec } from './structureGraphFromRunner.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');

/** The real agent chart a recorded turn ran on. */
function recordedBlueprint(): unknown {
  const artifacts = JSON.parse(
    readFileSync(join(FIXTURES, 'recorded-turn.json'), 'utf8'),
  ) as { blueprint: unknown };
  return artifacts.blueprint;
}

/** Build the graph, capturing whatever the structure recorder warned about. */
function buildWithWarnings(spec: unknown): {
  graph: ReturnType<typeof structureGraphFromSpec>;
  warnings: string[];
} {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const graph = structureGraphFromSpec(spec);
  const warnings = warn.mock.calls.map((call) => String(call[0]));
  warn.mockRestore();
  return { graph, warnings };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('structureGraphFromSpec — subflow mounts', () => {
  it('mounts every subflow onto a node the recorder already has', () => {
    const { warnings } = buildWithWarnings(recordedBlueprint());

    expect(warnings.filter((w) => w.includes('unknown rootStageId'))).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('carries the mount metadata on every subflow node', () => {
    const { graph } = buildWithWarnings(recordedBlueprint());

    const subflows = graph.nodes.filter(
      (n) => (n.data as { isSubflow?: boolean }).isSubflow === true,
    );
    expect(subflows.map((n) => n.id)).toEqual([
      'sf-injection-engine',
      'sf-system-prompt',
      'sf-messages',
      'sf-tools',
      'sf-cache',
      'sf-thinking',
      'final',
    ]);
    for (const node of subflows) {
      expect((node.data as { subflowId?: string }).subflowId).toBe(node.id);
    }
  });

  it('does not let the mount pull a second copy of the subflow’s insides in', () => {
    // The mount event deliberately travels without its `subflowSpec`: this
    // bridge materialises the internals itself, path-qualified to match the
    // runtime overlay. Handing the spec over too would re-walk it under the
    // recorder's own id scheme and duplicate every inner node.
    const { graph } = buildWithWarnings(recordedBlueprint());

    expect(graph.nodes).toHaveLength(27);
    expect(graph.edges).toHaveLength(22);
    expect(new Set(graph.nodes.map((n) => n.id)).size).toBe(graph.nodes.length);
    expect(new Set(graph.edges.map((e) => e.id)).size).toBe(graph.edges.length);
    // The insides are there exactly once, under the path-qualified ids.
    expect(graph.nodes.map((n) => n.id)).toContain('sf-system-prompt/compose');
    expect(graph.nodes.filter((n) => n.id.endsWith('/compose'))).toHaveLength(3);
  });

  it('leaves a chart with no subflows in it untouched', () => {
    const flat = {
      id: 'seed',
      name: 'Seed',
      type: 'stage',
      next: { id: 'work', name: 'Work', type: 'stage' },
    };

    const { graph, warnings } = buildWithWarnings(flat);

    expect(warnings).toEqual([]);
    expect(graph.nodes.map((n) => n.id)).toEqual(['seed', 'work']);
    expect(graph.edges.map((e) => e.id)).toEqual(['seed->work:next']);
    expect(graph.nodes.every((n) => (n.data as { isSubflow?: boolean }).isSubflow === false)).toBe(
      true,
    );
  });
});
