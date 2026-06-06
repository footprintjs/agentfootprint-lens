/**
 * translateLoop — `Loop` GroupMetadata → `LensGroupOutput`.
 *
 * Layer 2 (per-kind translator, pure) / Lens v0.1 translator pipeline.
 *
 * What it emits
 * ─────────────
 *   The body's subgraph unchanged, plus ONE self-edge of kind
 *   `loop-iteration` from the body's `rootNodeId` back to itself.
 *   The self-edge label encodes the loop's iteration budget (and
 *   optional wallclock budget) so the renderer can show "max N" /
 *   "max N · 30s" without having to read the edge's metadata bag.
 *
 * Why no own container
 * ────────────────────
 *   Loop is a control-flow decoration on its body, not a visual
 *   cluster. Wrapping the body in a "Loop box" would force the
 *   renderer to draw an extra frame on every loop, which the locked
 *   Lens v0.1 architecture (`memory/lens_v0_1_one_cursor_architecture.md`)
 *   rejects — only Parallel / Agent / LLMCall get boxes.
 *
 * Why label-encode, not separate-edge-metadata
 * ────────────────────────────────────────────
 *   v0.1 doesn't need programmatic access to a Loop's iteration
 *   budget from the rendered graph — the budget is already
 *   visible in the agentfootprint runner's snapshot. The label
 *   keeps the visualisation self-contained without inflating
 *   `LensEdge` with a metadata bag we'd only fill for this one
 *   kind. YAGNI applies until a renderer requires it.
 *
 * Pure function — no closures, no module state.
 */

import type { GroupMetadata } from 'agentfootprint';
import { exitNodeIdOf } from '../helpers/exitNodeId.js';
import { makeEdge } from '../helpers/makeEdge.js';
import type { LensGroupOutput } from '../types.js';
import type { MemberResolver } from './MemberResolver.js';

function buildLoopLabel(extra: Readonly<Record<string, unknown>> | undefined): string {
  if (extra === undefined) return 'iterate';
  const maxIterations = extra['maxIterations'];
  const maxWallclockMs = extra['maxWallclockMs'];
  const parts: string[] = [];
  if (typeof maxIterations === 'number') parts.push(`max ${maxIterations}`);
  if (typeof maxWallclockMs === 'number') parts.push(`${Math.round(maxWallclockMs / 1000)}s`);
  return parts.length > 0 ? parts.join(' · ') : 'iterate';
}

export function translateLoop(
  metadata: GroupMetadata,
  resolve: MemberResolver,
): LensGroupOutput {
  if (metadata.kind !== 'Loop') {
    throw new TypeError(
      `translateLoop: expected GroupMetadata.kind = 'Loop', got '${metadata.kind}'`,
    );
  }
  if (metadata.members.length !== 1) {
    throw new RangeError(
      `translateLoop: Loop '${metadata.id}' must have exactly 1 member (the body), got ${metadata.members.length}.`,
    );
  }

  const body = resolve(metadata.members[0]!);
  // The loop-iteration self-edge goes from body's EXIT back to body's
  // root — capturing "after the body finishes, run it again". For
  // single-stage bodies exit == root and the edge degenerates into a
  // self-loop; for chain bodies (Loop of Sequence) the back-edge
  // points from the last step's exit to the first step's root, which
  // is the correct visual semantic.
  const selfEdge = makeEdge(
    'loop-iteration',
    exitNodeIdOf(body),
    body.rootNodeId,
    { label: buildLoopLabel(metadata.extra) },
  );

  return {
    nodes: body.nodes,
    edges: [...body.edges, selfEdge],
    rootNodeId: body.rootNodeId,
    exitNodeId: exitNodeIdOf(body),
  };
}
