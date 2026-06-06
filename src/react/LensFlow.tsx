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
 */

import React, { useMemo } from 'react';
import { Background, Controls, type NodeTypes } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  TracedFlow,
  type RuntimeOverlay as TraceRuntimeOverlay,
  type TraceGraph,
  type TraceFlowLayout,
} from 'footprint-explainable-ui/flowchart';

export interface LensFlowProps {
  /**
   * The build-time chart to render: the `TraceGraph` (from
   * `structureGraphFromRunner`), the layout algorithm that positions it, and the
   * node renderers. Node ids ARE the run's `runtimeStageId`s so the overlay lights
   * the executed path as the cursor scrubs.
   */
  readonly chart: {
    readonly graph: TraceGraph;
    readonly layout: TraceFlowLayout;
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
  /**
   * Explain-ui's authoritative runtime overlay (`lensRecorder.runtime.getOverlay()`).
   * `<TracedFlow>` slices it at `scrubIndex` and injects active/done/error state
   * into every chart node's `data`.
   */
  readonly traceRuntimeOverlay?: TraceRuntimeOverlay;
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
}) => {
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

  return (
    <TracedFlow
      graph={chart.graph}
      layout={chart.layout}
      {...(traceRuntimeOverlay && { overlay: traceRuntimeOverlay })}
      {...(scrubIndex !== undefined && { scrubIndex })}
      {...(onNodeClick && { onNodeClick })}
      {...(coActiveStageIds && coActiveStageIds.size > 0 && { coActiveStageIds })}
      {...(mergedNodeTypes && { nodeTypes: mergedNodeTypes })}
    >
      {showBackground && <Background />}
      {showControls && <Controls />}
    </TracedFlow>
  );
};
