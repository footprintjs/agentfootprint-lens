/**
 * translateAgent — `Agent` GroupMetadata → `LensGroupOutput`.
 *
 * Layer 2 (per-kind translator, pure) / Lens v0.1 translator pipeline.
 *
 * What it emits
 * ─────────────
 *   ONE `stage` node carrying the Agent's `extra` (slots, toolNames,
 *   maxIterations) as `metadata`. No edges. `rootNodeId` points at
 *   the single node so a parent composition can attach control-flow
 *   edges to it.
 *
 * Why a leaf node (not a compound group)
 * ──────────────────────────────────────
 *   Agent's slots (SystemPrompt / Messages / Tools) and tool list
 *   render INSIDE the Agent card itself in Lens v0.1 — the
 *   slot/tool UI is a per-card concern, not a compound-graph
 *   concern. The Agent's iteration loop is a runtime artifact
 *   (visualised via timeline / step recorder), not a graph
 *   topology element here.
 *
 *   The whole point of Lens's three render boxes (Parallel / Agent /
 *   LLMCall) is that an Agent card opens to its detail view on drill-
 *   in; the card itself stays as one graph node.
 *
 * Pure function — no closures, no module state. Member array is
 * always empty for Agent (`buildUIGroupMetadata` returns
 * `members: []`); the translator does not iterate it.
 */

import type { GroupMetadata } from 'agentfootprint';
import { makeRootNodeId } from '../helpers/makeNodeId.js';
import type { LensGroupOutput, LensNode } from '../types.js';

export function translateAgent(metadata: GroupMetadata): LensGroupOutput {
  if (metadata.kind !== 'Agent') {
    throw new TypeError(
      `translateAgent: expected GroupMetadata.kind = 'Agent', got '${metadata.kind}'`,
    );
  }
  const id = makeRootNodeId('Agent', metadata.id);
  const node: LensNode = {
    id,
    kind: 'stage',
    label: metadata.name,
    primitiveKind: 'Agent',
    ...(metadata.extra !== undefined && { metadata: metadata.extra }),
  };
  return {
    nodes: [node],
    edges: [],
    rootNodeId: id,
    exitNodeId: id,
  };
}
