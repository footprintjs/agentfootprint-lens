/**
 * overlayToLayoutAugment — derive runtime-only ReactFlow nodes/edges
 * from the StepGraph + retry clusters that `specToReactFlow` cannot
 * generate from the static Spec alone.
 *
 * Layer 3 / Tier A / Lens v0.1.
 *
 * Why a separate layer
 * ────────────────────
 *   `specToReactFlow` (in `footprint-explainable-ui`) is pure: same
 *   Spec → same layout. Retry siblings, dynamic conditional branches
 *   the spec didn't anticipate, "actually-happened" overlay markers
 *   — these are RUNTIME observations, not Spec structure. Folding them
 *   into specToReactFlow would couple the layout function to a live
 *   recorder. Keeping the augment separate lets each side stay simple
 *   and testable on its own.
 *
 * v0.1 augmentations
 * ──────────────────
 *   - **Retry siblings**: for each `RetryCluster` with N attempts, we
 *     synthesize N-1 extra sibling nodes. The ORIGINAL base node from
 *     specToReactFlow represents the FINAL attempt; the augment fills
 *     in earlier attempts so the user sees the cluster as a row.
 *
 *   Future v0.x augmentations (not in v0.1):
 *     - Conditional branches that the run actually took but the spec
 *       compiled with `lazy: true`.
 *     - Dead-branch dimming (children of forks that broke early).
 *     - Streaming-call "ghost" siblings for in-flight chunks.
 *
 * Positioning is OUT OF SCOPE for this function — the produced nodes
 * carry `position: {x:0,y:0}` placeholders and a `data.anchorId`
 * pointing at the base node. `mergeAugmentedLayout` reads those
 * anchors and places the siblings.
 */

import type { Node, Edge } from '@xyflow/react';
import type { SpecNode } from '../buildSpecTreeFromBoundary.js';
import type { StepGraph } from 'agentfootprint/observe';
import type { RetryCluster, RetryAttempt } from '../utils/groupRetryAttempts.js';

/** Synthetic-sibling node data. The index signature satisfies xyflow's
 *  `Record<string, unknown>` data constraint without weakening the
 *  named-field contract. */
export interface AugmentNodeData extends Record<string, unknown> {
  /** Label rendered on the synthetic sibling node. */
  readonly label: string;
  /** Outcome of this earlier attempt. */
  readonly status: 'failed' | 'ok';
  /** Error string when the attempt failed. */
  readonly errorMessage?: string;
  /** Stable per-attempt id. */
  readonly runtimeStageId: string;
  /** Id of the base node this sibling anchors against. */
  readonly anchorId: string;
  /** 1-based attempt number this sibling represents. */
  readonly attempt: number;
}

export interface LayoutAugment {
  readonly extraNodes: readonly Node<AugmentNodeData>[];
  readonly extraEdges: readonly Edge[];
}

const EMPTY_AUGMENT: LayoutAugment = Object.freeze({
  extraNodes: Object.freeze([]) as readonly Node<AugmentNodeData>[],
  extraEdges: Object.freeze([]) as readonly Edge[],
});

function attemptLabel(stageId: string, a: RetryAttempt): string {
  return `${stageId} (attempt ${a.attempt})`;
}

export function overlayToLayoutAugment(
  spec: SpecNode | undefined,
  stepGraph: StepGraph | undefined,
  retryClusters: ReadonlyMap<string, RetryCluster>,
): LayoutAugment {
  // Suppress unused-warning while still preserving the v0.1 signature
  // — both spec and stepGraph are reserved for future augmentations
  // (conditional branches, dead-fork dimming, ghost-streaming siblings).
  void spec;
  void stepGraph;

  if (retryClusters.size === 0) return EMPTY_AUGMENT;

  const extraNodes: Node<AugmentNodeData>[] = [];
  const extraEdges: Edge[] = [];

  for (const [stageId, cluster] of retryClusters) {
    const attempts = cluster.attempts;
    if (attempts.length < 2) continue; // single-attempt = base node alone

    // Spec produces one base node for `stageId`. Earlier attempts get
    // synthesized — attempts.length - 1 of them.
    const earlier = attempts.slice(0, -1);

    let prevId: string | undefined;
    for (let i = 0; i < earlier.length; i++) {
      const a = earlier[i]!;
      const nodeId = `retry-${a.runtimeStageId}`;
      const node: Node<AugmentNodeData> = {
        id: nodeId,
        type: 'retryAttempt',
        position: { x: 0, y: 0 },
        data: {
          label: attemptLabel(stageId, a),
          status: a.status,
          ...(a.errorMessage !== undefined ? { errorMessage: a.errorMessage } : {}),
          runtimeStageId: a.runtimeStageId,
          anchorId: stageId,
          attempt: a.attempt,
        },
      };
      extraNodes.push(node);

      // Chain: prev → current
      if (prevId !== undefined) {
        extraEdges.push({
          id: `retry-edge-${prevId}-${nodeId}`,
          source: prevId,
          target: nodeId,
          type: 'retryConnector',
        });
      }
      prevId = nodeId;
    }

    // Tail edge: last synthetic earlier attempt → base node (the final
    // attempt). Base node id matches `stageId` (specToReactFlow convention).
    if (prevId !== undefined) {
      extraEdges.push({
        id: `retry-edge-${prevId}-${stageId}`,
        source: prevId,
        target: stageId,
        type: 'retryConnector',
      });
    }
  }

  return { extraNodes, extraEdges };
}
