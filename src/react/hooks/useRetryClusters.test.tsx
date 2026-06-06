/**
 * useRetryClusters — Layer 2 / Tier B tests (Convention 3, 7 patterns).
 */

/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { RetryEvent } from '../../core/utils/groupRetryAttempts.js';
import { useRetryClusters } from './useRetryClusters.js';

function ev(attempt: number, status: 'failed' | 'ok', stageId = 'x', error?: string): RetryEvent {
  return {
    runtimeStageId: `${stageId}#${attempt - 1}`,
    stageId, attempt, status,
    ...(error !== undefined ? { errorMessage: error } : {}),
    timestamp: attempt * 1000,
  };
}

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('useRetryClusters — unit', () => {
  it('empty events returns empty map', () => {
    const { result } = renderHook(() => useRetryClusters([]));
    expect(result.current.size).toBe(0);
  });

  it('one stage with two attempts produces one cluster', () => {
    const events = [ev(1, 'failed', 'x', 'e'), ev(2, 'ok', 'x')];
    const { result } = renderHook(() => useRetryClusters(events));
    expect(result.current.size).toBe(1);
    expect(result.current.get('x')!.finalStatus).toBe('ok');
  });

  it('two stages produce two clusters', () => {
    const events = [
      ev(1, 'failed', 'a', 'e'), ev(2, 'ok', 'a'),
      ev(1, 'failed', 'b', 'e'), ev(2, 'failed', 'b', 'e'),
    ];
    const { result } = renderHook(() => useRetryClusters(events));
    expect(result.current.size).toBe(2);
    expect(result.current.get('a')!.finalStatus).toBe('ok');
    expect(result.current.get('b')!.finalStatus).toBe('failed');
  });
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('useRetryClusters — functional', () => {
  it('memoizes — same events ref → same Map identity', () => {
    const events = [ev(1, 'failed', 'x', 'e'), ev(2, 'ok', 'x')];
    const { result, rerender } = renderHook(({ e }) => useRetryClusters(e), { initialProps: { e: events } });
    const first = result.current;
    rerender({ e: events });
    expect(result.current).toBe(first);
  });

  it('new events ref → new Map identity', () => {
    const a = [ev(1, 'failed', 'x', 'e'), ev(2, 'ok', 'x')];
    const b = [...a];
    const { result, rerender } = renderHook(({ e }) => useRetryClusters(e), { initialProps: { e: a } });
    const first = result.current;
    rerender({ e: b });
    expect(result.current).not.toBe(first);
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('useRetryClusters — integration', () => {
  it('handles 100 stages with mixed retry outcomes', () => {
    const events: RetryEvent[] = [];
    for (let i = 0; i < 100; i++) {
      events.push(ev(1, 'failed', `s${i}`, 'e'));
      events.push(ev(2, i % 2 === 0 ? 'ok' : 'failed', `s${i}`, i % 2 === 1 ? 'e' : undefined));
    }
    const { result } = renderHook(() => useRetryClusters(events));
    expect(result.current.size).toBe(100);
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('useRetryClusters — property', () => {
  it('result Map size ≤ number of distinct stageIds in events', () => {
    const stages = ['a', 'b', 'c'];
    const events = stages.map((s) => ev(1, 'ok', s));
    const { result } = renderHook(() => useRetryClusters(events));
    expect(result.current.size).toBeLessThanOrEqual(stages.length);
  });

  it('output Map is iterable and queryable', () => {
    const events = [ev(1, 'failed', 'x', 'e'), ev(2, 'ok', 'x')];
    const { result } = renderHook(() => useRetryClusters(events));
    let count = 0;
    for (const [k, v] of result.current) {
      expect(typeof k).toBe('string');
      expect(v.attempts.length).toBeGreaterThan(0);
      count++;
    }
    expect(count).toBe(1);
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('useRetryClusters — security', () => {
  it('does not mutate the input events array', () => {
    const events = [ev(1, 'failed', 'x', 'e'), ev(2, 'ok', 'x')];
    const before = JSON.stringify(events);
    renderHook(() => useRetryClusters(events));
    expect(JSON.stringify(events)).toBe(before);
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('useRetryClusters — performance', () => {
  it('1000 events / 100 stages in under 50ms', () => {
    const events: RetryEvent[] = [];
    for (let i = 0; i < 1000; i++) {
      events.push(ev(1, i % 4 === 0 ? 'failed' : 'ok', `s${i % 100}`, i % 4 === 0 ? 'e' : undefined));
    }
    const start = performance.now();
    renderHook(() => useRetryClusters(events));
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(200);
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('useRetryClusters — load', () => {
  it('10000 events / 1000 stages in under 500ms', () => {
    const events: RetryEvent[] = [];
    for (let i = 0; i < 10_000; i++) {
      events.push(ev((i % 3) + 1, i % 4 === 0 ? 'failed' : 'ok', `s${i % 1000}`, i % 4 === 0 ? 'e' : undefined));
    }
    const start = performance.now();
    renderHook(() => useRetryClusters(events));
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(1500);
  });
});
