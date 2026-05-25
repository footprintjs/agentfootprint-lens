/**
 * makeNodeId — stable, collision-free node id derivation for
 * `LensNode.id`.
 *
 * Layer 1 (helpers, pure) / Lens v0.1 translator pipeline.
 *
 * Why a dedicated helper
 * ──────────────────────
 *   Per-kind translators need deterministic ids that survive across
 *   re-builds AND don't collide when the same `GroupMetadata.id`
 *   string appears at different composition levels (e.g., two
 *   sub-Parallels both named `'committee'` under different parents).
 *   Centralising the rule keeps the per-kind translators free of
 *   "did I get the prefix right" mistakes and gives one canonical
 *   shape for tests to assert against.
 *
 * Convention
 * ──────────
 *   Top-level node:        `<kindLowerCase>:<id>`         e.g., `parallel:committee`
 *   Member of a parent:    `<parentNodeId>/<memberId>`    e.g., `parallel:committee/legal`
 *
 *   The `<parentNodeId>` form is what a caller passes when stamping
 *   children — it already includes its own prefix, so collisions
 *   across composition trees are impossible.
 *
 * Pure function — no closures, no module state.
 */

import type { GroupKind } from 'agentfootprint';

/** Build a top-level node id from the composition kind + id. */
export function makeRootNodeId(kind: GroupKind, id: string): string {
  return `${kind.toLowerCase()}:${id}`;
}

/**
 * Build a child node id rooted under a parent node. The parent's id is
 * passed verbatim — it already contains its own kind prefix so the
 * resulting id is collision-free across composition trees.
 */
export function makeChildNodeId(parentNodeId: string, memberId: string): string {
  return `${parentNodeId}/${memberId}`;
}
