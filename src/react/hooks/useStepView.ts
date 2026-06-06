/**
 * useStepView — wires core selectors to React's render cycle.
 *
 * Pattern: memoized call to `selectStepView` — runs fresh on every
 *          change of its inputs, stable reference otherwise. Works
 *          under React 18 concurrent rendering because the selector
 *          is pure (no side effects, no external mutation).
 * Role:    The one hook components call to get the ViewModel. All
 *          upstream derivation (agents / touched / edges / focus
 *          detail) flows through here.
 *
 * Consumers:
 *
 *     const view = useStepView(graph, log, focus, drillPath);
 *     return <RunTreeFlow view={view} />;
 *
 * Zero framework-specific code inside; just a `useMemo` wrapper over
 * the shared selector. Bindings for Vue / Angular write the
 * equivalent `computed` / `Observable` wrappers the same way.
 */

import { useMemo } from 'react';
import type { StepGraph } from 'agentfootprint/observe';
import { selectStepView, type StepView } from '../../core/selectors/index.js';
import type { EventLogEntry } from '../../core/types.js';

/**
 * Derive the ViewModel for the Lens flowchart from its four inputs.
 *
 * Inputs:
 *   - `graph`      → full StepGraph from `runner.enable.flowchart()`
 *   - `log`        → full EventLog from `LensRecorder.selectEventLog()`
 *   - `focusIndex` → current scrub position; `max` = graph.nodes.length - 1
 *   - `drillPath`  → drill-down state; `[]` = top-level
 *
 * Output: `StepView` — everything a renderer needs in one object.
 */
export function useStepView(
  graph: StepGraph,
  log: readonly EventLogEntry[],
  focusIndex: number,
  drillPath: readonly string[],
): StepView {
  return useMemo(
    () => selectStepView({ graph, log, focusIndex, drillPath }),
    [graph, log, focusIndex, drillPath],
  );
}
