/**
 * Lens type surface — re-exports the canonical agent-shaped types from
 * agentfootprint so Lens and any other UI consumer share one source of
 * truth.
 *
 * Why not define these in Lens:
 *
 *   The agent-shaped narrative (turns → iterations → tool calls +
 *   context injections + ledger) is the DATA CONTRACT, not a UI
 *   concept. Defining it in Lens would mean every other UI library
 *   (Grafana panels, CLI debuggers, replay viewers) re-implements the
 *   same translation from emit events. Mirrors how footprintjs owns
 *   `NarrativeEntry` and every shell consumes it.
 *
 *   Lens only adds UI-leaning types that don't belong in the data
 *   library:
 *     • `LensSkill` — UI skill detail card with raw-JSON escape hatch
 *     • `AgentTimeline` — extends the agentfootprint base with an
 *       optional `rawSnapshot` field the snapshot-import adapter uses
 */

import type {
  AgentMessage,
  AgentToolInvocation,
  AgentTurn,
  AgentInfo,
  SubAgentTimeline,
} from "agentfootprint";

export type {
  AgentMessage,
  AgentToolCallStub,
  AgentToolInvocation,
  AgentContextInjection,
  AgentContextLedger,
  AgentIteration,
  AgentTurn,
  AgentInfo,
  SubAgentTimeline,
} from "agentfootprint";

/**
 * Lens-flavored AgentTimeline — the bundled render shape Lens panels
 * consume. Composed from the recorder's selector surface (see
 * `timelineFromRecorder`). Not extended from agentfootprint (which now
 * exposes selectors, not a blob); Lens owns this shape because it is a
 * UI-layer concern — Vue / Angular / CLI consumers define their own
 * bundles off the same selectors.
 *
 * Adds `rawSnapshot` — escape hatch used by `fromAgentSnapshot` for the
 * snapshot-import path. Live-recorder path leaves it undefined.
 */
export interface AgentTimeline {
  readonly agent: AgentInfo;
  readonly turns: readonly AgentTurn[];
  readonly messages: readonly AgentMessage[];
  readonly tools: readonly AgentToolInvocation[];
  readonly finalDecision: Record<string, unknown>;
  readonly subAgents: readonly SubAgentTimeline[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly rawSnapshot?: any;
}

/**
 * A skill as it reaches Lens. Consumers pass these in from their
 * SkillRegistry (or wherever they build skills). Only `id` is
 * required — everything else is best-effort, and extra fields pass
 * through via the index signature so the raw-JSON view is useful for
 * debugging even when skills carry custom metadata.
 *
 * Lens-only (no agentfootprint equivalent) because "a skill with a
 * raw-JSON debug view" is specifically a UI concern.
 */
export interface LensSkill {
  readonly id: string;
  readonly title?: string;
  readonly description?: string;
  readonly version?: string;
  readonly scope?: readonly string[];
  /** Tool ids surfaced by this skill (if it uses autoActivate-style gating). */
  readonly tools?: readonly string[];
  /** Markdown body — the text delivered to the LLM on read_skill. */
  readonly body?: string;
  /** Everything else on the skill object passes through for raw-JSON view. */
  readonly [key: string]: unknown;
}
