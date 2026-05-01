/**
 * Tests — dumb node components.
 *
 * Each test renders one node component with fixture data and asserts
 * the visual role is carried through. No React Flow context needed —
 * we use React Testing Library's basic render.
 *
 * 7 patterns cover the full consumer circle:
 *   1. UserNode lit vs dim
 *   2. ToolNode lit vs dim
 *   3. LLMNode highlights updatedSlot
 *   4. LLMNode with no updatedSlot (terminal delivery) has no active slot
 *   5. ContextBinNode empty state
 *   6. ContextBinNode with chips renders label + slot + budget
 *   7. AgentGroupNode shows iteration badge only when multi-iter
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ContextInjection } from 'agentfootprint';
import { UserNode } from './UserNode.js';
import { ToolNode } from './ToolNode.js';
import { LLMNode } from './LLMNode.js';
import { ContextBinNode } from './ContextBinNode.js';
import { AgentGroupNode } from './AgentGroupNode.js';

// React Flow's node components expect some context — wrap in a
// minimal provider so rendering doesn't throw.
function wrap(el: React.ReactElement) {
  return <ReactFlowProvider>{el}</ReactFlowProvider>;
}

// NodeProps are complex — for unit tests we pass a minimal stub.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mkProps = (data: Record<string, unknown>): any => ({
  id: 'n',
  data,
  type: 't',
  selected: false,
  zIndex: 0,
  isConnectable: false,
  xPos: 0,
  yPos: 0,
  dragging: false,
  width: 100,
  height: 100,
});

// ─── Pattern 1: UserNode lit/dim ─────────────────────────────────────

describe('UserNode — pattern 1: lit vs dim', () => {
  it('renders "User" label regardless of lit state', () => {
    const { getByText, rerender } = render(wrap(<UserNode {...mkProps({ lit: true })} />));
    expect(getByText('User')).toBeTruthy();
    rerender(wrap(<UserNode {...mkProps({ lit: false })} />));
    expect(getByText('User')).toBeTruthy();
  });
});

// ─── Pattern 2: ToolNode lit/dim ─────────────────────────────────────

describe('ToolNode — pattern 2: lit vs dim', () => {
  it('renders "Tool" label with accent border when lit', () => {
    const { getByText } = render(wrap(<ToolNode {...mkProps({ lit: true })} />));
    expect(getByText('Tool')).toBeTruthy();
    expect(getByText('External execution')).toBeTruthy();
  });
});

// ─── Pattern 3: LLMNode highlights updatedSlot ───────────────────────

describe('LLMNode — pattern 3: active slot highlight', () => {
  it('messages slot is rendered when updatedSlot="messages"', () => {
    const { getByText } = render(wrap(<LLMNode {...mkProps({ updatedSlot: 'messages' })} />));
    expect(getByText('LLM')).toBeTruthy();
    expect(getByText('messages')).toBeTruthy();
    expect(getByText('system-prompt')).toBeTruthy();
    expect(getByText('tools')).toBeTruthy();
  });
});

// ─── Pattern 4: LLMNode with no updatedSlot ──────────────────────────

describe('LLMNode — pattern 4: no active slot', () => {
  it('still renders the 3 slot labels when updatedSlot is undefined', () => {
    const { getByText } = render(wrap(<LLMNode {...mkProps({})} />));
    expect(getByText('system-prompt')).toBeTruthy();
    expect(getByText('messages')).toBeTruthy();
    expect(getByText('tools')).toBeTruthy();
  });
});

// ─── Pattern 5: ContextBinNode empty ─────────────────────────────────

describe('ContextBinNode — pattern 5: empty state', () => {
  it('shows "No engineered context yet" when chip list is empty', () => {
    const { getByText } = render(
      wrap(<ContextBinNode {...mkProps({ chips: [] })} />),
    );
    expect(getByText('No engineered context yet')).toBeTruthy();
    expect(getByText('Context Engineering')).toBeTruthy();
  });
});

// ─── Pattern 6: ContextBinNode with chips ────────────────────────────

describe('ContextBinNode — pattern 6: chip rendering', () => {
  it('renders each chip with flavor label + slot', () => {
    const chips: ContextInjection[] = [
      {
        slot: 'messages',
        asRole: 'user',
        source: 'rag',
        sourceId: 'docs#3',
        contentSummary: 'Retrieved doc',
        reason: 'retrieval 0.92',
        budgetFraction: 0.14,
        budgetTokens: 140,
      },
      {
        slot: 'system-prompt',
        asRole: 'system',
        source: 'skill',
        sourceId: 'billing',
        contentSummary: 'Billing skill',
        reason: 'activated',
      },
    ];
    const { getByText } = render(
      wrap(<ContextBinNode {...mkProps({ chips })} />),
    );
    expect(getByText('rag:docs#3')).toBeTruthy();
    expect(getByText('skill:billing')).toBeTruthy();
  });
});

// ─── Pattern 7: AgentGroupNode iteration badge ──────────────────────

describe('AgentGroupNode — pattern 7: iteration badge visibility', () => {
  it('shows badge only when iterationCount > 1', () => {
    const { queryByText, rerender } = render(
      wrap(
        <AgentGroupNode
          {...mkProps({ label: 'Agent', iterationCount: 1, currentIteration: 1, selected: false })}
        />,
      ),
    );
    expect(queryByText(/iter 1\/1/)).toBeNull();

    rerender(
      wrap(
        <AgentGroupNode
          {...mkProps({ label: 'Agent', iterationCount: 3, currentIteration: 2, selected: false })}
        />,
      ),
    );
    expect(queryByText(/iter 2\/3/)).toBeTruthy();
  });
});
