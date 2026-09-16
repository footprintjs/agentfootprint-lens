/**
 * sharedCursor — one address, every axis (headless).
 *
 * Test types: Contract (a step is derived, an address is held) · Law (a visit
 * to a coarser axis and back lands on the same commit; only a mover changes
 * the address) · Edge (an address before the first stop of an axis reads as
 * no position, never a neighbour).
 */
import { describe, expect, it } from 'vitest';

import { addressOf, cursorForAddress, stepForAddress } from '../../src/core/cursor/sharedCursor.js';
import { scrubAxisFor } from '../../src/core/group/scrubAxisFor.js';
import { load } from '../served/helpers.js';

function axes() {
  const fixture = load('flat-dynamic-tools');
  const step = scrubAxisFor(fixture.recorder, 'step');
  const group = scrubAxisFor(fixture.recorder, 'group');
  // A commit the milestone axis does NOT stop on — the case that makes an
  // address different from a step.
  const groupCommits = new Set(group.map((p) => p.commitIdx));
  const between = step.find((p) => !groupCommits.has(p.commitIdx) && p.commitIdx > group[0]!.commitIdx);
  expect(between).toBeDefined();
  return { step, group, between: between! };
}

describe('stepForAddress', () => {
  it('finds the exact stage on the axis that has it', () => {
    const { step, between } = axes();
    const i = step.findIndex((p) => p.runtimeStageId === between.runtimeStageId);
    expect(stepForAddress(step, addressOf(between))).toBe(i);
  });

  it('on a coarser axis lands on the stop that CONTAINS the commit — the last stop at or before it', () => {
    const { group, between } = axes();
    const at = stepForAddress(group, addressOf(between));
    expect(at).toBeGreaterThanOrEqual(0);
    expect(group[at]!.commitIdx).toBeLessThan(between.commitIdx);
    expect(group[at + 1] === undefined || group[at + 1]!.commitIdx > between.commitIdx).toBe(true);
  });

  it('several stops on ONE stage: the address’s commit index picks the right one', () => {
    const { group } = axes();
    // FACT (fixture): the milestone axis stops twice on the same stage —
    // a route and the answer it produced — one commit apart.
    const byStage = new Map<string, number[]>();
    group.forEach((p, i) => byStage.set(p.runtimeStageId, [...(byStage.get(p.runtimeStageId) ?? []), i]));
    const twice = [...byStage.values()].find((is) => is.length > 1);
    expect(twice).toBeDefined();
    for (const i of twice!) expect(stepForAddress(group, addressOf(group[i]!))).toBe(i);
  });

  it('an address before the first stop of an axis is no position (-1), not the first stop', () => {
    const { group } = axes();
    const first = group[0]!;
    // No stage named (the exact lookup is skipped — a NAMED stage the axis
    // lacks goes through the library's own ladder, by execution index, and
    // lands on the stop that contains it; that is `stepForRuntimeStageId`'s
    // rule, not this file's).
    expect(stepForAddress(group, { runtimeStageId: '', commitIdx: first.commitIdx - 1 })).toBe(-1);
  });
});

describe('cursorForAddress — the law', () => {
  it('a tab derives its step; a visit to the coarser axis and back rewrites nothing', () => {
    const { step, group, between } = axes();
    const moves: unknown[] = [];
    const address = addressOf(between);
    const onStep = cursorForAddress(step, address, (a) => moves.push(a));
    const onGroup = cursorForAddress(group, address, (a) => moves.push(a));
    expect(onStep.at.commitIdx).toBe(between.commitIdx);
    expect(onGroup.at.commitIdx).toBeLessThan(between.commitIdx);
    // Back on the commit axis, from the SAME address — the same commit.
    const back = cursorForAddress(step, address, (a) => moves.push(a));
    expect(back.at.runtimeStageId).toBe(between.runtimeStageId);
    expect(moves).toEqual([]);
  });

  it('only a mover changes the address — moveTo hands the landed position back, clamped to the axis', () => {
    const { group, between } = axes();
    const moves: { runtimeStageId: string; commitIdx: number }[] = [];
    const cursor = cursorForAddress(group, addressOf(between), (a) => moves.push(a));
    cursor.moveTo(0);
    cursor.moveTo(group.length + 10);
    expect(moves).toEqual([addressOf(group[0]!), addressOf(group[group.length - 1]!)]);
  });

  it('a move lands under the AXIS’s drill path, whatever the address carried', () => {
    const { step } = axes();
    const moves: { drillPath?: readonly string[] }[] = [];
    cursorForAddress(step, addressOf(step[1]!), (a) => moves.push(a), ['mount']).moveTo(2);
    expect(moves[0]!.drillPath).toEqual(['mount']);
    cursorForAddress(step, { ...addressOf(step[1]!), drillPath: ['mount'] }, (a) => moves.push(a)).moveTo(2);
    expect(moves[1]!.drillPath).toBeUndefined();
  });

  it('across mounts a commit index is not comparable: only the exact stage resolves, an unnamed address reads as no position', () => {
    const { step } = axes();
    const inside = { runtimeStageId: '', commitIdx: step[3]!.commitIdx, drillPath: ['mount'] };
    expect(cursorForAddress(step, inside, () => undefined).at.step).toBe(-1);
    const named = { ...addressOf(step[3]!), drillPath: ['mount'] };
    expect(cursorForAddress(step, named, () => undefined).at.runtimeStageId).toBe(step[3]!.runtimeStageId);
  });

  it('reads as no position when the address is off the axis, and moves nowhere on an empty axis', () => {
    const { group } = axes();
    const off = cursorForAddress(group, { runtimeStageId: '', commitIdx: -1 }, () => {
      throw new Error('moved');
    });
    expect(off.at.step).toBe(-1);
    expect(off.total).toBe(group.length);
    expect(() => cursorForAddress([], addressOf(group[0]!), () => {
      throw new Error('moved');
    }).moveTo(0)).not.toThrow();
  });
});
