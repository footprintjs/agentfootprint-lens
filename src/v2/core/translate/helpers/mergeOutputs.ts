/**
 * mergeOutputs — fold N `LensGroupOutput`s into one.
 *
 * Layer 1 (helpers, pure) / Lens v0.1 translator pipeline.
 *
 * Why a dedicated fold
 * ────────────────────
 *   Compositions with multiple members (Parallel, Sequence,
 *   Conditional) each produce one `LensGroupOutput` per member. The
 *   parent composition merges them — concatenating nodes + edges and
 *   preserving order. Centralising the fold means every per-kind
 *   translator follows the same merge semantics (concat, no dedup, no
 *   reorder) so consumers can reason about the final graph from any
 *   translator output without surprise.
 *
 * Identity
 * ────────
 *   `mergeOutputs([])` returns the EMPTY output (no nodes, no edges,
 *   empty rootNodeId). Callers must NOT rely on this empty form for
 *   semantic meaning — they own picking a real `rootNodeId` AFTER the
 *   fold (e.g., the parent container's id). The empty `rootNodeId`
 *   is a sentinel: any caller producing a 0-member parent is
 *   probably mis-modeling its composition.
 *
 * Order preservation (locked)
 * ───────────────────────────
 *   Nodes appear in the order they're encountered (depth-first by
 *   caller). xyflow renders nodes in array order — preserving the
 *   composition's natural ordering means Lens defaults to "left-to-
 *   right by declaration" which matches developer mental models.
 *
 * Dev-mode collision guard
 * ────────────────────────
 *   When footprintjs `isDevMode()` is on, the fold asserts that node
 *   ids and edge ids are globally unique across the merged subgraphs.
 *   Duplicate ids would silently produce a malformed xyflow graph
 *   (xyflow keys both nodes and edges by id; duplicates cause
 *   rendering and diff surprises that are hard to debug). The check
 *   is gated on dev mode so production paths pay zero overhead, in
 *   line with the footprintjs convention (CLAUDE.md → "Dev Mode").
 *   Collision sources we have seen in practice:
 *
 *     - two sibling compositions sharing the same caller-supplied id
 *     - a nested Loop emitting a duplicate `loop-iteration` self-edge
 *       whose endpoints alias an outer loop's body root
 *     - a Sequence whose first member's `rootNodeId` collides with
 *       another sibling's leading node
 *
 *   Production callers can opt in to the guard via `enableDevMode()`.
 *
 * Pure function — no closures, no module state.
 */

import { isDevMode } from 'footprintjs';
import type { LensGroupOutput, LensEdge, LensNode } from '../types.js';

/**
 * Concatenate N outputs' nodes + edges into a single output. The
 * caller supplies the `rootNodeId` AFTER the fold (typically the
 * parent composition's container id; for a flat fold with no
 * container, the lead member's `rootNodeId`).
 */
export function mergeOutputs(
  outputs: readonly LensGroupOutput[],
  rootNodeId: string,
): LensGroupOutput {
  const nodes: LensNode[] = [];
  const edges: LensEdge[] = [];
  for (const o of outputs) {
    for (const n of o.nodes) nodes.push(n);
    for (const e of o.edges) edges.push(e);
  }
  if (isDevMode()) assertNoCollisions(nodes, edges);
  return { nodes, edges, rootNodeId };
}

function assertNoCollisions(
  nodes: readonly LensNode[],
  edges: readonly LensEdge[],
): void {
  const nodeIds = new Set<string>();
  for (const n of nodes) {
    if (nodeIds.has(n.id)) {
      throw new Error(
        `mergeOutputs: duplicate node id '${n.id}' detected during fold. ` +
          `Cause: two sibling compositions share the same caller-supplied id, ` +
          `or a nested composition aliases its parent's rootNodeId. Disambiguate ` +
          `the upstream composition ids.`,
      );
    }
    nodeIds.add(n.id);
  }
  const edgeIds = new Set<string>();
  for (const e of edges) {
    if (edgeIds.has(e.id)) {
      throw new Error(
        `mergeOutputs: duplicate edge id '${e.id}' detected during fold. ` +
          `Cause: nested compositions emit the same control-flow edge (commonly ` +
          `a self-edge in nested loops). Use makeEdge's 'n' disambiguator at the ` +
          `inner level.`,
      );
    }
    edgeIds.add(e.id);
  }
}
