/**
 * <AgentLens> — top-level shell.
 *
 * Composes the three v0.1 surfaces: IterationStrip (top), MessagesPanel
 * (center, primary), ToolCallInspector (right sidebar). Selection state
 * is internal; parent apps can hook into `onToolCallClick` to drive
 * external drill-downs (e.g. open a footprint-explainable-ui drawer
 * scoped to the tool's flowchart execution).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Usage (zero-boilerplate):
 *
 *   import { AgentLens } from 'agentfootprint-lens';
 *   import { FootprintTheme, coolDark, coolLight } from 'footprint-explainable-ui';
 *
 *   <FootprintTheme tokens={dark ? coolDark : coolLight}>
 *     <AgentLens runtimeSnapshot={agent.getSnapshot()} />
 *   </FootprintTheme>
 *
 * No Lens-specific theme prop — tokens flow from the standard
 * FootprintTheme context. The drill-in drawer (explainable-ui) reads
 * the same context, so chat + trace stay in sync when the consumer
 * flips themes.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fromAgentSnapshot } from "../core/fromAgentSnapshot";
import type {
  AgentToolInvocation,
  AgentTimeline,
  LensSkill,
} from "../core/types";
import { MessagesPanel } from "./panels/MessagesPanel";
import { SkillsPanel } from "./panels/SkillsPanel";
import { StageFlow } from "./panels/StageFlow";
import { TimeTravel } from "./panels/TimeTravel";
import { AskCard } from "./panels/AskCard";
import { RunSummary } from "./panels/RunSummary";
import { deriveStages, type Stage } from "../core/deriveStages";
import { useLensTheme } from "./theme/useLensTheme";

export interface AgentLensProps {
  /**
   * Raw runtimeSnapshot from `agent.getSnapshot()`. Lens parses this
   * into an agent-shaped AgentTimeline internally. Pass `null` when a
   * run hasn't happened yet — Lens renders an empty state.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly runtimeSnapshot?: any | null;
  /**
   * Pre-parsed timeline, for callers who want to run the adapter once
   * upstream and share the result. Overrides `runtimeSnapshot` when set.
   */
  readonly timeline?: AgentTimeline;
  /**
   * Optional system prompt to render in the collapsible preamble of
   * MessagesPanel. Usually `runtimeSnapshot.sharedState.systemPrompt`
   * or the agent's configured base prompt.
   */
  readonly systemPrompt?: string;
  /**
   * Called when the user clicks a tool call in either the Inspector or
   * the inline Messages tool-call card. Parent can use this to open a
   * drawer rendering `<ExplainableShell>` from footprint-explainable-ui
   * scoped to that tool's internal flowchart execution — the
   * composition seam between Lens (agent view) and explainable-ui
   * (tool-internal view).
   */
  readonly onToolCallClick?: (invocation: AgentToolInvocation) => void;
  /**
   * Skills registered with the agent. When supplied, a "📚 Skills (N)"
   * button appears in the iteration-strip row; clicking it opens a
   * modal with each skill's description, scope, tool list, body, and
   * raw-JSON view. The currently-active skill (from
   * `timeline.finalDecision.currentSkill`) is highlighted.
   *
   * Pass the list from wherever the consumer built the registry:
   *
   *   const skills = registry.list();
   *   <AgentLens timeline={t} skills={skills} />
   */
  readonly skills?: readonly LensSkill[];
  /**
   * Override the "active skill" highlight. Defaults to
   * `timeline.finalDecision.currentSkill` when that's a string.
   */
  readonly activeSkillId?: string | null;
}

