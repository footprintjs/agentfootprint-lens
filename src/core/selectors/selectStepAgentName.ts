/**
 * `selectStepAgentName` — pick the human-friendly agent name a step
 * "belongs to" in a multi-agent run.
 *
 * Pattern: walk the agent list, prefix-match the step's `subflowPath`,
 *          and return the deepest matching agent's label. Used to
 *          enrich step labels in multi-agent contexts so callers can
 *          render "user → classify" instead of generic "user → llm".
 *
 * Returns `undefined` for single-agent runs (caller falls back to the
 * step's own label) and for steps that don't lift to any agent (root
 * synthetic nodes, the User actor, etc.).
 */

import type { StepNode } from "agentfootprint";
import type { AgentInstance } from "./types.js";

/**
 * Strip `'step-'` prefix that Sequence stages get from the runtime
 * (so `'step-classify'` reads as `'classify'`). Matches the breadcrumb
 * convention in Lens.tsx and the `extractAgentName` humanizer
 * convention from agentfootprint v2.14.4.
 */
function cleanLabel(label: string): string {
  return label.replace(/^step-/, "");
}

/**
 * Find the agent whose `subflowPath` is the deepest prefix of the
 * step's `subflowPath`. Returns the cleaned label of that agent or
 * `undefined` when no agent matches (or only ONE agent exists, in
 * which case the caller already shows the agent in the container
 * header and prefixing every step would be redundant).
 */
export function selectStepAgentName(
  step: StepNode,
  agents: readonly AgentInstance[],
): string | undefined {
  if (agents.length < 2) return undefined;
  const stepPath = step.subflowPath ?? [];
  if (stepPath.length === 0) return undefined;

  let best: AgentInstance | undefined;
  let bestDepth = -1;
  for (const agent of agents) {
    const ap = agent.subflowPath;
    if (ap.length === 0) continue;
    if (!isPrefix(ap, stepPath)) continue;
    if (ap.length > bestDepth) {
      best = agent;
      bestDepth = ap.length;
    }
  }
  return best ? cleanLabel(best.label) : undefined;
}

function isPrefix(prefix: readonly string[], path: readonly string[]): boolean {
  if (prefix.length > path.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] !== path[i]) return false;
  }
  return true;
}
