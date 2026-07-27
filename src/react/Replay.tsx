/**
 * <Replay> — render a persisted agentfootprint `Trace` OFFLINE.
 *
 * No live runner, no recorder, no agent re-run. It is a thin adapter over
 * `observeRecording`: a `Trace` IS a recording under different field names, so
 * this maps the names and hands the result to the same `<Lens>` the live rail
 * renders.
 *
 *   import { Replay } from 'agentfootprint-lens';
 *   const trace = JSON.parse(fs.readFileSync('run.trace.json', 'utf8'));
 *   return <Replay trace={trace} />;
 *
 * WHY IT IS AN ADAPTER NOW
 * ────────────────────────
 * It used to draw `trace.structure` as a static chart and nothing else — no
 * slider, no commentary, no detail — while agentfootprint's own docs said an
 * offline replay "matches the live `<Lens>`". Two entry points, one of which
 * quietly did a tenth of the job. There is ONE replay path now, and `<Replay>`
 * is the `Trace`-shaped door into it.
 *
 * WHAT A TRACE CANNOT GIVE BACK
 * ─────────────────────────────
 *   `trace.events` are DOMAIN events (the boundary log) — they rebuild the step
 *   strip and the step graph. They are NOT the typed `agentfootprint.*` event
 *   log, so the commentary rail has nothing to narrate; Lens says so rather
 *   than showing an empty panel and letting you wonder.
 *
 *   `trace.snapshot` (agentfootprint 7.8+) carries the footprintjs commit log.
 *   Without it there is no commit axis and no provenance — an older Trace
 *   replays as chart + steps.
 *
 * The `Trace` is self-describing about redaction: when it carries raw,
 * un-redacted content (`trace.redaction === 'none'`) `<Replay>` shows a banner,
 * so a trace shared in a bug report / docs is never mistaken for safe.
 */

import React, { useMemo } from "react";
import { ensureLensStyles } from "./lensStyles.js";

import type { Trace } from "agentfootprint/observe";

import { observeRecording, type RecordedSnapshot } from "../core/observeRecording.js";
import { Lens, type LensTheme } from "./Lens.js";

export interface ReplayProps {
  /** A persisted `Trace` from `agentfootprint` `localObservability().getTrace()`. */
  readonly trace: Trace;
  /**
   * Show the "contains raw content" banner when the trace was NOT redacted
   * (`trace.redaction === 'none'`). Default `true`.
   */
  readonly warnOnRawContent?: boolean;
  /** Forwarded to `<Lens>` — light/dark plus the three chart colours. */
  readonly theme?: LensTheme;
}

/**
 * A `Trace`'s footprintjs snapshot, with its domain-event log guaranteed to be
 * in the place `observeRecording` reads boundaries from.
 *
 * A Trace stores that log at the top level (`trace.events`); a footprintjs
 * snapshot stores it as the `BoundaryEvents` recorder entry. Same events, two
 * homes — so an older Trace with no `snapshot` at all still rebuilds its step
 * strip, and a newer one that already carries the entry is left alone.
 */
function snapshotFor(trace: Trace): RecordedSnapshot {
  const carried = (trace as { snapshot?: unknown }).snapshot;
  const base: RecordedSnapshot =
    carried !== null && typeof carried === "object" ? (carried as RecordedSnapshot) : {};
  const recorders = Array.isArray(base.recorders) ? base.recorders : [];
  const alreadyThere = recorders.some(
    (r) => r?.name === "BoundaryEvents" && Array.isArray(r.data),
  );
  if (alreadyThere) return base;
  return { ...base, recorders: [...recorders, { name: "BoundaryEvents", data: trace.events }] };
}

export const Replay: React.FC<ReplayProps> = ({ trace, warnOnRawContent = true, theme }) => {
  ensureLensStyles();

  const observed = useMemo(() => {
    const result = observeRecording({
      structure: trace.structure,
      snapshot: snapshotFor(trace),
    });
    // A Trace has no typed event log at all, so an empty commentary rail is not
    // "the run was quiet" — it is a shape the transport never carried. Say which.
    result.recorder.addNote(
      'A Trace carries the boundary log, not the typed event log, so there is no commentary or message history to show. Record `{ snapshot, events, structure }` and use `observeRecording` for the full view.',
    );
    return result;
  }, [trace]);

  if (observed.chart === "absent") {
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
      <Lens
        recorder={observed.recorder}
        {...(observed.runner ? { runner: observed.runner } : {})}
        {...(theme ? { theme } : {})}
        view="engineer"
      />
    </div>
  );
};
