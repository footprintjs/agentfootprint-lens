/**
 * AgentGroupNode — the dashed container that wraps LLM + Tool +
 * ContextBin for one Agent instance.
 *
 * Pattern: dumb React component. Renders a transparent frame + a
 *          header ribbon ("🤖 Agent · ReAct loop") + an iteration
 *          badge when multi-iter. No edges target this node — it's
 *          a pure visual grouping via React Flow's `parentId` +
 *          `extent: 'parent'` on child nodes.
 * Role:    The composition boundary. In multi-agent runs, one
 *          `AgentGroupNode` per sub-agent; each houses its own
 *          LLM / Tool / ContextBin children.
 */

import React from 'react';
import type { Node, NodeProps } from '@xyflow/react';

export interface AgentGroupNodeData extends Record<string, unknown> {
  readonly label: string;
  readonly iterationCount: number;
  readonly currentIteration: number;
  readonly selected: boolean;
  /**
   * Primitive kind from the StepGraph's taxonomy prefix
   * (`'Agent'` / `'LLMCall'` / `'Sequence'` / `'Parallel'` /
   * `'Conditional'` / `'Loop'`). Drives the icon + subtitle on the
   * header ribbon. Undefined for graphs without taxonomy metadata —
   * the renderer falls back to a neutral `'runner'` subtitle.
   */
  readonly primitiveKind?: string;
}

/**
 * Map a primitive kind to its display affordances. Single source of
 * truth for the agent-group header so all primitives render with
 * consistent visuals.
 */
function primitiveAffordance(kind: string | undefined): {
  readonly icon: string;
  readonly subtitle: string;
} {
  switch (kind) {
    case 'Agent':
      return { icon: '🤖', subtitle: 'ReAct loop' };
    case 'LLMCall':
      return { icon: '📡', subtitle: 'one-shot' };
    case 'Sequence':
      return { icon: '➡️', subtitle: 'pipeline' };
    case 'Parallel':
      return { icon: '🔀', subtitle: 'fan-out' };
    case 'Conditional':
      return { icon: '🪧', subtitle: 'route' };
    case 'Loop':
      return { icon: '🔁', subtitle: 'iterate' };
    default:
      return { icon: '⚙️', subtitle: 'runner' };
  }
}

export const AGENT_GROUP_WIDTH = 720;
export const AGENT_GROUP_HEIGHT = 360;
export const AGENT_GROUP_PADDING = 24;

export const AgentGroupNode: React.FC<NodeProps<Node<AgentGroupNodeData>>> = ({
  data,
}) => {
  const multiIter = data.iterationCount > 1;
  const { icon, subtitle } = primitiveAffordance(data.primitiveKind);
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: AGENT_GROUP_PADDING,
        background: 'var(--lens-agent-bg, rgba(245, 158, 11, 0.05))',
        border: '2px dashed var(--lens-accent, #f59e0b)',
        borderRadius: 16,
        fontFamily: 'var(--lens-font-sans, ui-sans-serif, system-ui)',
        fontSize: 12,
        color: 'var(--lens-text, #1e293b)',
        boxShadow: data.selected
          ? '0 0 0 2px var(--lens-accent, #f59e0b)'
          : 'none',
        position: 'relative',
      }}
    >
      {/* Header ribbon — top-left. Identifies this as the Agent
          composition and its ReAct-loop semantics. */}
      <div
        style={{
          position: 'absolute',
          top: -11,
          left: 16,
          padding: '2px 10px',
          background: 'var(--lens-accent, #f59e0b)',
          color: '#fff',
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span aria-hidden>{icon}</span>
        <span>{data.label}</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            opacity: 0.9,
            borderLeft: '1px solid rgba(255, 255, 255, 0.4)',
            paddingLeft: 6,
          }}
        >
          {subtitle}
        </span>
      </div>
      {/* Iteration badge — top-right. Only shown when the run has
          multiple iterations (single-call runs suppress it to avoid
          noise). */}
      {multiIter && (
        <div
          title={`Iteration ${data.currentIteration} of ${data.iterationCount}`}
          style={{
            position: 'absolute',
            top: -11,
            right: 16,
            padding: '2px 8px',
            background: 'var(--lens-bg-elevated, #fff)',
            border: '1px solid var(--lens-accent, #f59e0b)',
            color: 'var(--lens-accent, #f59e0b)',
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 600,
          }}
        >
          iter {data.currentIteration}/{data.iterationCount}
        </div>
      )}
    </div>
  );
};
