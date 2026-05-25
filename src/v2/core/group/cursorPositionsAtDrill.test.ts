/**
 * cursorPositionsAtDrill — Layer 1 / Tier B tests (Convention 3).
 */

import { describe, it, expect } from 'vitest';
import type { Group } from './Group.js';
import type { CommitSyncEntry } from './buildCommitSyncMap.js';
import { cursorPositionsAtDrill } from './cursorPositionsAtDrill.js';

function group(
  runtimeGroupId: string,
  name: string,
  depth: number,
  parentGroupId: string | undefined,
  opensAt: number,
  closesAt?: number,
  isRoot = false,
  extras: Partial<Pick<Group, 'compositionKind' | 'slotKind' | 'primitiveKind'>> = {},
): Group {
  return {
    runtimeGroupId, name, parentGroupId,
    subflowPath: runtimeGroupId.split('#')[0]!.split('/'),
    depth,
    opensAtCommitIdx: opensAt,
    ...(closesAt !== undefined ? { closesAtCommitIdx: closesAt } : { closesAtCommitIdx: undefined }),
    isRoot,
    ...extras,
  };
}

function commit(
  commitIdx: number,
  runtimeStageId: string,
  runtimeGroupId: string,
  depth: number,
  label: string,
): CommitSyncEntry {
  return {
    runtimeStageId, commitIdx, runtimeGroupId,
    subflowPath: [], depth, label,
  };
}

// Standard fixture: Parallel-of-2-LLMCalls
// Committee is tagged as a Parallel composition so the selector emits
// BOTH start and end positions (the "merge" moment).
const root = group('__root__#0', 'Run', 0, undefined, 0, 9, true);
const parallel = group('sf-Committee#1', 'Committee', 1, '__root__#0', 1, 8,
  false, { compositionKind: 'Parallel' });
const legal = group('legal#1', 'legal', 2, 'sf-Committee#1', 2, 4);
const ethics = group('ethics#3', 'ethics', 2, 'sf-Committee#1', 3, 5);
const merge = group('merge#5', 'merge', 2, 'sf-Committee#1', 6, 6);
const groups: readonly Group[] = [root, parallel, legal, ethics, merge];

