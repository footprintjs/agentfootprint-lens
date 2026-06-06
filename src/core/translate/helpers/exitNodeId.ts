/**
 * exitNodeIdOf — resolve the effective exit node id of a
 * `LensGroupOutput`. Returns `exitNodeId` when set, otherwise
 * `rootNodeId` (the default for leaves and entry-only compositions).
 *
 * Layer 1 (helpers, pure) / Lens v0.1 translator pipeline.
 *
 * Used by chain-style translators (Sequence, Loop) when wiring
 * `next` edges so they target the inner composition's true exit
 * instead of its entry. Centralising the resolution keeps every
 * per-kind translator using the same default rule and frees them
 * from re-asserting the null-coalesce pattern.
 *
 * Pure function — no closures, no module state.
 */

import type { LensGroupOutput } from '../types.js';

export function exitNodeIdOf(output: LensGroupOutput): string {
  return output.exitNodeId ?? output.rootNodeId;
}
