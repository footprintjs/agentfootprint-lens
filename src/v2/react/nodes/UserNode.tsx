/**
 * UserNode — the user actor in the Lens triangle.
 *
 * Pattern: dumb React component. Receives `data.lit` boolean; renders
 *          the "User / You" card with accent when lit, dim otherwise.
 * Role:    One of four node components in the triangle (User / LLM /
 *          Tool / Agent-container). Zero derivation; all data lives
 *          in the ViewModel the selectors produce.
 */

import React from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';

/**
 * Data passed by React Flow to every `user` node. The parent
 * component (`RunTreeFlow`) produces this shape from the ViewModel's
 * `touched` set and other fields.
 */
export interface UserNodeData extends Record<string, unknown> {
  readonly lit: boolean;
}

export const USER_NODE_WIDTH = 160;

export const UserNode: React.FC<NodeProps<Node<UserNodeData>>> = ({ data }) => (
  <div
    style={{
      width: USER_NODE_WIDTH,
      padding: 14,
      textAlign: 'center',
      background: data.lit
        ? 'var(--lens-bg-elevated, #fff)'
        : 'var(--lens-bg-dim, #f1f5f9)',
      border: `1.5px solid ${data.lit ? 'var(--lens-accent, #f59e0b)' : 'var(--lens-stroke-dim, #cbd5e1)'}`,
      borderRadius: 12,
      fontFamily: 'var(--lens-font-sans, ui-sans-serif, system-ui)',
      fontSize: 13,
      color: 'var(--lens-text, #1e293b)',
      opacity: data.lit ? 1 : 0.55,
      boxShadow: data.lit ? '0 2px 10px rgba(0, 0, 0, 0.06)' : 'none',
    }}
  >
    {/* PARALLEL routing — user→llm on the LEFT, llm→user on the RIGHT,
        both running straight vertically. Reversing these would cause
        the two edges to cross through the middle (X-shape), which
        reads as "something weird happens between user and LLM."
        Parallel paths keep the flow legible. */}
    <Handle id="user-out" type="source" position={Position.Bottom} style={{ opacity: 0, left: '30%' }} />
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 600 }}>
      <span aria-hidden>👤</span>
      <span>User</span>
    </div>
    <div style={{ fontSize: 11, marginTop: 4, color: 'var(--lens-text-muted, #64748b)' }}>
      You
    </div>
    <Handle id="user-in" type="target" position={Position.Bottom} style={{ opacity: 0, left: '70%' }} />
  </div>
);
