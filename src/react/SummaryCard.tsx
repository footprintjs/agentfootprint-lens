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

/** Compact USD format: 4 decimals for normal costs, 6 for sub-cent dust so a
 *  tiny run never collapses to "$0.0000". Mirrors the mockup ($0.0027). */
function formatCost(usd: number): string {
  return `$${usd.toFixed(usd > 0 && usd < 0.0001 ? 6 : 4)}`;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({ summary }) => {
  // Throughput = output tokens per second over the run. Operator-facing metric
  // (how fast the agent is producing) — derived, not stored. Guard div-by-zero.
  const throughput =
    summary.durationMs !== undefined && summary.durationMs > 0
      ? Math.round(summary.totalTokens.output / (summary.durationMs / 1000))
      : undefined;

  const items: readonly { label: string; value: string; color?: string }[] = [
    { label: 'Status', value: statusLabel(summary.status), color: statusColor(summary.status) },
    { label: 'Latency', value: summary.durationMs !== undefined ? `${summary.durationMs}ms` : '—' },
    { label: 'LLM calls', value: String(summary.llmCallCount) },
    { label: 'Tool calls', value: String(summary.toolCallCount) },
    { label: 'Tokens in', value: summary.totalTokens.input.toLocaleString() },
    { label: 'Tokens out', value: summary.totalTokens.output.toLocaleString() },
    ...(summary.totalUsd !== undefined
      ? [{ label: 'Cost', value: formatCost(summary.totalUsd) }]
      : []),
    ...(throughput !== undefined ? [{ label: 'Throughput', value: `${throughput} tok/s` }] : []),
    ...(summary.permissionDenials > 0
      ? [{ label: 'Denials', value: String(summary.permissionDenials) }]
      : []),
  ];

  return (
    <div
      style={{
        // Compact single row of stats. `auto-fit minmax(78px…)` packs all the
        // metrics onto ONE line in the wide monitor (was wrapping to two with the
        // old 120px min) while still wrapping gracefully in a narrow panel.
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(64px, 1fr))',
        gap: '8px 12px',
        padding: '10px 14px',
        background: T.bgElevated,
        border: `1px solid ${T.border}`,
        borderRadius: 6,
        fontFamily: T.fontSans,
      }}
    >
      {items.map(({ label, value, color }) => (
        <div key={label} style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' }}>
            {label}
          </div>
          <div style={{ fontSize: 14, fontWeight: color ? 700 : 500, color: color ?? T.textPrimary, whiteSpace: 'nowrap' }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
};
