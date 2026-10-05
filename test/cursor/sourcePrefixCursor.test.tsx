import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { lensRecorder } from '../../src/core/LensRecorder.js';
import { cursorForTarget, type SharedCursorTarget } from '../../src/core/cursor/sharedCursor.js';
import { resolveSourcePrefix } from '../../src/core/cursor/sourcePrefix.js';
import type { CursorPosition } from '../../src/core/group/cursorPositionsAtDrill.js';
import { useSharedCursor, type SharedCursor, type SourceAwareSharedCursor } from '../../src/react/useSharedCursor.js';

const position = (committedThroughIdx = 0, drillPath: readonly string[] = []) => ({ engineRunId: 'leg', logRunId: 'log', drillPath, committedThroughIdx });
const row = (idx: number, value: number) => ({ idx, runtimeStageId: `stage#${idx}`, trace: [{ path: 'value', verb: 'set' }], overwrite: { value }, updates: {} });
const snapshot = () => ({ logAddress: { logRunId: 'log', drillPath: [] }, initialState: { value: 1 }, commitLog: [row(0, 2), row(1, 3)] });
const positions: readonly CursorPosition[] = [
  { kind: 'group-start', depth: 0, runtimeGroupId: 'root', runtimeStageId: '__root__#0', commitIdx: 0, label: 'Run · start' },
  { kind: 'commit', depth: 0, runtimeGroupId: 'root', runtimeStageId: 'stage#0', commitIdx: 0, label: 'First' },
  { kind: 'commit', depth: 0, runtimeGroupId: 'root', runtimeStageId: 'stage#1', commitIdx: 1, label: 'Later' },
];

describe('one target, source-prefix projection', () => {
  it('uses effective fold index, never a future stage or a group-start anchor', () => {
    const target: SharedCursorTarget = { kind: 'source-prefix', position: position(0) };
    const cursor = cursorForTarget(positions, target, () => { throw new Error('visit moved'); }, [], resolveSourcePrefix(snapshot(), position(0)));
    expect(cursor.at.step).toBe(1);
    expect(cursor.at.foldCommitIdx).toBe(0);
    const base = cursorForTarget(positions, { kind: 'source-prefix', position: position(-1) }, () => {}, [], resolveSourcePrefix(snapshot(), position(-1)));
    expect(base.at.step).toBe(0);
    expect(base.at.foldCommitIdx).toBe(-1);
  });

  it('never takes nearest stop, cross-mount coincident index, or unverified resolution', () => {
    const target: SharedCursorTarget = { kind: 'source-prefix', position: position(0) };
    const resolved = resolveSourcePrefix(snapshot(), target.position);
    expect(cursorForTarget([positions[0]!, positions[2]!], target, () => {}, [], resolved).at.step).toBe(-1);
    expect(cursorForTarget(positions, target, () => {}, ['mount#1'], resolved).at.step).toBe(-1);
    expect(cursorForTarget(positions, target, () => {}).at.step).toBe(-1);
    const other = resolveSourcePrefix(snapshot(), { ...position(), engineRunId: 'other' });
    expect(cursorForTarget(positions, target, () => {}, [], other).at.step).toBe(-1);
  });

  it('withheld coordinates cannot masquerade as a readable ordinary axis stop', () => {
    const target: SharedCursorTarget = { kind: 'source-prefix', position: position() };
    const resolved = resolveSourcePrefix({ ...snapshot(), stateValuesWithheld: true }, target.position);
    const cursor = cursorForTarget(positions, target, () => {}, [], resolved);
    expect(cursor.at.step).toBe(-1);
    expect(cursor.at.sourcePosition).toEqual(position());
  });

  it('an explicit axis move replaces the source target with a real stage address', () => {
    const moves: SharedCursorTarget[] = [];
    const target: SharedCursorTarget = { kind: 'source-prefix', position: position() };
    cursorForTarget(positions, target, (next) => moves.push(next)).moveTo(2);
    expect(moves).toEqual([{ kind: 'stage', address: { runtimeStageId: 'stage#1', commitIdx: 1 } }]);
  });
});

