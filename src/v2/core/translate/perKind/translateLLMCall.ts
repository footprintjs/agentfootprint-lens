/**
 * translateLLMCall — `LLMCall` GroupMetadata → `LensGroupOutput`.
 *
 * Layer 2 (per-kind translator, pure) / Lens v0.1 translator pipeline.
 *
 * What it emits
 * ─────────────
 *   ONE `stage` node carrying the LLMCall's slot list as `metadata`.
 *   No edges (leaves are terminal). The output's `rootNodeId` points
 *   at this single node so a parent composition can attach control-
 *   flow edges to it.
 *
 * Why a leaf node (not a compound group)
 * ──────────────────────────────────────
 *   LLMCall's slots (SystemPrompt / Messages / Tools) render INSIDE
 *   the stage card itself in Lens v0.1 — the slot UI is a per-card
 *   concern, not a compound-graph concern. Translating slots into
 *   xyflow child nodes would scatter them across the graph and break
 *   the locked "three boxes only" rendering rule (Parallel / Agent /
 *   LLMCall).
 *
 * Pure function — no closures, no module state. Member array is
 * always empty for LLMCall (`buildUIGroupMetadata` returns
 * `members: []`); the translator does not iterate it.
 */

import type { GroupMetadata } from 'agentfootprint';
import { makeRootNodeId } from '../helpers/makeNodeId.js';
import type { LensGroupOutput, LensNode } from '../types.js';

export function translateLLMCall(metadata: GroupMetadata): LensGroupOutput {
  if (metadata.kind !== 'LLMCall') {
    throw new TypeError(
      `translateLLMCall: expected GroupMetadata.kind = 'LLMCall', got '${metadata.kind}'`,
    );
  }
  const id = makeRootNodeId('LLMCall', metadata.id);
  const node: LensNode = {
    id,
    kind: 'stage',
    label: metadata.name,
    primitiveKind: 'LLMCall',
    ...(metadata.extra !== undefined && { metadata: metadata.extra }),
  };
  return {
    nodes: [node],
    edges: [],
    rootNodeId: id,
    exitNodeId: id,
  };
}
