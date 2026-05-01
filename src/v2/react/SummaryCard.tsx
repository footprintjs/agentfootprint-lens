/**
 * SummaryCard — compact stats overview rendered from a `RunSummary`.
 * Analyst view's top-of-panel glance; engineer view's header.
 */

import React from 'react';
import type { RunSummary } from '../core/types.js';
import { T } from './theme/index.js';

interface SummaryCardProps {
  readonly summary: RunSummary;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({ summary }) => {
  const items: readonly { label: string; value: string }[] = [
    { label: 'Status', value: summary.status },
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
      {items.map(({ label, value }) => (
        <div key={label}>
          <div style={{ fontSize: 11, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {label}
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: T.textPrimary }}>{value}</div>
        </div>
      ))}
    </div>
  );
};
