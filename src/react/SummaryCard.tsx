/**
 * SummaryCard — compact stats overview rendered from a `RunSummary`.
 * Analyst view's top-of-panel glance; engineer view's header.
 */

import React from 'react';
import type { RunNodeStatus, RunSummary } from '../core/types.js';
import { T } from './theme/index.js';

interface SummaryCardProps {
  readonly summary: RunSummary;
}

/** Human-readable label for a run status — the raw enum ('err',
 *  'budget_exhausted') is library jargon; the UI shows plain words. */
function statusLabel(s: RunNodeStatus): string {
  switch (s) {
    case 'ok':
      return 'OK';
    case 'err':
      return 'Error';
    case 'paused':
      return 'Paused';
    case 'running':
      return 'Running';
    case 'budget_exhausted':
      return 'Budget exhausted';
    default:
      return s;
  }
}

/** Accent color for a status — red for error, amber for paused/budget,
 *  default otherwise. Undefined → inherit the normal text color. */
function statusColor(s: RunNodeStatus): string | undefined {
  if (s === 'err') return T.error;
  if (s === 'paused' || s === 'budget_exhausted') return T.warning;
  return undefined;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({ summary }) => {
  const items: readonly { label: string; value: string; color?: string }[] = [
    { label: 'Status', value: statusLabel(summary.status), color: statusColor(summary.status) },
    { label: 'Duration', value: summary.durationMs !== undefined ? `${summary.durationMs}ms` : '—' },
    { label: 'LLM calls', value: String(summary.llmCallCount) },
    { label: 'Tool calls', value: String(summary.toolCallCount) },
    { label: 'Iterations', value: String(summary.iterationCount) },
    {
      label: 'Tokens',
      value: `${summary.totalTokens.input} in / ${summary.totalTokens.output} out`,
    },
    ...(summary.totalUsd !== undefined
      ? [{ label: 'Cost', value: `$${summary.totalUsd.toFixed(6)}` }]
      : []),
    ...(summary.permissionDenials > 0
      ? [{ label: 'Denials', value: String(summary.permissionDenials) }]
      : []),
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: 12,
        padding: 12,
        background: T.bgElevated,
        border: `1px solid ${T.border}`,
        borderRadius: 6,
        fontFamily: T.fontSans,
      }}
    >
      {items.map(({ label, value, color }) => (
        <div key={label}>
          <div style={{ fontSize: 11, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {label}
          </div>
          <div style={{ fontSize: 14, fontWeight: color ? 700 : 500, color: color ?? T.textPrimary }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
};
