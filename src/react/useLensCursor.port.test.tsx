/** @vitest-environment jsdom */
/**
 * The ONE funnel, moving through the port.
 *
 * `useLensCursor.test.tsx` pins the state machine with NO port — which is the
 * arithmetic the lens shipped, and the reading the equivalence proof compares
 * against (`core/timeTravel/portEquivalence.test.ts`). This file pins the
 * OTHER reading: the same funnel with footprintjs 9.17's cursor deciding where
 * a move lands, which is how `<Lens>` is wired.
 *
 * What must stay true (and does, in both readings):
 *   • a move to the step you are on is not a change — no event;
 *   • landing on the live edge re-engages "follow live", and a refused move at
 *     the end of the axis STILL re-derives it (the refusal comes through the
 *     funnel carrying the step it stayed on, rather than vanishing);
 *   • the position reported is the LENS's, in the lens's own units — the port
 *     decides WHERE, never WHAT a panel reads.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { openLensCursor } from '../core/timeTravel/lensCursorPort.js';
import type { CursorPosition } from '../core/group/cursorPositionsAtDrill.js';
import { useLensCursor, type LensCursorAt } from './useLensCursor.js';

const positions: readonly CursorPosition[] = [
  { runtimeStageId: 'seed#0', runtimeGroupId: 'run#0', label: 'Run · start', kind: 'group-start', depth: 0, commitIdx: 0 },
  { runtimeStageId: 'llm#1', runtimeGroupId: 'run#0', label: 'LLM turn 1', kind: 'commit', depth: 1, commitIdx: 3, milestone: 'llm-turn' },
  { runtimeStageId: 'tools#2', runtimeGroupId: 'run#0', label: 'Tool call 1', kind: 'commit', depth: 1, commitIdx: 5, milestone: 'tool-call' },
  { runtimeStageId: 'run#0', runtimeGroupId: 'run#0', label: 'Run · end', kind: 'group-end', depth: 0, commitIdx: 7 },
];

function setup(onStepChange?: (step: number, at: LensCursorAt) => void) {
  const port = openLensCursor(positions);
  const view = renderHook(() =>
    useLensCursor({
      controlledStep: undefined,
      ...(onStepChange ? { onStepChange } : {}),
      maxStep: positions.length - 1,
      describe: (n) => {
        const p = positions[n];
        return {
          runtimeStageId: p?.runtimeStageId ?? '',
          commitIdx: p?.commitIdx ?? -1,
          label: p?.label ?? '',
          ...(p?.kind !== undefined ? { kind: p.kind } : {}),
        };
      },
      port,
    }),
  );
  return { ...view, port };
}

describe('the funnel with the port in it', () => {
  it('reports the LENS position, not the port stop', () => {
    const onStepChange = vi.fn();
    const { result } = setup(onStepChange);
    // An uncontrolled cursor mounts following the live edge, and that first
    // hop is a move like any other — it reports through the same funnel.
    expect(result.current.step).toBe(3);
    onStepChange.mockClear();

    act(() => result.current.moveTo(2));
    expect(result.current.step).toBe(2);
    const at = onStepChange.mock.calls[0]?.[1] as LensCursorAt;
    // The lens's own kind ('commit' | 'group-start' | 'parallel' | …), the
    // lens's label and the lens's commit anchor — the port's four-word
    // `StopKind` never reaches a panel.
    expect(at).toMatchObject({
      step: 2,
      runtimeStageId: 'tools#2',
      commitIdx: 5,
      label: 'Tool call 1',
      kind: 'commit',
      clamped: false,
    });
  });

  it('a refused move at the end of the axis still re-derives "follow live"', () => {
    const onStepChange = vi.fn();
    const { result } = setup(onStepChange);
    act(() => result.current.moveTo(1));
    expect(result.current.isLive).toBe(false);

    onStepChange.mockClear();
    act(() => result.current.moveTo(3)); // the live edge
    expect(result.current.isLive).toBe(true);
    expect(onStepChange).toHaveBeenCalledTimes(1);

    onStepChange.mockClear();
    act(() => result.current.moveTo(3)); // already there: the port refuses
    expect(result.current.step).toBe(3);
    expect(result.current.isLive).toBe(true);
    expect(onStepChange).not.toHaveBeenCalled(); // a non-move is not a change
  });

  it('a step OFF the axis lands on the end it hit and SAYS it was clamped', () => {
    const onStepChange = vi.fn();
    const { result } = setup(onStepChange);
    act(() => result.current.moveTo(1));
    onStepChange.mockClear();

    act(() => result.current.moveTo(99));
    expect(result.current.step).toBe(3);
    const at = onStepChange.mock.calls[0]?.[1] as LensCursorAt;
    expect(at.clamped).toBe(true);
    expect(at.runtimeStageId).toBe('run#0');
  });

  it('the movers a transport binds come straight off the port', () => {
    const { port } = setup();
    expect(port.first(2).step).toBe(0);
    expect(port.prev(0).step).toBe(0); // clamped low
    expect(port.next(3).step).toBe(3); // clamped high
    expect(port.last(0).step).toBe(3);
    expect(port.toAddress(0, 'llm#1')).toEqual({ ok: true, step: 1 });
    // The lens's own second rung: a different execution index of the same
    // stage still resolves to that stage's stop.
    expect(port.toAddress(0, 'llm#42')).toEqual({ ok: true, step: 1 });
    expect(port.toAddress(1, 'ghost#9').ok).toBe(false);
  });
});

describe('the axis shrinks under the cursor', () => {
  // A granularity flip ('step' → 'group') on a long run, or a drill into a
  // small group, replaces the axis with a SHORTER one. The remembered step can
  // then be past its end — and everything downstream (the ruler, the strip
  // highlight, the movement port) would be reading a step that is not a
  // position. The funnel snaps it back, so the port is never asked from off
  // the axis and `describe` is never asked about a step that isn't there.
  it('the cursor is a position again on the very next render, and the port is never asked from off-axis', () => {
    const asked: number[] = [];
    const port = openLensCursor(positions);
    const watched = {
      ...port,
      prev: (from: number) => { asked.push(from); return port.prev(from); },
      next: (from: number) => { asked.push(from); return port.next(from); },
      toStep: (from: number, to: number) => { asked.push(from); return port.toStep(from, to); },
    };

    const { result, rerender } = renderHook(
      (p: { maxStep: number }) =>
        useLensCursor({
          controlledStep: undefined,
          maxStep: p.maxStep,
          describe: (n) => {
            const pos = positions[n];
            // A step off the axis would show up here as an empty address —
            // which is exactly what the snap exists to prevent.
            return {
              runtimeStageId: pos?.runtimeStageId ?? '',
              commitIdx: pos?.commitIdx ?? -1,
              label: pos?.label ?? '',
            };
          },
          port: watched,
        }),
      { initialProps: { maxStep: 3 } },
    );

    act(() => result.current.moveTo(3));
    expect(result.current.step).toBe(3);

    // The axis collapses to two stops under it.
    rerender({ maxStep: 1 });
    expect(result.current.step).toBe(1);

    asked.length = 0;
    act(() => result.current.moveTo(0));
    expect(result.current.step).toBe(0);
    // Every `from` the funnel handed the port was a real position.
    for (const from of asked) {
      expect(from).toBeGreaterThanOrEqual(0);
      expect(from).toBeLessThanOrEqual(1);
    }
  });
});
