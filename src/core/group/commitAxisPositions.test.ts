/**
 * commitAxisPositions — the COMMIT axis (Flow reading), unit-pinned.
 *
 * The law under test: every executed stage is a stop, in execution order,
 * nothing skippable — the ruler's count IS the commit log's count. Plus the
 * two scoping rules: drilled membership follows the enclosing-group CHAIN
 * (never a bare index range), and a subflow whose internals commit in its own
 * memory scope falls back to the runtime overlay.
 */

import { describe, it, expect } from 'vitest';
import type { Group } from './Group.js';
import type { CommitSyncEntry } from './buildCommitSyncMap.js';
import { commitAxisPositions, type ExecOrderEntry } from './cursorPositionsAtDrill.js';

function group(
  runtimeGroupId: string,
  name: string,
  depth: number,
  parentGroupId: string | undefined,
  opensAt: number,
  closesAt?: number,
  isRoot = false,
): Group {
  return {
    runtimeGroupId,
    name,
    parentGroupId,
    subflowPath: runtimeGroupId.split('#')[0]!.split('/'),
    depth,
    opensAtCommitIdx: opensAt,
    closesAtCommitIdx: closesAt,
    isRoot,
  };
}

function commit(
  commitIdx: number,
  runtimeStageId: string,
  runtimeGroupId: string,
  label: string,
): CommitSyncEntry {
  return { runtimeStageId, commitIdx, runtimeGroupId, subflowPath: [], depth: 0, label, overwriteKeys: [] };
}

const ROOT = group('__root__#0', 'Run', 0, undefined, 0, 4, true);

describe('commitAxisPositions — top level', () => {
  const commits = [
    commit(0, 'seed#0', '__root__#0', 'seed'),
    commit(1, 'call-llm#1', '__root__#0', 'call-llm'),
    commit(2, 'normalize-thinking#2', '__root__#0', 'normalize-thinking'),
    commit(3, 'call-llm#3', '__root__#0', 'call-llm'),
    commit(4, 'final#4', '__root__#0', 'final'),
  ];

  it('one stop per executed stage, in execution order — NOTHING SKIPPED', () => {
    const positions = commitAxisPositions([ROOT], commits, []);
    expect(positions).toHaveLength(commits.length);
    expect(positions.map((p) => p.runtimeStageId)).toEqual(commits.map((c) => c.runtimeStageId));
    positions.forEach((p, i) => expect(p.commitIdx).toBe(i));
    expect(positions.every((p) => p.kind === 'commit')).toBe(true);
  });

  it('a stage that committed TWICE is ONE stop, anchored at its first commit', () => {
    // A boundary stage's entry+exit bundles share the runtimeStageId. Two
    // stops with one address would be the same place twice.
    const doubled = [
      commit(0, 'seed#0', '__root__#0', 'seed'),
      commit(1, 'sf-engine#1', '__root__#0', 'Engine'), // entry bundle
      commit(2, 'gather#2', '__root__#0', 'gather'),
      commit(3, 'sf-engine#1', '__root__#0', 'Engine'), // exit bundle — same stage
      commit(4, 'final#4', '__root__#0', 'final'),
    ];
    const positions = commitAxisPositions([ROOT], doubled, []);
    expect(positions.map((p) => p.runtimeStageId)).toEqual([
      'seed#0',
      'sf-engine#1',
      'gather#2',
      'final#4',
    ]);
    // Anchored at the FIRST commit — execution order, not exit order.
    expect(positions.map((p) => p.commitIdx)).toEqual([0, 1, 2, 4]);
  });

  it('ordinal-suffixes repeated labels, leaves unique ones alone', () => {
    const positions = commitAxisPositions([ROOT], commits, []);
    expect(positions.map((p) => p.label)).toEqual([
      'seed',
      'call-llm 1',
      'normalize-thinking',
      'call-llm 2',
      'final',
    ]);
  });

  it('works with NO groups at all (a recording without boundaries still scrubs)', () => {
    const bare = commits.map((c) => ({ ...c, runtimeGroupId: '' }));
    const positions = commitAxisPositions([], bare, []);
    expect(positions).toHaveLength(commits.length);
    // runtimeGroupId falls back to the commit's own id, never an empty string.
    expect(positions.every((p) => p.runtimeGroupId !== '')).toBe(true);
  });

  it('empty commit log → empty axis (nothing invented)', () => {
    expect(commitAxisPositions([ROOT], [], [])).toEqual([]);
  });
});

describe('commitAxisPositions — drilled scope', () => {
  // Parallel siblings INTERLEAVE commits: legal (opens 1) and ethics (opens 2)
  // alternate. A bare [opens..closes] range on legal would capture ethics's
  // commits; the chain rule must not.
  const root = group('__root__#0', 'Run', 0, undefined, 0, 6, true);
  const legal = group('sf-legal#1', 'Legal', 1, '__root__#0', 1, 5);
  const ethics = group('sf-ethics#2', 'Ethics', 1, '__root__#0', 2, 4);
  const commits = [
    commit(0, 'seed#0', '__root__#0', 'seed'),
    commit(1, 'sf-legal#1', 'sf-legal#1', 'Legal'),
    commit(2, 'sf-ethics#2', 'sf-ethics#2', 'Ethics'),
    commit(3, 'sf-ethics/check#3', 'sf-ethics#2', 'check'),
    commit(4, 'sf-ethics/verdict#4', 'sf-ethics#2', 'verdict'),
    commit(5, 'sf-legal/opinion#5', 'sf-legal#1', 'opinion'),
    commit(6, 'final#6', '__root__#0', 'final'),
  ];
  const groups = [root, legal, ethics];

  it('membership follows the group CHAIN — interleaved parallel siblings stay out', () => {
    const positions = commitAxisPositions(groups, commits, ['sf-legal#1']);
    expect(positions.map((p) => p.runtimeStageId)).toEqual(['sf-legal#1', 'sf-legal/opinion#5']);
  });

  it('a drilled subflow with ONLY its boundary commit falls back to the overlay internals', () => {
    const gather = group('sf-engine#3', 'Engine', 1, '__root__#0', 1, 1);
    const boundaryOnly = [
      commit(0, 'seed#0', '__root__#0', 'seed'),
      commit(1, 'sf-engine#3', 'sf-engine#3', 'Engine'),
      commit(2, 'final#2', '__root__#0', 'final'),
    ];
    const executionOrder: ExecOrderEntry[] = [
      { runtimeStageId: 'seed#0' },
      { runtimeStageId: 'sf-engine#3' },
      { runtimeStageId: 'sf-engine/gather#4', stageName: 'Gather' },
      { runtimeStageId: 'sf-engine/route#5', stageName: 'Route' },
      { runtimeStageId: 'final#2' },
    ];
    const positions = commitAxisPositions([root, gather], boundaryOnly, ['sf-engine#3'], executionOrder);
    expect(positions.map((p) => p.runtimeStageId)).toEqual(['sf-engine/gather#4', 'sf-engine/route#5']);
    expect(positions.map((p) => p.label)).toEqual(['Gather', 'Route']);
  });
});
