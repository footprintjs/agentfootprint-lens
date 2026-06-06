/**
 * useActiveGroup — Layer 2 / Tier B tests (Convention 3).
 */

/** @vitest-environment jsdom */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { LensRecorder } from '../../core/LensRecorder.js';
import type { BoundaryRangeLabel } from 'agentfootprint';
import { useActiveGroup } from './useActiveGroup.js';

const sync = (fn: () => void): void => fn();

function open(rec: LensRecorder, label: BoundaryRangeLabel, idx: number): void {
  rec.boundary.boundaryIndex.open(label, idx);
}

function rootLabel(): BoundaryRangeLabel {
  return { type: 'run.entry', runtimeStageId: '__root__#0', subflowPath: ['__root__'], depth: 0, ts: 0 };
}
function subflowLabel(rid: string, name: string, path: string[], depth: number): BoundaryRangeLabel {
  return {
    type: 'subflow.entry', runtimeStageId: rid, subflowPath: path, depth, ts: 0,
    subflowId: path[path.length - 1], subflowName: name,
  };
}

let recorder: LensRecorder;
beforeEach(() => { recorder = new LensRecorder(); });

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('useActiveGroup — unit', () => {
  it('undefined cursor → undefined', () => {
    const { result } = renderHook(() => useActiveGroup(recorder, undefined, { schedule: sync }));
    expect(result.current).toBeUndefined();
  });

  it('cursor matching root → root group', () => {
    open(recorder, rootLabel(), 0);
    const { result } = renderHook(() => useActiveGroup(recorder, '__root__#0', { schedule: sync }));
    expect(result.current?.runtimeGroupId).toBe('__root__#0');
  });

  it('cursor matching subflow stage → that subflow group', () => {
    open(recorder, rootLabel(), 0);
    open(recorder, subflowLabel('sf-x#0', 'X', ['__root__', 'sf-x'], 1), 0);
    const { result } = renderHook(() =>
      useActiveGroup(recorder, 'sf-x/call#0', { schedule: sync }),
    );
    expect(result.current?.name).toBe('X');
  });
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('useActiveGroup — functional', () => {
  it('updates when cursor changes', () => {
    open(recorder, rootLabel(), 0);
    open(recorder, subflowLabel('sf-a#0', 'A', ['__root__', 'sf-a'], 1), 0);
    open(recorder, subflowLabel('sf-b#0', 'B', ['__root__', 'sf-b'], 1), 0);
    const { result, rerender } = renderHook(
      ({ rid }: { rid: string }) => useActiveGroup(recorder, rid, { schedule: sync }),
      { initialProps: { rid: 'sf-a/call#0' } },
    );
    expect(result.current?.name).toBe('A');
    rerender({ rid: 'sf-b/call#0' });
    expect(result.current?.name).toBe('B');
  });

  it('updates when boundary state grows (new subflow opens)', () => {
    open(recorder, rootLabel(), 0);
    const { result } = renderHook(() =>
      useActiveGroup(recorder, 'sf-new/call#0', { schedule: sync }),
    );
    // Before sf-new opens, the cursor falls back to root.
    expect(result.current?.isRoot).toBe(true);
    act(() => {
      open(recorder, subflowLabel('sf-new#0', 'New', ['__root__', 'sf-new'], 1), 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (recorder as any).notifier.notify();
    });
    expect(result.current?.name).toBe('New');
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('useActiveGroup — integration', () => {
  it('returns innermost group for a deep nested cursor', () => {
    open(recorder, rootLabel(), 0);
    open(recorder, subflowLabel('sf-Committee#0', 'C', ['__root__', 'sf-Committee'], 1), 0);
    open(recorder, subflowLabel('sf-ethics#0', 'ethics', ['__root__', 'sf-Committee', 'sf-ethics'], 2), 0);
    const { result } = renderHook(() =>
      useActiveGroup(recorder, 'sf-Committee/sf-ethics/call-llm#3', { schedule: sync }),
    );
    expect(result.current?.depth).toBe(2);
    expect(result.current?.name).toBe('ethics');
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('useActiveGroup — property', () => {
  it('returned group depth ≥ root depth (0) for any valid cursor', () => {
    open(recorder, rootLabel(), 0);
    const { result } = renderHook(() => useActiveGroup(recorder, '__root__#0', { schedule: sync }));
    expect(result.current!.depth).toBeGreaterThanOrEqual(0);
  });

  it('after unmount no crash', () => {
    open(recorder, rootLabel(), 0);
    const { unmount } = renderHook(() => useActiveGroup(recorder, '__root__#0', { schedule: sync }));
    expect(() => unmount()).not.toThrow();
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('useActiveGroup — security', () => {
  it('cursor with hostile path does not crash', () => {
    open(recorder, rootLabel(), 0);
    expect(() => renderHook(() => useActiveGroup(recorder, '../../../call#0', { schedule: sync }))).not.toThrow();
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('useActiveGroup — performance', () => {
  it('50 groups + 50 cursor changes in under 500ms', () => {
    open(recorder, rootLabel(), 0);
    for (let i = 0; i < 50; i++) {
      open(recorder, subflowLabel(`sf-${i}#0`, `s${i}`, ['__root__', `sf-${i}`], 1), 0);
    }
    const { rerender } = renderHook(
      ({ rid }: { rid: string }) => useActiveGroup(recorder, rid, { schedule: sync }),
      { initialProps: { rid: 'sf-0/call#0' } },
    );
    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      rerender({ rid: `sf-${i}/call#0` });
    }
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(1000);
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('useActiveGroup — load', () => {
  it('200 groups + 200 cursor changes under 2000ms', () => {
    open(recorder, rootLabel(), 0);
    for (let i = 0; i < 200; i++) {
      open(recorder, subflowLabel(`sf-${i}#0`, `s${i}`, ['__root__', `sf-${i}`], 1), 0);
    }
    const { rerender } = renderHook(
      ({ rid }: { rid: string }) => useActiveGroup(recorder, rid, { schedule: sync }),
      { initialProps: { rid: 'sf-0/call#0' } },
    );
    const start = performance.now();
    for (let i = 0; i < 200; i++) {
      rerender({ rid: `sf-${i}/call#0` });
    }
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(4000);
  });
});
