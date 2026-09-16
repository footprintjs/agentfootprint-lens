/**
 * useSharedCursor — the host's ONE cursor across lenses.
 *
 * Test types: Contract (default = the run's end; forAxis derives per axis) ·
 * Law (a move on one axis is read on the other; a visit rewrites nothing) ·
 * Bridge (the older step + report contract lands in the same address) ·
 * Lifecycle (a new recorder drops the held address).
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { addressOf } from '../../src/core/cursor/sharedCursor.js';
import { scrubAxisFor } from '../../src/core/group/scrubAxisFor.js';
import { useSharedCursor } from '../../src/react/useSharedCursor.js';
import { load, loadTampered } from '../served/helpers.js';

describe('useSharedCursor', () => {
  it('opens at the run’s end on every axis, holding no address yet', () => {
    const fixture = load('flat-dynamic-tools');
    const step = scrubAxisFor(fixture.recorder, 'step');
    const group = scrubAxisFor(fixture.recorder, 'group');
    const { result } = renderHook(() => useSharedCursor(fixture.recorder));
    expect(result.current.address).toBeUndefined();
    expect(result.current.forAxis('step').at.step).toBe(step.length - 1);
    expect(result.current.forAxis('group').at.commitIdx).toBe(group[group.length - 1]!.commitIdx);
  });

  it('a move on the commit axis is read on the milestone axis as the containing stop, and back as the same commit', () => {
    const fixture = load('flat-dynamic-tools');
    const step = scrubAxisFor(fixture.recorder, 'step');
    const group = scrubAxisFor(fixture.recorder, 'group');
    const groupCommits = new Set(group.map((p) => p.commitIdx));
    const k = step.findIndex((p) => !groupCommits.has(p.commitIdx) && p.commitIdx > group[0]!.commitIdx);
    expect(k).toBeGreaterThan(0);
    const { result } = renderHook(() => useSharedCursor(fixture.recorder));
    act(() => result.current.forAxis('step').moveTo(k));
    expect(result.current.address).toEqual(addressOf(step[k]!));
    const onGroup = result.current.forAxis('group').at;
    expect(onGroup.commitIdx).toBeLessThan(step[k]!.commitIdx);
    expect(result.current.forAxis('step').at.runtimeStageId).toBe(step[k]!.runtimeStageId);
    // Reading the milestone axis rewrote nothing.
    expect(result.current.address).toEqual(addressOf(step[k]!));
  });

  it('bridges the older step + report contract into the same address', () => {
    const fixture = load('flat-dynamic-tools');
    const group = scrubAxisFor(fixture.recorder, 'group');
    const { result } = renderHook(() => useSharedCursor(fixture.recorder));
    const landed = group[1]!;
    act(() =>
      result.current.onStepChange(1, {
        step: 1,
        totalSteps: group.length,
        runtimeStageId: landed.runtimeStageId,
        commitIdx: landed.commitIdx,
        label: landed.label,
        clamped: false,
      }),
    );
    expect(result.current.address).toEqual(addressOf(landed));
    expect(result.current.forAxis('group').at.step).toBe(1);
  });

  it('a new recorder drops the held address — the default applies again', () => {
    const a = load('flat-dynamic-tools');
    const b = loadTampered('flat-dynamic-tools', () => undefined);
    const { result, rerender } = renderHook(({ rec }) => useSharedCursor(rec), {
      initialProps: { rec: a.recorder },
    });
    act(() => result.current.forAxis('step').moveTo(0));
    expect(result.current.address?.commitIdx).toBe(scrubAxisFor(a.recorder, 'step')[0]!.commitIdx);
    rerender({ rec: b.recorder });
    expect(result.current.address).toBeUndefined();
    const stepB = scrubAxisFor(b.recorder, 'step');
    expect(result.current.forAxis('step').at.step).toBe(stepB.length - 1);
  });

  it('hands the SAME cursor object for an axis until the address moves', () => {
    const fixture = load('flat-dynamic-tools');
    const { result, rerender } = renderHook(() => useSharedCursor(fixture.recorder));
    const first = result.current.forAxis('group');
    rerender();
    expect(result.current.forAxis('group')).toBe(first);
    expect(result.current.forAxis('step')).not.toBe(first);
    act(() => result.current.forAxis('group').moveTo(0));
    expect(result.current.forAxis('group')).not.toBe(first);
    expect(result.current.forAxis('group').at.step).toBe(0);
  });

  it('an axis under a drill path the run does not have is empty, and does not disturb the root address', () => {
    const fixture = load('flat-dynamic-tools');
    const step = scrubAxisFor(fixture.recorder, 'step');
    const { result } = renderHook(() => useSharedCursor(fixture.recorder));
    act(() => result.current.forAxis('step').moveTo(2));
    const drilled = result.current.forAxis('step', ['nowhere']);
    expect(drilled.total).toBe(0);
    expect(drilled.at.step).toBe(-1);
    expect(result.current.address).toEqual(addressOf(step[2]!));
    expect(result.current.forAxis('step').at.runtimeStageId).toBe(step[2]!.runtimeStageId);
  });

  it('with no recorder it reads as no position and a move is harmless', () => {
    const { result } = renderHook(() => useSharedCursor(undefined));
    expect(result.current.forAxis('group').at.step).toBe(-1);
    expect(() => act(() => result.current.forAxis('group').moveTo(0))).not.toThrow();
  });
});
