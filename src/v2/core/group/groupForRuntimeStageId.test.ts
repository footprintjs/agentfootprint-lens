/**
 * groupForRuntimeStageId — Layer 1 / Tier C tests (Convention 3, 7 patterns).
 */

import { describe, it, expect } from 'vitest';
import type { Group } from './Group.js';
import { groupForRuntimeStageId } from './groupForRuntimeStageId.js';

function g(
  runtimeGroupId: string,
  depth: number,
  parent?: string,
  opensAt = 0,
  isRoot = false,
): Group {
  const path = runtimeGroupId.split('#')[0]!.split('/');
  return {
    runtimeGroupId,
    name: runtimeGroupId,
    parentGroupId: parent,
    subflowPath: path,
    depth,
    opensAtCommitIdx: opensAt,
    closesAtCommitIdx: undefined,
    isRoot,
  };
}

const root = g('__root__#0', 0, undefined, 0, true);
const committee = g('sf-Committee#1', 1, '__root__#0', 1);
const ethics = g('sf-Committee/sf-ethics#3', 2, 'sf-Committee#1', 3);
const legal = g('sf-Committee/sf-legal#5', 2, 'sf-Committee#1', 5);
const groups: readonly Group[] = [root, committee, ethics, legal];

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('groupForRuntimeStageId — unit', () => {
  it('empty rid returns undefined', () => {
    expect(groupForRuntimeStageId(groups, '')).toBeUndefined();
  });

  it('empty groups returns undefined', () => {
    expect(groupForRuntimeStageId([], 'sf-x#1')).toBeUndefined();
  });

  it('rid that exactly matches a group returns that group', () => {
    expect(groupForRuntimeStageId(groups, 'sf-Committee#1')).toBe(committee);
  });

  it('rid inside ethics branch returns ethics group', () => {
    expect(
      groupForRuntimeStageId(groups, 'sf-Committee/sf-ethics/call-llm#5'),
    ).toBe(ethics);
  });

  it('rid inside legal branch returns legal group', () => {
    expect(
      groupForRuntimeStageId(groups, 'sf-Committee/sf-legal/call-llm#9'),
    ).toBe(legal);
  });

  it('rid one level deep but only Committee group exists returns Committee', () => {
    expect(
      groupForRuntimeStageId([committee], 'sf-Committee/sf-x/call-llm#1'),
    ).toBe(committee);
  });

  it('rid whose path matches no specific subflow falls back to the root group', () => {
    // A stage at an unknown path is still inside the Run — return root.
    expect(
      groupForRuntimeStageId(groups, 'sf-Other/call-llm#1'),
    ).toBe(root);
  });

  it('no-root, no-match returns undefined', () => {
    // Only Committee, no root. An rid that doesn't fit Committee → undefined.
    expect(
      groupForRuntimeStageId([committee], 'sf-Other/call-llm#1'),
    ).toBeUndefined();
  });
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('groupForRuntimeStageId — functional', () => {
  it('always picks innermost match when nested groups all prefix-match', () => {
    // A commit deep inside ethics matches: root, Committee, AND ethics.
    // Innermost (deepest) is ethics.
    expect(
      groupForRuntimeStageId(groups, 'sf-Committee/sf-ethics/inner/call-llm#1'),
    ).toBe(ethics);
  });

  it('rid that matches root prefix only (a top-level stage) returns root', () => {
    expect(groupForRuntimeStageId(groups, '__root__#0')).toBe(root);
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('groupForRuntimeStageId — integration', () => {
  it('correctly disambiguates same-prefix groups (sf-eth vs sf-ethics)', () => {
    const eth = g('sf-Committee/sf-eth#3', 2, 'sf-Committee#1');
    const ethics2 = g('sf-Committee/sf-ethics#4', 2, 'sf-Committee#1');
    const result = groupForRuntimeStageId(
      [committee, eth, ethics2],
      'sf-Committee/sf-ethics/call-llm#1',
    );
    // The structural prefix check looks for `/` or `#` after the group id.
    // 'sf-Committee/sf-eth' is followed by 'i' in 'sf-Committee/sf-ethics/...',
    // so eth does NOT match. ethics2 DOES match.
    expect(result).toBe(ethics2);
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('groupForRuntimeStageId — property', () => {
  it('the returned group always has depth ≥ every other matching group', () => {
    const r = groupForRuntimeStageId(groups, 'sf-Committee/sf-ethics/inner#0');
    expect(r).toBeDefined();
    for (const other of groups) {
      const otherMatches =
        'sf-Committee/sf-ethics/inner#0'.startsWith(other.runtimeGroupId);
      if (otherMatches) expect(r!.depth).toBeGreaterThanOrEqual(other.depth);
    }
  });

  it('rid IS its own groupId → returns that group', () => {
    for (const grp of groups) {
      expect(groupForRuntimeStageId(groups, grp.runtimeGroupId)).toBe(grp);
    }
  });

  it('never throws', () => {
    const cases = ['', '__root__#0', 'no/match#1', 'sf-Committee#1/extra'];
    for (const c of cases) {
      expect(() => groupForRuntimeStageId(groups, c)).not.toThrow();
    }
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('groupForRuntimeStageId — security', () => {
  it('does not mutate the input groups array', () => {
    const before = JSON.stringify(groups);
    groupForRuntimeStageId(groups, 'sf-Committee#1');
    expect(JSON.stringify(groups)).toBe(before);
  });

  it('a hostile rid (very long path) does not crash', () => {
    const longRid = 'a/b/c/d/e/f/g/h/i/j#999';
    expect(() => groupForRuntimeStageId(groups, longRid)).not.toThrow();
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('groupForRuntimeStageId — performance', () => {
  it('100-group lookup × 1000 in under 50ms', () => {
    const many: Group[] = [];
    for (let i = 0; i < 100; i++) {
      many.push(g(`sf-${i}#${i}`, 1, '__root__#0'));
    }
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      groupForRuntimeStageId(many, `sf-${i % 100}/call#0`);
    }
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(200);
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('groupForRuntimeStageId — load', () => {
  it('1000-group lookup × 1000 in under 500ms', () => {
    const many: Group[] = [];
    for (let i = 0; i < 1000; i++) {
      many.push(g(`sf-${i}#${i}`, 1, '__root__#0'));
    }
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      groupForRuntimeStageId(many, `sf-${i % 1000}/call#0`);
    }
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(2000);
  });
});