export function AgentLens({
  runtimeSnapshot,
  timeline: providedTimeline,
  systemPrompt,
  onToolCallClick,
  skills,
  activeSkillId,
}: AgentLensProps) {
  const t = useLensTheme();
  const timeline = useMemo<AgentTimeline | null>(() => {
    if (providedTimeline) return providedTimeline;
    if (!runtimeSnapshot) return null;
    return fromAgentSnapshot(runtimeSnapshot);
  }, [providedTimeline, runtimeSnapshot]);

  const [selectedIterKey, setSelectedIterKey] = useState<string | null>(null);
  const [skillsOpen, setSkillsOpen] = useState(false);

  const derivedActiveSkill =
    activeSkillId ??
    (typeof timeline?.finalDecision?.currentSkill === "string"
      ? (timeline.finalDecision.currentSkill as string)
      : null);

  // Esc closes the Skills modal.
  useEffect(() => {
    if (!skillsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSkillsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [skillsOpen]);

  // Arrow keys scrub the slider. Skipped when focus is in an input/
  // textarea/contentEditable so we don't hijack typing. Also skipped
  // when the Skills modal is open — Esc handles that case and we
  // don't want arrow keys leaking into it.

  const handleToolClick = useCallback(
    (inv: AgentToolInvocation) => {
      setSelectedIterKey(`${inv.turnIndex}.${inv.iterationIndex}`);
      onToolCallClick?.(inv);
    },
    [onToolCallClick],
  );

  if (!timeline) {
    return (
      <div
        data-fp-lens="empty"
        style={{
          padding: 32,
          color: t.textMuted,
          fontFamily: t.fontSans,
          textAlign: "center",
          background: t.bg,
        }}
      >
        No agent run to show yet. Pass <code>runtimeSnapshot</code> after the agent runs.
      </div>
    );
  }

  const derivedSystemPrompt =
    systemPrompt ??
    (typeof timeline.rawSnapshot?.sharedState?.systemPrompt === "string"
      ? (timeline.rawSnapshot.sharedState.systemPrompt as string)
      : undefined);

  // Compute stages once per timeline change. Pure derivation — cheap.
  const stages = useMemo(() => (timeline ? deriveStages(timeline) : []), [timeline]);

  // Time-travel cursor. Follows the latest stage by default (live). Any
  // manual scrub pins focusIndex; a new stage arriving after a manual
  // scrub does NOT auto-advance (user owns the scrubber).
  const [focusIndex, setFocusIndex] = useState<number>(-1); // -1 = live
  const liveIndex = stages.length - 1;
  const resolvedFocus = focusIndex === -1 ? liveIndex : Math.min(focusIndex, liveIndex);
  const isLive = focusIndex === -1;

  // Read the current liveIndex via a ref so handleFocusChange's
  // identity doesn't flip every time a new stage arrives. If liveIndex
  // were a dep, handleFocusChange recomputes → handleEdgeClick
  // recomputes → StageFlow's edgeTypes memo invalidates → ReactFlow
  // warns "new edgeTypes object". The live-index read is cheap and
  // always-current since the ref syncs below.
  const liveIndexRef = useRef(liveIndex);
  liveIndexRef.current = liveIndex;
  const handleFocusChange = useCallback((i: number) => {
    // Jumping to the latest step re-engages "live" mode — new stages
    // will continue to advance the cursor.
    setFocusIndex(i >= liveIndexRef.current ? -1 : i);
  }, []);

  // Arrow-key scrubbing. Bound at the window so it works regardless of
  // which Lens surface has focus. Ignores keys when the user is typing
  // in an input/textarea/contentEditable (those own their own arrows)
  // or when the Skills modal is open.
  useEffect(() => {
    if (stages.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (skillsOpen) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const tgt = e.target as HTMLElement | null;
      const tag = tgt?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        tgt?.isContentEditable
      ) return;
      const delta = e.key === "ArrowLeft" ? -1 : 1;
      const next = Math.min(
        liveIndex,
        Math.max(0, resolvedFocus + delta),
      );
      handleFocusChange(next);
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resolvedFocus, liveIndex, stages.length, skillsOpen]);

  const handleEdgeClick = useCallback(
    (stage: Stage) => {
      if (stage.iterIndex === undefined) return;
      setSelectedIterKey(`${stage.turnIndex}.${stage.iterIndex}`);
      // Pin the scrubber to the stage just clicked.
      handleFocusChange(stage.index);
    },
    [handleFocusChange],
  );

  // Container-width responsiveness — same pattern as
  // `<ExplainableShell>`. When the host panel is narrower than the
  // two-column grid's comfortable minimum, stack `graph` above `ask`
  // in a single column. ResizeObserver + state (no media queries)
  // means Lens reacts to its own container's width, not the viewport
  // — works inside drawers, splitters, and resizable panels.
  const shellRef = useRef<HTMLDivElement>(null);
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      setIsNarrow(w < 640);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={shellRef}
      data-fp-lens="shell"
      data-fp-lens-narrow={isNarrow ? "true" : "false"}
      style={{
        display: "grid",
        // Top: TimeTravel slider (tt) + Skills button trailing on the
        // right. Middle-left: vertical StageFlow. Middle-right: AskCard
        // with current question + active step detail. Below: MessagesPanel
        // full width. Footer: RunSummary (only after first turn completes).
        //
        // Wide layout: two columns (graph | ask) with shared top/bottom rows.
        // Narrow layout: single column, ask card stacks below graph — same
        // responsive pattern `<ExplainableShell>` uses when its container
        // drops below ~640px. Container-width driven (ResizeObserver), so
        // this reacts to panel drags / splitters, not the viewport.
        //
        // Both columns use `minmax(0, ...)` so grid tracks can shrink below
        // their preferred size without clipping content.
        gridTemplateColumns: isNarrow
          ? "minmax(0, 1fr)"
          : "minmax(0, 1fr) minmax(0, 320px)",
        gridTemplateRows: isNarrow
          ? "auto auto auto minmax(0, 1fr) auto"
          : "auto auto minmax(0, 1fr) auto",
        gridTemplateAreas: isNarrow
          ? '"tt" "graph" "ask" "messages" "summary"'
          : '"tt tt" "graph ask" "messages messages" "summary summary"',
        // Self-constraining sizing contract — Lens never requires the
        // host to get their flex chain exactly right.
        //
        //   • `maxHeight: 100dvh` is the hard cap. Even if NOTHING
        //     upstream delivers a bounded height, the shell can never
        //     exceed the viewport. This is what makes the grid's
        //     `minmax(0, 1fr)` messages row actually resolve to a
        //     bounded number of pixels instead of expanding to content.
        //   • `height: 100%` + `flex: 1 1 0%` let well-constrained
        //     hosts still shrink Lens below the viewport cap when they
        //     want a narrower sidebar.
        //   • `overflow: hidden` clips children that would otherwise
        //     blow past the grid and make scrollHeight == clientHeight
        //     on MessagesPanel (the exact bug this block prevents).
        //   • `minHeight: 0` unblocks grid + flex size resolution.
        flex: "1 1 0%",
        minHeight: 0,
        height: "100%",
        maxHeight: "100dvh",
        overflow: "hidden",
        background: t.bg,
        color: t.text,
        fontFamily: t.fontSans,
      }}
    >
      {/* One-off stylesheet for the selected-iter pulse. Inline-style can't
          target a data attribute, and this rule is stable (doesn't depend
          on tokens — `currentColor` picks up whatever text color the
          active theme resolves). */}
      <style>{`
        [data-iter-selected="true"] {
          outline-color: currentColor !important;
          background: color-mix(in srgb, currentColor 8%, transparent);
        }
      `}</style>
      {stages.length > 0 && (
        <>
          <div
            style={{
              gridArea: "tt",
              display: "flex",
              alignItems: "center",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <TimeTravel
                stages={stages}
                focusIndex={resolvedFocus}
                onFocusChange={handleFocusChange}
                isLive={isLive}
              />
            </div>
            {skills && skills.length > 0 && (
              <button
                onClick={() => setSkillsOpen(true)}
                title="See all skills registered with the agent"
                style={{
                  // Borderless — rides on the same airy feel as the
                  // floating time-travel pill. A faint translucent fill
                  // on hover keeps it discoverable.
                  background: "transparent",
                  border: "none",
                  color: t.textMuted,
                  padding: "0 16px",
                  margin: "0 14px 0 0",
                  fontSize: 12,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontWeight: 400,
                  width: "auto",
                }}
              >
                <span aria-hidden="true">📚</span>
                <span>Skills · {skills.length}</span>
                {derivedActiveSkill && (
                  <span
                    style={{
                      fontSize: 9,
                      padding: "1px 5px",
                      borderRadius: 3,
                      background: `color-mix(in srgb, ${t.success} 25%, transparent)`,
                      color: t.success,
                      fontWeight: 600,
                      textTransform: "uppercase",
                    }}
                  >
                    {derivedActiveSkill}
                  </span>
                )}
              </button>
            )}
          </div>
          <div
            style={{
              gridArea: "graph",
              minHeight: 0,
              overflow: "hidden",
              borderRight: `1px solid ${t.border}`,
            }}
          >
            <StageFlow
              stages={stages}
              focusIndex={resolvedFocus}
              onEdgeClick={handleEdgeClick}
              activeSkillId={derivedActiveSkill}
              timeline={timeline}
            />
          </div>
          <div
            style={{
              gridArea: "ask",
              minHeight: 0,
              overflow: "hidden",
              background: t.bg,
            }}
          >
            <AskCard
              timeline={timeline}
              stages={stages}
              focusIndex={resolvedFocus}
            />
          </div>
        </>
      )}
      <div
        style={{
          gridArea: "messages",
          minHeight: 0,
          overflow: "hidden",
          // `position: relative` is the containing block for the
          // absolutely-positioned MessagesPanel inside. This is the
          // mechanism that forces the panel's height to match this
          // cell exactly, no matter what the upstream flex/grid
          // chain does.
          position: "relative",
        }}
      >
        <MessagesPanel
          timeline={timeline}
          onToolCallClick={handleToolClick}
          selectedIterKey={selectedIterKey}
          stages={stages}
          focusIndex={resolvedFocus}
          onFocusChange={handleFocusChange}
          isLive={isLive}
          {...(derivedSystemPrompt && { systemPrompt: derivedSystemPrompt })}
        />
      </div>
      <div style={{ gridArea: "summary" }}>
        <RunSummary timeline={timeline} />
      </div>
      {skillsOpen && skills && (
        <SkillsPanel
          skills={skills}
          activeSkillId={derivedActiveSkill}
          onClose={() => setSkillsOpen(false)}
        />
      )}
    </div>
  );
}
