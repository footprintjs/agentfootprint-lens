/**
 * `selectHops` — derive the ordered list of LOGICAL ARROWS for a run.
 *
 * Pattern: pure function over (graph, drillPath, agents). Returns one
 *          `Hop` per visible flowchart arrow — so `hops.length` is the
 *          slider step count, and the slider's i-th position highlights
 *          the i-th arrow. "step = arrow" is the user-facing mental
 *          model; this selector is the single source of truth for it.
 *
 * Why this lives in the lens-core (not agentfootprint): the LIBRARY
 * already exposes the right primitives (`StepNode.subflowPath`,
 * `isPrimitiveBoundary`, kind tags). Lens just walks them and labels
 * the transitions. Adding a domain-aware concept ("Hop") to the engine
 * would over-couple it to UI rendering. The selector is a thin
 * derivation, not new state.
 *
 * Two modes — driven by the SAME primitive (subflow boundaries):
 *
 *   ── Multi-agent top-level ──
 *   Drill path empty AND >1 primitive boundary. Hops are the
 *   AGENT-CHAIN arrows: User → agent[0], agent[i] → agent[i+1],
 *   agent[N-1] → User. Slider walks `agents.length + 1` positions.
 *
 *   ── Single-agent OR drilled-in ──
 *   The visible steps inside the active agent (filtered by
 *   subflowPath) are themselves the hops — each `user->llm`,
 *   `llm->tool`, `tool->llm`, `llm->user` step IS one arrow.
 *   Sub-flow / fork-branch / decision-branch nodes are NOT hops
 *   (they're container nodes, not arrows).
 *
 * The two modes are NOT special cases; they're the same rule applied
 * at different scopes — at top-level, the "agents" themselves are the
 * unit of traversal; drilled in, the ReAct steps inside one agent are.
 */

import type { StepGraph, StepNode } from 'agentfootprint';
import type { ActorId, AgentInstance } from './types.js';

/**
 * One arrow on the flowchart = one slider position. Each Hop carries:
 *
 *   - `id`              — stable key (slider index, edge React key)
 *   - `kind`            — what kind of transition this is
 *   - `source`/`target` — actor or agent IDs (matches flowchart node ids)
 *   - `label`           — short edge label (asks / forwards / answers / token count / tool name)
 *   - `anchorStep`      — the StepNode the slider should focus when this hop is active
 *
 * Hops are ordered: index 0 is the first arrow drawn in the run.
 */
export interface Hop {
  readonly id: string;
  readonly kind:
    | 'asks' // User → first agent (multi-agent top-level)
    | 'forwards' // agent[i] → agent[i+1] (multi-agent top-level)
    | 'answers' // last agent → User (multi-agent top-level)
    | StepNode['kind']; // user->llm / llm->tool / tool->llm / llm->user / fork-branch / decision-branch
  readonly source: string;
  readonly target: string;
  readonly label: string;
  /** The StepNode the slider focuses when this hop is the active one.
   *  `undefined` for synthetic hops that don't anchor to a single step
   *  (e.g., a top-level "User asks classify" hop anchors on classify's
   *  boundary, not on a specific internal step). */
  readonly anchorStep?: StepNode;
}

export interface SelectHopsArgs {
  readonly graph: StepGraph;
  readonly drillPath: readonly string[];
  readonly agents: readonly AgentInstance[];
}

const ACTOR_USER = 'actor-user';

const STEP_KINDS_THAT_LIFT_TO_ARROWS: ReadonlySet<StepNode['kind']> = new Set<
  StepNode['kind']
>(['user->llm', 'llm->tool', 'tool->llm', 'llm->user']);

export function selectHops(args: SelectHopsArgs): Hop[] {
  const { graph, drillPath, agents } = args;

  // Multi-agent top-level → AGENT-CHAIN hops. Same rule as the
  // flowchart drawing: User asks the first agent, each agent forwards
  // to the next, last agent answers the User.
  const isMultiAgentTopLevel = drillPath.length === 0 && agents.length > 1;
  if (isMultiAgentTopLevel) {
    return chainHops(agents, graph);
  }

  // Single-agent OR drilled-in → STEP hops. Filter graph nodes to the
  // active agent's scope, keep only those whose `kind` IS itself a
  // visible arrow direction (user->llm / llm->tool / etc.). Subflow
  // boundary entries / fork-branch / decision-branch nodes are skipped
  // because they render as nodes on the flowchart, not arrows.
  const activeAgent =
    drillPath.length > 0
      ? (agents.find((a) => a.subflowPath.join('/') === drillPath.join('/')) ??
        agents[0])
      : agents[0];
  if (!activeAgent) return [];

  const scoped =
    drillPath.length > 0
      ? graph.nodes.filter((n) => startsWith(n.subflowPath, drillPath))
      : graph.nodes;

  return scoped
    .filter((n) => STEP_KINDS_THAT_LIFT_TO_ARROWS.has(n.kind))
    .map((step, idx) => stepToHop(step, idx, activeAgent));
}

