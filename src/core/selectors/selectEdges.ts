/**
 * `selectEdges` — aggregate ReAct steps into per-actor-pair edges.
 *
 * Pattern: reduce visible steps into a Map<`source->target`, EdgeAgg>.
 *          Multiple traversals of the same hand-off (e.g., user→llm
 *          across two iterations) collapse to one line with a count.
 * Role:    Eliminates the "stack of N arrows between User and LLM"
 *          visual clutter. Matches v1's `StageFlow.edges` aggregation.
 */

import type { StepNode } from 'agentfootprint/observe';
import type { AgentInstance, EdgeAgg } from './types.js';

/**
 * Map a step to its actor-pair edge endpoints for a given agent
 * instance. Returns null for steps that don't lift to ReAct edges
 * (subflow / fork-branch / decision-branch — those render as nodes,
 * not edges).
 *
 * @internal used by `selectEdges`; exported for testing.
 */
export function stepToStageEndpoints(
  step: StepNode,
  agent: AgentInstance,
): {
  readonly source: string;
  readonly target: string;
  readonly sourceHandle?: string;
  readonly targetHandle?: string;
  readonly dashed: boolean;
} | null {
  // Named handles (see nodes/*.tsx) drive precise arrow routing:
  //   - user.bottom-out  →  llm.top-in       (user message flows down)
  //   - llm.right-out    →  tool.left-in     (tool call goes right)
  //   - tool.bottom-out  →  llm.bottom-in    (tool result curves back under)
  //   - llm.top-out      →  user.bottom-in   (final answer goes up)
  switch (step.kind) {
    case 'user->llm':
      return {
        source: 'actor-user',
        target: agent.llmId,
        sourceHandle: 'user-out',
        targetHandle: 'llm-top-in',
        dashed: false,
      };
    case 'llm->tool':
      return {
        source: agent.llmId,
        target: agent.toolId,
        sourceHandle: 'llm-right-out',
        targetHandle: 'tool-left-in',
        dashed: false,
      };
    case 'tool->llm':
      // Dashed loop-back: tool result curves underneath from tool's
      // bottom to LLM's bottom — visually echoes "return to LLM."
      return {
        source: agent.toolId,
        target: agent.llmId,
        sourceHandle: 'tool-bottom-out',
        targetHandle: 'llm-bottom-in',
        dashed: true,
      };
    case 'llm->user':
      return {
        source: agent.llmId,
        target: 'actor-user',
        sourceHandle: 'llm-top-out',
        targetHandle: 'user-in',
        dashed: false,
      };
    default:
      return null;
  }
}

/**
 * Short, human-friendly label for a step's edge. Tokens for LLM steps,
 * tool name for tool steps, duration for timed steps, empty for
 * zero-duration markers.
 */
export function stepEdgeLabel(step: StepNode): string {
  if (step.tokens) return `${step.tokens.in}→${step.tokens.out} tok`;
  if (step.toolName) return step.toolName;
  const dur = step.endOffsetMs !== undefined ? step.endOffsetMs - step.startOffsetMs : 0;
  if (dur > 0) return dur < 1000 ? `${Math.round(dur)}ms` : `${(dur / 1000).toFixed(2)}s`;
  return '';
}

/**
 * Aggregate visible steps into one `EdgeAgg` per actor-pair.
 *
 * Invariants:
 *   - Every returned edge has `count >= 1`.
 *   - `mostRecentIdx` is the highest step index using this edge.
 *   - `label` reflects the most-recent step's label (falls back to
 *     any earlier non-empty one so edges aren't unlabeled in the
 *     rare case where a later step has nothing useful to show).
 */
export function selectEdges(
  visibleSteps: readonly StepNode[],
  agent: AgentInstance,
): EdgeAgg[] {
  const byKey = new Map<string, EdgeAgg>();
  visibleSteps.forEach((step, idx) => {
    const mapping = stepToStageEndpoints(step, agent);
    if (!mapping) return;
    const id = `${mapping.source}->${mapping.target}`;
    const label = stepEdgeLabel(step);
    const existing = byKey.get(id);
    if (existing) {
      (existing as { count: number }).count = existing.count + 1;
      (existing as { mostRecentIdx: number }).mostRecentIdx = idx;
      if (label) (existing as { label: string }).label = label;
    } else {
      byKey.set(id, {
        id,
        source: mapping.source,
        target: mapping.target,
        sourceHandle: mapping.sourceHandle,
        targetHandle: mapping.targetHandle,
        kind: step.kind,
        label,
        count: 1,
        mostRecentIdx: idx,
        dashed: mapping.dashed,
      });
    }
  });
  return [...byKey.values()];
}
