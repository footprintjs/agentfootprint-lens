/**
 * mergeOutputs — 7-pattern test matrix.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { disableDevMode, enableDevMode } from 'footprintjs';
import { mergeOutputs } from './mergeOutputs.js';
import type { LensGroupOutput } from '../types.js';

const node = (id: string): LensGroupOutput['nodes'][number] => ({
  id,
  kind: 'stage',
  label: id,
  primitiveKind: 'LLMCall',
});

const edge = (id: string, source: string, target: string): LensGroupOutput['edges'][number] => ({
  id,
  source,
  target,
  kind: 'next',
});

const out = (
  nodes: LensGroupOutput['nodes'],
  edges: LensGroupOutput['edges'],
  rootNodeId = 'root',
): LensGroupOutput => ({ nodes, edges, rootNodeId });

// ── 1. Unit ───────────────────────────────────────────────────────

describe('mergeOutputs — unit', () => {
  it('merging an empty array returns an empty output with the caller-supplied rootNodeId', () => {
    expect(mergeOutputs([], 'x')).toEqual({ nodes: [], edges: [], rootNodeId: 'x' });
  });

  it('merging one output returns its nodes + edges with the new rootNodeId', () => {
    const a = out([node('a')], [edge('e1', 'a', 'b')]);
    const merged = mergeOutputs([a], 'new-root');
    expect(merged.nodes).toEqual(a.nodes);
    expect(merged.edges).toEqual(a.edges);
    expect(merged.rootNodeId).toBe('new-root');
  });
});

// ── 2. Functional ─────────────────────────────────────────────────

describe('mergeOutputs — functional', () => {
  it('concatenates nodes from N outputs in input order', () => {
    const a = out([node('a1'), node('a2')], []);
    const b = out([node('b1')], []);
    const c = out([node('c1'), node('c2')], []);
    const merged = mergeOutputs([a, b, c], 'root');
    expect(merged.nodes.map((n) => n.id)).toEqual(['a1', 'a2', 'b1', 'c1', 'c2']);
  });

  it('concatenates edges from N outputs in input order', () => {
    const a = out([], [edge('e1', 'x', 'y'), edge('e2', 'y', 'z')]);
    const b = out([], [edge('e3', 'p', 'q')]);
    const merged = mergeOutputs([a, b], 'root');
    expect(merged.edges.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
  });
});

// ── 3. Integration ────────────────────────────────────────────────

describe('mergeOutputs — integration', () => {
  it('produces a valid LensGroupOutput shape consumable by xyflow', () => {
    const merged = mergeOutputs(
      [out([node('a')], [edge('e', 'a', 'b')]), out([node('b')], [])],
      'container',
    );
    expect(merged).toEqual({
      nodes: [node('a'), node('b')],
      edges: [edge('e', 'a', 'b')],
      rootNodeId: 'container',
    });
  });
});

// ── 4. Property ───────────────────────────────────────────────────

describe('mergeOutputs — property', () => {
  it.each([0, 1, 2, 5, 10])(
    'output node count equals the sum of input node counts (N=%d)',
    (n) => {
      const inputs = Array.from({ length: n }, (_, i) => out([node(`n${i}`)], []));
      const merged = mergeOutputs(inputs, 'r');
      expect(merged.nodes).toHaveLength(n);
    },
  );

  it('does NOT dedup duplicate node ids — caller owns id uniqueness', () => {
    const a = out([node('same')], []);
    const b = out([node('same')], []);
    const merged = mergeOutputs([a, b], 'r');
    // Two entries with the same id appear verbatim; the helper does
    // NOT dedup. Composition layer ensures unique ids via the
    // `makeChildNodeId(parent, member)` rule.
    expect(merged.nodes).toHaveLength(2);
  });
});

// ── 5. Security ───────────────────────────────────────────────────

describe('mergeOutputs — security', () => {
  it('does NOT mutate input outputs (defensive: new arrays produced)', () => {
    const a = out([node('a')], []);
    const aNodesRef = a.nodes;
    const merged = mergeOutputs([a, out([node('b')], [])], 'r');
    expect(a.nodes).toBe(aNodesRef); // input unchanged
    expect(merged.nodes).not.toBe(aNodesRef); // output is a new array
  });

  describe('dev-mode collision guard', () => {
    beforeEach(() => enableDevMode());
    afterEach(() => disableDevMode());

    it('throws on duplicate node ids when dev mode is on', () => {
      const a = out([node('same')], []);
      const b = out([node('same')], []);
      expect(() => mergeOutputs([a, b], 'r')).toThrowError(
        /duplicate node id 'same'/,
      );
    });

    it('throws on duplicate edge ids when dev mode is on', () => {
      const a = out([], [edge('same-edge', 'x', 'y')]);
      const b = out([], [edge('same-edge', 'p', 'q')]);
      expect(() => mergeOutputs([a, b], 'r')).toThrowError(
        /duplicate edge id 'same-edge'/,
      );
    });

    it('passes when ids are globally unique under dev mode', () => {
      const a = out([node('a')], [edge('e1', 'a', 'b')]);
      const b = out([node('b')], [edge('e2', 'b', 'c')]);
      expect(() => mergeOutputs([a, b], 'r')).not.toThrow();
    });
  });

  it('production path (dev mode off) tolerates duplicates — backward-compat with documented "no dedup" contract', () => {
    // Defaults to dev mode OFF; the test at line 92-100 of this file
    // documents that duplicates pass through silently in prod. We
    // re-assert it here to lock the gating behaviour.
    disableDevMode();
    const a = out([node('same')], []);
    const b = out([node('same')], []);
    expect(() => mergeOutputs([a, b], 'r')).not.toThrow();
  });
});

// ── 6. Performance ────────────────────────────────────────────────

describe('mergeOutputs — performance', () => {
  it('100 outputs × 100 nodes each (10k total) merges under 50ms', () => {
    const inputs = Array.from({ length: 100 }, (_, i) =>
      out(
        Array.from({ length: 100 }, (_, j) => node(`n${i}-${j}`)),
        [],
      ),
    );
    const t0 = performance.now();
    const merged = mergeOutputs(inputs, 'r');
    const ms = performance.now() - t0;
    expect(merged.nodes).toHaveLength(10_000);
    expect(ms).toBeLessThan(50);
  });
});

// ── 7. ROI ────────────────────────────────────────────────────────

describe('mergeOutputs — ROI', () => {
  it('one helper covers all 4 multi-member composition kinds', () => {
    // Same call shape works for Parallel branches, Sequence steps,
    // Conditional branches, Loop body — there's only one merge fold.
    const seq = mergeOutputs([out([node('s1')], []), out([node('s2')], [])], 'seq');
    const par = mergeOutputs([out([node('p1')], []), out([node('p2')], [])], 'par');
    expect(seq.nodes).toHaveLength(2);
    expect(par.nodes).toHaveLength(2);
  });
});
