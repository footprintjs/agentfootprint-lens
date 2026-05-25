/**
 * translateSequence — `Sequence` GroupMetadata → `LensGroupOutput`.
 *
 * Layer 2 (per-kind translator, pure) / Lens v0.1 translator pipeline.
 *
 * What it emits
 * ─────────────
 *   The concatenation of each member's subgraph, plus N-1 `next`
 *   edges chaining consecutive members through their `rootNodeId`s.
 *   Sequence has NO own container node — the locked Lens v0.1
 *   architecture renders only Parallel / Agent / LLMCall as compound
 *   boxes. Sequence is a control-flow pattern, not a visual cluster.
 *
 * Why no own container
 * ────────────────────
 *   A "Sequence box" would force the renderer to draw two visually
 *   redundant frames (the Sequence's container + each member's own
 *   card), which clutters multi-agent flowcharts. The chain of
 *   `next` edges between members carries all the semantic weight
 *   the user needs to read the sequence. Layout engines (dagre,
 *   ELK) handle this naturally as a horizontal chain.
 *
 * rootNodeId convention
 * ─────────────────────
 *   The first member's `rootNodeId` becomes the Sequence's
 *   `rootNodeId` — that's the entry point a parent composition
 *   wires control-flow edges to. Empty Sequence (zero members) is
 *   a caller bug; the translator throws so the bug surfaces loudly
 *   at translation time, not as a silent empty graph.
 *
 * Pure function — no closures, no module state. Member subgraphs
 * arrive resolved via the `resolve` callback supplied by the
 * dispatcher; this translator does not call back into other
 * translators directly.
 */

import type { GroupMetadata } from 'agentfootprint';
import { exitNodeIdOf } from '../helpers/exitNodeId.js';
import { makeEdge } from '../helpers/makeEdge.js';
import { mergeOutputs } from '../helpers/mergeOutputs.js';
import type { LensEdge, LensGroupOutput } from '../types.js';
import type { MemberResolver } from './MemberResolver.js';

export function translateSequence(
  metadata: GroupMetadata,
  resolve: MemberResolver,
): LensGroupOutput {
  if (metadata.kind !== 'Sequence') {
    throw new TypeError(
      `translateSequence: expected GroupMetadata.kind = 'Sequence', got '${metadata.kind}'`,
    );
  }
  if (metadata.members.length === 0) {
    throw new RangeError(
      `translateSequence: Sequence '${metadata.id}' has zero members — caller bug (a Sequence must declare at least one step).`,
    );
  }

  const memberOutputs = metadata.members.map(resolve);
  const rootNodeId = memberOutputs[0]!.rootNodeId;
  const exitNodeId = exitNodeIdOf(memberOutputs[memberOutputs.length - 1]!);
  const merged = mergeOutputs(memberOutputs, rootNodeId);

  // Chain edges connect each member's EXIT to the next member's ROOT
  // so chains-of-chains (Sequence of Parallel of LLMCall) wire from
  // the inner Parallel's Merge node, not its container entry.
  const chainEdges: LensEdge[] = [];
  for (let i = 0; i < memberOutputs.length - 1; i++) {
    chainEdges.push(
      makeEdge(
        'next',
        exitNodeIdOf(memberOutputs[i]!),
        memberOutputs[i + 1]!.rootNodeId,
      ),
    );
  }

  return {
    nodes: merged.nodes,
    edges: [...merged.edges, ...chainEdges],
    rootNodeId,
    exitNodeId,
  };
}
