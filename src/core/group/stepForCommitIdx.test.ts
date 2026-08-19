/**
 * stepForCommitIdx — the cross-axis carrier, unit-pinned.
 *
 * A host holding ONE cursor across the two granularities carries it by commit
 * index: Flow(commit) → Why lands on the milestone at-or-nearest-BEFORE that
 * commit; Why(milestone) → Flow lands on that milestone's own commit exactly
 * (every commit is a stop there).
 */

import { describe, it, expect } from 'vitest';
import type { CursorPosition } from './cursorPositionsAtDrill.js';
import { stepForCommitIdx } from './stepForCommitIdx.js';

function pos(runtimeStageId: string, commitIdx: number, kind: CursorPosition['kind'] = 'commit'): CursorPosition {
  return { runtimeStageId, runtimeGroupId: runtimeStageId, label: runtimeStageId, kind, depth: 0, commitIdx };
}

// A milestone axis over a 10-commit run: bookends + three milestones.
const MILESTONES: readonly CursorPosition[] = [
  pos('__root__#0', 0, 'group-start'),
  pos('sf-iter#1', 1),
  pos('call-llm#4', 4),
  pos('tool-calls#7', 7),
  pos('__root__#0', 9, 'group-end'),
];

describe('stepForCommitIdx', () => {
  it('exact commit → the stop standing AT it', () => {
    expect(stepForCommitIdx(MILESTONES, 4)).toBe(2);
    expect(stepForCommitIdx(MILESTONES, 7)).toBe(3);
  });

  it('between stops → the nearest stop BEFORE (never after)', () => {
    expect(stepForCommitIdx(MILESTONES, 5)).toBe(2); // mid-LLM-turn → the turn
    expect(stepForCommitIdx(MILESTONES, 8)).toBe(3); // after the tool call → it
  });

  it('ties on commitIdx → the FIRST position (a mover means "take me there")', () => {
    const tied = [pos('a#0', 0), pos('b#1', 3), pos('c#2', 3), pos('d#3', 5)];
    expect(stepForCommitIdx(tied, 3)).toBe(1);
    expect(stepForCommitIdx(tied, 4)).toBe(1);
  });

  it('run end → the last stop; before the first stop / empty axis → -1', () => {
    expect(stepForCommitIdx(MILESTONES, 9)).toBe(4);
    expect(stepForCommitIdx(MILESTONES, 200)).toBe(4); // past the end clamps to the last true stop
    expect(stepForCommitIdx([], 3)).toBe(-1);
    expect(stepForCommitIdx(MILESTONES, -1)).toBe(-1);
    expect(stepForCommitIdx([pos('a#0', 2)], 1)).toBe(-1); // commit pre-dates the axis
  });

  it('round trip Why → Flow → Why is stable for every milestone', () => {
    // The Flow axis: one stop per commit, index == commitIdx.
    const flow = Array.from({ length: 10 }, (_, i) => pos(`stage-${i}#${i}`, i));
    for (let m = 0; m < MILESTONES.length; m += 1) {
      const flowStep = stepForCommitIdx(flow, MILESTONES[m]!.commitIdx);
      expect(flowStep).toBe(MILESTONES[m]!.commitIdx); // lands ON the milestone's commit
      const back = stepForCommitIdx(MILESTONES, flow[flowStep]!.commitIdx);
      // First-wins on ties: Run · end shares nothing here, so back == m except
      // when an earlier stop shares the commit — not the case on this axis.
      expect(back).toBe(m);
    }
  });
});
