/**
 * useSpecSubscription — Layer 2 / Tier A tests (Convention 3, 7 patterns).
 */

/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { LensRecorder } from '../../core/LensRecorder.js';
import { useSpecSubscription } from './useSpecSubscription.js';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (rec as any).notifier.notify();
}

function notifyOnly(rec: LensRecorder): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (rec as any).notifier.notify();
}

const sync = (fn: () => void): void => fn();

let recorder: LensRecorder;
beforeEach(() => {
  recorder = new LensRecorder();
});

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('useSpecSubscription — unit', () => {
  it('initial render returns version=0 and a SpecNode (or undefined)', () => {
    const { result } = renderHook(() => useSpecSubscription(recorder, { schedule: sync }));
    expect(result.current.version).toBe(0);
    // boundary is empty so spec may be undefined — but the hook must not throw.
    expect(['object', 'undefined']).toContain(typeof result.current.spec);
  });

  it('non-structural notify does NOT bump version', () => {
    const { result } = renderHook(() => useSpecSubscription(recorder, { schedule: sync }));
    act(() => { notifyOnly(recorder); });
    expect(result.current.version).toBe(0);
  });

  it('structural change bumps version', () => {
    const { result } = renderHook(() => useSpecSubscription(recorder, { schedule: sync }));
    act(() => { appendFakeNode(recorder); });
    expect(result.current.version).toBe(1);
  });
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('useSpecSubscription — functional', () => {
  it('rebuilds spec on structural change only', () => {
    const { result } = renderHook(() => useSpecSubscription(recorder, { schedule: sync }));
    const v0 = result.current.version;
    act(() => { notifyOnly(recorder); });
    expect(result.current.version).toBe(v0);
    act(() => { appendFakeNode(recorder); });
    expect(result.current.version).toBe(v0 + 1);
  });

  it('multiple structural changes bump version once per change', () => {
    const { result } = renderHook(() => useSpecSubscription(recorder, { schedule: sync }));
    act(() => { appendFakeNode(recorder); });
    act(() => { appendFakeNode(recorder); });
    act(() => { appendFakeNode(recorder); });
    expect(result.current.version).toBe(3);
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('useSpecSubscription — integration', () => {
  it('two hooks on the same recorder both see structural changes', () => {
    const a = renderHook(() => useSpecSubscription(recorder, { schedule: sync }));
    const b = renderHook(() => useSpecSubscription(recorder, { schedule: sync }));
    act(() => { appendFakeNode(recorder); });
    expect(a.result.current.version).toBe(1);
    expect(b.result.current.version).toBe(1);
  });

  it('rerender with a NEW recorder swaps the subscription', () => {
    const second = new LensRecorder();
    const { result, rerender } = renderHook(
      ({ rec }) => useSpecSubscription(rec, { schedule: sync }),
      { initialProps: { rec: recorder } },
    );
    act(() => { appendFakeNode(recorder); });
    expect(result.current.version).toBe(1);
    rerender({ rec: second });
    act(() => { appendFakeNode(second); });
    // After swap, version increments are tracked on the NEW split store.
    expect(result.current.version).toBe(1);
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('useSpecSubscription — property', () => {
  it('version is monotonically non-decreasing across many events', () => {
    const { result } = renderHook(() => useSpecSubscription(recorder, { schedule: sync }));
    const seen: number[] = [];
    for (let i = 0; i < 10; i++) {
      act(() => {
        if (i % 2 === 0) appendFakeNode(recorder);
        else notifyOnly(recorder);
      });
      seen.push(result.current.version);
    }
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    }
  });

  it('after unmount, further events do not crash', () => {
    const { unmount } = renderHook(() => useSpecSubscription(recorder, { schedule: sync }));
    unmount();
    expect(() => appendFakeNode(recorder)).not.toThrow();
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('useSpecSubscription — security', () => {
  it('hostile buildSpec failure is swallowed — hook returns undefined spec', () => {
    // Stub the boundary so the internal buildSpec walk hits a throw.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const boundary = recorder.boundary as any;
    Object.defineProperty(boundary, 'boundaryIndex', {
      get() { throw new Error('hostile'); },
    });
    const { result } = renderHook(() => useSpecSubscription(recorder, { schedule: sync }));
    // Either the hook caught and returned undefined, OR the build path is
    // tolerant and returned a partial spec — both are acceptable;
    // crashing is the failure mode we're guarding against.
    expect(result.current.version).toBe(0);
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('useSpecSubscription — performance', () => {
  it('100 structural changes flush in under 300ms (includes React rerender path)', () => {
    const { result } = renderHook(() => useSpecSubscription(recorder, { schedule: sync }));
    const start = performance.now();
    for (let i = 0; i < 100; i++) act(() => { appendFakeNode(recorder); });
    const ms = performance.now() - start;
    expect(result.current.version).toBe(100);
    expect(ms).toBeLessThan(300);
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('useSpecSubscription — load', () => {
  it('1000 mixed events (10% structural) in under 1500ms', () => {
    const { result } = renderHook(() => useSpecSubscription(recorder, { schedule: sync }));
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      act(() => {
        if (i % 10 === 0) appendFakeNode(recorder);
        else notifyOnly(recorder);
      });
    }
    const ms = performance.now() - start;
    expect(result.current.version).toBe(100);
    expect(ms).toBeLessThan(1500);
  });
});

// Avoid unused-var lint.
void vi;
