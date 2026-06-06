/**
 * `selectStepView` — top-level ViewModel composer.
 *
 * Pattern: compose the smaller selectors into the `StepView` shape
 *          consumers render. Pure function over `(graph, log,
 *          focusIndex, drillPath)`.
 * Role:    The one function every Lens binding calls. React's
 *          `useStepView` hook wraps this in `useMemo`; Vue / Angular
 *          / CLI bindings call it directly.
 *
 * No framework imports. No caching inside the selector (React's
 * `useMemo` or equivalent handles per-render stability).
 */

import type { StepGraph, StepNode } from 'agentfootprint/observe';
import type { EventLogEntry } from '../types.js';
import type { BreadcrumbItem, StepView } from './types.js';
import { selectAgentInstances } from './selectAgentInstances.js';
import { selectEdges, stepToStageEndpoints } from './selectEdges.js';
import { selectFocusDetail } from './selectFocusDetail.js';
import { selectHops } from './selectHops.js';
import { selectTouched } from './selectTouched.js';

export interface SelectStepViewArgs {
  readonly graph: StepGraph;
  readonly log: readonly EventLogEntry[];
  /** Current focus position. Clamped to [0, graph.nodes.length - 1]. */
  readonly focusIndex: number;
  /** Drill stack. Empty = top-level; `['triage']` = drilled into triage agent. */
  readonly drillPath: readonly string[];
}

/**
 * Compose the ViewModel.
 *
 * Mode selection:
 *   - `drillPath.length === 0` → top-level view. All agents surface.
 *     For single-agent runs this is equivalent to the triangle.
 *   - `drillPath.length > 0` → drill-down. Filter steps to the agent
 *     whose subflowPath matches. Edges compute against that agent's
 *     stage ids.
 *
 * Invariants:
 *   - `totalSteps` always equals `graph.nodes.length` (not the visible
 *     count) so consumers size their slider to the WHOLE run.
 *   - `visibleSteps.length === focusIndex + 1` (or graph.nodes.length
 *     if focus is at max).
 *   - `touched` includes at least `user` (run begins with user msg).
 */
export function selectStepView(args: SelectStepViewArgs): StepView {
  const { graph, focusIndex, drillPath } = args;

  const agents = selectAgentInstances(graph);
  const mode: StepView['mode'] = drillPath.length === 0 ? 'top-level' : 'drill-down';

  // In drill-down mode, filter the visible steps to those inside the
  // drilled agent's subflow. In top-level mode, the full run.
  const agentForEdges = drillPath.length > 0
    ? (agents.find((a) => a.subflowPath.join('/') === drillPath.join('/')) ?? agents[0])
    : agents[0];

  // ── Hops are the SINGLE source of truth for the slider axis. ─
  // - `hops.length` is the slider total
  // - `focusIndex` is an index into `hops`
  // - `currentStep` is `hops[focusIndex].anchorStep`
  // - `visibleSteps` is the prefix of anchor StepNodes through `focusIndex`
  // - `activeEdgeKey` derives from `hops[focusIndex]` source/target
  //
  // This eliminates the previous off-by-one between slider position
  // (hop count = arrow count) and `currentStep` (which used to index
  // into the raw scoped node list and lagged by one step).
  const hops = selectHops({ graph, drillPath, agents });
  const totalHops = hops.length;
  const clampedFocus = Math.min(
    Math.max(0, focusIndex),
    Math.max(0, totalHops - 1),
  );

  const focusedHop = hops[clampedFocus];
  const currentStep = focusedHop?.anchorStep;

  // Visible steps = anchor steps for hops 0..clampedFocus. Skip hops
  // that have no anchor (synthetic chain hops with `undefined`
  // anchorStep — they don't appear in `visibleSteps` but still count
  // toward `totalSteps`).
  const visibleSteps: StepNode[] = [];
  for (let i = 0; i <= clampedFocus; i++) {
    const a = hops[i]?.anchorStep;
    if (a && !visibleSteps.includes(a)) visibleSteps.push(a);
  }

  const touched = selectTouched(visibleSteps);
  const edges = selectEdges(visibleSteps, agentForEdges);

  // Active edge — derived directly from the focused hop's source/target
  // (which already match the flowchart node IDs). For ReAct hops this
  // matches `stepToStageEndpoints`; for chain hops (asks/forwards/answers)
  // the source/target are agent-card IDs and the chart highlights those.
  const activeEdgeKey = focusedHop
    ? `${focusedHop.source}->${focusedHop.target}`
    : undefined;

  // Touch the selector so tree-shaking keeps it reachable — consumers
  // will pull focus detail separately via `selectFocusDetail`, which
  // isn't part of StepView itself (it would grow the ViewModel for a
  // detail most views don't render).
  void selectFocusDetail;
  void stepToStageEndpoints;

  return {
    mode,
    agents: drillPath.length > 0 ? [agentForEdges] : agents,
    visibleSteps,
    touched,
    edges,
    ...(activeEdgeKey ? { activeEdgeKey } : {}),
    ...(currentStep ? { currentStep } : {}),
    totalSteps: totalHops,
    breadcrumb: buildBreadcrumb(drillPath, agents),
    graph,
    hops,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

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

function buildBreadcrumb(
  drillPath: readonly string[],
  agents: readonly { readonly subflowPath: readonly string[]; readonly label: string }[],
): BreadcrumbItem[] {
  const out: BreadcrumbItem[] = [{ id: '', label: 'Run' }];
  for (let i = 0; i < drillPath.length; i++) {
    const partial = drillPath.slice(0, i + 1);
    const key = partial.join('/');
    const match = agents.find((a) => a.subflowPath.join('/') === key);
    out.push({ id: key, label: match?.label ?? key });
  }
  return out;
}

// Dummy adapter to keep `focusDetail` import-live for consumers that
// call `selectFocusDetail(view.currentStep, log)` separately.
type FocusDetailAdapter = ReturnType<typeof selectFocusDetail>;
