/**
 * useLensCursor — the controlled/uncontrolled matrix at the hook level.
 *
 * The component-level proof (a real run, real buttons) lives in
 * `Lens.cursor.test.tsx`; this file pins the state machine itself, where every
 * branch is reachable without a browser.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { clampStep, useLensCursor, type LensCursorAt } from './useLensCursor.js';

const place = (n: number) => ({
  runtimeStageId: `stage-${n}#0`,
  commitIdx: n,
  label: `Step ${n}`,
  kind: 'commit',
});

function setup(args: {
  controlledStep?: number | undefined;
  maxStep: number;
  onStepChange?: (step: number, at: LensCursorAt) => void;
}) {
  return renderHook(
    (p: { controlledStep?: number | undefined; maxStep: number }) =>
      useLensCursor({
        controlledStep: p.controlledStep,
        ...(args.onStepChange ? { onStepChange: args.onStepChange } : {}),
        maxStep: p.maxStep,
        describe: place,
      }),
    {
      initialProps: {
        ...(args.controlledStep !== undefined
          ? { controlledStep: args.controlledStep }
          : {}),
        maxStep: args.maxStep,
      },
    },
  );
}

describe('clampStep', () => {
  it('snaps every non-position onto the axis', () => {
    expect(clampStep(3, 5)).toBe(3);
    expect(clampStep(9, 5)).toBe(5);
    expect(clampStep(-2, 5)).toBe(0);
    expect(clampStep(2.7, 5)).toBe(2);
    expect(clampStep(Number.NaN, 5)).toBe(0);
    expect(clampStep(Number.POSITIVE_INFINITY, 5)).toBe(0);
    expect(clampStep(3, 0)).toBe(0);
  });
});

describe('uncontrolled (no `step` prop)', () => {
  it('holds the cursor itself and follows the live edge', () => {
    const { result, rerender } = setup({ maxStep: 0 });
    expect(result.current.step).toBe(0);
    expect(result.current.isLive).toBe(true);

    // The axis grows — auto-advance follows it, exactly as the shipped lens does.
    rerender({ maxStep: 4 });
    expect(result.current.step).toBe(4);
    expect(result.current.isLive).toBe(true);
  });

  it('a scrub back parks the cursor; a scrub to the edge re-engages live', () => {
    const { result, rerender } = setup({ maxStep: 4 });
    act(() => result.current.moveTo(1));
    expect(result.current.step).toBe(1);
    expect(result.current.isLive).toBe(false);

    rerender({ maxStep: 6 });
    expect(result.current.step).toBe(1); // parked — the run advances, we don't

    act(() => result.current.moveTo(6));
    expect(result.current.isLive).toBe(true);
    rerender({ maxStep: 7 });
    expect(result.current.step).toBe(7); // following again
  });

  it('still reports every move when a host is only OBSERVING', () => {
    const onStepChange = vi.fn();
    const { result } = setup({ maxStep: 4, onStepChange });
    onStepChange.mockClear();

    act(() => result.current.moveTo(2));
    expect(result.current.step).toBe(2); // the lens still owns the state
    expect(onStepChange).toHaveBeenCalledTimes(1);
    expect(onStepChange.mock.calls[0]?.[0]).toBe(2);
  });
});

describe('controlled (`step` passed)', () => {
  it('renders the host value and does NOT move itself', () => {
    const onStepChange = vi.fn();
    const { result } = setup({ controlledStep: 1, maxStep: 4, onStepChange });
    expect(result.current.step).toBe(1);

    act(() => result.current.moveTo(3));
    expect(result.current.step).toBe(1); // host owns it; nothing moved
    expect(onStepChange).toHaveBeenCalledTimes(1);
    expect(onStepChange.mock.calls[0]?.[0]).toBe(3);
  });

  it('follows the host', () => {
    const { result, rerender } = setup({ controlledStep: 1, maxStep: 4 });
    rerender({ controlledStep: 3, maxStep: 4 });
    expect(result.current.step).toBe(3);
  });

  it('does not yank a parked host to the live edge on mount', () => {
    const onStepChange = vi.fn();
    setup({ controlledStep: 1, maxStep: 4, onStepChange });
    expect(onStepChange).not.toHaveBeenCalled();
  });

  it('asks a host sitting at the live edge to advance, once per new step', () => {
    const onStepChange = vi.fn();
    const { rerender } = setup({ controlledStep: 4, maxStep: 4, onStepChange });
    expect(onStepChange).not.toHaveBeenCalled();

    rerender({ controlledStep: 4, maxStep: 5 });
    expect(onStepChange).toHaveBeenCalledTimes(1);
    expect(onStepChange.mock.calls[0]?.[0]).toBe(5);
    expect(onStepChange.mock.calls[0]?.[1].clamped).toBe(false);

    // The host echoes: no second fire, and it keeps following.
    rerender({ controlledStep: 5, maxStep: 5 });
    expect(onStepChange).toHaveBeenCalledTimes(1);
    rerender({ controlledStep: 5, maxStep: 6 });
    expect(onStepChange).toHaveBeenCalledTimes(2);
    expect(onStepChange.mock.calls[1]?.[0]).toBe(6);
  });

  it('never fires for a move that resolves to the position already showing', () => {
    const onStepChange = vi.fn();
    const { result } = setup({ controlledStep: 2, maxStep: 4, onStepChange });
    act(() => result.current.moveTo(2));
    expect(onStepChange).not.toHaveBeenCalled();
  });

  it('hands back every unit of the position', () => {
    const onStepChange = vi.fn();
    const { result } = setup({ controlledStep: 0, maxStep: 4, onStepChange });
    act(() => result.current.moveTo(3));
    const at = onStepChange.mock.calls[0]?.[1] as LensCursorAt;
    expect(at).toEqual({
      step: 3,
      totalSteps: 5,
      runtimeStageId: 'stage-3#0',
      commitIdx: 3,
      label: 'Step 3',
      kind: 'commit',
      clamped: false,
    });
  });
});

describe('controlled, out of range — clamps AND says so', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('renders the clamped step and reports the correction exactly once', () => {
    const onStepChange = vi.fn();
    const { result, rerender } = setup({
      controlledStep: 99,
      maxStep: 4,
      onStepChange,
    });
    expect(result.current.step).toBe(4);
    expect(onStepChange).toHaveBeenCalledTimes(1);
    expect(onStepChange.mock.calls[0]?.[0]).toBe(4);
    expect(onStepChange.mock.calls[0]?.[1].clamped).toBe(true);

    // The host stores the correction — the two cursors agree, no more fires.
    rerender({ controlledStep: 4, maxStep: 4 });
    expect(onStepChange).toHaveBeenCalledTimes(1);
  });

  it('teaches on the console rather than clamping in silence', () => {
    setup({ controlledStep: 99, maxStep: 4 });
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = String(warn.mock.calls[0]?.[0]);
    expect(msg).toContain('agentfootprint-lens');
    expect(msg).toContain('5 steps (0…4)');
    expect(msg).toContain('clamped: true');
  });

  it('clamps a negative host value to the first position', () => {
    const onStepChange = vi.fn();
    const { result } = setup({ controlledStep: -3, maxStep: 4, onStepChange });
    expect(result.current.step).toBe(0);
    expect(onStepChange.mock.calls[0]?.[0]).toBe(0);
    expect(onStepChange.mock.calls[0]?.[1].clamped).toBe(true);
  });
});
