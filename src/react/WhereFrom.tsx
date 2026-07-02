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

import React, { useEffect, useMemo, useState } from "react";

import { cursorProvenance } from "../core/cursorProvenance.js";
import type { ProvenanceFrame } from "../core/cursorProvenance.js";
import { T } from "./theme/index.js";

/**
 * SAME-RAIL REWIND (the walk): "Walk the causes" FREEZES the picked key's
 * slice as an ordered stop list (commitIdx DESCENDING — reverse time is a
 * valid topological order because every dependency commits earlier than its
 * dependent) and steps THE one cursor through it with "◀ earlier cause /
 * toward result ▶". The walk session is a LENS, not a cursor: the position
 * within the walk is DERIVED from the host's cursor every render — if the
 * host scrubs elsewhere mid-walk, the panel says "the cursor left the walk"
 * and offers resume/end instead of inventing a second position. Freezing is
 * what makes walking possible here at all: WhereFrom re-anchors its
 * provenance on every cursor move, so an unfrozen walk would dissolve on
 * the first step.
 */
interface WalkSession {
  readonly key: string;
  /** Walk order: newest first (commitIdx descending). */
  readonly stops: readonly ProvenanceFrame[];
  /** footprintjs `formatSlice` output, frozen at entry — [Copy story]. */
  readonly story: string;
}

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
  /**
   * The active slice as a chart CONE (node id → BFS depth; ids are stage
   * parts — runtimeStageIds with `#N` stripped). Fired whenever the picked
   * key's slice changes; `undefined` when there is nothing to paint
   * (missing slice, or on unmount). The engineer view forwards it to the
   * chart so the panel's frames and the lit cone can never disagree.
   */
  readonly onSliceChange?: (cone: ReadonlyMap<string, number> | undefined) => void;
}

const MISSING_TEXT: Record<string, string> = {
  "never-written":
    "never written in this run — the value came from initial state, frozen run input (args), or a closure; the commit log cannot see those.",
  "empty-log": "the commit log is empty — nothing executed.",
};

export function WhereFrom({ runner, cursorRuntimeStageId, onJumpTo, onSliceChange }: WhereFromProps): React.ReactElement | null {
  const provenance = useMemo(
    () => cursorProvenance(runner, cursorRuntimeStageId),
    [runner, cursorRuntimeStageId],
  );
  const [pickedKey, setPickedKey] = useState<string | undefined>(undefined);
  const [walk, setWalk] = useState<WalkSession | null>(null);
  const [copied, setCopied] = useState(false);

  const activeKey =
    provenance && pickedKey !== undefined && provenance.writtenKeys.includes(pickedKey)
      ? pickedKey
      : provenance?.writtenKeys[0];
  const slice = provenance && activeKey !== undefined ? provenance.sliceFor(activeKey) : undefined;

  // Report the cone up (and clear it when there is nothing to paint or on
  // unmount) — a slice of ≥2 frames is a cone; a lone anchor is not.
  // While WALKING, the frozen walk's cone wins: the chart must keep showing
  // the walked question even though the panel re-anchors at every stop.
  useEffect(() => {
    if (!onSliceChange) return;
    const frames = walk ? walk.stops : slice && slice.frames.length >= 2 ? slice.frames : undefined;
    if (!frames || frames.length < 2) {
      onSliceChange(undefined);
      return () => onSliceChange(undefined);
    }
    const cone = new Map<string, number>();
    for (const f of frames) {
      const stagePart = f.runtimeStageId.split("#")[0];
      const prev = cone.get(stagePart);
      if (prev === undefined || f.depth < prev) cone.set(stagePart, f.depth);
    }
    onSliceChange(cone);
    return () => onSliceChange(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSliceChange, cursorRuntimeStageId, activeKey, slice?.frames.length, walk]);

  // The walk survives cursor moves; it renders even when the CURRENT cursor
  // stage has no provenance of its own (e.g. a read-only stop).
  const walkBox = walk ? (
    <WalkBox
      walk={walk}
      cursorRuntimeStageId={cursorRuntimeStageId}
      onJumpTo={onJumpTo}
      copied={copied}
      onCopy={() => {
        void navigator.clipboard?.writeText(walk.story).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
      onEnd={() => setWalk(null)}
    />
  ) : null;

  if (!provenance || activeKey === undefined || slice === undefined) return walkBox;

  return (
    <div style={{ marginTop: 10, borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
      {walkBox}
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
          {walk === null && slice.frames.length >= 2 && onJumpTo && (
            <button
              type="button"
              data-lens="walk-start"
              onClick={() => {
                const stops = [...slice.frames].sort((a, b) => b.commitIdx - a.commitIdx);
                setWalk({ key: activeKey, stops, story: slice.story });
                onJumpTo(stops[0].runtimeStageId);
              }}
              style={{
                marginTop: 6,
                fontSize: 10,
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: 999,
                cursor: "pointer",
                border: `1px solid ${T.primary}`,
                background: `color-mix(in srgb, ${T.primary} 14%, transparent)`,
                color: T.textPrimary,
              }}
            >
              ◀ Walk the causes
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The walk header — position DERIVES from the host cursor; the buttons only
 * ever call onJumpTo (the one-cursor rule survives by construction).
 */
function WalkBox({
  walk,
  cursorRuntimeStageId,
  onJumpTo,
  copied,
  onCopy,
  onEnd,
}: {
  walk: WalkSession;
  cursorRuntimeStageId: string;
  onJumpTo?: (runtimeStageId: string) => void;
  copied: boolean;
  onCopy: () => void;
  onEnd: () => void;
}): React.ReactElement {
  const pos = walk.stops.findIndex((st) => st.runtimeStageId === cursorRuntimeStageId);
  const offWalk = pos < 0;
  // Walk order is newest-first: "earlier cause" advances IN the array.
  const earlier = !offWalk && pos + 1 < walk.stops.length ? walk.stops[pos + 1] : undefined;
  const later = !offWalk && pos > 0 ? walk.stops[pos - 1] : undefined;

  const pill = (label: string, onClick: (() => void) | undefined, disabled: boolean): React.ReactElement => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 999,
        cursor: disabled ? "default" : "pointer",
        border: `1px solid ${disabled ? T.border : T.primary}`,
        background: "transparent",
        color: disabled ? T.textMuted : T.textPrimary,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      data-lens="walk-box"
      style={{
        marginBottom: 8,
        padding: "6px 8px",
        borderRadius: 6,
        border: `1px solid ${T.primary}`,
        background: `color-mix(in srgb, ${T.primary} 8%, transparent)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T.textMuted }}>
          Walking
        </span>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: T.textPrimary, fontWeight: 700 }}>
          {walk.key}
        </span>
        <span data-lens="walk-position" style={{ fontSize: 10, color: T.textMuted }}>
          {offWalk ? "· the cursor left the walk" : `· stop ${pos + 1} of ${walk.stops.length}`}
        </span>
        <span style={{ flex: 1 }} />
        {pill(copied ? "Copied ✓" : "Copy story", onCopy, false)}
        {pill("End ✕", onEnd, false)}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        {offWalk ? (
          pill("Resume at stop 1", onJumpTo && (() => onJumpTo(walk.stops[0].runtimeStageId)), !onJumpTo)
        ) : (
          <>
            {pill("◀ earlier cause", earlier && onJumpTo ? () => onJumpTo(earlier.runtimeStageId) : undefined, !earlier || !onJumpTo)}
            {pill("toward result ▶", later && onJumpTo ? () => onJumpTo(later.runtimeStageId) : undefined, !later || !onJumpTo)}
          </>
        )}
      </div>
    </div>
  );
}