// ─── Helpers ────────────────────────────────────────────────────────

function chainHops(
  agents: readonly AgentInstance[],
  graph: StepGraph,
): Hop[] {
  const out: Hop[] = [];
  const firstAgent = agents[0];
  const lastAgent = agents[agents.length - 1];

  out.push({
    id: 'hop-asks',
    kind: 'asks',
    source: ACTOR_USER,
    target: agentNodeId(firstAgent),
    label: 'asks',
    ...(firstAgentAnchor(firstAgent, graph)
      ? { anchorStep: firstAgentAnchor(firstAgent, graph)! }
      : {}),
  });

  for (let i = 0; i < agents.length - 1; i++) {
    const from = agents[i];
    const to = agents[i + 1];
    const anchor = firstAgentAnchor(to, graph);
    out.push({
      id: `hop-forwards-${i}`,
      kind: 'forwards',
      source: agentNodeId(from),
      target: agentNodeId(to),
      label: 'forwards',
      ...(anchor ? { anchorStep: anchor } : {}),
    });
  }

  const finalAnchor = lastAgentFinalAnchor(lastAgent, graph);
  out.push({
    id: 'hop-answers',
    kind: 'answers',
    source: agentNodeId(lastAgent),
    target: ACTOR_USER,
    label: 'answers',
    ...(finalAnchor ? { anchorStep: finalAnchor } : {}),
  });

  return out;
}

function agentNodeId(agent: AgentInstance): string {
  return `agent-card-${agent.groupId.replace(/^agent-group-/, '')}`;
}

/** Earliest step inside the agent's subflow — the arrow ENDS at this. */
function firstAgentAnchor(
  agent: AgentInstance,
  graph: StepGraph,
): StepNode | undefined {
  if (agent.subflowPath.length === 0) return graph.nodes[0];
  for (const n of graph.nodes) {
    if (startsWith(n.subflowPath, agent.subflowPath)) {
      // Skip the boundary node itself; prefer the first ReAct step.
      if (STEP_KINDS_THAT_LIFT_TO_ARROWS.has(n.kind)) return n;
    }
  }
  // Fall back to the boundary node if no ReAct step is present yet.
  return graph.nodes.find(
    (n) => n.kind === 'subflow' && joinPath(n.subflowPath) === joinPath(agent.subflowPath),
  );
}

/** Last `llm->user` step inside the agent's subflow — final answer. */
function lastAgentFinalAnchor(
  agent: AgentInstance,
  graph: StepGraph,
): StepNode | undefined {
  if (agent.subflowPath.length === 0) {
    return [...graph.nodes].reverse().find((n) => n.kind === 'llm->user');
  }
  let last: StepNode | undefined;
  for (const n of graph.nodes) {
    if (!startsWith(n.subflowPath, agent.subflowPath)) continue;
    if (n.kind === 'llm->user') last = n;
  }
  return last;
}

/**
 * Map a per-step ReAct node to a Hop. Source/target endpoints match
 * the flowchart node IDs `selectEdges` uses (actor-user, stage-llm-*,
 * stage-tool-*) so the same arrows can be highlighted by `view.activeEdgeKey`.
 */
function stepToHop(step: StepNode, index: number, agent: AgentInstance): Hop {
  const { source, target } = stepEndpoints(step.kind, agent);
  return {
    id: `hop-step-${index}-${step.id}`,
    kind: step.kind,
    source,
    target,
    label: step.label ?? step.kind,
    anchorStep: step,
  };
}

function stepEndpoints(
  kind: StepNode['kind'],
  agent: AgentInstance,
): { source: string; target: string } {
  switch (kind) {
    case 'user->llm':
      return { source: ACTOR_USER, target: agent.llmId };
    case 'llm->tool':
      return { source: agent.llmId, target: agent.toolId };
    case 'tool->llm':
      return { source: agent.toolId, target: agent.llmId };
    case 'llm->user':
      return { source: agent.llmId, target: ACTOR_USER };
    default:
      return { source: agent.groupId, target: agent.groupId };
  }
}

function startsWith(
  path: readonly string[],
  prefix: readonly string[],
): boolean {
  if (path.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (path[i] !== prefix[i]) return false;
  }
  return true;
}

function joinPath(p: readonly string[]): string {
  return p.join('/');
}

// Touch the union member so tree-shaking keeps it.
const _actorIds: ActorId[] = ['user', 'llm', 'tool', 'skill'];
void _actorIds;
