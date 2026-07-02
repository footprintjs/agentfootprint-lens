/**
 * WhereFrom — "Where did this come from?" for the Lens cursor stage.
 *
 * The developer-debugging face of the triage program: the cursor stage's
 * written state keys render as clickable chips; picking one shows the
 * backward slice that produced its value AS OF the cursor (who wrote it,
 * what those writers read, transitively — `cursorProvenance`, the same
 * canonical footprintjs slice the `backtrack` LLM tool and eui's Data Trace
 * run). Clicking a frame moves THE one cursor (the host maps the frame's
 * runtimeStageId to a slider position) — navigation, never a second cursor,
 * per the locked Lens v0.1 architecture.
 *
 * Honesty in the UI, not just the data: a missing slice renders its reason
 * ("never written — initial state / args / a closure"); a reads-less
 * snapshot renders "⚠ reads were not recorded — unknowable, not absent".
 *
 * Self-contained (owns only the selected-key state); exported for
 * consumer-built shells; mounted by the engineer view's detail slot.
 */

import React, { useMemo, useState } from "react";

import { cursorProvenance } from "../core/cursorProvenance.js";
import { T } from "./theme/index.js";

export interface WhereFromProps {
  /** The runner whose last snapshot holds the commit log + reads (any
   *  agentfootprint Runner — getLastSnapshot is duck-checked at runtime). */
  readonly runner: unknown;
  /** THE cursor (a runtimeStageId — the Lens single time cursor). */
  readonly cursorRuntimeStageId: string;
  /**
   * Jump the ONE cursor to a slice frame's step. The host maps the
   * runtimeStageId to its slider position; ids with no position (e.g.
   * subflow internals) may no-op.
   */
  readonly onJumpTo?: (runtimeStageId: string) => void;
}

const MISSING_TEXT: Record<string, string> = {
  "never-written":
    "never written in this run — the value came from initial state, frozen run input (args), or a closure; the commit log cannot see those.",
  "empty-log": "the commit log is empty — nothing executed.",
};

export function WhereFrom({ runner, cursorRuntimeStageId, onJumpTo }: WhereFromProps): React.ReactElement | null {
  const provenance = useMemo(
    () => cursorProvenance(runner, cursorRuntimeStageId),
    [runner, cursorRuntimeStageId],
  );
  const [pickedKey, setPickedKey] = useState<string | undefined>(undefined);

  if (!provenance) return null;
  const activeKey =
    pickedKey !== undefined && provenance.writtenKeys.includes(pickedKey)
      ? pickedKey
      : provenance.writtenKeys[0];
  if (activeKey === undefined) return null;
  const slice = provenance.sliceFor(activeKey);

  return (
    <div style={{ marginTop: 10, borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: T.textMuted,
          marginBottom: 6,
        }}
      >
        Where did this come from?
      </div>

      {/* Written-key chips — the variables this step produced. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
        {provenance.writtenKeys.map((key) => {
          const active = key === activeKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setPickedKey(key)}
              style={{
                fontSize: 10,
                fontFamily: "ui-monospace, monospace",
                padding: "2px 8px",
                borderRadius: 999,
                cursor: "pointer",
                border: `1px solid ${active ? T.primary : T.border}`,
                background: active ? `color-mix(in srgb, ${T.primary} 14%, transparent)` : "transparent",
                color: active ? T.textPrimary : T.textSecondary,
              }}
            >
              {key}
            </button>
          );
        })}
      </div>

      {/* Honesty lines before any frames. */}
      {slice.readsWarning && (
        <div style={{ fontSize: 10, color: T.textMuted, fontStyle: "italic", marginBottom: 6 }}>
          ⚠ reads were not recorded (readTracking off) — dependencies are unknowable, not absent.
        </div>
      )}
      {slice.missing !== undefined ? (
        <div style={{ fontSize: 11, color: T.textSecondary, fontStyle: "italic" }}>
          <span style={{ fontFamily: "ui-monospace, monospace" }}>{activeKey}</span>{" "}
          {MISSING_TEXT[slice.missing] ?? slice.missing}
        </div>
      ) : (
        <div>
          {slice.frames.map((frame, i) => (
            <button
              key={`${frame.runtimeStageId}-${i}`}
              type="button"
              onClick={() => onJumpTo?.(frame.runtimeStageId)}
              title={
                onJumpTo
                  ? `jump the cursor to ${frame.runtimeStageId}`
                  : frame.runtimeStageId
              }
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: "transparent",
                border: "none",
                cursor: onJumpTo ? "pointer" : "default",
                padding: "2px 0 2px " + String(frame.depth * 14) + "px",
                fontSize: 11,
                color: T.textSecondary,
              }}
            >
              {frame.depth > 0 ? "↑ " : ""}
              <span style={{ color: T.textPrimary, fontWeight: frame.depth === 0 ? 700 : 500 }}>
                {frame.stageName}
              </span>{" "}
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: T.textMuted }}>
                ({frame.runtimeStageId})
              </span>
              {frame.linkedBy !== "" && (
                <span style={{ color: T.primary, fontSize: 10 }}> ← via {frame.linkedBy}</span>
              )}
              {frame.depth === 0 && <span style={{ color: T.textMuted, fontSize: 10 }}> (writer)</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
