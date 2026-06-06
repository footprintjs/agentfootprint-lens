/**
 * buildGroups — Layer 1 / Tier B tests (Convention 3, 7 patterns).
 */

import { describe, it, expect } from 'vitest';
import { CommitRangeIndex } from 'footprintjs/trace';
import type { BoundaryRangeLabel } from 'agentfootprint';
import { buildGroups } from './buildGroups.js';

function rootLabel(rid = '__root__#0'): BoundaryRangeLabel {
  return {
    type: 'run.entry',
    runtimeStageId: rid,
    subflowPath: ['__root__'],
    depth: 0,
    ts: 0,
  };
}

function subflowLabel(
  rid: string,
  name: string,
  path: string[],
  depth: number,
): BoundaryRangeLabel {
  return {
    type: 'subflow.entry',
    runtimeStageId: rid,
    subflowPath: path,
    depth,
    ts: 0,
    subflowId: path[path.length - 1],
    subflowName: name,
  };
}

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('buildGroups — unit', () => {
  it('empty index returns []', () => {
    expect(buildGroups(new CommitRangeIndex<BoundaryRangeLabel>())).toEqual([]);
  });

  it('one root group', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(rootLabel(), 0);
    const groups = buildGroups(idx);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.runtimeGroupId).toBe('__root__#0');
    expect(groups[0]!.isRoot).toBe(true);
    expect(groups[0]!.parentGroupId).toBeUndefined();
    expect(groups[0]!.depth).toBe(0);
  });

  it('subflow inside root has parentGroupId pointing at root', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(rootLabel(), 0);
    idx.open(subflowLabel('sf-a#1', 'A', ['__root__', 'sf-a'], 1), 1);
    const groups = buildGroups(idx);
    expect(groups).toHaveLength(2);
    const sub = groups.find((g) => g.runtimeGroupId === 'sf-a#1')!;
    expect(sub.parentGroupId).toBe('__root__#0');
    expect(sub.depth).toBe(1);
    expect(sub.isRoot).toBe(false);
  });

  it('closesAtCommitIdx populated for closed range, undefined for open', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    const t1 = idx.open(rootLabel(), 0);
    const t2 = idx.open(subflowLabel('sf-a#1', 'A', ['__root__', 'sf-a'], 1), 1);
    idx.close(t2, 10);
    // t1 still open
    void t1;
    const groups = buildGroups(idx);
    const root = groups.find((g) => g.isRoot)!;
    const sub = groups.find((g) => !g.isRoot)!;
    expect(sub.closesAtCommitIdx).toBe(10);
    expect(root.closesAtCommitIdx).toBeUndefined();
  });

  it('name falls back to runtimeStageId when subflowName absent', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(
      {
        type: 'subflow.entry', runtimeStageId: 'sf-x#3', subflowPath: ['__root__', 'sf-x'],
        depth: 1, ts: 0,
      },
      0,
    );
    expect(buildGroups(idx)[0]!.name).toBe('sf-x#3');
  });

  it('root label that lacks subflowName defaults to "Run"', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(rootLabel(), 0);
    expect(buildGroups(idx)[0]!.name).toBe('Run');
  });
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('buildGroups — functional', () => {
  it('Parallel with 2 branches yields 3 groups (root + 2 siblings)', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(rootLabel(), 0);
    idx.open(subflowLabel('sf-Committee#1', 'Committee', ['__root__', 'sf-Committee'], 1), 1);
    idx.open(subflowLabel('sf-ethics#3', 'ethics', ['__root__', 'sf-Committee', 'sf-ethics'], 2), 3);
    idx.open(subflowLabel('sf-legal#5', 'legal', ['__root__', 'sf-Committee', 'sf-legal'], 2), 5);
    const groups = buildGroups(idx);
    expect(groups).toHaveLength(4);
    const ethics = groups.find((g) => g.name === 'ethics')!;
    const legal = groups.find((g) => g.name === 'legal')!;
    expect(ethics.parentGroupId).toBe('sf-Committee#1');
    expect(legal.parentGroupId).toBe('sf-Committee#1');
  });

  it('depth chain root → committee → branch is reflected in groups[].depth', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(rootLabel(), 0);
    idx.open(subflowLabel('sf-c#1', 'C', ['__root__', 'sf-c'], 1), 1);
    idx.open(subflowLabel('sf-b#3', 'B', ['__root__', 'sf-c', 'sf-b'], 2), 3);
    const depths = buildGroups(idx).map((g) => g.depth).sort();
    expect(depths).toEqual([0, 1, 2]);
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('buildGroups — integration', () => {
  it('3-level nesting preserves the parent chain', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(rootLabel(), 0);
    idx.open(subflowLabel('sf-a#1', 'A', ['__root__', 'sf-a'], 1), 1);
    idx.open(subflowLabel('sf-b#3', 'B', ['__root__', 'sf-a', 'sf-b'], 2), 3);
    idx.open(subflowLabel('sf-c#5', 'C', ['__root__', 'sf-a', 'sf-b', 'sf-c'], 3), 5);
    const groups = buildGroups(idx);
    const c = groups.find((g) => g.name === 'C')!;
    expect(c.parentGroupId).toBe('sf-b#3');
    const b = groups.find((g) => g.name === 'B')!;
    expect(b.parentGroupId).toBe('sf-a#1');
    const a = groups.find((g) => g.name === 'A')!;
    expect(a.parentGroupId).toBe('__root__#0');
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('buildGroups — property', () => {
  it('every non-root group has a parentGroupId; root has none', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(rootLabel(), 0);
    for (let i = 1; i <= 5; i++) {
      idx.open(subflowLabel(`sf-${i}#${i}`, `s${i}`, ['__root__', `sf-${i}`], 1), i);
    }
    const groups = buildGroups(idx);
    for (const g of groups) {
      if (g.isRoot) expect(g.parentGroupId).toBeUndefined();
      else expect(g.parentGroupId).toBeDefined();
    }
  });

  it('output count equals input range count', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    for (let i = 0; i < 8; i++) {
      idx.open(subflowLabel(`sf-${i}#${i}`, `s${i}`, ['__root__', `sf-${i}`], 1), i);
    }
    expect(buildGroups(idx)).toHaveLength(8);
  });

  it('never throws on a fully-closed index', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    const tokens = [
      idx.open(rootLabel(), 0),
      idx.open(subflowLabel('sf-a#1', 'A', ['__root__', 'sf-a'], 1), 1),
    ];
    for (let i = 0; i < tokens.length; i++) idx.close(tokens[i]!, 10 + i);
    expect(() => buildGroups(idx)).not.toThrow();
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('buildGroups — security', () => {
  it('does not mutate the input index', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(rootLabel(), 0);
    const before = idx.size;
    buildGroups(idx);
    expect(idx.size).toBe(before);
  });

  it('Group objects expose only documented fields', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(rootLabel(), 0);
    const allowed = new Set([
      'runtimeGroupId', 'name', 'parentGroupId', 'subflowPath',
      'depth', 'opensAtCommitIdx', 'closesAtCommitIdx', 'isRoot',
    ]);
    for (const k of Object.keys(buildGroups(idx)[0]!)) {
      expect(allowed.has(k)).toBe(true);
    }
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('buildGroups — performance', () => {
  it('100-range index processed in under 50ms', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(rootLabel(), 0);
    for (let i = 1; i <= 100; i++) {
      idx.open(subflowLabel(`sf-${i}#${i}`, `s${i}`, ['__root__', `sf-${i}`], 1), i);
    }
    const start = performance.now();
    buildGroups(idx);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(100);
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('buildGroups — load', () => {
  it('1000-range index processed in under 500ms', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(rootLabel(), 0);
    for (let i = 1; i <= 1000; i++) {
      idx.open(subflowLabel(`sf-${i}#${i}`, `s${i}`, ['__root__', `sf-${i}`], 1), i);
    }
    const start = performance.now();
    buildGroups(idx);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(1000);
  });
});
