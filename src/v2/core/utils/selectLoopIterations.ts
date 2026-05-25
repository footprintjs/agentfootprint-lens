/**
 * selectLoopIterations — derive the loop-iteration count for a stage
 * (typically an Agent or Loop subflow) from the live `Topology`.
 *
 * Pure function. Layer 1 / Tier B / Lens v0.1.
 *
 * Drives the iteration scrubber + iteration badge on agent nodes.
 *
 * Semantics
 * ─────────
 *   `topology.edges` contains one `loop-iteration` self-edge per `onLoop`
 *   event fired by the engine inside the active subflow (see
 *   `TopologyRecorder.onLoop` in footprintjs).
 *
 *   `current` = count of loop-iteration self-edges whose `from === stageId`.
 *   `max`     = `undefined` — the Topology does not carry the chart's
 *               configured `maxIterations`. Callers that have the Spec /
 *               chart configuration should override `max` themselves.
 *
 *   This function is intentionally narrow: it ONLY reads the topology
 *   edge stream. It never throws — unknown `stageId` → `{current: 0}`.
 */

import type { Topology } from 'footprintjs/trace';

export interface IterationCount {
  /** Number of loop-iteration edges recorded for this stage so far. */
  readonly current: number;
  /** Configured max-iterations, if available to the caller. Always
   *  `undefined` from this function — callers attach it from the chart. */
  readonly max: number | undefined;
}

export function selectLoopIterations(
  topology: Topology,
  stageId: string,
): IterationCount {
  if (stageId.length === 0) return { current: 0, max: undefined };

  let count = 0;
  const edges = topology.edges;
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i]!;
    if (e.kind === 'loop-iteration' && e.from === stageId) count++;
  }
  return { current: count, max: undefined };
}
