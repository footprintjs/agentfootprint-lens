/**
 * makeEdge — factory for `LensEdge` with deterministic id derivation.
 *
 * Layer 1 (helpers, pure) / Lens v0.1 translator pipeline.
 *
 * Why a dedicated factory
 * ───────────────────────
 *   Edge ids must be globally unique within a `LensGroupOutput` (xyflow
 *   keys edges by `id` for diff). Per-kind translators previously had to
 *   roll their own id strings, leaking the "did I encode kind + source
 *   + target consistently" responsibility across the codebase. This
 *   helper centralises the rule so every edge id is predictable and
 *   collision-free.
 *
 * Convention
 * ──────────
 *   `<kind>:<source>->\<target>`           e.g., `next:seed->merge`
 *   `<kind>:<source>->\<target>#<n>`        when N edges share endpoints
 *
 *   The optional `#N` disambiguator handles cases where the same logical
 *   edge appears twice (rare; e.g., loop-iteration self-edges across
 *   two iteration contexts). Callers pass `n` explicitly — the helper
 *   does NOT track state.
 *
 * Pure function — no closures, no module state.
 */

import type { LensEdge } from '../types.js';

/**
 * Build a `LensEdge` with a deterministic id from kind + endpoints.
 * Optional `n` disambiguates collisions when the same logical edge
 * appears more than once.
 */
export function makeEdge(
  kind: LensEdge['kind'],
  source: string,
  target: string,
  options: { label?: string; n?: number } = {},
): LensEdge {
  const idCore = `${kind}:${source}->${target}`;
  const id = options.n !== undefined ? `${idCore}#${options.n}` : idCore;
  return {
    id,
    source,
    target,
    kind,
    ...(options.label !== undefined && { label: options.label }),
  };
}
