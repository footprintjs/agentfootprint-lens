/**
 * LensFlow — the canonical Lens chart renderer.
 *
 *   <LensFlow chart={{ graph, layout, nodeTypes }} selectedRuntimeStageId={cursorStageId} />
 *
 * Renders a consumer-supplied build-time chart (from `structureGraphFromRunner`)
 * through explainable-ui's `<TracedFlow>`. The chart's node ids ARE the run's
 * `runtimeStageId`s, so the runtime overlay lights the executed path as the
 * cursor scrubs; `coActiveStageIds` lights a whole parallel cohort at one cursor
 * (the context slots, or the branches of a parallel fork). Lens owns the shell
 * (slider / commentary / details); this file owns only the chart canvas.
 *
 * One graph path: the consumer builds the chart with `structureGraphFromRunner`
 * (real runtime-stage ids + hero/plumbing emphasis) and supplies it via `chart`.
 * The older lens-card collapser (lensCollapser / collapserFromRunner) was removed
 * — there is exactly one runner→graph path now.
 *
 * TWO GRANULARITIES, ONE CHART (0.36). A chart is scrubbed by either ruler: the
 * per-commit one (⛓ Flow Lens — every step is a stop) or the grouped one
 * (🔍 Why Lens — every boundary is a stop). `granularity` is the word an embedder
 * already uses for that difference, so it is the word this component takes. On
 * `'group'` — and only there — the active group is drawn as a PLACE: its members
 * light with one uniform accent, everything else recedes uniformly, and a named
 * boundary is drawn around them. `'step'` (the default) renders exactly as it
 * always has.
 */

import React, { useMemo } from 'react';
import { Background, Controls, type NodeTypes } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  StageNode,
  TracedFlow,
  type RuntimeOverlay as TraceRuntimeOverlay,
  type TraceGraph,
  type TraceFlowLayout,
} from 'footprint-explainable-ui/flowchart';
import type { ChartGroupHighlight } from '../core/group/activeChartGroup.js';
import { ChartGroupContext } from './group/ChartGroupContext.js';
import { GroupBoundary } from './group/GroupBoundary.js';
import { withGroupEmphasisAll } from './group/groupEmphasis.js';
import { ensureLensStyles } from './lensStyles.js';

export interface LensFlowProps {
  /**
   * The build-time chart to render: the `TraceGraph` (from
   * `structureGraphFromRunner`), the layout algorithm that positions it, and the
   * node renderers. Node ids ARE the run's `runtimeStageId`s so the overlay lights
   * the executed path as the cursor scrubs.
   */
  readonly chart: {
    readonly graph: TraceGraph;
    /**
     * OPTIONAL layout override. Omit it (the norm) to use TracedFlow's built-in
     * measure-then-layout pipeline — content-exact sizing + fork-centering +
     * straight spines. Pass the RAW `dagreTraceLayout` ONLY to deliberately
     * bypass that pipeline; doing so silently forfeits every layout improvement
     * eui ships (this is exactly what once made the lens render stale).
     */
    readonly layout?: TraceFlowLayout;
    readonly nodeTypes?: NodeTypes;
  };
  /**
   * Consumer node renderer overrides, merged ON TOP of `chart.nodeTypes`
   * (consumer keys win). Use to swap a renderer or add types your graph emits.
   */
  readonly nodeTypes?: NodeTypes;
  /**
   * Slider cursor's `runtimeStageId` (format `[subflowPath/]stageId#index`).
   * Resolved to a scrubIndex into the overlay's executionOrder.
   */
  readonly selectedRuntimeStageId?: string;
  /**
   * Slider cursor's `kind` — distinguishes Run · start from Run · end (both share
   * the root `runtimeStageId`): at `group-start` nothing is done yet; at
   * `group-end` everything is done.
   */
  readonly selectedCursorKind?: 'group-start' | 'group-end' | 'commit' | 'user-in' | 'user-out' | 'parallel';
  /** Fired when the user clicks a chart node, with that node's id. */
  readonly onNodeClick?: (nodeId: string) => void;
  /** Whether to render `<Controls>` (zoom / fit-view). Default `true`. */
  readonly showControls?: boolean;
  /** Whether to render `<Background>` (dot pattern). Default `true`. */
  readonly showBackground?: boolean;
  /**
   * Chart node ids to light as active SIMULTANEOUSLY at the current cursor — the
   * concurrent branches of a parallel fork (context slots, or parallel agent
   * branches). Resolved by `<Lens>` from the cursor position's `coActiveGroupIds`
   * (strip `#index`). The single canonical cursor still governs the panels.
   */
  readonly coActiveStageIds?: ReadonlySet<string>;
  /** Dependency-cone overlay (chart node id → BFS depth) — pass-through to
   *  `<TracedFlow>`: members re-light staggered by depth, non-members dim.
   *  Fed by `<WhereFrom>`'s active slice via the engineer view. */
  readonly sliceCone?: ReadonlyMap<string, number>;
  /**
   * Explain-ui's authoritative runtime overlay (`lensRecorder.runtime.getOverlay()`).
   * `<TracedFlow>` slices it at `scrubIndex` and injects active/done/error state
   * into every chart node's `data`.
   */
  readonly traceRuntimeOverlay?: TraceRuntimeOverlay;
  /**
   * Node colours forwarded to `<TracedFlow>`: `done` (visited), `active`
   * (current), `default` (ground / unvisited). Set by `<Lens theme={…}>`.
   */
  readonly colors?: { default?: string; done?: string; active?: string; error?: string; loop?: string };
  /**
   * Which RULER is scrubbing this chart — the same word an embedder already uses
   * to tell its two lenses apart.
   *
   *   `'step'`  (default) — one stop per commit. Rendering is untouched: the
   *                         overlay's single active node, hero emphasis and all.
   *   `'group'`           — one stop per boundary. With `activeGroup` supplied,
   *                         the chart paints the group as a unit (see below).
   *
   * Passing `'group'` without an `activeGroup` renders as `'step'` — a mode with
   * nothing to draw draws nothing.
   */
  readonly granularity?: 'step' | 'group';
  /**
   * The group the cursor is standing in, from `useChartGroup(recorder, commitIdx)`
   * (or the pure `activeChartGroup(...)` for non-React shells). Used only when
   * `granularity` is `'group'`, where it produces three things:
   *
   *   1. every member node lit with ONE accent — same tint, same intensity for
   *      an LLM, a tool and a context pill alike (type stays in icon + shape);
   *   2. every non-member dimmed uniformly;
   *   3. a soft, named boundary drawn around the members' real measured box.
   *
   * The name on that boundary is `groupDisplayName` — the same spelling the
   * WHAT HAPPENED boundary rail uses, never a second one.
   */
  readonly activeGroup?: ChartGroupHighlight;
}

