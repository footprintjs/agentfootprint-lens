/**
 * <Replay> — render a persisted agentfootprint `Trace` OFFLINE.
 *
 * No live runner, no recorder, no agent re-run. It rebuilds the flowchart from
 * `trace.structure` (the serialized static chart captured by
 * `localObservability().getTrace()` — Replay Option A) and renders it via the
 * same `<LensFlow>` the live `<Lens>` uses, so an offline replay matches the
 * live view's shape.
 *
 *   import { Replay } from 'agentfootprint-lens';
 *   const trace = JSON.parse(fs.readFileSync('run.trace.json', 'utf8'));
 *   return <Replay trace={trace} />;
 *
 * The `Trace` is self-describing about redaction: when it carries raw,
 * un-redacted content (`trace.redaction === 'none'`) `<Replay>` shows a banner,
 * so a trace shared in a bug report / docs is never mistaken for safe.
 *
 * Time-travel overlay (lighting the executed path + a step slider from
 * `trace.events`) is a planned refinement; this renders the executed chart shape.
 */

import React, { useMemo } from "react";

import type { Trace } from "agentfootprint/observe";

import { structureGraphFromSpec } from "../core/collapser/structureGraphFromRunner.js";
import { LensFlow } from "./LensFlow.js";
import { LENS_NODE_TYPES } from "./lensNodeTypes.js";

export interface ReplayProps {
  /** A persisted `Trace` from `agentfootprint` `localObservability().getTrace()`. */
  readonly trace: Trace;
  /**
   * Show the "contains raw content" banner when the trace was NOT redacted
   * (`trace.redaction === 'none'`). Default `true`.
   */
  readonly warnOnRawContent?: boolean;
  /** Forwarded to `<LensFlow>` — render zoom/fit controls. Default `true`. */
  readonly showControls?: boolean;
  /** Forwarded to `<LensFlow>` — render the dot background. Default `true`. */
  readonly showBackground?: boolean;
}

export const Replay: React.FC<ReplayProps> = ({
  trace,
  warnOnRawContent = true,
  showControls = true,
  showBackground = true,
}) => {
  const chart = useMemo(
    () =>
      trace.structure === undefined
        ? undefined
        : {
            graph: structureGraphFromSpec(trace.structure),
            // No `layout` → use TracedFlow's built-in measure-then-layout pipeline
            // (content-exact + fork-centering); inherits eui layout fixes for free.
            nodeTypes: LENS_NODE_TYPES,
          },
    [trace.structure],
  );

  if (chart === undefined) {
    return (
      <div className="lens-replay lens-replay--no-structure" role="status">
        This trace has no <code>structure</code> to replay — re-capture with
        <code> enable.localObservability()</code>.
      </div>
    );
  }

  return (
    <div className="lens-replay">
      {warnOnRawContent && trace.redaction === "none" && (
        <div className="lens-replay__warning" role="status">
          ⚠ This trace contains raw, un-redacted content.
        </div>
      )}
      <LensFlow
        chart={chart}
        showControls={showControls}
        showBackground={showBackground}
      />
    </div>
  );
};
