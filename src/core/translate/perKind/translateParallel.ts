/**
 * translateParallel — `Parallel` GroupMetadata → `LensGroupOutput`.
 *
 * Layer 2 (per-kind translator, pure) / Lens v0.1 translator pipeline.
 *
 * What it emits
 * ─────────────
 *   ONE compound `group` node (the Parallel container) carrying
 *   `extra.mergeStrategy` as `metadata`, plus each branch's
 *   subgraph PINNED inside the container via `pinUnderParent`,
 *   plus N `fork-branch` edges from the container to each branch's
 *   `rootNodeId`. Container node id is `parallel:<id>`. Container
 *   appears FIRST in the nodes array so xyflow sees the parent
 *   before its children (xyflow renders in array order).
 *
 * Why a compound container
 * ────────────────────────
 *   Parallel is one of the THREE rendering boxes in Lens v0.1
 *   (Parallel / Agent / LLMCall) — see
 *   `memory/lens_v0_1_one_cursor_architecture.md`. The container
 *   visually groups the branches so a reader instantly sees "these
 *   N things run concurrently." Without the box, parallel branches
 *   look identical to a fan-out from a decision point.
 *
 * Why fork-branch edges in ADDITION to compound containment
 * ─────────────────────────────────────────────────────────
 *   The container expresses "which branches belong together"; the
 *   `fork-branch` edges express "the parent fans out to each
 *   branch's entry point." Some renderers theme fork-branch edges
 *   differently (dotted, dashed) to distinguish from sequential
 *   `next` edges — keeping them explicit lets every renderer
 *   theme consistently without inferring intent from the
 *   parent-child relationship alone.
 *
 * Pure function — no closures, no module state. The branches'
 * subgraphs arrive resolved via the `resolve` callback; this
 * translator does not call other translators directly.
 */

import type { GroupMetadata } from 'agentfootprint';
import { exitNodeIdOf } from '../helpers/exitNodeId.js';
import { makeEdge } from '../helpers/makeEdge.js';
import { makeRootNodeId } from '../helpers/makeNodeId.js';
import { mergeOutputs } from '../helpers/mergeOutputs.js';
import { pinUnderParent } from '../helpers/pinUnderParent.js';
import type { LensEdge, LensGroupOutput, LensNode } from '../types.js';
import type { MemberResolver } from './MemberResolver.js';

export function translateParallel(
  metadata: GroupMetadata,
  resolve: MemberResolver,
): LensGroupOutput {
  if (metadata.kind !== 'Parallel') {
    throw new TypeError(
      `translateParallel: expected GroupMetadata.kind = 'Parallel', got '${metadata.kind}'`,
    );
  }
  if (metadata.members.length === 0) {
    throw new RangeError(
      `translateParallel: Parallel '${metadata.id}' has zero branches — caller bug.`,
    );
  }

  const containerId = makeRootNodeId('Parallel', metadata.id);
  // Synthetic Merge tail node — represents the engine's merge stage
  // that collects results from every branch. Lives OUTSIDE the
  // container (a sibling, not a child) so layout positions it after
  // the container. Suffix `/merge` keeps it disjoint from any
  // caller-supplied composition id.
  const mergeId = `${containerId}/merge`;

  const container: LensNode = {
    id: containerId,
    kind: 'group',
    label: metadata.name,
    primitiveKind: 'Parallel',
    ...(metadata.extra !== undefined && { metadata: metadata.extra }),
  };

  const mergeNode: LensNode = {
    id: mergeId,
    kind: 'stage',
    label: 'merge',
    primitiveKind: 'Parallel',
    metadata: { synthetic: 'merge' },
  };

  const branchOutputs = metadata.members.map(resolve);
  const pinnedBranches = branchOutputs.map((out) =>
    pinUnderParent(out, containerId),
  );

  const merged = mergeOutputs(pinnedBranches, containerId);

  const forkEdges: LensEdge[] = metadata.members.map((m, i) => {
    const branchOut = branchOutputs[i]!;
    return makeEdge('fork-branch', containerId, branchOut.rootNodeId, {
      label: m.memberId,
    });
  });

  // Each branch's exit → Merge. `next` kind (not fork-branch) because
  // the fan-IN side is sequential — the fork already happened at the
  // container.
  const joinEdges: LensEdge[] = branchOutputs.map((b) =>
    makeEdge('next', exitNodeIdOf(b), mergeId),
  );

  return {
    // Order: container first (so xyflow sees parent before children),
    // then pinned children, then Merge synthetic sibling.
    nodes: [container, ...merged.nodes, mergeNode],
    edges: [...merged.edges, ...forkEdges, ...joinEdges],
    rootNodeId: containerId,
    exitNodeId: mergeId,
  };
}