describe('useSharedCursor source-prefix lifecycle', () => {
  it('keeps the existing hand-built SharedCursor shape assignable and exposes stronger hook typing', () => {
    const { result } = renderHook(() => useSharedCursor(undefined));
    const legacy: SharedCursor = {
      address: undefined, forAxis: result.current.forAxis, over: result.current.over,
      moveTo: () => {}, onStepChange: () => {},
    };
    const complete: SourceAwareSharedCursor = result.current;
    expect(legacy.selectSourcePrefix).toBeUndefined();
    expect(typeof complete.selectSourcePrefix).toBe('function');
  });

  it('keeps ordinary cursor identity when a live runner allocates a fresh snapshot on every read', () => {
    const recorder = lensRecorder();
    const read = vi.fn(() => snapshot());
    vi.spyOn(recorder, 'observedRunner').mockReturnValue({ getLastSnapshot: read } as unknown as ReturnType<typeof recorder.observedRunner>);
    const { result, rerender } = renderHook(() => useSharedCursor(recorder));
    const first = result.current.over(positions);
    const reads = read.mock.calls.length;
    rerender();
    expect(result.current.over(positions)).toBe(first);
    expect(read).toHaveBeenCalledTimes(reads);
    act(() => recorder.addNote('snapshot advanced'));
    expect(result.current.over(positions)).not.toBe(first);
    expect(read.mock.calls.length).toBeGreaterThan(reads);
  });

  it('holds full copied coordinates through axis visits and moves only on explicit navigation', () => {
    const recorder = lensRecorder();
    const snap = snapshot();
    const { result } = renderHook(() => useSharedCursor(recorder, snap));
    act(() => { expect(result.current.selectSourcePrefix(position(-1)).status).toBe('available'); });
    const target = result.current.target;
    expect(target).toEqual({ kind: 'source-prefix', position: position(-1) });
    expect(result.current.address).toBeUndefined();
    expect(result.current.over(positions).at.foldCommitIdx).toBe(-1);
    result.current.forAxis('group');
    result.current.forAxis('step', ['absent#1']);
    expect(result.current.target).toBe(target);
    act(() => result.current.over(positions).moveTo(2));
    expect(result.current.target?.kind).toBe('stage');
    expect(result.current.address).toEqual({ runtimeStageId: 'stage#1', commitIdx: 1 });
  });

  it('refuses a missing prefix without moving or clamping the previous target', () => {
    const recorder = lensRecorder();
    const { result } = renderHook(() => useSharedCursor(recorder, snapshot()));
    act(() => result.current.moveTo({ runtimeStageId: 'stage#0', commitIdx: 0 }));
    const held = result.current.target;
    act(() => { expect(result.current.selectSourcePrefix(position(2)).status).toBe('unavailable'); });
    expect(result.current.target).toBe(held);
  });

  it('preserves a selected address when a replacement snapshot no longer contains its log', () => {
    const recorder = lensRecorder();
    const { result, rerender } = renderHook(({ snap }) => useSharedCursor(recorder, snap), { initialProps: { snap: snapshot() } });
    act(() => result.current.selectSourcePrefix(position()));
    const held = result.current.target;
    rerender({ snap: { ...snapshot(), logAddress: { logRunId: 'different-log', drillPath: [] } } });
    expect(result.current.target).toBe(held);
    expect(result.current.sourcePrefix).toMatchObject({ status: 'unavailable', reason: 'log-mismatch' });
    expect(result.current.over(positions).at.step).toBe(-1);
  });

  it('invalidates state and axis caches on recorder changes even with identical root length and snapshot identity', () => {
    const recorder = lensRecorder();
    const path = ['outer#1', 'outer/inner#2'];
    const nested = { logAddress: { logRunId: 'log', drillPath: path }, initialState: { value: 10 }, history: [row(0, 11)] };
    const snap = { ...snapshot(), subflowResults: { 'outer/inner#2': { treeContext: nested } } };
    const { result } = renderHook(() => useSharedCursor(recorder, snap));
    act(() => result.current.selectSourcePrefix(position(0, path)));
    const before = result.current.forAxis('group');
    const first = result.current.sourcePrefix;
    if (first?.status !== 'available' || first.state.status !== 'available') throw new Error('missing nested');
    expect(first.state.folded.state.value).toBe(11);
    act(() => {
      nested.history[0] = row(0, 12);
      nested.history.push(row(1, 13));
      recorder.addNote('new nested history received');
    });
    const next = result.current.sourcePrefix;
    if (next?.status !== 'available' || next.state.status !== 'available') throw new Error('stale nested');
    expect(next.state.folded.state.value).toBe(12);
    expect(result.current.forAxis('group')).not.toBe(before);
    expect(result.current.target).toEqual({ kind: 'source-prefix', position: position(0, path) });
    // No legacy nested overlay index is advertised as this local log position.
    expect(result.current.over(positions, path).at.step).toBe(-1);
  });

  it('selects a verified withheld location but never exposes fold values', () => {
    const recorder = lensRecorder();
    const snap = { ...snapshot(), stateValuesWithheld: true };
    const { result } = renderHook(() => useSharedCursor(recorder, snap));
    act(() => { expect(result.current.selectSourcePrefix(position())).toMatchObject({ status: 'available', state: { status: 'unavailable', reason: 'withheld' } }); });
    expect(result.current.target?.kind).toBe('source-prefix');
    expect(result.current.sourcePrefix).not.toHaveProperty('state.folded');
    expect(result.current.over(positions).at.step).toBe(-1);
  });

  it('resets on recorder replacement, while no recorder plus no snapshot cannot manufacture a prefix', () => {
    const a = lensRecorder(), b = lensRecorder();
    const snap = snapshot();
    const { result, rerender } = renderHook(({ recorder }) => useSharedCursor(recorder, snap), { initialProps: { recorder: a } });
    act(() => result.current.selectSourcePrefix(position()));
    rerender({ recorder: b });
    expect(result.current.target).toBeUndefined();
    expect(result.current.sourcePrefix).toBeUndefined();
    const absent = renderHook(() => useSharedCursor(undefined));
    act(() => { expect(absent.result.current.selectSourcePrefix(position()).status).toBe('unavailable'); });
    expect(absent.result.current.target).toBeUndefined();
  });
});
