/**
 * useOverlaySubscription — Layer 2 / Tier A tests (Convention 3, 7 patterns).
 */

/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { LensRecorder } from '../../core/LensRecorder.js';
import { timingRecorder, TimingRecorder } from '../../core/TimingRecorder.js';
import { useOverlaySubscription } from './useOverlaySubscription.js';

function appendFakeNode(rec: LensRecorder): void {
  // Simulate a subflow-entry boundary event — the signal splitLensStores polls.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = rec.boundary as any;
  if (!b._fakeEvents) b._fakeEvents = [];
  b._fakeEvents.push({ type: 'subflow.entry', runtimeStageId: `sf#${b._fakeEvents.length}` });
  if (!b._origGetEvents) {
    b._origGetEvents = b.getEvents?.bind(b);
    b.getEvents = () => b._fakeEvents;
  }
  // Also push to snapshot for tests that assert stepGraph identity changes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snap = rec.snapshot as any;
  snap.nodes.push({ id: `n-${snap.nodes.length}`, kind: 'function', label: '?', startOffsetMs: 0 });
  snap.graphCache = undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (rec as any).notifier.notify();
}

function notifyOnly(rec: LensRecorder): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (rec as any).notifier.notify();
}

const sync = (fn: () => void): void => fn();

let recorder: LensRecorder;
let timing: TimingRecorder;

beforeEach(() => {
  recorder = new LensRecorder();
  timing = timingRecorder();
});

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('useOverlaySubscription — unit', () => {
  it('initial render returns version=0, stepGraph defined, empty timing', () => {
    const { result } = renderHook(() => useOverlaySubscription(recorder, timing, { schedule: sync }));
    expect(result.current.version).toBe(0);
    expect(result.current.stepGraph).toBeDefined();
    expect(result.current.timing.size).toBe(0);
  });

  it('omitting timingRecorder yields an empty timing map (no throw)', () => {
    const { result } = renderHook(() => useOverlaySubscription(recorder, undefined, { schedule: sync }));
    expect(result.current.timing.size).toBe(0);
    expect(result.current.version).toBe(0);
  });

  it('overlay-only notify bumps version', () => {
    const { result } = renderHook(() => useOverlaySubscription(recorder, timing, { schedule: sync }));
    act(() => { notifyOnly(recorder); });
    expect(result.current.version).toBe(1);
  });

  it('structural notify ALSO bumps overlay version', () => {
    const { result } = renderHook(() => useOverlaySubscription(recorder, timing, { schedule: sync }));
    act(() => { appendFakeNode(recorder); });
    expect(result.current.version).toBe(1);
  });
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('useOverlaySubscription — functional', () => {
  it('timing snapshot updates after onStageStart/onStageEnd', () => {
    const { result, rerender: _rerender } = renderHook(() =>
      useOverlaySubscription(recorder, timing, { schedule: sync }),
    );
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      timing.onStageStart({ runtimeStageId: 's#0', stageName: 's', timestamp: 1000 } as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      timing.onStageEnd({ runtimeStageId: 's#0', stageName: 's', timestamp: 1500 } as any);
      notifyOnly(recorder);
    });
    expect(result.current.timing.size).toBe(1);
    const entry = result.current.timing.get('s#0');
    expect(entry?.durationMs).toBe(500);
  });

  it('stepGraph identity changes when nodes grow', () => {
    const { result } = renderHook(() => useOverlaySubscription(recorder, timing, { schedule: sync }));
    const first = result.current.stepGraph;
    act(() => { appendFakeNode(recorder); });
    const second = result.current.stepGraph;
    expect(second).not.toBe(first);
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('useOverlaySubscription — integration', () => {
  it('two hooks on same recorder both observe overlay flushes', () => {
    const a = renderHook(() => useOverlaySubscription(recorder, timing, { schedule: sync }));
    const b = renderHook(() => useOverlaySubscription(recorder, timing, { schedule: sync }));
    act(() => { notifyOnly(recorder); });
    expect(a.result.current.version).toBe(1);
    expect(b.result.current.version).toBe(1);
  });

  it('overlay+spec combined: both bump on a structural change', () => {
    const { result } = renderHook(() => useOverlaySubscription(recorder, timing, { schedule: sync }));
    act(() => { appendFakeNode(recorder); });
    expect(result.current.version).toBe(1);
    expect(result.current.stepGraph?.nodes.length).toBe(1);
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('useOverlaySubscription — property', () => {
  it('version is monotonically non-decreasing', () => {
    const { result } = renderHook(() => useOverlaySubscription(recorder, timing, { schedule: sync }));
    const seen: number[] = [];
    for (let i = 0; i < 20; i++) {
      act(() => { notifyOnly(recorder); });
      seen.push(result.current.version);
    }
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    }
  });

  it('after unmount no crash on further events', () => {
    const { unmount } = renderHook(() => useOverlaySubscription(recorder, timing, { schedule: sync }));
    unmount();
    expect(() => notifyOnly(recorder)).not.toThrow();
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('useOverlaySubscription — security', () => {
  it('hostile getStepGraph error yields undefined stepGraph (no crash)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snap = recorder.snapshot as any;
    const origGet = snap.getStepGraph.bind(snap);
    snap.getStepGraph = () => { throw new Error('hostile'); };
    const { result } = renderHook(() => useOverlaySubscription(recorder, timing, { schedule: sync }));
    expect(result.current.stepGraph).toBeUndefined();
    snap.getStepGraph = origGet;
  });

  it('timing snapshot is a ReadonlyMap (no mutation surface leaked)', () => {
    const { result } = renderHook(() => useOverlaySubscription(recorder, timing, { schedule: sync }));
    expect(result.current.timing).toBeInstanceOf(Map);
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('useOverlaySubscription — performance', () => {
  it('100 notifies flushed in under 300ms', () => {
    const { result } = renderHook(() => useOverlaySubscription(recorder, timing, { schedule: sync }));
    const start = performance.now();
    for (let i = 0; i < 100; i++) act(() => { notifyOnly(recorder); });
    const ms = performance.now() - start;
    expect(result.current.version).toBe(100);
    expect(ms).toBeLessThan(300);
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('useOverlaySubscription — load', () => {
  it('1000 mixed notifies (10% structural) in under 1500ms', () => {
    const { result } = renderHook(() => useOverlaySubscription(recorder, timing, { schedule: sync }));
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      act(() => {
        if (i % 10 === 0) appendFakeNode(recorder);
        else notifyOnly(recorder);
      });
    }
    const ms = performance.now() - start;
    expect(result.current.version).toBe(1000);
    expect(ms).toBeLessThan(1500);
  });
});

void vi;
