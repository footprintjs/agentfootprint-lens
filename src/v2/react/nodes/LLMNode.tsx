/**
 * LLMNode — the LLM primitive stage inside an Agent container.
 *
 * Pattern: dumb React component. Three slot labels; the one matching
 *          `data.updatedSlot` pulses/highlights so the student sees
 *          WHICH slot just changed at this step. All derivation is
 *          upstream — `data.updatedSlot` comes directly from
 *          `StepNode.slotUpdated`.
 * Role:    Minimal center card. Detailed chips live in the floating
 *          ContextBinNode (to the left of the LLM, no edge).
 *          LLM reasoning / decision lives in the Debug Pane to the
 *          right (separate surface). This card is just the
 *          "I'm the LLM, here are my 3 inputs, one of them changed"
 *          at-a-glance indicator.
 */

import React from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';

export type LLMSlot = 'system-prompt' | 'messages' | 'tools';

export interface LLMNodeData extends Record<string, unknown> {
  /**
   * Which of the 3 slots just updated at the current focus step.
   * Mirrors `StepNode.slotUpdated`. `undefined` = no slot changed
   * this step (e.g. terminal llm->user delivery).
   */
  readonly updatedSlot?: LLMSlot;
}

export const LLM_NODE_WIDTH = 240;

const SLOTS: readonly LLMSlot[] = ['system-prompt', 'messages', 'tools'];

export const LLMNode: React.FC<NodeProps<Node<LLMNodeData>>> = ({ data }) => (
  <div
    style={{
      width: LLM_NODE_WIDTH,
      padding: 12,
      background: 'var(--lens-bg-elevated, #fff)',
      border: '1.5px solid var(--lens-accent, #f59e0b)',
      borderRadius: 12,
      fontFamily: 'var(--lens-font-sans, ui-sans-serif, system-ui)',
      fontSize: 13,
      color: 'var(--lens-text, #1e293b)',
      boxShadow: '0 2px 14px rgba(245, 158, 11, 0.12)',
    }}
  >
    {/* Handle routing (named IDs so edges target specific sides).
        PARALLEL user-LLM channel:
        - llm-top-in (LEFT 30%)   aligns with user-out (LEFT 30%)  → straight down
        - llm-top-out (RIGHT 70%) aligns with user-in (RIGHT 70%)  → straight up
        Non-parallel placement would cross the edges through the
        middle — swap sides WITH user-node handles or visuals break.

        Tool channel uses right + bottom loop-back:
        - llm-right-out  → tool call leaves RIGHT
        - llm-bottom-in  ← tool result curves back under from BOTTOM */}
    <Handle id="llm-top-in" type="target" position={Position.Top} style={{ opacity: 0, left: '30%' }} />
    <Handle id="llm-top-out" type="source" position={Position.Top} style={{ opacity: 0, left: '70%' }} />
    <Handle id="llm-right-out" type="source" position={Position.Right} style={{ opacity: 0 }} />
    <Handle id="llm-bottom-in" type="target" position={Position.Bottom} style={{ opacity: 0 }} />
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13 }}>
      <span aria-hidden>🅛</span>
      <span>LLM</span>
      <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.7, marginLeft: 4 }}>
        one call · 3 slots in
      </span>
    </div>
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {SLOTS.map((slot) => (
        <SlotIndicator key={slot} label={slot} active={data.updatedSlot === slot} />
      ))}
    </div>
  </div>
);

const SlotIndicator: React.FC<{ label: string; active: boolean }> = ({
  label,
  active,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '4px 8px',
      background: active
        ? 'var(--lens-slot-active, rgba(245, 158, 11, 0.18))'
        : 'transparent',
      border: `1px solid ${active ? 'var(--lens-accent, #f59e0b)' : 'var(--lens-stroke-dim, #cbd5e1)'}`,
      borderRadius: 6,
      fontSize: 11,
      fontWeight: 500,
      transition: 'background 0.15s, border 0.15s',
    }}
  >
    <span
      aria-hidden
      style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        background: active ? 'var(--lens-accent, #f59e0b)' : 'var(--lens-stroke-dim, #cbd5e1)',
      }}
    />
    <span style={{ textTransform: 'lowercase', opacity: 0.85 }}>{label}</span>
  </div>
);
