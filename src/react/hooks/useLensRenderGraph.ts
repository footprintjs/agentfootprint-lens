/**
 * useLensRenderGraph — React hook that turns an agentfootprint Runner
 * into a laid-out xyflow graph (`Node[]` + `Edge[]`).
 *
 * Layer 3.3 (React adapter) / Lens v0.1 translator pipeline.
 *
 * What it does
 * ────────────
 *
 *   Runner
 *     │ runner.getUIGroupWith(lensGroupTranslator)
 *     ▼
 *   LensGroupOutput
 *     │ layoutLensGraph (toReactFlow + defaultSize + dagre)
 *     ▼
 *   { nodes: Node[], edges: Edge[] }   (ready to drop into <ReactFlow>)
 *
 * Why a hook and not a useEffect/useState dance
 * ─────────────────────────────────────────────
 *   `runner.getUIGroup()` is memoised by the runner (see
 *   `agentfootprint/src/core/RunnerBase.ts:170` — uiGroupCache). The
 *   shape is build-time and stable across renders. We wrap the
 *   call in `useMemo` keyed on the runner identity so the laid-out
 *   graph is recomputed only when the runner reference changes —
 *   not on every render.
 *
 *   No useState, no useEffect, no subscription: build-time data is
 *   not reactive. Runtime updates (cursor position, step highlight,
 *   live status) belong to a SEPARATE hook that overlays the static
 *   graph — they don't reshape it.
 *
 * Error contract
 * ──────────────
 *   The hook throws (via the translator) when:
 *     - The runner does not expose a UI group shape
 *     - A nested member returns undefined from `getUIGroupWith`
 *     - A nested `member.uiGroup` is not a `LensGroupOutput`
 *
 *   Throws are loud — they make consumer wiring bugs visible at
 *   the first render. React's error boundary catches them; for
 *   v0.1 we expect every Lens-supported runner to translate
 *   cleanly so this is a development-time signal.
 */

import { useMemo } from 'react';
import type { Runner } from 'agentfootprint';
import { lensGroupTranslator } from '../../core/translate/lensGroupTranslator.js';
import type { LensGroupOutput } from '../../core/translate/types.js';
import {
  layoutLensGraph,
  type LayoutLensGraphOptions,
  type LayoutLensGraphResult,
} from '../../core/render/layoutLensGraph.js';

export type { LayoutLensGraphOptions, LayoutLensGraphResult };

/**
 * Like `LayoutLensGraphResult` but also surfaces the composition's
 * `rootNodeId`, which the React render layer needs to map engine-
 * level cursor positions (e.g., `seed#0`, `merge#21`) back to the
 * top-level chart node when no subflow path is present.
 */
export interface UseLensRenderGraphResult extends LayoutLensGraphResult {
  readonly rootNodeId: string;
}

export function useLensRenderGraph(
  runner: Runner,
  options: LayoutLensGraphOptions = {},
): UseLensRenderGraphResult {
  return useMemo(() => {
    const output =
      runner.getUIGroupWith<LensGroupOutput>(lensGroupTranslator);
    if (output === undefined) {
      throw new Error(
        'useLensRenderGraph: runner.getUIGroupWith(lensGroupTranslator) returned undefined. ' +
          'The runner does not expose a translatable UI group shape — verify the runner is one ' +
          'of agentfootprint\'s composition kinds (Parallel / Sequence / Loop / Conditional / Agent / LLMCall).',
      );
    }
    assertLensGroupOutput(output);
    const laidOut = layoutLensGraph(output, options);
    return { ...laidOut, rootNodeId: output.rootNodeId };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    runner,
    options.direction,
    options.rankSep,
    options.nodeSep,
    options.edgeSep,
    options.sizeOverride,
    options.withUserFrame,
  ]);
}

/**
 * Runtime shape guard. The generic call `getUIGroupWith<LensGroupOutput>`
 * is a TypeScript-level assertion only; this guard catches a
 * misbehaving custom translator at the boundary so layout crashes
 * become actionable errors. Cheap O(1) check — only the top-level
 * shape, not a deep walk.
 */
function assertLensGroupOutput(value: unknown): asserts value is LensGroupOutput {
  if (
    typeof value !== 'object' ||
    value === null ||
    !Array.isArray((value as { nodes?: unknown }).nodes) ||
    !Array.isArray((value as { edges?: unknown }).edges) ||
    typeof (value as { rootNodeId?: unknown }).rootNodeId !== 'string'
  ) {
    throw new TypeError(
      'useLensRenderGraph: runner.getUIGroupWith(lensGroupTranslator) returned a value ' +
        'that is not a LensGroupOutput { nodes, edges, rootNodeId }. A custom translator ' +
        'wired into one of the runner\'s inner compositions returned the wrong shape.',
    );
  }
}
