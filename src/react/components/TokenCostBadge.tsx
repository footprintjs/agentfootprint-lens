/**
 * <TokenCostBadge> — inline badge for subtree-aggregated token + cost.
 *
 * Layer 3 / Tier B / Lens v0.1.
 *
 * Rendered in the node header of any group/subflow node. The
 * aggregation comes from a Lens-side `KeyedRecorder<TokenEntry>`
 * accumulating over the subtree's runtimeStageIds — the badge is a
 * pure presentation primitive.
 *
 * Display rules
 * ─────────────
 *   - Token counts compact via SI suffix at ≥10K (`14.2K`, `1.3M`).
 *   - Cost optional. When present, formatted as `$0.0023` (4 decimals)
 *     up to 1 cent, then `$0.012` (3) up to 10 cents, then `$0.12` (2).
 *   - Zero tokens hides the entire badge (returns null).
 */

import React from 'react';
import { ensureLensStyles } from '../lensStyles.js';

export interface TokenCostBadgeProps {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd?: number;
}

function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n < 10_000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function formatCost(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 0.1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

export const TokenCostBadge: React.FC<TokenCostBadgeProps> = ({
  inputTokens,
  outputTokens,
  costUsd,
}) => {
  ensureLensStyles();
  const total = (inputTokens || 0) + (outputTokens || 0);
  if (total <= 0) return null;

  return (
    <span
      className="lens-token-cost-badge"
      aria-label={`${total} tokens${costUsd !== undefined ? `, ${formatCost(costUsd)}` : ''}`}
      data-input-tokens={inputTokens}
      data-output-tokens={outputTokens}
    >
      <span className="lens-token-cost-badge__tokens">
        {formatTokens(inputTokens)}↑ {formatTokens(outputTokens)}↓
      </span>
      {costUsd !== undefined && (
        <span className="lens-token-cost-badge__cost">
          {formatCost(costUsd)}
        </span>
      )}
    </span>
  );
};
