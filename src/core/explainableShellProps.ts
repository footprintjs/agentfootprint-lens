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

/**
 * Assemble the full, typed `<ExplainableShell>` input bundle from a finished
 * (or paused) run. Call AFTER `recorder.observe(runner)` + `runner.run(...)`,
 * so the runtime overlay has been captured.
 */
export function explainableShellPropsFromRunner(
  agent: Agent,
  recorder: LensRecorder,
  opts?: {
    /**
     * Apply the agent-vocabulary decoration (hero/plumbing emphasis, the 3
     * context slots as pills, role icons). Default `false`: the ExplainableShell
     * Trace is the FOOTPRINTJS-LEVEL view — plain stages/subflows lit purely by
     * the runtime overlay (visited + current). The agent-semantic (decorated)
     * rendering is `<Lens>`'s job, not the shell's. Pass `true` only if you
     * deliberately want the agent decoration inside the shell.
     */
    decorate?: boolean;
  },
): ExplainableShellInputs {
  return {
    runtimeSnapshot: agent.getLastSnapshot() ?? null,
    narrativeEntries: [...agent.getLastNarrativeEntries()],
    traceGraph: structureGraphFromRunner(agent, { decorate: opts?.decorate ?? false }),
    runtimeOverlay: recorder.runtime.getOverlay(),
  };
}
