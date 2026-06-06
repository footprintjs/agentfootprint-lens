/**
 * ViewModel types — consumer-facing shapes produced by `lens/core/selectors/`.
 *
 * These are the SINGLE data contract between the headless selector
 * layer and every framework binding (React today, Vue / Angular / CLI
 * tomorrow). Selectors return these shapes; framework components
 * render them. No framework-specific fields leak here.
 */

import type { StepGraph, StepNode } from 'agentfootprint/observe';
import type { Hop } from './selectHops.js';

// ─── Actor identity ─────────────────────────────────────────────────

/**
 * The four actor roles a ReAct cycle surfaces to the user:
 *
 *   - `user`   — outside the Agent container; asks + receives answers
 *   - `llm`    — the LLM primitive inside an Agent
 *   - `tool`   — external execution bound to the Agent
 *   - `skill`  — activated capability that contributed to a slot
 *
 * Consumer renderers map these to their own node components. Adding
 * a new actor requires a type widening here + mapping in consumers.
 */
export type ActorId = 'user' | 'llm' | 'tool' | 'skill';

// ─── Agent grouping ─────────────────────────────────────────────────

/**
 * One agent boundary in the run. Single-agent runs produce ONE
 * `AgentInstance` (`groupId: 'agent-root'`); multi-agent runs
 * (Swarm / Debate / Hierarchy) produce one per sub-agent.
 *
 * `subflowPath` mirrors the footprintjs topology path — use it to
 * filter StepGraph steps that belong to this agent (drill-down mode).
 */
export interface AgentInstance {
  readonly groupId: string;
  readonly llmId: string;
  readonly toolId: string;
  readonly label: string;
  readonly subflowPath: readonly string[];
  /**
   * Primitive kind (`'Agent'` / `'LLMCall'` / `'Sequence'` / `'Parallel'`
   * / `'Conditional'` / `'Loop'`) parsed from the runner's root
   * `<Kind>:` taxonomy prefix. Drives the container subtitle in
   * `AgentGroupNode` so an LLMCall renders as `'LLMCall · one-shot'`,
   * a Sequence as `'Sequence · pipeline'`, etc. — instead of the
   * (legacy) hardcoded `'ReAct loop'`. Undefined when the StepGraph
   * carries no description metadata; the renderer falls back to a
   * neutral subtitle.
   */
  readonly primitiveKind?: string;
}

// ─── Edge aggregation ───────────────────────────────────────────────

/**
 * One AGGREGATED edge for the triangle view. Multiple steps between
 * the same two actors collapse to one edge with:
 *   - count of traversals
 *   - label from the most-recent step (tokens / tool name)
 *   - `kind` preserved from the driving step
 *
 * Eliminates the "four stacked arrows" problem for multi-iteration
 * runs. Rendered as one line per `(source, target)` pair.
 */
export interface EdgeAgg {
  readonly id: string; // `source->target`
  readonly source: string;
  readonly target: string;
  /** Named handle on source node (e.g. `llm-right-out`) for precise routing. */
  readonly sourceHandle?: string;
  /** Named handle on target node (e.g. `tool-left-in`) for precise routing. */
  readonly targetHandle?: string;
  readonly kind: StepNode['kind'];
  readonly label: string;
  readonly count: number;
  readonly mostRecentIdx: number; // index into the visible-steps array
  readonly dashed: boolean;
}

// ─── Focus-step detail (right-side debug pane) ──────────────────────

/**
 * Detail for the currently-focused step — what the right-side debug
 * pane renders. Pulled from the EventLog at selection time; no
 * caching, pure derivation.
 */
export interface FocusDetail {
  readonly stepId: string;
  readonly kind: StepNode['kind'];
  /**
   * LLM output text — for `user->llm` / `tool->llm` / `llm->user` steps.
   * Empty string `''` is a valid value (LLM returned no content, only
   * tool_calls). `undefined` means no matching `llm_end` event was
   * found in the log. Renderers should distinguish the two.
   */
  readonly llmReasoning?: string;
  /** Decision the LLM made — route picked, tool selected, or 'final'. */
  readonly llmDecision?: { readonly route: string; readonly rationale?: string };
  /** Tool call args — for `llm->tool` steps. */
  readonly toolArgs?: Record<string, unknown>;
  /** Tool result — for `llm->tool` steps (after tool_end fires). */
  readonly toolResult?: string;
  /** Token usage — for LLM steps. */
  readonly tokens?: { readonly in: number; readonly out: number };
}

// ─── Breadcrumb (drill-down UI) ─────────────────────────────────────

export interface BreadcrumbItem {
  readonly id: string; // empty string = root
  readonly label: string;
}

// ─── Top-level ViewModel ────────────────────────────────────────────

/**
 * Everything a renderer needs in ONE shape. `useStepView` (React hook)
 * or equivalent bindings in other frameworks produce this on every
 * render, passing it to dumb components.
 */
export interface StepView {
  /**
   * Rendering mode:
   *   - `top-level`  → each agent is a collapsed node; edges = handoffs
   *   - `drill-down` → one agent expanded; edges = internal ReAct cycle
   */
  readonly mode: 'top-level' | 'drill-down';
  readonly agents: readonly AgentInstance[];
  /** Steps up to focusIndex. `visibleSteps.length === focusIndex + 1`. */
  readonly visibleSteps: readonly StepNode[];
  /** Actors that have been touched by at least one visible step. */
  readonly touched: ReadonlySet<ActorId>;
  readonly edges: readonly EdgeAgg[];
  readonly activeEdgeKey?: string;
  readonly currentStep?: StepNode;
  readonly totalSteps: number;
  readonly breadcrumb: readonly BreadcrumbItem[];
  /** The full graph; consumers usually use `visibleSteps` instead. */
  readonly graph: StepGraph;
  /**
   * Logical arrows for THIS scope — one per slider position. Drives:
   *   - flowchart edge rendering (no inline edge synthesis)
   *   - slider total (`hops.length`)
   *   - focused-step lookup (`hops[focusStep].anchorStep`)
   *
   * Multi-agent top-level: `agents.length + 1` hops (asks + N-1
   * forwards + answers). Single-agent / drilled-in: one hop per
   * `user->llm` / `llm->tool` / `tool->llm` / `llm->user` step.
   */
  readonly hops: readonly Hop[];
}
