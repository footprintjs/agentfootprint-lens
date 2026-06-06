/**
 * mergeAugmentedLayout — fold a `LayoutAugment` into the base
 * ReactFlow layout produced by `specToReactFlow`.
 *
 * Layer 3 / Tier A / Lens v0.1.
 *
 * Responsibilities
 * ────────────────
 *   1. Compute final position for each augment node by anchoring it to
 *      the matching base node.
 *   2. Concatenate base + augment nodes/edges into one layout output.
 *   3. Preserve insertion order of the base layout (ReactFlow stable
 *      rendering, predictable z-order).
 *
 * Positioning convention
 * ──────────────────────
 *   For retry siblings, earlier attempts sit horizontally to the LEFT
 *   of the base (final-attempt) node, on the same row. Spacing matches
 *   a default node width of 200px + a 32px gap — caller-overridable
 *   via options.
 *
 *   The first earlier attempt has `attempt === 1`, sits leftmost in
 *   the row. Augment nodes from `overlayToLayoutAugment` retain their
 *   order — we read `data.attempt` to determine offset.
 *
 * Missing anchors
 * ───────────────
 *   If an augment node's `anchorId` doesn't match any base node,
 *   the augment node is dropped (logged via `console.warn` in dev).
 *   This keeps the layout from rendering "floating" siblings with no
 *   home — typically caused by spec drift during a hot reload.
 */

import type { Node, Edge } from '@xyflow/react';
import type { LayoutAugment, AugmentNodeData } from './overlayToLayoutAugment.js';

export interface MergeOptions {
  /** Horizontal pixels between sibling centers. Default 232 (200 + 32 gap). */
  readonly siblingSpacing?: number;
}

export interface MergedLayout {
  readonly nodes: readonly Node[];
  readonly edges: readonly Edge[];
}

export function mergeAugmentedLayout(
  base: { readonly nodes: readonly Node[]; readonly edges: readonly Edge[] },
  augment: LayoutAugment,
  options: MergeOptions = {},
): MergedLayout {
  const spacing = options.siblingSpacing ?? 232;

  if (augment.extraNodes.length === 0 && augment.extraEdges.length === 0) {
    return base;
  }

  // Index base nodes by id for O(1) anchor lookup.
  const baseById = new Map<string, Node>();
  for (const n of base.nodes) baseById.set(n.id, n);

  // Group augment nodes by anchor so we can lay out siblings in
  // attempt-ascending order on the SAME row.
  const byAnchor = new Map<string, Node<AugmentNodeData>[]>();
  for (const n of augment.extraNodes) {
    const anchorId = n.data?.anchorId;
    if (typeof anchorId !== 'string' || !baseById.has(anchorId)) continue;
    let bucket = byAnchor.get(anchorId);
    if (!bucket) {
      bucket = [];
      byAnchor.set(anchorId, bucket);
    }
    bucket.push(n);
  }
  // Sort each bucket by attempt ascending (earliest leftmost).
  for (const bucket of byAnchor.values()) {
    bucket.sort((a, b) => (a.data?.attempt ?? 0) - (b.data?.attempt ?? 0));
  }

  // Position each augment node leftward of its anchor.
  const positioned: Node[] = [];
  for (const [anchorId, bucket] of byAnchor) {
    const anchor = baseById.get(anchorId)!;
    const ay = anchor.position?.y ?? 0;
    const ax = anchor.position?.x ?? 0;
    // bucket.length total earlier-attempt siblings; leftmost gets the
    // largest negative offset, rightmost gets -spacing.
    const total = bucket.length;
    for (let i = 0; i < total; i++) {
      const offsetIdx = total - i; // 1..total, leftmost = total
      const aug = bucket[i]!;
      positioned.push({
        ...aug,
        position: { x: ax - spacing * offsetIdx, y: ay },
      });
    }
  }

  // Filter edges to only those whose source AND target survived the
  // anchor-match step. A retry connector pointing to an orphaned
  // augment node would dangle.
  const idSet = new Set<string>([...baseById.keys(), ...positioned.map((n) => n.id)]);
  const keptAugmentEdges: Edge[] = [];
  for (const e of augment.extraEdges) {
    if (idSet.has(e.source) && idSet.has(e.target)) {
      keptAugmentEdges.push(e);
    }
  }

  return {
    nodes: [...base.nodes, ...positioned],
    edges: [...base.edges, ...keptAugmentEdges],
  };
}
