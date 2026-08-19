/**
 * `stepForRuntimeStageId` — an address back to the position that holds it.
 *
 * The axis under test is the REAL one a skill-graph run produces (the shape
 * `useCursorPositions` returns at drill depth 0): whole iterations as stops,
 * with the routing stages living INSIDE them. That mismatch is the whole
 * reason this function exists — a routing view knows `sf-injection-engine/
 * evaluate#3` and the axis only stops at `sf-injection-engine#1`.
 */

import { describe, it, expect } from 'vitest';
import type { CursorPosition } from './cursorPositionsAtDrill.js';
import { stepForRuntimeStageId } from './stepForRuntimeStageId.js';

/** The first stops of a real skill-graph run's axis, trimmed to what matters. */
const positions: readonly CursorPosition[] = [
  { runtimeStageId: '__root__#0', runtimeGroupId: '__root__#0', label: 'Run · start', kind: 'group-start', depth: 0, commitIdx: 0 },
  { runtimeStageId: 'sf-injection-engine#1', runtimeGroupId: 'sf-injection-engine#1', label: 'Iteration 1', kind: 'commit', depth: 1, commitIdx: 1 },
  { runtimeStageId: 'call-llm#19', runtimeGroupId: '__root__#0', label: 'LLM turn 1', kind: 'commit', depth: 1, commitIdx: 16 },
  { runtimeStageId: 'sf-injection-engine#24', runtimeGroupId: 'sf-injection-engine#24', label: 'Iteration 2', kind: 'commit', depth: 1, commitIdx: 21 },
  { runtimeStageId: 'call-llm#42', runtimeGroupId: '__root__#0', label: 'LLM turn 2', kind: 'commit', depth: 1, commitIdx: 36 },
  { runtimeStageId: '__root__#0', runtimeGroupId: '__root__#0', label: 'Run · end', kind: 'group-end', depth: 0, commitIdx: 102 },
] as unknown as readonly CursorPosition[];

describe('stepForRuntimeStageId', () => {
  it('lands on an exact position', () => {
    expect(stepForRuntimeStageId(positions, 'call-llm#19')).toBe(2);
  });

  it('returns the FIRST of two positions sharing an id (start, not end)', () => {
    expect(stepForRuntimeStageId(positions, '__root__#0')).toBe(0);
  });

  it('resolves an address inside a subflow to the subflow\'s own stop', () => {
    expect(stepForRuntimeStageId(positions, 'sf-injection-engine/evaluate#3')).toBe(1);
    expect(stepForRuntimeStageId(positions, 'sf-injection-engine/evaluate#26')).toBe(3);
  });

  it('falls back to the nearest-previous stop for an address in no listed scope', () => {
    // `tool-calls#23` has no stop of its own and no enclosing subflow on this
    // axis. NEAREST-previous is by executionIndex, so the answer is the LLM
    // turn at #19 — not the iteration that contains it. That is the honest
    // one: #19 is the last thing the axis can prove had already happened.
    expect(stepForRuntimeStageId(positions, 'tool-calls#23')).toBe(2);
  });

  it('never moves FORWARD past its target', () => {
    // Before every stop but `__root__#0`… which is the exact match at index 0.
    expect(stepForRuntimeStageId(positions, 'seed#0')).toBe(0);
    // …and an axis whose every stop is later than the address answers -1
    // rather than snapping forward onto one of them.
    const later = positions.slice(2, 5);
    expect(stepForRuntimeStageId(later, 'sf-injection-engine/evaluate#3')).toBe(-1);
  });

  it('answers -1 rather than guessing', () => {
    expect(stepForRuntimeStageId([], 'call-llm#19')).toBe(-1);
    expect(stepForRuntimeStageId(positions, '')).toBe(-1);
    expect(stepForRuntimeStageId(positions, 'no-index')).toBe(-1);
  });

  it('prefers the INNERMOST enclosing scope', () => {
    const nested = [
      { runtimeStageId: 'a#1', runtimeGroupId: 'a#1', label: 'a', kind: 'commit', depth: 1, commitIdx: 1 },
      { runtimeStageId: 'a/b#4', runtimeGroupId: 'a/b#4', label: 'b', kind: 'commit', depth: 2, commitIdx: 4 },
    ] as unknown as readonly CursorPosition[];
    expect(stepForRuntimeStageId(nested, 'a/b/c#9')).toBe(1);
  });
});
