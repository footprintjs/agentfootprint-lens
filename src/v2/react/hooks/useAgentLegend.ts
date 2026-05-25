/**
 * useAgentLegend — memoized Agent-legend list from a Spec tree.
 *
 * Layer 2 / Tier B / Lens v0.1.
 *
 * Thin React wrapper over `extractAgentLegend()` (Layer 1). Re-runs
 * only when `spec` reference changes — pairs with `useSpecSubscription`
 * so the legend recomputes once per structural change (not per overlay
 * event). When `spec` is `undefined` (pre-run / hostile build), returns
 * an empty array.
 */

import { useMemo } from 'react';
import type { SpecNode } from '../../core/buildSpecTreeFromBoundary.js';
import {
  extractAgentLegend,
  type AgentLegendEntry,
} from '../../core/utils/extractAgentLegend.js';

const EMPTY: readonly AgentLegendEntry[] = Object.freeze([]);

export function useAgentLegend(
  spec: SpecNode | undefined,
): readonly AgentLegendEntry[] {
  return useMemo(() => {
    if (!spec) return EMPTY;
    return extractAgentLegend(spec);
  }, [spec]);
}
