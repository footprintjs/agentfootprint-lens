/**
 * `selectAgentInstances` — derive AgentInstance[] from a StepGraph.
 *
 * Pattern: pure function over the `isPrimitiveBoundary` flag that
 *          agentfootprint sets on every subflow StepNode whose root
 *          description carries a known `<Kind>:` prefix (Agent /
 *          LLMCall / Sequence / Parallel / Conditional / Loop).
 *          Single-primitive runs produce one synthetic root instance;
 *          composed runs produce one per primitive subflow.
 * Role:    Feeds the top-level agent-grouping layer in Lens (one
 *          container per primitive instance). Framework-agnostic.
 *
 * Naming: kept as `selectAgentInstances` for backwards compatibility —
 * "Agent" here means "an outlined container in the run-tree view," not
 * specifically "ReAct agent." The narrow flag (`isAgentBoundary`)
 * remains available on each StepNode for callers that care about the
 * distinction (cost / iteration attribution).
 */

import type { StepGraph } from 'agentfootprint/observe';
import type { AgentInstance } from './types.js';

/**
 * Produce one AgentInstance per primitive boundary in the graph.
 *
 * Derivation:
 *   - If ANY StepNode has `isPrimitiveBoundary === true`, use those.
 *     Their `id` becomes the instance's `subflowPath` root segment.
 *   - Otherwise, synthesize a single root instance covering the run.
 *     Matches the common case of a standalone primitive run (e.g., a
 *     standalone LLMCall whose chart has no top-level subflow).
 *
 * Each instance carries a `primitiveKind` (when the StepGraph supplies
 * one) so the renderer picks the correct icon + subtitle:
 *   - Agent boundary       → `'Agent'`       → `'🤖 Agent · ReAct loop'`
 *   - LLMCall boundary     → `'LLMCall'`     → `'📡 LLMCall · one-shot'`
 *   - Sequence boundary    → `'Sequence'`    → `'➡️ Sequence · pipeline'`
 *   - Parallel boundary    → `'Parallel'`    → `'🔀 Parallel · fan-out'`
 *   - Conditional boundary → `'Conditional'` → `'🪧 Conditional · route'`
 *   - Loop boundary        → `'Loop'`        → `'🔁 Loop · iterate'`
 *
 * IDs are stable within a run — safe to use as React keys.
 */
export function selectAgentInstances(graph: StepGraph): AgentInstance[] {
  const allBoundaries = graph.nodes.filter((n) => n.isPrimitiveBoundary === true);
  if (allBoundaries.length === 0) {
    // Synthetic root — peek at the first subflow node's `primitiveKind`
    // so we can label the container by what's actually running, not a
    // hardcoded `'Agent'`. Falls back to `'Runner'` when the graph
    // carries no taxonomy metadata.
    const rootSubflow = graph.nodes.find((n) => n.kind === 'subflow');
    const primitiveKind = rootSubflow?.primitiveKind;
    return [
      {
        groupId: 'agent-root',
        llmId: 'stage-llm-root',
        toolId: 'stage-tool-root',
        label: primitiveKind ?? 'Runner',
        subflowPath: [],
        ...(primitiveKind ? { primitiveKind } : {}),
      },
    ];
  }

  // LEAF-filter: keep only the DEEPEST primitive boundaries — the ones
  // that actually do work. Drop composition wrappers (Sequence /
  // Parallel / Conditional / Loop) when at least one of their children
  // is itself a primitive boundary, since the children fully describe
  // the run.
  //
  // Examples:
  //   Sequence(LLMCall a, LLMCall b)        → [a, b]    (Sequence dropped)
  //   Parallel(LLMCall x, LLMCall y, LLMCall z) → [x, y, z] (Parallel dropped)
  //   Conditional(when a / otherwise b)     → [a] OR [b] (only the chosen
  //                                                       runs has events;
  //                                                       boundaries with
  //                                                       no descendants
  //                                                       in graph.nodes
  //                                                       fall through)
  //   Loop(body)                            → [body]   (Loop dropped — the
  //                                                     body is the unit of
  //                                                     work)
  //   Standalone Agent / LLMCall / RAG run  → [self]   (no nested primitive,
  //                                                     so it's already a leaf)
  const boundaries = allBoundaries.filter((b) =>
    !allBoundaries.some(
      (other) =>
        other !== b &&
        isStrictDescendant(other.subflowPath, b.subflowPath),
    ),
  );

  return boundaries.map((b) => ({
    groupId: `agent-group-${b.id}`,
    llmId: `stage-llm-${b.id}`,
    toolId: `stage-tool-${b.id}`,
    label: b.label,
    subflowPath: b.subflowPath,
    ...(b.primitiveKind ? { primitiveKind: b.primitiveKind } : {}),
  }));
}

/** True iff `child` is strictly deeper than `parent` (parent is a proper
 *  prefix of child). Used to detect "is this boundary nested inside another
 *  boundary" so we can drop the wrapper. */
function isStrictDescendant(
  child: readonly string[],
  parent: readonly string[],
): boolean {
  if (child.length <= parent.length) return false;
  for (let i = 0; i < parent.length; i++) {
    if (child[i] !== parent[i]) return false;
  }
  return true;
}
