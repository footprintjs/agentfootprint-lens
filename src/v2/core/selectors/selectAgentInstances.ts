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

import type { StepGraph } from 'agentfootprint';
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
  const boundaries = graph.nodes.filter((n) => n.isPrimitiveBoundary === true);
  if (boundaries.length === 0) {
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
  return boundaries.map((b) => ({
    groupId: `agent-group-${b.id}`,
    llmId: `stage-llm-${b.id}`,
    toolId: `stage-tool-${b.id}`,
    label: b.label,
    subflowPath: b.subflowPath,
    ...(b.primitiveKind ? { primitiveKind: b.primitiveKind } : {}),
  }));
}
