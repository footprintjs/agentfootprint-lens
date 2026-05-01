/**
 * Tests — Lens React hooks (useStepFocus / useDrillPath / useStepView).
 *
 * Each hook is exercised with `renderHook`. No component tree needed;
 * no DOM assertions. These tests capture the hook's contract — what
 * happens on every state transition.
 *
 * 7 patterns cover the consumer circle:
 *   1. useStepFocus: initial focus == max
 *   2. useStepFocus: auto-advances when at max and max grows
 *   3. useStepFocus: pins focus when user scrubbed back
 *   4. useDrillPath: drillInto appends; drillBack pops
 *   5. useDrillPath: drillToRoot clears; drillTo replaces
 *   6. useStepView: returns stable reference when inputs don't change
 *   7. useStepView: new reference when focusIndex changes
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { StepGraph, StepNode } from 'agentfootprint';
import { useStepFocus } from './useStepFocus.js';
import { useDrillPath } from './useDrillPath.js';
import { useStepView } from './useStepView.js';

// ─── useStepFocus ────────────────────────────────────────────────────

describe('useStepFocus — pattern 1: initial focus at max', () => {
  it('starts at the provided max', () => {
    const { result } = renderHook(() => useStepFocus(5));
    expect(result.current.focus).toBe(5);
    expect(result.current.isLive).toBe(true);
  });
});

describe('useStepFocus — pattern 2: auto-advance when live', () => {
  it('moves forward when max grows and user is at the end', () => {
    const { result, rerender } = renderHook(
      ({ max }) => useStepFocus(max),
      { initialProps: { max: 3 } },
    );
    expect(result.current.focus).toBe(3);
    rerender({ max: 7 });
    expect(result.current.focus).toBe(7);
    expect(result.current.isLive).toBe(true);
  });
});

describe('useStepFocus — pattern 3: pins when user scrubs back', () => {
  it('stays at the user-chosen position when max grows', () => {
    const { result, rerender } = renderHook(
      ({ max }) => useStepFocus(max),
      { initialProps: { max: 5 } },
    );
    act(() => result.current.setFocus(2));
    expect(result.current.focus).toBe(2);
    expect(result.current.isLive).toBe(false);
    rerender({ max: 10 });
    // Still at 2 — user is pinned, no auto-advance.
    expect(result.current.focus).toBe(2);
    expect(result.current.isLive).toBe(false);
  });
});

// ─── useDrillPath ────────────────────────────────────────────────────

describe('useDrillPath — pattern 4: drillInto + drillBack', () => {
  it('appends and pops segments', () => {
    const { result } = renderHook(() => useDrillPath());
    expect(result.current.drillPath).toEqual([]);
    act(() => result.current.drillInto('triage'));
    expect(result.current.drillPath).toEqual(['triage']);
    act(() => result.current.drillInto('billing'));
    expect(result.current.drillPath).toEqual(['triage', 'billing']);
    act(() => result.current.drillBack());
    expect(result.current.drillPath).toEqual(['triage']);
  });
});

describe('useDrillPath — pattern 5: drillToRoot + drillTo', () => {
  it('clears and replaces the path', () => {
    const { result } = renderHook(() => useDrillPath(['a', 'b']));
    expect(result.current.drillPath).toEqual(['a', 'b']);
    act(() => result.current.drillToRoot());
    expect(result.current.drillPath).toEqual([]);
    act(() => result.current.drillTo(['x']));
    expect(result.current.drillPath).toEqual(['x']);
  });
});

// ─── useStepView ─────────────────────────────────────────────────────

function mkGraph(): StepGraph {
  const nodes: StepNode[] = [
    { id: 's1', kind: 'user->llm', label: 'user→llm', startOffsetMs: 0, subflowPath: [] },
    { id: 's2', kind: 'llm->user', label: 'llm→user', startOffsetMs: 50, subflowPath: [] },
  ];
  return { nodes, edges: [] };
}

describe('useStepView — pattern 6: stable reference under identical inputs', () => {
  it('returns the same StepView object across renders with unchanged inputs', () => {
    const graph = mkGraph();
    const log: readonly never[] = [];
    // Stable drillPath reference — a new `[]` literal every render
    // would invalidate useMemo and defeat the test. Consumers in
    // real code get stability for free because they hold drillPath
    // in state (`useState` / `useDrillPath`).
    const drillPath: readonly string[] = [];
    const { result, rerender } = renderHook(
      ({ f }) => useStepView(graph, log, f, drillPath),
      { initialProps: { f: 1 } },
    );
    const first = result.current;
    rerender({ f: 1 });
    expect(result.current).toBe(first); // identity preserved
  });
});

describe('useStepView — pattern 7: fresh reference when focusIndex changes', () => {
  it('produces a new StepView when focus moves', () => {
    const graph = mkGraph();
    const log: readonly never[] = [];
    const drillPath: readonly string[] = [];
    const { result, rerender } = renderHook(
      ({ f }) => useStepView(graph, log, f, drillPath),
      { initialProps: { f: 0 } },
    );
    const v0 = result.current;
    expect(v0.visibleSteps).toHaveLength(1);
    rerender({ f: 1 });
    expect(result.current.visibleSteps).toHaveLength(2);
    expect(result.current).not.toBe(v0);
  });
});
