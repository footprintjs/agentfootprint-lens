/**
 * selectLoopIterations — Layer 1 / Tier B tests (Convention 3, 7 patterns).
 */

import { describe, it, expect } from 'vitest';
import type { Topology, TopologyEdge, TopologyNode } from 'footprintjs/trace';
import { selectLoopIterations } from './selectLoopIterations.js';

function edge(from: string, to: string, kind: TopologyEdge['kind'], at = ''): TopologyEdge {
  return { from, to, kind, at };
}

function node(id: string, name: string, kind: TopologyNode['kind'] = 'subflow'): TopologyNode {
  return {
    id, name, kind, depth: 0,
    incomingKind: 'root', enteredAt: '',
  };
}

function topology(edges: TopologyEdge[], nodes: TopologyNode[] = []): Topology {
  return {
    nodes,
    edges,
    activeNodeId: nodes[nodes.length - 1]?.id ?? null,
    rootId: nodes[0]?.id ?? null,
  };
}

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('selectLoopIterations — unit', () => {
  it('returns 0 when no edges at all', () => {
    expect(selectLoopIterations(topology([]), 'sf-agent')).toEqual({ current: 0, max: undefined });
  });

  it('returns 0 when no loop-iteration edges match stageId', () => {
    const t = topology([
      edge('sf-other', 'sf-other', 'loop-iteration', 'r#1'),
      edge('sf-root', 'sf-agent', 'next', 'r#2'),
    ]);
    expect(selectLoopIterations(t, 'sf-agent')).toEqual({ current: 0, max: undefined });
  });

  it('counts single loop-iteration self-edge', () => {
    const t = topology([
      edge('sf-agent', 'sf-agent', 'loop-iteration', 'r#1'),
    ]);
    expect(selectLoopIterations(t, 'sf-agent')).toEqual({ current: 1, max: undefined });
  });

  it('counts multiple loop-iteration self-edges', () => {
    const t = topology([
      edge('sf-agent', 'sf-agent', 'loop-iteration', 'r#1'),
      edge('sf-agent', 'sf-agent', 'loop-iteration', 'r#2'),
      edge('sf-agent', 'sf-agent', 'loop-iteration', 'r#3'),
    ]);
    expect(selectLoopIterations(t, 'sf-agent').current).toBe(3);
  });

  it('ignores non-loop edges with same from', () => {
    const t = topology([
      edge('sf-agent', 'sf-other', 'next', 'r#1'),
      edge('sf-agent', 'sf-other', 'fork-branch', 'r#2'),
      edge('sf-agent', 'sf-agent', 'loop-iteration', 'r#3'),
    ]);
    expect(selectLoopIterations(t, 'sf-agent').current).toBe(1);
  });

  it('ignores loop-iteration edges whose from is a different stage', () => {
    const t = topology([
      edge('sf-other', 'sf-other', 'loop-iteration', 'r#1'),
      edge('sf-other', 'sf-other', 'loop-iteration', 'r#2'),
    ]);
    expect(selectLoopIterations(t, 'sf-agent').current).toBe(0);
  });

  it('empty stageId returns 0 without scanning', () => {
    const t = topology([edge('sf-agent', 'sf-agent', 'loop-iteration', 'r#1')]);
    expect(selectLoopIterations(t, '').current).toBe(0);
  });

  it('max is always undefined from this function', () => {
    const t = topology([
      edge('sf-agent', 'sf-agent', 'loop-iteration', 'r#1'),
    ]);
    expect(selectLoopIterations(t, 'sf-agent').max).toBeUndefined();
  });
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('selectLoopIterations — functional', () => {
  it('typical ReAct agent: 5 iterations recorded', () => {
    const edges: TopologyEdge[] = [];
    for (let i = 1; i <= 5; i++) {
      edges.push(edge('sf-agent', 'sf-agent', 'loop-iteration', `react#${i}`));
    }
    expect(selectLoopIterations(topology(edges), 'sf-agent').current).toBe(5);
  });

  it('two distinct agents both looping — counts are isolated', () => {
    const edges: TopologyEdge[] = [
      edge('sf-agent-a', 'sf-agent-a', 'loop-iteration', 'a#1'),
      edge('sf-agent-a', 'sf-agent-a', 'loop-iteration', 'a#2'),
      edge('sf-agent-b', 'sf-agent-b', 'loop-iteration', 'b#1'),
    ];
    const t = topology(edges);
    expect(selectLoopIterations(t, 'sf-agent-a').current).toBe(2);
    expect(selectLoopIterations(t, 'sf-agent-b').current).toBe(1);
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('selectLoopIterations — integration', () => {
  it('interleaved edges of all kinds — only loop-iteration counted', () => {
    const edges: TopologyEdge[] = [
      edge('sf-root', 'sf-agent', 'next', '0'),
      edge('sf-agent', 'sf-agent', 'loop-iteration', '1'),
      edge('sf-agent', 'fork-1', 'fork-branch', '2'),
      edge('sf-agent', 'sf-agent', 'loop-iteration', '3'),
      edge('sf-agent', 'dec-1', 'decision-branch', '4'),
      edge('sf-agent', 'sf-agent', 'loop-iteration', '5'),
      edge('sf-agent', 'sf-tail', 'next', '6'),
    ];
    expect(selectLoopIterations(topology(edges), 'sf-agent').current).toBe(3);
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('selectLoopIterations — property', () => {
  it('count equals number of loop-iteration edges where from===stageId', () => {
    const rng = (seed: number) => {
      let s = seed;
      return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
      };
    };
    const r = rng(7);
    const kinds: TopologyEdge['kind'][] = ['next', 'fork-branch', 'decision-branch', 'loop-iteration'];
    for (let trial = 0; trial < 50; trial++) {
      const n = 1 + Math.floor(r() * 30);
      const edges: TopologyEdge[] = [];
      let expected = 0;
      for (let i = 0; i < n; i++) {
        const from = r() < 0.5 ? 'sf-target' : 'sf-other';
        const kind = kinds[Math.floor(r() * kinds.length)]!;
        const to = kind === 'loop-iteration' ? from : 'sf-x';
        edges.push(edge(from, to, kind, `r#${i}`));
        if (kind === 'loop-iteration' && from === 'sf-target') expected++;
      }
      expect(selectLoopIterations(topology(edges), 'sf-target').current).toBe(expected);
    }
  });

  it('result.max is undefined for every input', () => {
    const t = topology([edge('a', 'a', 'loop-iteration', 'r')]);
    expect(selectLoopIterations(t, 'a').max).toBeUndefined();
    expect(selectLoopIterations(topology([]), 'a').max).toBeUndefined();
    expect(selectLoopIterations(t, '').max).toBeUndefined();
  });

  it('never throws for any reasonable input', () => {
    const t = topology([edge('a', 'a', 'loop-iteration', 'r')]);
    const cases = ['', 'a', 'sf-x/y/z', '   ', '##'];
    for (const c of cases) {
      expect(() => selectLoopIterations(t, c)).not.toThrow();
    }
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('selectLoopIterations — security', () => {
  it('output is plain object with only readonly fields current+max', () => {
    const t = topology([edge('a', 'a', 'loop-iteration', 'r')]);
    const out = selectLoopIterations(t, 'a');
    expect(Object.keys(out).sort()).toEqual(['current', 'max']);
  });

  it('does not mutate the input topology (edge order preserved)', () => {
    const edges = [
      edge('a', 'a', 'loop-iteration', '1'),
      edge('a', 'a', 'loop-iteration', '2'),
    ];
    const t = topology([...edges]);
    selectLoopIterations(t, 'a');
    expect(t.edges).toEqual(edges);
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('selectLoopIterations — performance', () => {
  it('1000-edge scan in under 5ms', () => {
    const edges: TopologyEdge[] = [];
    for (let i = 0; i < 1000; i++) {
      edges.push(edge('sf-agent', 'sf-agent', 'loop-iteration', `r#${i}`));
    }
    const t = topology(edges);
    const start = performance.now();
    for (let i = 0; i < 100; i++) selectLoopIterations(t, 'sf-agent');
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(50); // 100 × 1000 = 100K scans
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('selectLoopIterations — load', () => {
  it('10000-edge topology scanned 100 times in under 100ms', () => {
    const edges: TopologyEdge[] = [];
    for (let i = 0; i < 10_000; i++) {
      const isLoop = i % 3 === 0;
      const from = i % 5 === 0 ? 'sf-agent' : 'sf-other';
      edges.push(edge(from, from, isLoop ? 'loop-iteration' : 'next', `r#${i}`));
    }
    const t = topology(edges);
    const start = performance.now();
    for (let i = 0; i < 100; i++) selectLoopIterations(t, 'sf-agent');
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(100);
  });
});
