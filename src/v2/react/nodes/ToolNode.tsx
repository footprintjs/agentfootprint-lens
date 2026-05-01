/**
 * ToolNode — the external tool actor in the Lens triangle.
 *
 * Pattern: dumb React component. `data.lit` controls whether the
 *          card reads as "live" or dim. The tool is hidden entirely
 *          (parent filters via `touched.has('tool')`) until the first
 *          llm->tool / tool->llm step reaches focus.
 * Role:    One of four node components in the triangle. Renders as a
 *          child INSIDE an Agent container (positioned parent-relative).
 */

import React from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';

export interface ToolNodeData extends Record<string, unknown> {
  readonly lit: boolean;
}

export const TOOL_NODE_WIDTH = 170;

export const ToolNode: React.FC<NodeProps<Node<ToolNodeData>>> = ({ data }) => (
  <div
    style={{
      width: TOOL_NODE_WIDTH,
      padding: 14,
      textAlign: 'center',
      background: 'var(--lens-bg-elevated, #fff)',
      border: `1.5px solid ${data.lit ? 'var(--lens-accent-tool, #059669)' : 'var(--lens-stroke-dim, #cbd5e1)'}`,
      borderRadius: 12,
      fontFamily: 'var(--lens-font-sans, ui-sans-serif, system-ui)',
      fontSize: 13,
      color: 'var(--lens-text, #1e293b)',
      opacity: data.lit ? 1 : 0.55,
      boxShadow: data.lit ? '0 2px 10px rgba(0, 0, 0, 0.06)' : 'none',
    }}
  >
    {/* Handle routing:
        - tool-left-in     ← LLM invokes the tool via LEFT side
        - tool-bottom-out  → tool result flows out the BOTTOM, curving
                             back underneath to the LLM's bottom-in
                             (visually reads as "tool returns to LLM"). */}
    <Handle id="tool-left-in" type="target" position={Position.Left} style={{ opacity: 0 }} />
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 600 }}>
      <span aria-hidden>🛠</span>
      <span>Tool</span>
    </div>
    <div style={{ fontSize: 11, marginTop: 4, color: 'var(--lens-text-muted, #64748b)' }}>
      External execution
    </div>
    <Handle id="tool-bottom-out" type="source" position={Position.Bottom} style={{ opacity: 0 }} />
  </div>
);
