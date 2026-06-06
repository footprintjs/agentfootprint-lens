/**
 * viaStructureRecorder — PROTOTYPE for the structure-extraction path
 * that consumes explainable-ui's `createTraceStructureRecorder`
 * INSTEAD of agentfootprint's bespoke `GroupMetadata` +
 * per-kind translators (translateAgent / translateLLMCall / ...).
 *
 * Background — the duplication this is targeting
 * ──────────────────────────────────────────────
 *   Today lens consumes `Runner.getUIGroupWith(lensGroupTranslator)`,
 *   which walks the agentfootprint composition tree via per-kind
 *   `buildUIGroupMetadata()` methods. footprintjs v6 + explainable-ui
 *   v0.20 ALREADY ship the canonical pipeline:
 *
 *     flowChart(..., { structureRecorders: [trace.recorder] })
 *     ┕━► (build emits onStageAdded / onEdgeAdded / onSubflowMounted)
 *           ┕━► trace.getGraph(): TraceGraph (nodes + edges, xyflow-ready)
 *
 *   Lens has not adopted this path. This prototype proves the bridge
 *   works against agentfootprint compositions, then identifies the
 *   AGENT-DECORATION gap (collapsing internal subflow trees down to
 *   single domain nodes — the work the current per-kind translators
 *   do today via metadata.kind).
 *
 * Usage (the new path)
 * ────────────────────
 *   const lensRec = lensStructureRecorder();
 *   const llm = LLMCall.create({
 *     provider,
 *     model: 'mock',
 *     structureRecorders: [lensRec.recorder],
 *   }).system('').build();
 *
 *   const graph = lensRec.getGraph();  // → TraceGraph
 *   // <TraceFlow graph={graph} nodeTypes={...} />
 *
 * Known gap (next slice of work)
 * ──────────────────────────────
 *   The base TraceGraph is FINE-GRAINED — every internal stage of an
 *   LLMCall (Seed, SystemPrompt slot subflow, Messages slot subflow,
 *   Tools slot subflow, CallLLM, Route, etc.) appears as a separate
 *   node. Lens's current translator COLLAPSES the LLMCall into ONE
 *   node by reading `metadata.kind === 'LLMCall'` from
 *   `buildUIGroupMetadata()`. To reach visual parity we need an
 *   "agent decorator" that:
 *     1. walks the TraceGraph
 *     2. finds subflows tagged as agentfootprint primitives (Agent /
 *        LLMCall / Tool)
 *     3. replaces each subgraph with one annotated node carrying
 *        primitiveKind + metadata (slots / model / toolNames / ...)
 *     4. preserves edges entering/leaving the collapsed subgraph
 *
 *   The cleanest way to feed the decorator is to have agentfootprint
 *   emit additional structure events tagging which subflow IS which
 *   primitive — a small additive change to the composition classes.
 *   That work is OUT OF SCOPE for this scouting prototype; see the
 *   companion test file for the comparison that proves it's needed.
 */

import { createTraceStructureRecorder } from 'footprint-explainable-ui/flowchart';
import type { TraceGraph } from 'footprint-explainable-ui/flowchart';
import type { StructureRecorder } from 'footprintjs';

export interface LensStructureRecorderHandle {
  /** Pass via `structureRecorders: [handle.recorder]` to any
   *  agentfootprint composition factory (Agent / LLMCall / Sequence /
   *  Parallel / Loop / Conditional). */
  readonly recorder: StructureRecorder;
  /** Returns the accumulated build-time graph. Safe to call any time
   *  after composition construction completes. */
  getGraph(): TraceGraph;
}

export function lensStructureRecorder(): LensStructureRecorderHandle {
  const trace = createTraceStructureRecorder();
  return {
    recorder: trace.recorder as unknown as StructureRecorder,
    getGraph: () => trace.getGraph(),
  };
}