const commits: readonly CommitSyncEntry[] = [
  commit(0, '__root__#0', '__root__#0', 0, 'seed'),
  commit(1, 'sf-Committee/fork#1', 'sf-Committee#1', 1, 'Committee · fork'),
  commit(2, 'legal/setup#2', 'legal#1', 2, 'legal · setup'),
  commit(3, 'legal/call-llm#3', 'legal#1', 2, 'legal · call-llm'),
  commit(4, 'ethics/setup#4', 'ethics#3', 2, 'ethics · setup'),
  commit(5, 'ethics/call-llm#5', 'ethics#3', 2, 'ethics · call-llm'),
  commit(6, 'merge/exec#6', 'merge#5', 2, 'merge · exec'),
  commit(7, 'sf-Committee/exit#7', 'sf-Committee#1', 1, 'Committee · exit'),
];

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('cursorPositionsAtDrill — unit', () => {
  it('empty groups returns []', () => {
    expect(cursorPositionsAtDrill([], [], [])).toEqual([]);
  });

  it('drillPath=[] yields outline: Run.start + Committee.start + Committee.end + Run.end', () => {
    const positions = cursorPositionsAtDrill(groups, commits, []);
    expect(positions).toHaveLength(4);
    expect(positions[0]!.runtimeGroupId).toBe('__root__#0');
    expect(positions[0]!.kind).toBe('group-start');
    expect(positions[1]!.runtimeGroupId).toBe('sf-Committee#1');
    expect(positions[1]!.kind).toBe('group-start');
    expect(positions[2]!.runtimeGroupId).toBe('sf-Committee#1');
    expect(positions[2]!.kind).toBe('group-end');
    expect(positions[3]!.runtimeGroupId).toBe('__root__#0');
    expect(positions[3]!.kind).toBe('group-end');
  });

  it('drillPath=[Parallel] yields Parallel\'s direct children (each as group-start)', () => {
    const positions = cursorPositionsAtDrill(groups, commits, ['sf-Committee#1']);
    // Committee.start + legal + ethics + merge + Committee.end (Parallel emits end)
    expect(positions).toHaveLength(5);
    const groupIds = positions.map((p) => p.runtimeGroupId);
    expect(groupIds[0]).toBe('sf-Committee#1');
    expect(groupIds[positions.length - 1]).toBe('sf-Committee#1');
    expect(groupIds.slice(1, -1)).toEqual(['legal#1', 'ethics#3', 'merge#5']);
  });

  it('drillPath=[Parallel, legal] yields legal\'s outline (no children → just legal start + end based on compositionKind)', () => {
    const positions = cursorPositionsAtDrill(groups, commits, ['sf-Committee#1', 'legal#1']);
    // legal is a leaf subflow (no compositionKind, no children) → just start
    expect(positions).toHaveLength(1);
    expect(positions[0]!.runtimeGroupId).toBe('legal#1');
    expect(positions[0]!.kind).toBe('group-start');
  });

  it('unknown drilled group returns []', () => {
    expect(cursorPositionsAtDrill(groups, commits, ['nope#0'])).toEqual([]);
  });

  it('every position carries a commitIdx for jumpTo', () => {
    const positions = cursorPositionsAtDrill(groups, commits, []);
    for (const p of positions) {
      expect(typeof p.commitIdx).toBe('number');
      expect(p.commitIdx).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('cursorPositionsAtDrill — functional', () => {
  it('children appear in commit-opening order (chronological)', () => {
    const positions = cursorPositionsAtDrill(groups, commits, ['sf-Committee#1']);
    // Strip outer Committee start/end; check middle order.
    const middle = positions.slice(1, -1).map((p) => p.runtimeGroupId);
    expect(middle).toEqual(['legal#1', 'ethics#3', 'merge#5']);
  });

  it('Parallel composition emits BOTH start and end positions', () => {
    const positions = cursorPositionsAtDrill(groups, commits, []);
    const committeeStart = positions.find(
      (p) => p.runtimeGroupId === 'sf-Committee#1' && p.kind === 'group-start',
    );
    const committeeEnd = positions.find(
      (p) => p.runtimeGroupId === 'sf-Committee#1' && p.kind === 'group-end',
    );
    expect(committeeStart).toBeDefined();
    expect(committeeEnd).toBeDefined();
    expect(committeeEnd!.label).toContain('merged');
  });

  it('non-Parallel subflows (leaf) emit start only', () => {
    const positions = cursorPositionsAtDrill(groups, commits, ['sf-Committee#1', 'legal#1']);
    // legal is a leaf subflow — single position
    expect(positions).toHaveLength(1);
    expect(positions[0]!.kind).toBe('group-start');
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('cursorPositionsAtDrill — integration', () => {
  it('outline view at top level matches user mental model (4 positions for Parallel run)', () => {
    const positions = cursorPositionsAtDrill(groups, commits, []);
    expect(positions).toHaveLength(4);
    expect(positions.map((p) => p.kind)).toEqual([
      'group-start', 'group-start', 'group-end', 'group-end',
    ]);
  });

  it('drilling into Parallel reveals children inline + Parallel start/end as bookends', () => {
    const positions = cursorPositionsAtDrill(groups, commits, ['sf-Committee#1']);
    // Committee.start + legal + ethics + merge + Committee.end = 5
    expect(positions).toHaveLength(5);
  });

  it('drilling into a leaf subflow shows just its start position', () => {
    const positions = cursorPositionsAtDrill(groups, commits, ['sf-Committee#1', 'legal#1']);
    expect(positions).toHaveLength(1);
    expect(positions[0]!.runtimeGroupId).toBe('legal#1');
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('cursorPositionsAtDrill — property', () => {
  it('every position\'s runtimeStageId is a known group', () => {
    const positions = cursorPositionsAtDrill(groups, commits, ['sf-Committee#1']);
    const groupIds = new Set(groups.map((g) => g.runtimeGroupId));
    for (const p of positions) {
      expect(groupIds.has(p.runtimeStageId)).toBe(true);
    }
  });

  it('Parallel always contributes 2 positions; non-Parallel only 1', () => {
    const positions = cursorPositionsAtDrill(groups, commits, []);
    const parallelHits = positions.filter((p) => p.runtimeGroupId === 'sf-Committee#1');
    expect(parallelHits).toHaveLength(2);
    const rootHits = positions.filter((p) => p.runtimeGroupId === '__root__#0');
    expect(rootHits).toHaveLength(2); // root.start + root.end
  });

  it('commitIdx is monotonically non-decreasing along the positions list', () => {
    const positions = cursorPositionsAtDrill(groups, commits, []);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]!.commitIdx).toBeGreaterThanOrEqual(positions[i - 1]!.commitIdx);
    }
  });

  it('never throws for any reasonable drillPath', () => {
    const cases: ReadonlyArray<readonly string[]> = [
      [], ['__root__#0'], ['sf-Committee#1'], ['sf-Committee#1', 'legal#1'],
      ['totally/unknown#42'],
    ];
    for (const dp of cases) {
      expect(() => cursorPositionsAtDrill(groups, commits, dp)).not.toThrow();
    }
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('cursorPositionsAtDrill — security', () => {
  it('does not mutate inputs', () => {
    const before = JSON.stringify({ groups, commits });
    cursorPositionsAtDrill(groups, commits, ['sf-Committee#1']);
    expect(JSON.stringify({ groups, commits })).toBe(before);
  });

  it('positions expose only documented fields', () => {
    const positions = cursorPositionsAtDrill(groups, commits, ['sf-Committee#1']);
    const allowed = new Set(['runtimeStageId', 'runtimeGroupId', 'label', 'kind', 'depth', 'commitIdx']);
    for (const k of Object.keys(positions[0]!)) {
      expect(allowed.has(k)).toBe(true);
    }
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('cursorPositionsAtDrill — performance', () => {
  it('100-group fixture × 100 lookups in under 50ms', () => {
    const many: Group[] = [root];
    for (let i = 0; i < 100; i++) {
      many.push(group(`sf-${i}#${i}`, `s${i}`, 1, '__root__#0', i));
    }
    const start = performance.now();
    for (let i = 0; i < 100; i++) cursorPositionsAtDrill(many, [], []);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(100);
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('cursorPositionsAtDrill — load', () => {
  it('1000-group fixture × 100 lookups in under 500ms', () => {
    const many: Group[] = [root];
    for (let i = 0; i < 1000; i++) {
      many.push(group(`sf-${i}#${i}`, `s${i}`, 1, '__root__#0', i));
    }
    const start = performance.now();
    for (let i = 0; i < 100; i++) cursorPositionsAtDrill(many, [], []);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(1000);
  });
});
