/**
 * translateConditional — `Conditional` GroupMetadata → `LensGroupOutput`.
 *
 * Layer 2 (per-kind translator, pure) / Lens v0.1 translator pipeline.
 *
 * What it emits
 * ─────────────
 *   ONE synthetic `stage` node (the decision point) carrying the
 *   conditional's `extra` (`fallbackId`) as `metadata`, plus each
 *   branch's subgraph, plus N `decision-branch` edges from the
 *   decision point to each branch's `rootNodeId`. The decision
 *   point's id is `conditional:<id>`. The edge for the fallback
 *   branch is labelled `'<memberId> (default)'` so the renderer
 *   can highlight it without reading the metadata bag.
 *
 * Why a synthetic decision node
 * ─────────────────────────────
 *   xyflow needs a concrete source for every edge. Conditional has
 *   no caller-supplied node to serve as that source (the runtime
 *   decision is data, not a node) — so we synthesise one. It
 *   renders as a small diamond / "?" stage in the default theme,
 *   matching the convention readers expect from BPMN-style
 *   flowcharts.
 *
 *   The decision node is NOT a compound box: only Parallel / Agent /
 *   LLMCall get those (locked Lens v0.1 architecture). Conditional's
 *   visual presence is the decision point + the fanout edges.
 *
 * Pure function — no closures, no module state.
 */

import type { GroupMetadata } from 'agentfootprint';
import { exitNodeIdOf } from '../helpers/exitNodeId.js';
import { makeEdge } from '../helpers/makeEdge.js';
import { makeRootNodeId } from '../helpers/makeNodeId.js';
import { mergeOutputs } from '../helpers/mergeOutputs.js';
import type { LensEdge, LensGroupOutput, LensNode } from '../types.js';
import type { MemberResolver } from './MemberResolver.js';

export function translateConditional(
  metadata: GroupMetadata,
  resolve: MemberResolver,
): LensGroupOutput {
  if (metadata.kind !== 'Conditional') {
    throw new TypeError(
      `translateConditional: expected GroupMetadata.kind = 'Conditional', got '${metadata.kind}'`,
    );
  }
  if (metadata.members.length === 0) {
    throw new RangeError(
      `translateConditional: Conditional '${metadata.id}' has zero branches — caller bug.`,
    );
  }

  const decisionId = makeRootNodeId('Conditional', metadata.id);
  // Suffix synthetic ids with `/converge` so they're guaranteed
  // distinct from any caller-supplied composition id.
  const convergeId = `${decisionId}/converge`;
  const fallbackId =
    metadata.extra !== undefined && typeof metadata.extra['fallbackId'] === 'string'
      ? (metadata.extra['fallbackId'] as string)
      : undefined;

  const decisionNode: LensNode = {
    id: decisionId,
    kind: 'stage',
    label: metadata.name,
    primitiveKind: 'Conditional',
    ...(metadata.extra !== undefined && { metadata: metadata.extra }),
  };

  // Synthetic Converge tail node — represents the join after the
  // chosen branch completes. Mirrors the engine's runtime semantics:
  // exactly one branch runs, and execution converges to a single
  // point before continuing.
  const convergeNode: LensNode = {
    id: convergeId,
    kind: 'stage',
    label: 'converge',
    primitiveKind: 'Conditional',
    metadata: { synthetic: 'converge' },
  };

  const branchOutputs = metadata.members.map(resolve);
  const merged = mergeOutputs(branchOutputs, decisionId);

  const fanoutEdges: LensEdge[] = metadata.members.map((m, i) => {
    const branchOut = branchOutputs[i]!;
    const isFallback = fallbackId !== undefined && m.memberId === fallbackId;
    const label = isFallback ? `${m.memberId} (default)` : m.memberId;
    return makeEdge('decision-branch', decisionId, branchOut.rootNodeId, {
      label,
    });
  });

  // Each branch's exit → converge. `next` kind (not decision-branch)
  // because the fan-IN side is purely sequential — the decision
  // already happened at the decision node.
  const joinEdges: LensEdge[] = branchOutputs.map((b) =>
    makeEdge('next', exitNodeIdOf(b), convergeId),
  );

  return {
    nodes: [decisionNode, ...merged.nodes, convergeNode],
    edges: [...merged.edges, ...fanoutEdges, ...joinEdges],
    rootNodeId: decisionId,
    exitNodeId: convergeId,
  };
}
