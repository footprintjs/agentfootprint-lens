/**
 * explainableShellPropsFromRunner — the ONE typed call a consumer makes to
 * drive eui's `<ExplainableShell>` from an agentfootprint `Runner` + a
 * `LensRecorder`.
 *
 * WHY this exists: consumers used to hand-wire FIVE values from five lib
 * accessors into `<ExplainableShell>` — and because each was threaded through
 * an `any` (or an `as never` cast), the compiler protected none of them. That
 * is how a footprintjs `FlowChart` blob slipped into eui's `spec` prop (which
 * wants a `SpecNode`) and silently blanked the chart on subflow drill.
 *
 * Lens is the bridge that already owns BOTH vocabularies (agentfootprint
 * `Runner` and eui's prop/overlay types), so the contract is enforced HERE,
 * once. The consumer just spreads the result:
 *
 * ```tsx
 * const props = explainableShellPropsFromRunner(agent, recorder);
 * <ExplainableShell {...props} />
 * ```
 *
 * Note: NO `spec`. The chart renders from `traceGraph` + `runtimeOverlay`
 * (both eui-owned types). The legacy spec tree is not needed for rendering and
 * was the source of the silent-blank type mismatch — leaving it out means a
 * consumer using this helper cannot pass it wrong.
 */
import type { Agent } from 'agentfootprint';
import type { ExplainableShellProps } from 'footprint-explainable-ui';
import type { CombinedNarrativeEntry } from 'footprintjs';

import type { LensRecorder } from './LensRecorder.js';
import { structureGraphFromRunner } from './collapser/structureGraphFromRunner.js';

/**
 * The exact subset of `ExplainableShellProps` this helper provides. Spread it
 * into `<ExplainableShell {...props} />`. Pulled from eui's own prop type, so
 * if eui changes the contract this helper fails to typecheck — not the
 * consumer at runtime.
 */
export type ExplainableShellInputs = Pick<
  ExplainableShellProps,
  'runtimeSnapshot' | 'narrativeEntries' | 'traceGraph' | 'runtimeOverlay'
>;

/** One narrative entry in the vocabulary `<ExplainableShell>` declares.
 *  Derived from eui's own prop type — never re-typed here. */
type ShellNarrativeEntry = NonNullable<
  ExplainableShellInputs['narrativeEntries']
>[number];

/**
 * The entry types `<ExplainableShell>` knows how to render, as a runtime
 * lookup. Typed as a total `Record` over eui's union, so BOTH directions are
 * compiler-checked: drop a key (or eui adds one) and this fails to build.
 *
 * That trap is not decoration — it fired for real when eui learned `'retry'`,
 * with exactly the message it should have:
 *
 *   TS2741: Property 'retry' is missing ... but required in Record<... | "retry", true>
 *
 * It only fires if lens actually BUILDS against a current eui, which is why the
 * `footprint-explainable-ui` devDependency is a floor-and-major range rather
 * than a caret: a caret pinned lens to one eui minor, so eui widened its union
 * three releases running and this file never heard about it.
 *
 * footprintjs's own narrative vocabulary is still the SUPERSET and still grows
 * on its own cadence, so `toShellNarrativeEntries` keeps a fallback for the
 * NEXT type eui has not learned yet. `'retry'` is no longer that case — eui
 * renders it natively now, so it passes straight through.
 */
const SHELL_ENTRY_TYPES: Record<ShellNarrativeEntry['type'], true> = {
  stage: true,
  step: true,
  condition: true,
  fork: true,
  selector: true,
  subflow: true,
  loop: true,
  break: true,
  error: true,
  pause: true,
  resume: true,
  emit: true,
  // eui >= 0.32.0 renders retry with its own icon, label and warning-weight
  // colour. Listing it here IS the passthrough — there is no separate branch.
  retry: true,
};

/** Where an entry type eui does not know is rendered: the generic step line —
 *  a plain, indented sub-item at the entry's own depth, which is where
 *  footprintjs places its nested per-stage entries. The entry's own `text` is
 *  what shows, verbatim. This is the bridge for the NEXT variant footprintjs
 *  adds, not for any type in `SHELL_ENTRY_TYPES` above. */
const GENERIC_ENTRY_TYPE = 'step' satisfies ShellNarrativeEntry['type'];

function isShellEntryType(
  type: CombinedNarrativeEntry['type'],
): type is ShellNarrativeEntry['type'] {
  return Object.prototype.hasOwnProperty.call(SHELL_ENTRY_TYPES, type);
}

/**
 * Translate footprintjs narrative entries into the vocabulary
 * `<ExplainableShell>` declares. Entry types eui knows pass through untouched —
 * `'retry'` among them, as of eui 0.32.0, so the badge reads "retry" and the
 * line carries retry's own icon instead of a generic step dot.
 *
 * A type eui has NOT learned yet is still rendered as a generic step line
 * keeping its own text — displayed honestly, never dropped, and never silently
 * typed as something eui would style differently (a heading, an error). Folding
 * costs the badge its real name, which is why folding is the fallback and never
 * the destination: the fix for a folded type is always upstream, eui teaching
 * its union the new variant, exactly as it just did for retry.
 */
export function toShellNarrativeEntries(
  entries: readonly CombinedNarrativeEntry[],
): ShellNarrativeEntry[] {
  return entries.map((entry) => {
    const { type } = entry;
    return isShellEntryType(type)
      ? { ...entry, type }
      : { ...entry, type: GENERIC_ENTRY_TYPE };
  });
}

/**
 * Assemble the full, typed `<ExplainableShell>` input bundle from a finished
 * (or paused) run. Call AFTER `recorder.observe(runner)` + `runner.run(...)`,
 * so the runtime overlay has been captured.
 *
 * The `traceGraph` is ALWAYS the plain, undecorated view. This is not a knob:
 * `<ExplainableShell>` IS the footprintjs-level renderer — plain stages/subflows
 * lit purely by the runtime overlay (visited + current). The agent-semantic
 * (decorated) rendering is a DIFFERENT renderer, `<Lens>`, whose whole job is
 * the decorated view. Baking plain-vs-decorated into which renderer you pick —
 * rather than a hidden default on this helper — keeps the boundary enforceable:
 * the shell can never accidentally carry agent decoration.
 *
 * Escape hatch: if you deliberately want a decorated graph inside the shell,
 * build it explicitly with `structureGraphFromRunner(agent, { decorate: true })`
 * and pass it as `traceGraph` yourself — a visible, non-default choice.
 */
export function explainableShellPropsFromRunner(
  agent: Agent,
  recorder: LensRecorder,
): ExplainableShellInputs {
  return {
    runtimeSnapshot: agent.getLastSnapshot() ?? null,
    narrativeEntries: toShellNarrativeEntries(agent.getLastNarrativeEntries()),
    traceGraph: structureGraphFromRunner(agent, { decorate: false }),
    runtimeOverlay: recorder.runtime.getOverlay(),
  };
}
