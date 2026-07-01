/**
 * Tests — useLensRecorder (the useSyncExternalStore bridge).
 *
 * Exercised with `renderHook`, same as hooks.test.tsx. The hook's
 * contract: it returns the recorder itself, and every event the
 * recorder observes bumps the version → re-renders the component →
 * selectors read fresh state.
 *
 * 3 patterns:
 *   1. returns the SAME recorder instance it was given
 *   2. an observed event re-renders: version bumps, entry accumulates
 *   3. selectors read fresh state after the re-render
 */

import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { AgentfootprintEvent } from 'agentfootprint/events';
import { LensRecorder, lensRecorder } from '../../core/LensRecorder.js';
import { useLensRecorder } from './useLensRecorder.js';

// ─── Fixtures ───────────────────────────────────────────────────────

/** Synthetic typed-event envelope (same shape the dispatcher emits). */
function evt(
  type: string,
  payload: Record<string, unknown> = {},
): AgentfootprintEvent {
  return {
    type,
    payload,
    meta: {
      wallClockMs: 1000,
      runOffsetMs: 0,
      runtimeStageId: 'test#0',
      subflowPath: [],
      compositionPath: [],
      runId: 'test',
    },
  } as unknown as AgentfootprintEvent;
}

/** Feed a synthetic event through the recorder's private event path —
 *  the same seam `observe()`'s `runner.on('*')` subscription uses. */
function feed(rec: LensRecorder, e: AgentfootprintEvent): void {
  (
    rec as unknown as { handleEvent: (e: AgentfootprintEvent) => void }
  ).handleEvent(e);
}

// ─── Pattern 1: identity ─────────────────────────────────────────────

describe('useLensRecorder — pattern 1: returns the given recorder', () => {
  it('hands back the exact instance so selectors can be called on it', () => {
    const rec = lensRecorder();
    const { result } = renderHook(() => useLensRecorder(rec));
    expect(result.current).toBe(rec);
  });
});

// ─── Pattern 2: event → re-render ────────────────────────────────────

describe('useLensRecorder — pattern 2: observed event triggers a re-render', () => {
  it('bumps the version and accumulates the event in the log', () => {
    const rec = lensRecorder();
    const { result } = renderHook(() => {
      const r = useLensRecorder(rec);
      // Read derived state in the hook body — it only updates if the
      // subscription actually re-rendered the component.
      return { recorder: r, version: r.getVersion(), entries: r.entryCount };
    });

    const versionBefore = result.current.version;
    expect(result.current.entries).toBe(0);

    act(() => {
      feed(
        rec,
        evt('agentfootprint.cost.tick', { cumulative: { estimatedUsd: 0.01 } }),
      );
    });

    expect(result.current.version).toBeGreaterThan(versionBefore);
    expect(result.current.entries).toBe(1);
  });
});

// ─── Pattern 3: selectors see fresh state ────────────────────────────

describe('useLensRecorder — pattern 3: selectors read fresh state post-render', () => {
  it('selectEventLog reflects the accumulated event', () => {
    const rec = lensRecorder();
    const { result } = renderHook(() => {
      const r = useLensRecorder(rec);
      return { log: r.selectEventLog() };
    });

    expect(result.current.log).toHaveLength(0);

    act(() => {
      feed(
        rec,
        evt('agentfootprint.cost.tick', { cumulative: { estimatedUsd: 0.01 } }),
      );
    });

    expect(result.current.log).toHaveLength(1);
    expect(result.current.log[0]!.event.type).toBe('agentfootprint.cost.tick');
  });
});
