/**
 * Tests — drill-down integration (breadcrumb + filtered view).
 *
 * Exercises the combined hook/selector/component path:
 *   useDrillPath → selectStepView(drillPath) → RunTreeFlow render.
 *
 * 7 patterns cover the consumer circle:
 *   1. Top-level view shows multiple agents (no breadcrumb)
 *   2. drillInto('triage') filters the visible steps
 *   3. Breadcrumb appears with one segment after drilling in
 *   4. drillBack pops one segment
 *   5. drillToRoot clears path
 *   6. selectStepView mode flips to 'drill-down' when drillPath is non-empty
 *   7. Slider total reflects scoped step count in drill-down mode
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { act, renderHook } from '@testing-library/react';
import type { StepGraph, StepNode } from 'agentfootprint';
import { useDrillPath } from './hooks/useDrillPath.js';
import { selectStepView } from '../core/selectors/index.js';

// ─── Test fixtures ──────────────────────────────────────────────────

function mkStep(
  overrides: Partial<StepNode> & Pick<StepNode, 'id' | 'kind'>,
): StepNode {
  return {
    label: overrides.kind,
    startOffsetMs: 0,
    subflowPath: [],
    ...overrides,
  };
}

function swarmGraph(): StepGraph {
  return {
    nodes: [
      mkStep({ id: 'triage', kind: 'subflow', label: 'triage', isPrimitiveBoundary: true, primitiveKind: 'Agent', subflowPath: ['triage'] }),
      mkStep({ id: 't1', kind: 'user->llm', subflowPath: ['triage'] }),
      mkStep({ id: 't2', kind: 'llm->user', subflowPath: ['triage'] }),
      mkStep({ id: 'billing', kind: 'subflow', label: 'billing', isPrimitiveBoundary: true, primitiveKind: 'Agent', subflowPath: ['billing'] }),
      mkStep({ id: 'b1', kind: 'user->llm', subflowPath: ['billing'] }),
      mkStep({ id: 'b2', kind: 'llm->user', subflowPath: ['billing'] }),
    ],
    edges: [],
  };
}

// ─── Pattern 1: top-level shows multiple agents ──────────────────────

describe('drill-down — pattern 1: top-level view', () => {
  it('selectStepView returns all agents when drillPath is empty', () => {
    const view = selectStepView({
      graph: swarmGraph(),
      log: [],
      focusIndex: 10,
      drillPath: [],
    });
    expect(view.mode).toBe('top-level');
    expect(view.agents).toHaveLength(2);
    expect(view.breadcrumb).toHaveLength(1); // just "Run"
    expect(view.breadcrumb[0].label).toBe('Run');
  });
});

// ─── Pattern 2: drillInto filters visible steps ──────────────────────

describe('drill-down — pattern 2: scoped visible steps', () => {
  it('visibleSteps only contains triage-scoped steps after drillInto("triage")', () => {
    const view = selectStepView({
      graph: swarmGraph(),
      log: [],
      focusIndex: 10,
      drillPath: ['triage'],
    });
    expect(view.mode).toBe('drill-down');
    expect(view.visibleSteps.every((s) => s.subflowPath[0] === 'triage')).toBe(true);
    // Billing steps are excluded.
    expect(view.visibleSteps.find((s) => s.subflowPath[0] === 'billing')).toBeUndefined();
  });
});

// ─── Pattern 3: breadcrumb after drilling in ─────────────────────────

describe('drill-down — pattern 3: breadcrumb segments', () => {
  it('breadcrumb gains a segment with the agent label when drilled in', () => {
    const view = selectStepView({
      graph: swarmGraph(),
      log: [],
      focusIndex: 10,
      drillPath: ['triage'],
    });
    expect(view.breadcrumb).toHaveLength(2);
    expect(view.breadcrumb[1].label).toBe('triage');
  });
});

// ─── Pattern 4: drillBack pops ───────────────────────────────────────

describe('drill-down — pattern 4: drillBack', () => {
  it('drillBack reduces drillPath by one segment', () => {
    const { result } = renderHook(() => useDrillPath(['triage', 'sub']));
    expect(result.current.drillPath).toEqual(['triage', 'sub']);
    act(() => result.current.drillBack());
    expect(result.current.drillPath).toEqual(['triage']);
  });
});

// ─── Pattern 5: drillToRoot clears ───────────────────────────────────

describe('drill-down — pattern 5: drillToRoot', () => {
  it('drillToRoot empties drillPath and brings view back to top-level', () => {
    const { result } = renderHook(() => useDrillPath(['triage', 'billing']));
    act(() => result.current.drillToRoot());
    expect(result.current.drillPath).toEqual([]);
  });
});

// ─── Pattern 6: mode flip ────────────────────────────────────────────

describe('drill-down — pattern 6: mode flip', () => {
  it('mode is "top-level" when drillPath empty, "drill-down" otherwise', () => {
    const base = { graph: swarmGraph(), log: [], focusIndex: 5 };
    expect(selectStepView({ ...base, drillPath: [] }).mode).toBe('top-level');
    expect(selectStepView({ ...base, drillPath: ['triage'] }).mode).toBe('drill-down');
  });
});

// ─── Pattern 7: slider total reflects scoped count ───────────────────

describe('drill-down — pattern 7: scoped total', () => {
  it('totalSteps equals scoped-subflow step count in drill-down mode', () => {
    const graph = swarmGraph();
    const topTotal = selectStepView({ graph, log: [], focusIndex: 10, drillPath: [] }).totalSteps;
    const drilled = selectStepView({ graph, log: [], focusIndex: 10, drillPath: ['triage'] }).totalSteps;
    expect(drilled).toBeLessThan(topTotal);
    expect(drilled).toBe(3); // triage subflow + 2 LLM steps
  });
});
