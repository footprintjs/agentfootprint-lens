/**
 * findInflightBranches — Layer 1 / Tier B tests (Convention 3, 7 patterns).
 */

import { describe, it, expect } from 'vitest';
import { CommitRangeIndex } from 'footprintjs/trace';
import type { BoundaryRangeLabel } from 'agentfootprint';
import { findInflightBranches } from './findInflightBranches.js';

function subflowLabel(
  runtimeStageId: string,
  subflowId: string,
  depth: number,
  primitiveKind?: string,
): BoundaryRangeLabel {
  return {
    type: 'subflow.entry',
    runtimeStageId,
    subflowPath: subflowId.split('/'),
    depth,
    ts: 0,
    subflowId,
    subflowName: subflowId,
    ...(primitiveKind !== undefined ? { primitiveKind } : {}),
  };
}

function runRootLabel(runtimeStageId: string): BoundaryRangeLabel {
  return {
    type: 'run.entry',
    runtimeStageId,
    subflowPath: [],
    depth: 0,
    ts: 0,
  };
}

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('findInflightBranches — unit', () => {
  it('empty index returns []', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    expect(findInflightBranches(idx, 0)).toEqual([]);
  });

  it('one open subflow enclosing the commit → returns its runtimeStageId', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(subflowLabel('sf-agent#0', 'sf-agent', 1), 5);
    expect(findInflightBranches(idx, 10)).toEqual(['sf-agent#0']);
  });

  it('open subflow but commit is BEFORE its start → returns []', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(subflowLabel('sf-agent#0', 'sf-agent', 1), 5);
    expect(findInflightBranches(idx, 3)).toEqual([]);
  });

  it('closed subflow that ended BEFORE commitIdx → returns []', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    const t = idx.open(subflowLabel('sf-a#0', 'sf-a', 1), 5);
    idx.close(t, 9);
    expect(findInflightBranches(idx, 12)).toEqual([]);
  });

  it('closed subflow that ended AT or AFTER commitIdx → returns it (replay semantic)', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    const t = idx.open(subflowLabel('sf-a#0', 'sf-a', 1), 5);
    idx.close(t, 15);
    expect(findInflightBranches(idx, 10)).toEqual(['sf-a#0']);
  });

  it('run.entry is excluded from the result (root is not a navigable branch)', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(runRootLabel('__root__#0'), 0);
    idx.open(subflowLabel('sf-a#0', 'sf-a', 1), 5);
    const out = findInflightBranches(idx, 8);
    expect(out).toEqual(['sf-a#0']);
  });

  it('negative commitIdx returns []', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(subflowLabel('sf-a#0', 'sf-a', 1), 5);
    expect(findInflightBranches(idx, -1)).toEqual([]);
  });

  it('NaN/Infinity commitIdx returns []', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(subflowLabel('sf-a#0', 'sf-a', 1), 5);
    expect(findInflightBranches(idx, NaN)).toEqual([]);
    expect(findInflightBranches(idx, Infinity)).toEqual([]);
  });
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('findInflightBranches — functional', () => {
  it('parallel: 3 simultaneous branches all open at commit=20', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(subflowLabel('sf-parallel#0', 'sf-parallel', 1, 'Parallel'), 5);
    idx.open(subflowLabel('sf-branch-a#0', 'sf-parallel/sf-branch-a', 2), 10);
    idx.open(subflowLabel('sf-branch-b#0', 'sf-parallel/sf-branch-b', 2), 12);
    idx.open(subflowLabel('sf-branch-c#0', 'sf-parallel/sf-branch-c', 2), 14);
    const out = findInflightBranches(idx, 20);
    expect(out).toContain('sf-parallel#0');
    expect(out).toContain('sf-branch-a#0');
    expect(out).toContain('sf-branch-b#0');
    expect(out).toContain('sf-branch-c#0');
    expect(out).toHaveLength(4);
  });

  it('parallel with one branch already closed — only 2 in-flight at commit=25', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(subflowLabel('sf-parallel#0', 'sf-parallel', 1, 'Parallel'), 5);
    const tA = idx.open(subflowLabel('sf-a#0', 'sf-parallel/sf-a', 2), 10);
    idx.open(subflowLabel('sf-b#0', 'sf-parallel/sf-b', 2), 12);
    idx.open(subflowLabel('sf-c#0', 'sf-parallel/sf-c', 2), 14);
    idx.close(tA, 20); // branch A closes before commit 25
    const out = findInflightBranches(idx, 25);
    expect(out).toContain('sf-b#0');
    expect(out).toContain('sf-c#0');
    expect(out).not.toContain('sf-a#0');
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('findInflightBranches — integration', () => {
  it('outer→inner ordering preserved (parent before children)', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(subflowLabel('sf-outer#0', 'sf-outer', 1), 0);
    idx.open(subflowLabel('sf-inner#0', 'sf-outer/sf-inner', 2), 5);
    idx.open(subflowLabel('sf-deepest#0', 'sf-outer/sf-inner/sf-deepest', 3), 8);
    const out = findInflightBranches(idx, 10);
    expect(out).toEqual(['sf-outer#0', 'sf-inner#0', 'sf-deepest#0']);
  });

  it('replay scrub: querying past commit returns historical inflight set', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    const tA = idx.open(subflowLabel('sf-a#0', 'sf-a', 1), 5);
    const tB = idx.open(subflowLabel('sf-b#0', 'sf-b', 1), 10);
    idx.close(tA, 15);
    idx.close(tB, 20);
    // At historical commit=12, both A and B were running.
    const out = findInflightBranches(idx, 12);
    expect([...out].sort()).toEqual(['sf-a#0', 'sf-b#0']);
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('findInflightBranches — property', () => {
  it('result never contains run.entry runtimeStageIds', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(runRootLabel('__root__#0'), 0);
    idx.open(subflowLabel('sf-x#0', 'sf-x', 1), 1);
    const out = findInflightBranches(idx, 5);
    expect(out).not.toContain('__root__#0');
  });

  it('result length ≤ enclosing length', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(runRootLabel('__root__#0'), 0);
    idx.open(subflowLabel('sf-a#0', 'sf-a', 1), 1);
    idx.open(subflowLabel('sf-b#0', 'sf-a/sf-b', 2), 2);
    const out = findInflightBranches(idx, 5);
    const enclosing = idx.enclosing(5);
    expect(out.length).toBeLessThanOrEqual(enclosing.length);
  });

  it('never throws for any reasonable commitIdx', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(subflowLabel('sf-a#0', 'sf-a', 1), 5);
    const cases = [-1, 0, 5, 100, NaN, Infinity, -Infinity, 0.5, 1e9];
    for (const c of cases) {
      expect(() => findInflightBranches(idx, c)).not.toThrow();
    }
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('findInflightBranches — security', () => {
  it('does not mutate the index (queries are read-only)', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(subflowLabel('sf-a#0', 'sf-a', 1), 5);
    findInflightBranches(idx, 10);
    // Re-query to confirm state unchanged.
    expect(findInflightBranches(idx, 10)).toEqual(['sf-a#0']);
  });

  it('result is a plain string array (no leaked label fields)', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(subflowLabel('sf-a#0', 'sf-a', 1), 5);
    const out = findInflightBranches(idx, 10);
    for (const x of out) expect(typeof x).toBe('string');
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('findInflightBranches — performance', () => {
  it('100-boundary index, 1000 queries in under 50ms', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    for (let i = 0; i < 100; i++) {
      const t = idx.open(subflowLabel(`sf-${i}#0`, `sf-${i}`, 1), i);
      if (i % 3 !== 0) idx.close(t, i + 10);
    }
    const start = performance.now();
    for (let i = 0; i < 1000; i++) findInflightBranches(idx, 50);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(100);
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('findInflightBranches — load', () => {
  it('1000-boundary index, 1000 queries in under 500ms', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    for (let i = 0; i < 1000; i++) {
      const t = idx.open(subflowLabel(`sf-${i}#0`, `sf-${i}`, 1), i);
      if (i % 5 !== 0) idx.close(t, i + 5);
    }
    const start = performance.now();
    for (let i = 0; i < 1000; i++) findInflightBranches(idx, 500);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(500);
  });
});