export const LensFlow: React.FC<LensFlowProps> = ({
  chart,
  nodeTypes,
  selectedRuntimeStageId,
  selectedCursorKind,
  onNodeClick,
  showControls = true,
  showBackground = true,
  traceRuntimeOverlay,
  coActiveStageIds,
  sliceCone,
  colors,
  granularity = 'step',
  activeGroup,
}) => {
  // The group-mode classes are painted from Lens's own stylesheet, which injects
  // itself on first render of a component that needs it.
  ensureLensStyles();
  // Group mode is on only when there is a group to draw. `'group'` with nothing
  // active (the cursor sits at a commit no boundary encloses) renders as step.
  const group = granularity === 'group' && activeGroup && activeGroup.memberNodeIds.size > 0
    ? activeGroup
    : undefined;
  const groupMode = group !== undefined;

  // Map the cursor's runtimeStageId → scrubIndex into the overlay's executionOrder.
  // TracedFlow uses this to compute the active/done slice it injects per node.
  //
  // Root cursors (__root__#0) aren't stages in the overlay:
  //   • group-start → -1 → NOTHING done yet (Run · start).
  //   • group-end   → executionOrder.length-1 → ALL done (Run · end).
  //   • non-root    → look up the matching stage in executionOrder.
  const scrubIndex = useMemo<number | undefined>(() => {
    if (!selectedRuntimeStageId || !traceRuntimeOverlay) return undefined;
    if (selectedRuntimeStageId.startsWith('__root__')) {
      if (selectedCursorKind === 'group-start') return -1;
      if (selectedCursorKind === 'group-end') {
        return Math.max(0, traceRuntimeOverlay.executionOrder.length - 1);
      }
      return undefined;
    }
    const idx = traceRuntimeOverlay.executionOrder.findIndex(
      (s) => s.runtimeStageId === selectedRuntimeStageId,
    );
    return idx >= 0 ? idx : undefined;
  }, [selectedRuntimeStageId, selectedCursorKind, traceRuntimeOverlay]);

  // Merge consumer overrides on top of the chart's own node renderers. xyflow
  // treats nodeTypes as identity-keyed, so memoize to avoid remount churn.
  const mergedNodeTypes = useMemo<NodeTypes | undefined>(
    () => (nodeTypes ? { ...(chart.nodeTypes ?? {}), ...nodeTypes } : chart.nodeTypes),
    [nodeTypes, chart.nodeTypes],
  );

  // In group mode every renderer is wrapped so member/non-member emphasis is
  // uniform — including eui's built-in `stageNode`, which a chart gets for free
  // and which is exactly the renderer that carries the hero styling. Memoised on
  // the MAP and the MODE only: membership rides the context, so scrubbing from
  // group to group re-renders nodes without remounting a single one.
  const effectiveNodeTypes = useMemo<NodeTypes | undefined>(
    () => (groupMode ? withGroupEmphasisAll(mergedNodeTypes, StageNode) : mergedNodeTypes),
    [mergedNodeTypes, groupMode],
  );

  return (
    <ChartGroupContext.Provider value={group}>
      <TracedFlow
        graph={chart.graph}
        {...(chart.layout && { layout: chart.layout })}
        {...(traceRuntimeOverlay && { overlay: traceRuntimeOverlay })}
        {...(scrubIndex !== undefined && { scrubIndex })}
        {...(onNodeClick && { onNodeClick })}
        {...(coActiveStageIds && coActiveStageIds.size > 0 && { coActiveStageIds })}
        {...(sliceCone && sliceCone.size > 0 && { sliceCone })}
        {...(effectiveNodeTypes && { nodeTypes: effectiveNodeTypes })}
        {...(colors && { colors })}
      >
        {showBackground && <Background />}
        {showControls && <Controls />}
        {/* The drawn place. Inside <TracedFlow> so it lives in the chart's own
            viewport (pans + zooms with the nodes it encloses). */}
        {group && <GroupBoundary group={group} />}
      </TracedFlow>
    </ChartGroupContext.Provider>
  );
};
