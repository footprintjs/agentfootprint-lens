/**
 * Tests — NodeDetailPanel: 7 patterns covering payload rendering.
 *
 * The panel is the right-pane drawer that Lens shows when a node is
 * selected. It renders the data crossing a subflow's boundary
 * (entry/exit payloads from BoundaryRecorder), ReAct step metadata for
 * LLM calls, and a short note for topology helpers (fork/decision).
 *
 * 7 patterns:
 *   P1  No selection → empty placeholder
 *   P2  Subflow with entry+exit payloads → both rendered as JSON
 *   P3  Subflow in-progress (entry only) → exit shows "in progress"
 *   P4  Topology helper (fork-branch) → composition note, no payload
 *   P5  ReAct step (user→llm) with tokens + injections → ReAct body
 *   P6  primitiveKind pill renders when set
 *   P7  runtimeStageId visible in identity strip for cross-view binding
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { StepNode } from 'agentfootprint';
import { NodeDetailPanel } from './NodeDetailPanel.js';

// ── Helpers ─────────────────────────────────────────────────────────────

function mkNode(overrides: Partial<StepNode> & Pick<StepNode, 'id' | 'kind'>): StepNode {
  return {
    label: overrides.kind,
    startOffsetMs: 0,
    subflowPath: [],
    ...overrides,
  };
}

// ─── Pattern 1: empty state ─────────────────────────────────────────────

describe('NodeDetailPanel — pattern 1: empty state', () => {
  it('renders a placeholder hint when no node is selected', () => {
    render(<NodeDetailPanel />);
    expect(screen.getByText(/click a node to inspect/i)).toBeDefined();
  });
});

// ─── Pattern 2: subflow with both payloads ──────────────────────────────

describe('NodeDetailPanel — pattern 2: subflow with entry + exit payloads', () => {
  it('renders both payloads as JSON with user-friendly labels', () => {
    const node = mkNode({
      id: 'sf-task',
      kind: 'subflow',
      label: 'Task',
      subflowPath: ['sf-task'],
      entryPayload: { request: 'analyze' },
      exitPayload: { result: 'done' },
    });
    render(<NodeDetailPanel node={node} />);

    // Generic labels for an unknown primitive: "Input" + "Output"
    // (no "inputMapper / outputMapper" jargon).
    expect(screen.getByText('Input')).toBeDefined();
    expect(screen.getByText('Output')).toBeDefined();
    // Payload bodies present
    expect(screen.getByText(/"request": "analyze"/)).toBeDefined();
    expect(screen.getByText(/"result": "done"/)).toBeDefined();
  });
});

// ─── Pattern 3: in-progress subflow (entry only) ────────────────────────

describe('NodeDetailPanel — pattern 3: in-progress subflow', () => {
  it('shows "in progress" hint when entry exists but exit is undefined', () => {
    const node = mkNode({
      id: 'sf-pause',
      kind: 'subflow',
      label: 'AwaitingApproval',
      subflowPath: ['sf-pause'],
      entryPayload: { question: 'Approve?' },
      // No exitPayload — paused / in-flight subflow
    });
    render(<NodeDetailPanel node={node} />);

    expect(screen.getByText(/"question": "Approve\?"/)).toBeDefined();
    // Empty hint distinguishes finished steps from in-progress ones
    expect(screen.getByText(/in progress/i)).toBeDefined();
  });
});

// ─── Pattern 4: fork-branch (topology helper) ───────────────────────────

describe('NodeDetailPanel — pattern 4: fork-branch topology helper', () => {
  it('renders a composition note instead of payload sections', () => {
    const node = mkNode({
      id: 'fork-1-Alpha',
      kind: 'fork-branch',
      label: 'Alpha',
      subflowPath: [],
    });
    render(<NodeDetailPanel node={node} />);

    expect(screen.getByText(/parallel branch/i)).toBeDefined();
    expect(screen.getByText(/composition shape only/i)).toBeDefined();
    // No "Input" section for a topology helper.
    expect(screen.queryByText('Input')).toBeNull();
  });
});

// ─── Pattern 5: ReAct step body ─────────────────────────────────────────

describe('NodeDetailPanel — pattern 5: ReAct step (user→llm)', () => {
  it('renders only meaningful field rows + engineered context (filters baseline)', () => {
    const node = mkNode({
      id: 'step-1',
      kind: 'user->llm',
      label: 'user → llm',
      subflowPath: [],
      tokens: { in: 30, out: 5 },
      llmModel: 'mock-gpt',
      slotUpdated: 'messages',
      iterationIndex: 1,
      injections: [
        // Baseline — should be FILTERED
        { slot: 'messages', source: 'user', contentSummary: 'analyze the report' },
        // Engineered — appears under "Context engineering"
        { slot: 'system-prompt', source: 'skill', sourceId: 'billing', contentSummary: 'billing helpers' },
      ],
    });
    render(<NodeDetailPanel node={node} />);

    // No "ReAct step" / "user->llm" header row (header already says it).
    expect(screen.queryByText('ReAct step')).toBeNull();
    // Token / model rows render with plain-language labels.
    expect(screen.getByText(/in 30/)).toBeDefined();
    expect(screen.getByText(/out 5/)).toBeDefined();
    expect(screen.getByText('mock-gpt')).toBeDefined();
    // "What landed in" instead of "slot updated"
    expect(screen.getByText(/what landed in/i)).toBeDefined();
    // Context engineering section: only the engineered (skill) item.
    expect(screen.getByText(/Context engineering/i)).toBeDefined();
    expect(screen.getByText(/billing helpers/)).toBeDefined();
    expect(screen.queryByText(/analyze the report/)).toBeNull();
  });

  it('hides Context engineering section entirely when no engineered injections present', () => {
    const node = mkNode({
      id: 'step-1',
      kind: 'user->llm',
      label: 'user → llm',
      subflowPath: [],
      tokens: { in: 30, out: 5 },
      llmModel: 'mock-gpt',
      injections: [
        // All baseline — section should not render
        { slot: 'messages', source: 'user', contentSummary: 'hi' },
        { slot: 'tools', source: 'registry', contentSummary: 'weather tool' },
      ],
    });
    render(<NodeDetailPanel node={node} />);
    // Per the "no update, don't render" rule, the section is hidden.
    expect(screen.queryByText(/Context engineering/i)).toBeNull();
  });
});

// ─── Pattern 6: primitiveKind pill ──────────────────────────────────────

describe('NodeDetailPanel — pattern 6: primitiveKind pill', () => {
  it('renders the primitive kind as a header pill when set', () => {
    const node = mkNode({
      id: 'sf-agent',
      kind: 'subflow',
      label: 'Triage',
      subflowPath: ['sf-agent'],
      primitiveKind: 'Agent',
    });
    render(<NodeDetailPanel node={node} />);

    expect(screen.getByText('Agent')).toBeDefined();
    expect(screen.getByText('Triage')).toBeDefined();
  });
});

// ─── Pattern 7: runtimeStageId binding key ──────────────────────────────

describe('NodeDetailPanel — pattern 7: identity strip surfaces user-meaningful metadata', () => {
  it('shows iteration number when available (no library-internal ids leaked)', () => {
    const node = mkNode({
      id: 'step-1',
      kind: 'user->llm',
      label: 'user → llm',
      subflowPath: [],
      iterationIndex: 3,
    });
    render(<NodeDetailPanel node={node} />);
    // Iteration is the meaningful number for the user — runtimeStageId
    // is library-internal and intentionally hidden from the teaching
    // surface (still visible in the Trace tab when needed).
    expect(screen.getByText('iteration')).toBeDefined();
    expect(screen.getByText('#3')).toBeDefined();
    expect(screen.queryByText('runtimeStageId')).toBeNull();
  });
});
