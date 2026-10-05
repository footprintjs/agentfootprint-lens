import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addressOf, cursorForAddress } from '../core/cursor/sharedCursor.js';
import type { CursorPosition } from '../core/group/cursorPositionsAtDrill.js';
import { openLensCursor } from '../core/timeTravel/lensCursorPort.js';
import { lensRecorder } from '../core/LensRecorder.js';
import { useLensCursor } from './useLensCursor.js';
import { useSharedCursor } from './useSharedCursor.js';

const stops: readonly CursorPosition[] = [0, 1, 2].map((n) => ({
  runtimeStageId: `stage#${n}`, runtimeGroupId: 'root', commitIdx: n,
  label: `Stage ${n}`, kind: 'commit', depth: 0,
}));
afterEach(() => vi.restoreAllMocks());

describe('a derived axis cursor is a reading, not numeric step ownership', () => {
  it('preserves no-position and reports no correction through drill/granularity visits', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const moves = vi.fn(), reports = vi.fn();
    const held = addressOf(stops[0]!);
    const { result, rerender } = renderHook(({ positions, drill }: { positions: readonly CursorPosition[]; drill: readonly string[] }) => {
      const axisCursor = cursorForAddress(positions, held, moves, drill);
      return useLensCursor({ axisCursor, controlledStep: 999, maxStep: Math.max(0, positions.length - 1),
        positions, describe: (n) => positions[n]!, port: openLensCursor(positions), onStepChange: reports });
    }, { initialProps: { positions: stops, drill: [] as readonly string[] } });
    expect(result.current.step).toBe(0);
    rerender({ positions: stops.slice(2), drill: ['child#2'] });
    expect(result.current.step).toBe(-1);
    expect(result.current.cursor.at).toMatchObject({ step: -1, runtimeStageId: '', commitIdx: -1, totalSteps: 1 });
    expect(result.current.isLive).toBe(false);
    rerender({ positions: stops, drill: [] });
    expect(result.current.cursor.at.runtimeStageId).toBe(held.runtimeStageId);
    expect(moves).not.toHaveBeenCalled();
    expect(reports).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('an explicit first stop moves an unplaced address, even on a one-stop child axis', () => {
    const positions = stops.slice(2), moves = vi.fn(), reports = vi.fn();
    const axisCursor = cursorForAddress(positions, addressOf(stops[0]!), moves, ['child#2']);
    const { result } = renderHook(() => useLensCursor({ axisCursor, controlledStep: undefined,
      maxStep: 0, positions, describe: (n) => positions[n]!, port: openLensCursor(positions), onStepChange: reports }));
    act(() => result.current.moveTo(0));
    expect(moves).toHaveBeenCalledExactlyOnceWith(addressOf(positions[0]!, ['child#2']));
    expect(reports).toHaveBeenCalledExactlyOnceWith(0, expect.objectContaining({ runtimeStageId: 'stage#2', clamped: false }));
    // The owner has not echoed the move yet.
    expect(result.current.step).toBe(-1);
  });

  it('an empty derived axis has no move and cannot become base evidence', () => {
    const moves = vi.fn(), reports = vi.fn();
    const axisCursor = cursorForAddress([], addressOf(stops[0]!), moves);
    const { result } = renderHook(() => useLensCursor({ axisCursor, controlledStep: undefined, maxStep: 0,
      positions: [], describe: (n) => stops[n]!, port: openLensCursor([]), onStepChange: reports }));
    act(() => result.current.moveTo(0));
    expect(result.current.step).toBe(-1);
    expect(result.current.cursor.total).toBe(0);
    expect(moves).not.toHaveBeenCalled();
    expect(reports).not.toHaveBeenCalled();
  });

  it('the unheld default follows the growing end; an explicit latest jump retains its address', () => {
    const recorder = lensRecorder();
    const count = vi.spyOn(recorder, 'getCommitCount').mockReturnValue(2);
    const reports = vi.fn();
    const { result, rerender } = renderHook(({ positions }) => {
      const shared = useSharedCursor(recorder);
      const lens = useLensCursor({ axisCursor: shared.over(positions), controlledStep: undefined,
        maxStep: positions.length - 1, positions, describe: (n) => positions[n]!,
        port: openLensCursor(positions), onStepChange: reports });
      return { shared, lens };
    }, { initialProps: { positions: stops.slice(0, 2) as readonly CursorPosition[] } });
    expect(result.current.shared.address).toBeUndefined();
    expect(result.current.lens.step).toBe(1);
    count.mockReturnValue(3);
    rerender({ positions: stops });
    expect(result.current.shared.address).toBeUndefined();
    expect(result.current.lens.step).toBe(2);
    expect(reports).not.toHaveBeenCalled();
    act(() => result.current.lens.moveTo(0));
    act(() => result.current.lens.moveTo(2)); // Latest is an explicit move.
    const held = result.current.shared.address;
    const more = [...stops, { ...stops[2]!, runtimeStageId: 'stage#3', commitIdx: 3 }];
    reports.mockClear();
    count.mockReturnValue(4);
    rerender({ positions: more });
    expect(result.current.shared.address).toBe(held);
    expect(result.current.lens.step).toBe(2);
    expect(result.current.lens.isLive).toBe(false);
    expect(reports).not.toHaveBeenCalled();
  });
});
