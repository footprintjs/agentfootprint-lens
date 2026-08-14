/**
 * The active group, shared with every chart node renderer.
 *
 * ── Why a context and not a prop ────────────────────────────────────────────
 * xyflow renders node components itself, from a `nodeTypes` map. A renderer
 * receives only the node's own props — there is no channel for "and by the way,
 * these eight ids are one group right now". Threading it through `nodeTypes`
 * would rebuild the map on every cursor move, and xyflow treats that map as
 * identity-keyed: a new object per scrub remounts every node on the chart.
 *
 * So the map stays stable and the MEMBERSHIP travels by context. Node renderers
 * re-render (cheap); nothing remounts.
 */

import { createContext, useContext } from 'react';
import type { ChartGroupHighlight } from '../../core/group/activeChartGroup.js';

/** `undefined` = not in group mode. Every node renders exactly as it always
 *  did — this is the seam that keeps STEP mode byte-identical. */
export const ChartGroupContext = createContext<ChartGroupHighlight | undefined>(undefined);

/** The active group, or `undefined` outside group mode. */
export function useChartGroupHighlight(): ChartGroupHighlight | undefined {
  return useContext(ChartGroupContext);
}
