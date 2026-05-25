/**
 * toReactFlow — pure mapper `LensGroupOutput` → xyflow `Node[]` + `Edge[]`.
 *
 * Layer 3.1 (pure render mapper) / Lens v0.1 translator pipeline.
 *
 * Why a pure mapper (no layout, no React, no DOM)
 * ───────────────────────────────────────────────
 *   The translate pipeline (L2) produces a UI-framework-agnostic
 *   `LensGroupOutput`. The xyflow mapping is the FIRST place a
 *   framework dependency enters — keep it isolated in this one file
 *   so a Vue / D3 consumer can swap in their own mapper without
 *   touching the data layer or the React hook above.
 *
 *   Positions are NOT set here: dagre (or any layout engine) runs
 *   downstream over the result. Keeping layout out of the mapper
 *   means the mapper is trivially testable against fixed outputs.
 *
 * Node mapping
 * ────────────
 *   LensNode.kind = 'group'  → xyflow Node with `type: 'group'`,
 *                              `style: { width, height }` placeholders
 *                              (final dims come from layout).
 *   LensNode.kind = 'stage'  → xyflow Node with `type: 'lensStage'`
 *                              (consumer registers a renderer for that
 *                              type — Lens does NOT bake in JSX here).
 *   parentId  → xyflow parentId + `extent: 'parent'` so the child is
 *               clipped to its compound container.
 *   data      → { label, primitiveKind, metadata } — exactly what a
 *               renderer needs to theme by kind without re-importing
 *               LensNode.
 *
 * Edge mapping
 * ────────────
 *   LensEdge maps 1:1 to xyflow Edge. `data` carries the LensEdge
 *   `kind` so consumers can theme:
 *
 *     next             → solid arrow (default)
 *     fork-branch      → dashed / fanned
 *     decision-branch  → conditional / dashed
 *     loop-iteration   → curved back-edge
 *
 *   `label` passes through verbatim. `type` defaults to 'default'
 *   (xyflow's straight-line) so the consumer-supplied edgeTypes map
 *   can pick a custom edge component per kind without bezier/straight
 *   conflicts.
 *
 * Pure function — no closures, no module state.
 */

import type { Edge, Node } from '@xyflow/react';
import type { LensEdge, LensGroupOutput, LensNode } from '../../core/translate/types.js';

/** Default size box for a stage node. Layout overrides via dagre. */
const DEFAULT_STAGE_SIZE = { width: 180, height: 56 } as const;
/** Default placeholder size for a group container — dagre overrides. */
const DEFAULT_GROUP_SIZE = { width: 260, height: 120 } as const;

/**
 * Data payload xyflow renderers receive on each node. Closed enough
 * that a consumer renderer can switch on `primitiveKind` and consume
 * `metadata` safely.
 *
 * `userActor` is set ONLY on the synthetic user-frame nodes
 * (`__lens_user_in` / `__lens_user_out`) added by `layoutLensGraph`
 * when `withUserFrame` is on. Real composition nodes leave it
 * undefined. Renderers theme accordingly: a circular actor pill for
 * `'in' | 'out'`, the standard stage card otherwise.
 */
export interface LensReactFlowNodeData {
  readonly label: string;
  readonly primitiveKind: LensNode['primitiveKind'];
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly userActor?: 'in' | 'out';
  readonly [key: string]: unknown;
}

/**
 * Data payload xyflow renderers receive on each edge. Carries the
 * LensEdge `kind` so the consumer can switch on it without re-deriving.
 */
export interface LensReactFlowEdgeData {
  readonly kind: LensEdge['kind'];
  readonly [key: string]: unknown;
}

export interface ToReactFlowResult {
  readonly nodes: Node<LensReactFlowNodeData>[];
  readonly edges: Edge<LensReactFlowEdgeData>[];
}

export function toReactFlow(output: LensGroupOutput): ToReactFlowResult {
  const nodes: Node<LensReactFlowNodeData>[] = output.nodes.map((n) =>
    nodeToXyflow(n),
  );
  const edges: Edge<LensReactFlowEdgeData>[] = output.edges.map((e) =>
    edgeToXyflow(e),
  );
  return { nodes, edges };
}

function nodeToXyflow(n: LensNode): Node<LensReactFlowNodeData> {
  const data: LensReactFlowNodeData = {
    label: n.label,
    primitiveKind: n.primitiveKind,
    ...(n.metadata !== undefined && { metadata: n.metadata }),
  };
  const base: Node<LensReactFlowNodeData> = {
    id: n.id,
    position: { x: 0, y: 0 },
    data,
    ...(n.kind === 'group'
      ? { type: 'group', style: { ...DEFAULT_GROUP_SIZE } }
      : { type: 'lensStage' }),
    ...(n.parentId !== undefined && {
      parentId: n.parentId,
      extent: 'parent' as const,
    }),
  };
  return base;
}

function edgeToXyflow(e: LensEdge): Edge<LensReactFlowEdgeData> {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'default',
    data: { kind: e.kind },
    ...(e.label !== undefined && { label: e.label }),
  };
}

/**
 * Default size hint per LensNode kind — exported so the layout step
 * can sit alongside the mapper and consumers can override at one
 * boundary instead of inferring sizes from CSS during layout.
 */
export function defaultSize(node: LensNode): { width: number; height: number } {
  return node.kind === 'group'
    ? { ...DEFAULT_GROUP_SIZE }
    : { ...DEFAULT_STAGE_SIZE };
}
