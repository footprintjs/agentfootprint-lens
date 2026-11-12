/**
 * `executionStages` / `stageBranches` read both execution-tree shapes alike.
 *
 * Test types: Contract (the list form of footprintjs 13 and the linked form of
 * footprintjs 12 and saved runs give the same stages and branches) · Boundary
 * (no tree, malformed values, a cyclic hand-built chain) · Capability (a
 * 20 000-stage linked chain is read without recursion).
 */
import { describe, expect, it } from 'vitest';
import { executionStages, stageBranches } from './executionStages.js';

type Stage = { id: string; next?: Stage; children?: Stage[]; branches?: Stage[][] };

/** seed → fork(legal: a → b, ethics: c) → merge, in both shapes. */
const linked: Stage = {
  id: 'seed',
  next: {
    id: 'fork',
    children: [{ id: 'a', next: { id: 'b' } }, { id: 'c' }],
    next: { id: 'merge' },
  },
};
const list: Stage[] = [
  { id: 'seed' },
  { id: 'fork', branches: [[{ id: 'a' }, { id: 'b' }], [{ id: 'c' }]] },
  { id: 'merge' },
];

const ids = (stages: readonly Stage[]) => stages.map((s) => s.id);

describe('executionStages', () => {
  it('lists the stages in run order in both shapes', () => {
    expect(ids(executionStages<Stage>(list))).toEqual(['seed', 'fork', 'merge']);
    expect(ids(executionStages<Stage>(linked))).toEqual(['seed', 'fork', 'merge']);
  });

  it('reads no tree as no stages', () => {
    for (const tree of [undefined, null, 0, 'stage', []]) expect(executionStages(tree)).toEqual([]);
  });

  it('skips entries that are not stages in a list', () => {
    expect(ids(executionStages<Stage>([{ id: 'x' }, null, 3, { id: 'y' }]))).toEqual(['x', 'y']);
  });

  it('stops at a cycle in a hand-built linked chain', () => {
    const a: Stage = { id: 'a' };
    a.next = { id: 'b', next: a };
    expect(ids(executionStages<Stage>(a))).toEqual(['a', 'b']);
  });

  it('reads a 20 000-stage linked chain without recursion', () => {
    let head: Stage | undefined;
    for (let i = 19_999; i >= 0; i--) head = { id: `s${i}`, ...(head ? { next: head } : {}) };
    const stages = executionStages<Stage>(head);
    expect(stages).toHaveLength(20_000);
    expect(stages[19_999]!.id).toBe('s19999');
  });
});

describe('stageBranches', () => {
  it('gives one list per child, each in run order, in both shapes', () => {
    expect(stageBranches<Stage>(executionStages<Stage>(list)[1]!).map(ids)).toEqual([['a', 'b'], ['c']]);
    expect(stageBranches<Stage>(executionStages<Stage>(linked)[1]!).map(ids)).toEqual([['a', 'b'], ['c']]);
  });

  it('gives no branches for a stage without children', () => {
    expect(stageBranches(list[0]!)).toEqual([]);
    expect(stageBranches(linked)).toEqual([]);
  });
});
