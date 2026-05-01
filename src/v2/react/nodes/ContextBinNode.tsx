/**
 * ContextBinNode — floating "Context Engineering" bin next to the LLM.
 *
 * Pattern: dumb React component. Receives a PRE-FILTERED list of
 *          `ContextInjection` chips (baseline sources like `user`
 *          and `tool-result` are dropped upstream — see
 *          `selectContextEngineeringInjections`). Renders each as a
 *          compact card with the 5-axis teaching model visible.
 * Role:    The Context Engineering teaching surface. Floats INSIDE
 *          the Agent container to the LEFT of the LLM node. NO edge
 *          connects it — proximity implies "feeds the LLM."
 *
 * What you'll see here — by design:
 *   RAG chunks · Skill activations · Memory replays · Instructions
 *   fired by tool returns · Grounding rules · consumer-custom sources
 *
 * What you WON'T see here — baseline LLM-API flow lives in the edges:
 *   The user's current message (on the `user→llm` edge)
 *   The tool's return (on the `tool→llm` edge)
 *
 * Chip fields (from `agentfootprint.ContextInjection`):
 *   - `source`       → flavor (rag / skill / memory / instruction / grounding)
 *   - `asRole`       → user / assistant / tool / system (for messages slot)
 *   - `slot`         → system-prompt / messages / tools (where it lands)
 *   - `reason`       → why (rule or LLM-guided trigger)
 *   - `budgetTokens` + `budgetFraction` → how much of the budget consumed
 *   - `retrievalScore`, `rankPosition`  → RAG-specific metadata
 */

import React from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { ContextInjection } from 'agentfootprint';

export interface ContextBinNodeData extends Record<string, unknown> {
  readonly chips: readonly ContextInjection[];
}

export const CONTEXT_BIN_WIDTH = 210;

export const ContextBinNode: React.FC<NodeProps<Node<ContextBinNodeData>>> = ({
  data,
}) => {
  const chips = data.chips ?? [];
  return (
    <div
      style={{
        width: CONTEXT_BIN_WIDTH,
        padding: 10,
        background: 'var(--lens-bg-elevated, #fff)',
        border: '1.5px dashed var(--lens-accent-context, #6366f1)',
        borderRadius: 10,
        fontFamily: 'var(--lens-font-sans, ui-sans-serif, system-ui)',
        fontSize: 11,
        color: 'var(--lens-text, #1e293b)',
        boxShadow: '0 2px 8px rgba(99, 102, 241, 0.08)',
      }}
    >
      <Handle type="target" position={Position.Right} style={{ opacity: 0 }} />
      <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 6, color: 'var(--lens-accent-context, #6366f1)' }}>
        Context Engineering
      </div>
      {chips.length === 0 ? (
        <div style={{ fontSize: 10, opacity: 0.5, fontStyle: 'italic', lineHeight: 1.4 }}>
          No engineered context yet
          <div style={{ fontSize: 9, marginTop: 2, opacity: 0.7 }}>
            RAG · Skill · Memory · Instructions · Grounding
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {chips.map((c, i) => (
            <ChipCard key={i} chip={c} />
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
};

const ChipCard: React.FC<{ chip: ContextInjection }> = ({ chip }) => (
  <div
    title={buildTooltip(chip)}
    style={{
      padding: '4px 6px',
      background: sourceBackground(chip.source),
      borderRadius: 5,
      fontSize: 10,
      color: '#fff',
      fontWeight: 500,
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
      <span>{labelFor(chip)}</span>
      {chip.budgetFraction !== undefined && (
        <span style={{ opacity: 0.75, fontSize: 9 }}>
          {Math.round(chip.budgetFraction * 100)}%
        </span>
      )}
    </div>
    <div style={{ opacity: 0.85, fontSize: 9 }}>
      → {chip.slot}
      {chip.asRole && chip.asRole !== 'system' ? ` · ${chip.asRole}` : ''}
    </div>
  </div>
);

function labelFor(c: ContextInjection): string {
  if (c.sourceId) return `${c.source}:${c.sourceId}`;
  return c.source;
}

function buildTooltip(c: ContextInjection): string {
  const lines: string[] = [`${c.source}${c.sourceId ? ` (${c.sourceId})` : ''}`];
  if (c.asRole) lines.push(`role: ${c.asRole}`);
  if (c.reason) lines.push(c.reason);
  if (c.contentSummary) lines.push(c.contentSummary);
  if (c.retrievalScore !== undefined) lines.push(`score: ${c.retrievalScore.toFixed(3)}`);
  if (c.rankPosition !== undefined) lines.push(`rank: #${c.rankPosition + 1}`);
  if (c.budgetTokens !== undefined)
    lines.push(`${c.budgetTokens} tokens (${Math.round((c.budgetFraction ?? 0) * 100)}%)`);
  return lines.join('\n');
}

function sourceBackground(source: string): string {
  const key = source.toLowerCase();
  if (key.includes('rag')) return 'var(--lens-src-rag, #0284c7)';
  if (key.includes('skill')) return 'var(--lens-src-skill, #7c3aed)';
  if (key.includes('memory')) return 'var(--lens-src-memory, #ca8a04)';
  if (key.includes('instruction')) return 'var(--lens-src-instruction, #db2777)';
  if (key.includes('user')) return 'var(--lens-src-user, #059669)';
  if (key.includes('tool')) return 'var(--lens-src-tool, #0891b2)';
  return 'var(--lens-src-default, #64748b)';
}
