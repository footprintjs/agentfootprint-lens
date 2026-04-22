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

export type {
  AgentMessage,
  AgentToolCallStub,
  AgentToolInvocation,
  AgentContextInjection,
  AgentContextLedger,
  AgentIteration,
  AgentTurn,
} from "agentfootprint";

import type { AgentTimeline as AgentTimelineBase } from "agentfootprint";

/**
 * Lens-flavored AgentTimeline. Adds the optional `rawSnapshot` escape
 * hatch used by the snapshot-import adapter (`fromAgentSnapshot`) —
 * consumers who already have a runtime snapshot pass it through for
 * advanced panels (custom extensions reading `sharedState` directly).
 * The live-recorder path leaves this undefined; no cost when unused.
 */
export interface AgentTimeline extends AgentTimelineBase {
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
