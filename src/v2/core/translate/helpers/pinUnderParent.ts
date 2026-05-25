/**
 * pinUnderParent — set `parentId` on every TOP-LEVEL node of a child
 * output so xyflow renders the child inside the parent's compound
 * container.
 *
 * Layer 1 (helpers, pure) / Lens v0.1 translator pipeline.
 *
 * Why "all top-level nodes" (not just the root)
 * ─────────────────────────────────────────────
 *   Top-level = "no `parentId` set in the child output". That nicely
 *   subsumes both compositional shapes:
 *
 *     1. Child has its OWN container (Parallel / Agent / LLMCall)
 *        ─ the container is the only top-level node; the container's
 *          internal members already carry `parentId: container`.
 *          Result: only the container is re-pinned under the new
 *          parent, preserving the inner compound structure.
 *
 *     2. Child has NO own container (Sequence / Loop / Conditional)
 *        ─ all of the child's nodes are top-level. xyflow needs each
 *          one to live INSIDE the parent's compound box, so every
 *          top-level node gets the new `parentId`.
 *
 *   This matches xyflow's compound model: `parentId` is single-level,
 *   and a node renders inside whichever container its `parentId`
 *   points to. We never overwrite an already-set `parentId`, which
 *   would otherwise re-parent grandchildren away from their proper
 *   compound box.
 *
 * Why a new output (not in-place mutation)
 * ────────────────────────────────────────
 *   `LensGroupOutput` is documented as reference-stable. Mutating an
 *   input output would silently change a value the runner has memoised
 *   in its `uiGroupCache`. Returning a new output preserves the
 *   runner-side memoisation invariant.
 *
 * Pure function — no closures, no module state.
 */

import type { LensGroupOutput, LensNode } from '../types.js';

/**
 * Return a new `LensGroupOutput` identical to `child` except every
 * TOP-LEVEL node (no `parentId`) now carries `parentId: parentNodeId`.
 * Nodes that already carry a `parentId` pass through unchanged so
 * grandchildren stay pinned inside their proper inner container.
 *
 * `child.rootNodeId` is preserved verbatim — it remains the semantic
 * entry point for parent compositions wiring control-flow edges.
 */
export function pinUnderParent(
  child: LensGroupOutput,
  parentNodeId: string,
): LensGroupOutput {
  const nodes: LensNode[] = child.nodes.map((n) =>
    n.parentId === undefined ? { ...n, parentId: parentNodeId } : n,
  );
  return {
    nodes,
    edges: child.edges,
    rootNodeId: child.rootNodeId,
  };
}
