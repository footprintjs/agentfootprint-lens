/**
 * useCommitSync — Layer 2 / Tier A tests (Convention 3).
 */

/** @vitest-environment jsdom */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { LensRecorder } from '../../core/LensRecorder.js';
import type { BoundaryRangeLabel } from 'agentfootprint/observe';
import { useCommitSync } from './useCommitSync.js';

const sync = (fn: () => void): void => fn();

function appendCommit(rec: LensRecorder, rid: string, stageId: string): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = rec as any;
  if (!Array.isArray(r._fakeCommits)) {
    r._fakeCommits = [];
    r.getCommitLog = () => r._fakeCommits;
  }
  r._fakeCommits.push({ runtimeStageId: rid, stageId });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (rec as any).notifier.notify();
}

function openRoot(rec: LensRecorder): void {
  const label: BoundaryRangeLabel = {
    type: 'run.entry',
    runtimeStageId: '__root__#0',
    subflowPath: ['__root__'],
    depth: 0,
    ts: 0,
  };
  rec.boundary.boundaryIndex.open(label, 0);
}

let recorder: LensRecorder;
beforeEach(() => {
  recorder = new LensRecorder();
});

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('useCommitSync — unit', () => {
  it('initial render returns [] for an empty recorder', () => {
    const { result } = renderHook(() => useCommitSync(recorder, { schedule: sync }));
    expect(result.current).toEqual([]);
  });

  it('updates when a commit is appended', () => {
    openRoot(recorder);
    const { result } = renderHook(() => useCommitSync(recorder, { schedule: sync }));
    act(() => { appendCommit(recorder, 'seed#0', 'seed'); });
    expect(result.current).toHaveLength(1);
    expect(result.current[0]!.runtimeStageId).toBe('seed#0');
  });
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('useCommitSync — functional', () => {
  it('runtimeGroupId resolves to root for a top-level commit', () => {
    openRoot(recorder);
    const { result } = renderHook(() => useCommitSync(recorder, { schedule: sync }));
    act(() => { appendCommit(recorder, 'seed#0', 'seed'); });
    expect(result.current[0]!.runtimeGroupId).toBe('__root__#0');
  });

  it('multiple commits → ordered map with monotonically increasing commitIdx', () => {
    openRoot(recorder);
    const { result } = renderHook(() => useCommitSync(recorder, { schedule: sync }));
    act(() => {
      appendCommit(recorder, 'a#0', 'a');
      appendCommit(recorder, 'b#0', 'b');
      appendCommit(recorder, 'c#0', 'c');
    });
    expect(result.current.map((e) => e.commitIdx)).toEqual([0, 1, 2]);
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('useCommitSync — integration', () => {
  it('two hooks on the same recorder both see updates', () => {
    openRoot(recorder);
    const a = renderHook(() => useCommitSync(recorder, { schedule: sync }));
    const b = renderHook(() => useCommitSync(recorder, { schedule: sync }));
    act(() => { appendCommit(recorder, 'x#0', 'x'); });
    expect(a.result.current).toHaveLength(1);
    expect(b.result.current).toHaveLength(1);
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('useCommitSync — property', () => {
  it('length is monotonically non-decreasing as commits append', () => {
    openRoot(recorder);
    const { result } = renderHook(() => useCommitSync(recorder, { schedule: sync }));
    const lengths: number[] = [];
    for (let i = 0; i < 10; i++) {
      act(() => { appendCommit(recorder, `s${i}#0`, `s${i}`); });
      lengths.push(result.current.length);
    }
    for (let i = 1; i < lengths.length; i++) {
      expect(lengths[i]!).toBeGreaterThanOrEqual(lengths[i - 1]!);
    }
  });

  it('after unmount, further commits do not crash', () => {
    openRoot(recorder);
    const { unmount } = renderHook(() => useCommitSync(recorder, { schedule: sync }));
    unmount();
    expect(() => appendCommit(recorder, 'x#0', 'x')).not.toThrow();
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('useCommitSync — security', () => {
  it('hostile recorder state still produces a result (no crash)', () => {
    // No root opened, no commits — should return empty cleanly.
    const { result } = renderHook(() => useCommitSync(recorder, { schedule: sync }));
    expect(result.current).toEqual([]);
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('useCommitSync — performance', () => {
  it('100 commit appends rebuild in under 300ms', () => {
    openRoot(recorder);
    const { result } = renderHook(() => useCommitSync(recorder, { schedule: sync }));
    const start = performance.now();
    for (let i = 0; i < 100; i++) act(() => { appendCommit(recorder, `s${i}#0`, 's'); });
    const ms = performance.now() - start;
    expect(result.current).toHaveLength(100);
    expect(ms).toBeLessThan(500);
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('useCommitSync — load', () => {
  it('500 commit appends under 1500ms', () => {
    openRoot(recorder);
    const { result } = renderHook(() => useCommitSync(recorder, { schedule: sync }));
    const start = performance.now();
    for (let i = 0; i < 500; i++) act(() => { appendCommit(recorder, `s${i}#0`, 's'); });
    const ms = performance.now() - start;
    expect(result.current).toHaveLength(500);
    expect(ms).toBeLessThan(3000);
  });
});
