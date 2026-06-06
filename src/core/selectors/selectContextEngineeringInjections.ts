/**
 * `selectContextEngineeringInjections` — filter injections to the
 * ENGINEERED set (exclude baseline user + tool-result).
 *
 * Pattern: pure function over a step's injections. Applies the stable
 *          `BASELINE_SOURCES` filter: `user` and `tool-result` are the
 *          standard LLM-API flow and don't constitute "context
 *          engineering." Everything else (`rag`, `skill`, `memory`,
 *          `instruction`, `grounding`, consumer-custom) is engineered.
 * Role:    The teaching surface for Lens's Context Engineering bin.
 *          Matches the filter that `agent.enable.contextEngineering()`
 *          will apply once that API lands — consumers get identical
 *          results whether they derive client-side via this selector
 *          or subscribe to the enable handle.
 *
 * Why the filter lives here (selector) AND in agentfootprint (enable
 * handle) when that lands:
 *   - Today's Lens consumes `StepNode.injections[]` directly; the
 *     selector is the only place to drop baseline.
 *   - Tomorrow, `enable.contextEngineering({ onInjection })` gives
 *     non-Lens consumers a pre-filtered stream — they don't need the
 *     selector at all.
 *   - The filter rule is the SAME (stable set of baseline sources),
 *     so the two paths produce identical output. Documenting once
 *     here keeps them in sync.
 */

import type { ContextInjection } from 'agentfootprint';

/**
 * Sources that represent baseline LLM-API flow — NOT context engineering:
 *
 *   - `user`        → the user's current-turn message OR prior user-turn
 *                     history replay (standard conversation flow)
 *   - `tool-result` → tool return for the current call OR prior-turn
 *                     tool-result history replay
 *   - `assistant`   → prior-turn assistant output replayed as history
 *                     (standard conversation continuity)
 *   - `base`        → static system prompt configured at build time
 *                     via `.system('...')` — NOT engineered
 *   - `registry`    → tool registry configured at build time via
 *                     `.tool(...)` — the static tool list
 *
 * What's left — the ENGINEERED sources (chips in the Lens bin):
 *   `rag` · `skill` · `memory` · `instruction` · `grounding` +
 *   consumer-custom sources
 *
 * Contract for library extensions: if you re-inject content with
 * engineered intent (memory strategy, RAG retriever, skill activator,
 * instruction system, grounding rule), you MUST set your own source
 * at the injection site — don't let role-based inference drop you
 * into the baseline bucket.
 */
export const BASELINE_SOURCES: ReadonlySet<string> = new Set([
  'user',
  'tool-result',
  'assistant',
  'base',
  'registry',
]);

/**
 * True when this injection represents engineered context (not baseline
 * API flow). Reads the immutable `source` field — no derivation from
 * role or slot.
 */
export function isContextEngineering(inj: ContextInjection): boolean {
  return !BASELINE_SOURCES.has(inj.source);
}

/**
 * Filter a step's injections to the engineered subset. Returns a new
 * readonly array; empty if the step had only baseline injections.
 *
 * Use: Lens's ContextBinNode gets this array; empty → "No engineered
 * context yet" empty state. Full → the 5-axis teaching chips.
 */
export function selectContextEngineeringInjections(
  injections: readonly ContextInjection[] | undefined,
): readonly ContextInjection[] {
  if (!injections || injections.length === 0) return [];
  return injections.filter(isContextEngineering);
}
