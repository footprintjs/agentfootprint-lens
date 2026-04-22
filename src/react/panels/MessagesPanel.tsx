/**
 * MessagesPanel — the primary Lens surface. Chat-shaped, story-mode view
 * of an agent run with human-friendly narration for each step.
 *
 * Each assistant iteration is one of five conceptual steps:
 *   1. "Neo is looking up available skills"    (list_skills)
 *   2. "Neo activated the {id} skill"          (read_skill)
 *   3. "Neo called {tool} to get data"         (any other tool)
 *   4. "Neo gathered data from N sources"      (parallel tool calls)
 *   5. "Neo is ready to answer"                (final — no tool calls)
 *
 * Each iteration has a "Show what Neo saw" expander that reveals the
 * exact messages that were in context when the LLM made this decision.
 * Tools + system prompt will follow when agentfootprint emits a richer
 * llm_start event; for now we show the message slice.
 */
import React, { useEffect, useRef, useState } from "react";
import type {
  AgentIteration,
  AgentMessage,
  AgentTimeline,
  AgentToolInvocation,
  AgentTurn,
} from "../../core/types";
import type { Stage, StageMutations } from "../../core/deriveStages";
import { useLensTheme } from "../theme/useLensTheme";

export interface MessagesPanelProps {
  readonly timeline: AgentTimeline;
  readonly onToolCallClick?: (invocation: AgentToolInvocation) => void;
  readonly systemPrompt?: string;
  /**
   * Display name for the agent in narration ("Neo called tool …",
   * "Acme Bot is ready to answer"). Defaults to "Agent" when the
   * consumer doesn't supply one — generic enough to read sensibly for
   * any sample (calculator agent, RAG bot, etc.) without leaking the
   * Neo MDS triage scenario's name into other apps.
   */
  readonly agentName?: string;
  /**
   * Ordered list of stages derived from the timeline. Lets each
   * iteration block tag its stage index range so the slider's focus
   * position can map to a specific iteration block to scroll to.
   */
  readonly stages?: readonly Stage[];
  /**
   * Current focus cursor (global stage index). Drives which iteration
   * the panel scrolls to. One-way for scroll: slider → panel. The
   * panel does NOT emit on scroll events; this matches the
   * explainable-ui pattern and avoids the bidirectional feedback
   * loop. However, explicit CLICKS on a round header still jump the
   * slider via onFocusChange — that's a deliberate user action, not a
   * scroll-as-scrub inference.
   */
  readonly focusIndex?: number;
  /** Emits when the user clicks a round header to jump the slider. */
  readonly onFocusChange?: (stageIndex: number) => void;
  /** True when the slider is in Live mode (following the latest stage).
   *  In Live mode the panel auto-tails to the bottom on new stages. */
  readonly isLive?: boolean;
  readonly selectedIterKey?: string | null;
}

export function MessagesPanel({
  timeline,
  onToolCallClick,
  systemPrompt,
  selectedIterKey,
  stages,
  focusIndex,
  onFocusChange,
  isLive,
  agentName = "Agent",
}: MessagesPanelProps) {
  const t = useLensTheme();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Per-iteration stage index ranges so focusIndex → iterKey lookup
  // works during the slider-driven scroll effect.
  const iterRanges = useIterationStageRanges(stages);
  // Note: mutation aggregation now happens per-IterationBlock with a
  // focus-clamped range, so the mutation strip only shows mutations
  // that have actually landed as of the slider position. The old
  // full-round `useIterationMutations` hook is no longer called.

  // Focus → scroll (slider drives the commentary). One-way.
  //
  // Modeled on explainable-ui's StoryNarrative pattern: the dependency
  // array is the whole feedback-loop prevention. No scroll listener
  // means no possible re-entry, so no flags/timestamps are needed.
  // `behavior: "auto"` for instant snap — smooth scroll race-conditions
  // with live updates that keep arriving mid-animation.
  useEffect(() => {
    if (!scrollRef.current) {
      console.log("[Lens scroll] selectedIter effect skipped: no scrollRef");
      return;
    }
    // Legacy selectedIterKey path — still supported for callers that
    // drive the panel via tool-click without a stages/focusIndex pair.
    if (selectedIterKey) {
      const target = scrollRef.current.querySelector<HTMLDivElement>(
        `[data-iter-key="${CSS.escape(selectedIterKey)}"]`,
      );
      console.log("[Lens scroll] selectedIterKey path", {
        selectedIterKey,
        foundTarget: !!target,
      });
      if (target) {
        target.scrollIntoView({ block: "start", behavior: "smooth" });
        target.setAttribute("data-iter-selected", "true");
        const h = window.setTimeout(() => target.removeAttribute("data-iter-selected"), 1200);
        return () => window.clearTimeout(h);
      }
    }
  }, [selectedIterKey]);

  useEffect(() => {
    const ctx = {
      focusIndex,
      isLive,
      stagesLen: stages?.length ?? 0,
      iterRangesSize: iterRanges.size,
      hasScrollRef: !!scrollRef.current,
    };
    if (!scrollRef.current || focusIndex === undefined || !stages?.length) {
      console.log("[Lens scroll] focus effect SKIPPED", ctx);
      return;
    }
    // Live mode: tail to bottom so the latest iteration is visible.
    if (isLive) {
      const el = scrollRef.current;
      const beforeTop = el.scrollTop;
      const sh = el.scrollHeight;
      const ch = el.clientHeight;
      const canScroll = sh > ch;
      const alreadyAtBottom = Math.abs(sh - ch - beforeTop) < 2;
      el.scrollTo({ top: sh, behavior: "auto" });
      const afterTop = el.scrollTop;
      const moved = afterTop !== beforeTop;
      // Flat string first so Chrome's collapsed-object truncation can't
      // hide the verdict. Full ctx follows for deep-dive.
      console.log(
        `[Lens scroll] LIVE tail → ${
          moved ? "moved" : canScroll ? "NO-OP (scrollTo returned same top)" : alreadyAtBottom ? "already at bottom" : "CONTAINER NOT SCROLLABLE (scrollHeight<=clientHeight)"
        } · sh=${sh} ch=${ch} before=${beforeTop} after=${afterTop}`,
        { ...ctx, scrollHeight: sh, clientHeight: ch, beforeScrollTop: beforeTop, afterScrollTop: afterTop },
      );
      return;
    }
    // Not live: scrub to the iteration containing focusIndex.
    // Smooth here — one-way sync means no feedback loop, and the
    // visible animation makes slider → commentary feel connected.
    const key = keyForStage(iterRanges, focusIndex);
    if (!key) {
      console.log("[Lens scroll] focus effect: no iterKey for focusIndex", ctx);
      return;
    }
    const target = scrollRef.current.querySelector<HTMLDivElement>(
      `[data-iter-key="${CSS.escape(key)}"]`,
    );
    if (!target) {
      console.log("[Lens scroll] focus effect: DOM node missing for key", {
        ...ctx,
        key,
      });
      return;
    }
    const container = scrollRef.current;
    const rect = target.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    const relTop = rect.top - cRect.top;
    const beforeTop = container.scrollTop;
    target.scrollIntoView({ block: "start", behavior: "smooth" });
    console.log(
      `[Lens scroll] SCRUB key=${key} · relTop=${Math.round(relTop)} sh=${container.scrollHeight} ch=${container.clientHeight} before=${beforeTop}`,
      { ...ctx, key },
    );
  }, [focusIndex, isLive, iterRanges, stages?.length]);

  return (
    <div
      ref={scrollRef}
      data-fp-lens="messages-panel"
      style={{
        // Absolute + inset:0 inside a `position: relative` wrapper
        // forces the panel to be EXACTLY the size of its wrapper cell,
        // regardless of flex/grid height resolution quirks upstream.
        // Without this, percentage heights and 1fr rows can fail to
        // resolve and the panel grows to its content → no scroll.
        // The grid-area wrapper in AgentLens sets `position: relative`
        // to make this the containing block.
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: "16px 24px",
        background: t.bg,
        color: t.text,
        fontFamily: t.fontSans,
        fontSize: 14,
        lineHeight: 1.55,
        minHeight: 0,
        overflow: "auto",
      }}
    >
      {systemPrompt && <SystemBubble text={systemPrompt} agentName={agentName} />}
      {timeline.turns.map((turn) => (
        <TurnBlock
          key={turn.index}
          turn={turn}
          allMessages={timeline.messages}
          onToolCallClick={onToolCallClick}
          iterRanges={iterRanges}
          focusIndex={focusIndex}
          stages={stages}
          onFocusChange={onFocusChange}
          agentName={agentName}
        />
      ))}
    </div>
  );
}

function SystemBubble({ text, agentName }: { text: string; agentName: string }) {
  const t = useLensTheme();
  const [open, setOpen] = useState(false);
  const preview = text.slice(0, 140).replace(/\s+/g, " ") + (text.length > 140 ? "…" : "");
  return (
    <div
      style={{
        alignSelf: "center",
        width: "100%",
        maxWidth: 880,
        border: `1px dashed ${t.border}`,
        borderRadius: t.radius,
        padding: "8px 12px",
        background: t.bgElev,
        fontSize: 12,
        color: t.textMuted,
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "transparent",
          border: "none",
          color: t.textMuted,
          cursor: "pointer",
          padding: 0,
          font: "inherit",
        }}
      >
        <strong>How {agentName} is configured</strong> {open ? "▾" : "▸"} {open ? "" : preview}
      </button>
      {open && (
        <pre
          style={{
            marginTop: 8,
            whiteSpace: "pre-wrap",
            fontFamily: t.fontMono,
            fontSize: 11,
            color: t.text,
          }}
        >
          {text}
        </pre>
      )}
    </div>
  );
}

function TurnBlock({
  turn,
  allMessages,
  onToolCallClick,
  iterRanges,
  focusIndex,
  stages,
  onFocusChange,
  agentName,
}: {
  turn: AgentTurn;
  allMessages: readonly AgentMessage[];
  onToolCallClick?: (inv: AgentToolInvocation) => void;
  iterRanges?: Map<string, { firstStageIndex: number; lastStageIndex: number }>;
  focusIndex?: number;
  stages?: readonly Stage[];
  onFocusChange?: (stageIndex: number) => void;
  agentName: string;
}) {
  const t = useLensTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <TurnHeader turn={turn} />
      <UserBubble text={turn.userPrompt} />
      {turn.iterations.map((iter, i) => {
        const key = `${turn.index}.${iter.index}`;
        const range = iterRanges?.get(key);
        // A round is "active" when the slider is pointing at one of
        // its stages; "past" when the slider is beyond its last stage;
        // "future" when it hasn't been reached yet. Default to
        // "future" when the round has no stage range yet (e.g. a round
        // whose stages haven't been derived) — anything else risks
        // false "active" highlights on rounds the slider isn't at.
        let state: "active" | "past" | "future" = "future";
        if (range && focusIndex !== undefined) {
          if (focusIndex < range.firstStageIndex) state = "future";
          else if (focusIndex > range.lastStageIndex) state = "past";
          else state = "active";
        } else if (!range && focusIndex === undefined) {
          // No slider at all (non-live consumers) — show everything
          // as active by default so content isn't faded out.
          state = "active";
        }
        return (
          <IterationBlock
            key={iter.index}
            iter={iter}
            iterPositionInTurn={i + 1}
            turnIndex={turn.index}
            allMessages={allMessages}
            onToolCallClick={onToolCallClick}
            state={state}
            stages={stages}
            range={range}
            focusIndex={focusIndex}
            agentName={agentName}
            {...(range && onFocusChange
              ? { onClick: () => onFocusChange(range.lastStageIndex) }
              : {})}
          />
        );
      })}
      {turn.finalContent && turn.iterations.length > 0 && (
        <div style={{ fontSize: 11, color: t.textSubtle, textAlign: "center" }}>
          Answer compiled · {turn.iterations.length} step
          {turn.iterations.length === 1 ? "" : "s"} · {turn.totalInputTokens}→
          {turn.totalOutputTokens} tokens · {(turn.totalDurationMs / 1000).toFixed(1)}s
        </div>
      )}
    </div>
  );
}

function TurnHeader({ turn }: { turn: AgentTurn }) {
  const t = useLensTheme();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        color: t.textSubtle,
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        fontWeight: 600,
      }}
    >
      <div style={{ flex: 1, height: 1, background: t.border }} />
      <span>Your question {turn.index + 1}</span>
      <div style={{ flex: 1, height: 1, background: t.border }} />
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  const t = useLensTheme();
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <div
        style={{
          background: `color-mix(in srgb, ${t.accent} 18%, ${t.bgElev})`,
          border: `1px solid ${t.border}`,
          color: t.text,
          maxWidth: 720,
          padding: "10px 14px",
          borderRadius: `${t.radius} ${t.radius} 2px ${t.radius}`,
          whiteSpace: "pre-wrap",
        }}
      >
        {text}
      </div>
    </div>
  );
}

/**
 * Human-friendly narration for each iteration. Looks at what the LLM
 * actually did and renders a sentence instead of a technical label.
 *
 * Special-case three common meta-tools:
 *   • list_skills  → "<name> is looking up available skills"
 *   • read_skill   → "<name> activated the <id> skill"
 *   • ask_human    → "<name> asked the user for clarification"
 * Everything else falls through to the generic form
 *   "<name> called tool (<name>)".
 *
 * `name` defaults to "Agent" upstream when no consumer-supplied
 * `agentName` is given — keeps the narration sensible across every
 * sample (calculator, RAG bot, swarm) instead of leaking the Neo MDS
 * triage scenario's name into other apps.
 *
 * Parallel calls collapse to a plural form with tool names visible
 * (up to 3) or a count (4+).
 */
function iterationHeadline(iter: AgentIteration, name: string): string {
  if (iter.toolCalls.length === 0) {
    return `${name} is ready to answer`;
  }
  if (iter.toolCalls.length === 1) {
    return singleToolHeadline(iter.toolCalls[0], name);
  }
  // Any round with >1 tool call is parallel — the LLM emitted them in
  // one response and the agent runtime fans them out concurrently. Be
  // explicit about "in parallel" so debuggers don't confuse it with
  // "three sequential rounds".
  const names = iter.toolCalls.map((tc) => tc.name);
  if (names.length <= 3) {
    return `${name} called ${names.length} tools in parallel (${names.join(", ")})`;
  }
  return `${name} gathered data from ${names.length} tools in parallel`;
}

function singleToolHeadline(tc: AgentToolInvocation, name: string): string {
  if (tc.name === "list_skills") return `${name} is looking up available skills`;
  if (tc.name === "read_skill") {
    const id = (tc.arguments?.id as string | undefined) ?? "?";
    return `${name} activated the "${id}" skill`;
  }
  if (tc.name === "ask_human" || tc.name === "ask_user") {
    return `${name} asked the user for clarification`;
  }
  return `${name} called tool (${tc.name})`;
}

function IterationBlock({
  iter,
  iterPositionInTurn,
  turnIndex,
  allMessages,
  onToolCallClick,
  state = "active",
  stages,
  range,
  focusIndex,
  onClick,
  agentName,
}: {
  iter: AgentIteration;
  iterPositionInTurn: number;
  turnIndex: number;
  allMessages: readonly AgentMessage[];
  onToolCallClick?: (inv: AgentToolInvocation) => void;
  /** Position of this round relative to the slider cursor. Drives
   *  past/active/future dimming. */
  state?: "active" | "past" | "future";
  /** Full ordered stage list — needed to do per-element progressive
   *  reveal inside the active round. */
  stages?: readonly Stage[];
  /** This round's stage index range in `stages`. Used together with
   *  `focusIndex` to decide which pieces of this round have happened
   *  yet (reasoning, each tool call's args, each tool call's result,
   *  mutation strip). */
  range?: { firstStageIndex: number; lastStageIndex: number };
  focusIndex?: number;
  /** Click the round header to jump the slider to this round's last
   *  stage — the only path from commentary → slider after the scroll
   *  handler was removed. */
  onClick?: () => void;
  agentName: string;
}) {
  const t = useLensTheme();
  const [showContext, setShowContext] = useState(false);
  const key = `${turnIndex}.${iter.index}`;
  const headline = iterationHeadline(iter, agentName);
  const contextMessages = allMessages.slice(0, iter.messagesSentCount);

  // Progressive-reveal cursor:
  //   • past round       → revealIdx = range.lastStageIndex  (everything visible)
  //   • active round     → revealIdx = focusIndex            (partial)
  //   • future round     → revealIdx = -1                    (show only the header skeleton)
  //   • no stages/range  → revealIdx = Infinity              (no slider → show everything)
  let revealIdx = Number.POSITIVE_INFINITY;
  if (range && focusIndex !== undefined) {
    if (state === "future") revealIdx = -1;
    else if (state === "past") revealIdx = range.lastStageIndex;
    else revealIdx = focusIndex;
  }
  const roundHasStarted = revealIdx >= (range?.firstStageIndex ?? 0);

  // Aggregate mutations only for stages that have actually fired as
  // of the slider position. Done inline so the strip stays in sync
  // with the progressive reveal (no stale "Changed: Tools +3" before
  // the return edge that caused the change has even landed).
  const revealedMutations = (() => {
    if (!stages || !range) return undefined;
    const agg: IterAggregatedMutations = {
      systemPrompt: false,
      tools: false,
      systemPromptDeltaChars: 0,
      toolsAdded: 0,
      toolsRemoved: 0,
      systemPromptAdded: "",
      toolsAddedList: [],
    };
    const stop = Math.min(revealIdx, range.lastStageIndex);
    for (let i = range.firstStageIndex; i <= stop; i++) {
      const m = stages[i]?.mutations;
      if (!m) continue;
      if (m.systemPrompt) agg.systemPrompt = true;
      if (m.tools) agg.tools = true;
      if (m.systemPromptDeltaChars) agg.systemPromptDeltaChars += m.systemPromptDeltaChars;
      if (m.toolsAdded) agg.toolsAdded += m.toolsAdded;
      if (m.toolsRemoved) agg.toolsRemoved += m.toolsRemoved;
      // Carry the payload forward. When multiple stages in the same
      // round contribute (rare but possible), concat the SP additions
      // and merge tool-name lists.
      if (m.systemPromptAdded) {
        agg.systemPromptAdded = agg.systemPromptAdded
          ? `${agg.systemPromptAdded}\n\n${m.systemPromptAdded}`
          : m.systemPromptAdded;
      }
      if (m.activatedSkillId && !agg.activatedSkillId) {
        agg.activatedSkillId = m.activatedSkillId;
      }
      if (m.toolsAddedList?.length) {
        for (const name of m.toolsAddedList) {
          if (!agg.toolsAddedList.includes(name)) agg.toolsAddedList.push(name);
        }
      }
    }
    return agg;
  })();
  const mutations = revealedMutations;

  // For each tool call in this round, find its outgoing and return
  // stage indices so we can show args/result progressively. Linear
  // scan — rounds are small and this only runs when stages change.
  const toolStageIdx = new Map<string, { outIdx: number; retIdx: number }>();
  if (stages) {
    for (const tc of iter.toolCalls) {
      let outIdx = -1;
      let retIdx = -1;
      for (let i = 0; i < stages.length; i++) {
        const s = stages[i];
        if (s.turnIndex !== turnIndex || s.iterIndex !== iter.index) continue;
        if (s.toolName !== tc.name) continue;
        if (s.from === "agent" && s.to === "tool" && outIdx < 0) outIdx = i;
        else if (s.from === "tool" && s.to === "agent" && retIdx < 0) retIdx = i;
      }
      toolStageIdx.set(tc.id, { outIdx, retIdx });
    }
  }

  // Active round is strongly foregrounded — mirrors the flowchart's
  // active node treatment (filled-tint background, accent left-bar,
  // pulse glow). Past rounds read as completed work (slightly muted,
  // no accent). Future rounds fade out heavily.
  const opacity = state === "future" ? 0.4 : state === "past" ? 0.85 : 1;
  const isActiveRound = state === "active";
  const background = isActiveRound
    ? `color-mix(in srgb, ${t.accent} 10%, ${t.bg})`
    : "transparent";
  const boxShadow = isActiveRound
    ? `0 0 0 1px ${t.accent}, 0 0 24px color-mix(in srgb, ${t.accent} 22%, transparent)`
    : "none";

  return (
    <div
      data-iter-key={key}
      data-turn-index={turnIndex}
      data-iter-index={iter.index}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: 12,
        margin: isActiveRound ? "2px -12px" : "-8px",
        borderRadius: 8,
        background,
        borderLeft: isActiveRound ? `3px solid ${t.accent}` : "3px solid transparent",
        boxShadow,
        opacity,
        transition:
          "background 220ms ease, box-shadow 220ms ease, opacity 220ms ease, border-left-color 220ms ease, margin 220ms ease",
      }}
    >
      {isActiveRound && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: -3,
            top: 8,
            bottom: 8,
            width: 3,
            background: t.accent,
            boxShadow: `0 0 8px ${t.accent}`,
            pointerEvents: "none",
          }}
        />
      )}
      {/* Headline + step metadata (readable sentence on left, subtle
          tech details on right). The headline itself is clickable so
          the user can jump the slider to this round. */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          fontSize: 13,
          color: t.textMuted,
        }}
      >
        <button
          onClick={onClick}
          disabled={!onClick}
          title={onClick ? "Jump the slider to this round" : undefined}
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            cursor: onClick ? "pointer" : "default",
            color: "inherit",
            font: "inherit",
            width: "auto",
            textAlign: "left",
          }}
        >
          <span style={{ color: t.accent, fontWeight: 600 }}>
            Round {iterPositionInTurn}:
          </span>
          <span style={{ color: t.text }}>{headline}</span>
        </button>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontSize: 10,
            color: t.textSubtle,
            fontFamily: t.fontMono,
          }}
        >
          {iter.inputTokens !== undefined &&
            `${iter.inputTokens}→${iter.outputTokens ?? "?"} tok · `}
          {iter.durationMs !== undefined && `${(iter.durationMs / 1000).toFixed(2)}s`}
        </span>
        <button
          onClick={() => setShowContext((v) => !v)}
          title="See exactly what Neo saw when deciding this step"
          style={{
            fontSize: 11,
            color: t.textMuted,
            background: "transparent",
            border: `1px solid ${t.border}`,
            borderRadius: 4,
            padding: "2px 8px",
            cursor: "pointer",
            fontWeight: 400,
            width: "auto",
          }}
        >
          {showContext ? "Hide" : "Show"} what Neo saw
        </button>
      </div>

      {roundHasStarted &&
        (iter.model || iter.stopReason || (iter.matchedInstructions?.length ?? 0) > 0) && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            fontSize: 10,
            color: t.textSubtle,
            fontFamily: t.fontMono,
            paddingLeft: 12,
          }}
        >
          {iter.model && (
            <MetaPill t={t} title="Model the LLM call was routed to">
              {iter.model}
            </MetaPill>
          )}
          {iter.stopReason && (
            <MetaPill t={t} title="Why the LLM stopped producing tokens">
              stop: {iter.stopReason}
            </MetaPill>
          )}
          {iter.matchedInstructions?.map((id) => (
            <MetaPill
              key={id}
              t={t}
              title="Instruction injected into this round"
              accent
            >
              ▸ {id}
            </MetaPill>
          ))}
        </div>
      )}
      {roundHasStarted && iter.assistantContent && (
        <ReasoningBubble text={iter.assistantContent} />
      )}
      {roundHasStarted && iter.toolCalls.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 12 }}>
          {iter.toolCalls.map((tc) => {
            const idx = toolStageIdx.get(tc.id);
            // Show the card when the outgoing agent→tool stage has
            // fired. If we don't know (no stages/range), fall back to
            // always-visible so non-live consumers still work.
            const cardRevealed = !idx || idx.outIdx < 0 || revealIdx >= idx.outIdx;
            if (!cardRevealed) return null;
            // The result section is hidden until the return edge
            // fires — debugging-faithful: shows "args sent; waiting
            // for tool" in between.
            const resultRevealed = !idx || idx.retIdx < 0 || revealIdx >= idx.retIdx;
            return (
              <ToolCallCard
                key={tc.id}
                invocation={tc}
                onClick={onToolCallClick}
                resultRevealed={resultRevealed}
              />
            );
          })}
        </div>
      )}
      {mutations && (mutations.systemPrompt || mutations.tools) && (
        <MutationStrip mutations={mutations} iter={iter} />
      )}
      {showContext && (
        <ContextDrawer
          messagesSentCount={iter.messagesSentCount}
          contextMessages={contextMessages}
          iter={iter}
        />
      )}
    </div>
  );
}

/**
 * The LLM's reasoning/answer text for a round, collapsed by default so
 * long blocks don't dominate the commentary. Shows a 1-line preview +
 * click-to-expand. Short text (<= preview length) renders inline
 * without a toggle — no point teasing a 40-char string.
 */
function ReasoningBubble({ text }: { text: string }) {
  const t = useLensTheme();
  const [open, setOpen] = useState(false);
  const PREVIEW_LEN = 140;
  const flat = text.replace(/\s+/g, " ").trim();
  const needsToggle = flat.length > PREVIEW_LEN;
  const preview = needsToggle ? flat.slice(0, PREVIEW_LEN - 1) + "…" : flat;

  return (
    <div
      style={{
        background: t.bgElev,
        border: `1px solid ${t.border}`,
        borderRadius: `2px ${t.radius} ${t.radius} ${t.radius}`,
        padding: "10px 14px",
        maxWidth: 820,
        whiteSpace: "pre-wrap",
        fontSize: 13,
        lineHeight: 1.55,
      }}
    >
      {needsToggle && !open ? (
        <>
          <span>{preview}</span>{" "}
          <button
            onClick={() => setOpen(true)}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              color: t.accent,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              width: "auto",
            }}
          >
            ▸ Show full reasoning
          </button>
        </>
      ) : (
        <>
          {text}
          {needsToggle && (
            <div style={{ marginTop: 6 }}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  color: t.textMuted,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 500,
                  width: "auto",
                }}
              >
                ▾ Collapse
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MetaPill({
  t,
  children,
  title,
  accent,
}: {
  t: ReturnType<typeof useLensTheme>;
  children: React.ReactNode;
  title?: string;
  accent?: boolean;
}) {
  return (
    <span
      title={title}
      style={{
        padding: "1px 6px",
        borderRadius: 3,
        background: accent
          ? `color-mix(in srgb, ${t.warning} 18%, transparent)`
          : t.bgElev,
        color: accent ? t.warning : t.textSubtle,
        fontWeight: accent ? 600 : 500,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/**
 * Shows which of the three LLM primitives this round MUTATED. Click
 * to expand into a diff view showing WHAT changed:
 *   • The skill body that landed in System Prompt (if a read_skill
 *     return caused the mutation)
 *   • The skill id that activated this round
 *   • Summary counts for tools added/removed
 * Messages is always true per round and is intentionally omitted
 * from the top-level badges to keep the annotation high signal.
 */
function MutationStrip({
  mutations,
  iter,
}: {
  mutations: IterAggregatedMutations;
  iter: AgentIteration;
}) {
  const t = useLensTheme();
  const [open, setOpen] = useState(false);
  // Source of truth for the diff content is now the aggregated
  // mutation object — the `pending` mechanism in deriveStages captures
  // the skill body + id at read_skill's return stage and propagates
  // the payload to the stage where the mutation is attributed. So
  // `mutations.systemPromptAdded` is the REAL text, not a reconstructed
  // best-guess like the previous iter.toolCalls scan was. Fall back
  // to that scan only when nothing's been propagated (defensive).
  const fallbackReadSkill = mutations.systemPromptAdded
    ? undefined
    : iter.toolCalls.find((tc) => tc.name === "read_skill");
  const skillId =
    mutations.activatedSkillId ||
    ((fallbackReadSkill?.arguments?.id as string | undefined) ?? "");
  const skillBody = mutations.systemPromptAdded || fallbackReadSkill?.result || "";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        paddingLeft: 12,
        fontSize: 11,
        color: t.textMuted,
        fontFamily: t.fontSans,
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 6,
          background: "transparent",
          border: "none",
          padding: 0,
          margin: 0,
          cursor: "pointer",
          color: "inherit",
          font: "inherit",
          width: "auto",
          textAlign: "left",
        }}
        title="Click to see the actual diff"
      >
        <span style={{ fontSize: 10, color: t.textSubtle }}>{open ? "▾" : "▸"}</span>
        <span
          style={{
            fontWeight: 700,
            color: t.accent,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontSize: 10,
          }}
        >
          ✎ Changed
        </span>
        <span>in Neo's input:</span>
        {mutations.systemPrompt && (
          <span
            style={{
              padding: "1px 7px",
              borderRadius: 3,
              background: `color-mix(in srgb, ${t.accent} 18%, transparent)`,
              color: t.accent,
              fontWeight: 600,
              letterSpacing: "0.02em",
            }}
          >
            System Prompt
            {mutations.systemPromptDeltaChars > 0 && (
              <span style={{ fontWeight: 400, marginLeft: 4 }}>
                +{mutations.systemPromptDeltaChars.toLocaleString()} chars
              </span>
            )}
          </span>
        )}
        {mutations.tools && (
          <span
            style={{
              padding: "1px 7px",
              borderRadius: 3,
              background: `color-mix(in srgb, ${t.accent} 18%, transparent)`,
              color: t.accent,
              fontWeight: 600,
              letterSpacing: "0.02em",
            }}
          >
            Tools
            {(mutations.toolsAdded > 0 || mutations.toolsRemoved > 0) && (
              <span style={{ fontWeight: 400, marginLeft: 4 }}>
                {mutations.toolsAdded > 0 ? `+${mutations.toolsAdded}` : ""}
                {mutations.toolsRemoved > 0 ? ` -${mutations.toolsRemoved}` : ""}
              </span>
            )}
          </span>
        )}
      </button>
      {open && (
        <MutationDiffModal
          mutations={mutations}
          skillId={skillId}
          skillBody={skillBody}
          visibleTools={iter.visibleTools}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Modal surface for the actual "what changed in Neo's input" diff.
 * The strip-level badges answer "what kind changed"; this modal
 * answers "show me the content so I can debug". Rendered into a full
 * overlay because skill bodies can be multi-KB and deserve real
 * screen real estate — inline expansion was cramped and easy to miss.
 */
function MutationDiffModal({
  mutations,
  skillId,
  skillBody,
  visibleTools,
  onClose,
}: {
  mutations: IterAggregatedMutations;
  skillId: string;
  skillBody: string;
  visibleTools: readonly string[];
  onClose: () => void;
}) {
  const t = useLensTheme();
  // Esc closes the modal. Window-scoped so it works regardless of
  // which modal descendant has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toolsToShow = mutations.toolsAddedList.length > 0
    ? mutations.toolsAddedList
    : visibleTools;

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.55)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.bg,
          color: t.text,
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.45)",
          width: "min(880px, 100%)",
          maxHeight: "min(80dvh, 800px)",
          display: "flex",
          flexDirection: "column",
          fontFamily: t.fontSans,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "14px 18px",
            borderBottom: `1px solid ${t.border}`,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                color: t.textSubtle,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontWeight: 600,
              }}
            >
              ✎ Changed in Neo's input
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>
              Round diff
              {skillId && (
                <>
                  {" · "}
                  <code
                    style={{
                      fontFamily: t.fontMono,
                      color: t.accent,
                      fontWeight: 600,
                    }}
                  >
                    {skillId}
                  </code>
                </>
              )}
            </div>
          </div>
          <span style={{ flex: 1 }} />
          <button
            onClick={onClose}
            title="Close (Esc)"
            style={{
              background: "transparent",
              border: `1px solid ${t.border}`,
              color: t.textMuted,
              padding: "4px 10px",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 12,
              width: "auto",
            }}
          >
            Esc
          </button>
        </div>
        <div
          style={{
            padding: 18,
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {mutations.systemPrompt && (
            <section>
              <div
                style={{
                  fontSize: 11,
                  color: t.textSubtle,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                System Prompt
                {mutations.systemPromptDeltaChars > 0 &&
                  ` · +${mutations.systemPromptDeltaChars.toLocaleString()} chars`}
              </div>
              {skillBody ? (
                <pre
                  style={{
                    margin: 0,
                    padding: "12px 14px",
                    background: t.bgElev,
                    border: `1px solid ${t.border}`,
                    borderLeft: `3px solid ${t.accent}`,
                    borderRadius: 6,
                    fontSize: 12,
                    lineHeight: 1.55,
                    fontFamily: t.fontMono,
                    color: t.text,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {skillBody}
                </pre>
              ) : (
                <div
                  style={{
                    padding: "10px 12px",
                    border: `1px dashed ${t.border}`,
                    borderRadius: 6,
                    color: t.textSubtle,
                    fontStyle: "italic",
                    fontSize: 12,
                  }}
                >
                  System Prompt grew by {mutations.systemPromptDeltaChars.toLocaleString()}{" "}
                  chars but the source text isn't flowing through the adapter for this round.
                </div>
              )}
            </section>
          )}
          {mutations.tools && (
            <section>
              <div
                style={{
                  fontSize: 11,
                  color: t.textSubtle,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                Tools
                {mutations.toolsAdded > 0 && ` · +${mutations.toolsAdded} added`}
                {mutations.toolsRemoved > 0 && ` · -${mutations.toolsRemoved} removed`}
              </div>
              {toolsToShow.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {toolsToShow.map((name) => (
                    <span
                      key={name}
                      style={{
                        padding: "3px 9px",
                        borderRadius: 4,
                        background: t.bgElev,
                        border: `1px solid ${t.border}`,
                        color: t.text,
                        fontFamily: t.fontMono,
                        fontSize: 11,
                      }}
                    >
                      {name}
                    </span>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    padding: "10px 12px",
                    border: `1px dashed ${t.border}`,
                    borderRadius: 6,
                    color: t.textSubtle,
                    fontStyle: "italic",
                    fontSize: 12,
                  }}
                >
                  The tool list that came online in this round isn't flowing through the
                  adapter yet — counts are available, names aren't.
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function ContextDrawer({
  messagesSentCount,
  contextMessages,
  iter,
}: {
  messagesSentCount: number;
  contextMessages: readonly AgentMessage[];
  iter: AgentIteration;
}) {
  const t = useLensTheme();
  return (
    <div
      style={{
        border: `1px dashed ${t.border}`,
        borderRadius: t.radius,
        padding: "10px 12px",
        background: t.bg,
        fontSize: 12,
        color: t.textMuted,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: t.textSubtle,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        What Neo saw before this step
      </div>
      <div style={{ color: t.text, marginBottom: 8 }}>
        <strong>{messagesSentCount}</strong> message{messagesSentCount === 1 ? "" : "s"} in
        context{iter.model ? ` · sent to ${iter.model}` : ""}
        {iter.inputTokens !== undefined && ` · ${iter.inputTokens} input tokens`}
      </div>
      {contextMessages.length === 0 ? (
        <div style={{ color: t.textSubtle, fontStyle: "italic" }}>
          Just the system configuration — this is the first call of the conversation.
        </div>
      ) : (
        <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
          {contextMessages.map((m, i) => (
            <li key={i} style={{ fontSize: 12 }}>
              <span
                style={{
                  display: "inline-block",
                  padding: "1px 6px",
                  borderRadius: 3,
                  background:
                    m.role === "user"
                      ? `color-mix(in srgb, ${t.accent} 20%, transparent)`
                      : m.role === "assistant"
                        ? t.bgElev
                        : m.role === "tool"
                          ? `color-mix(in srgb, ${t.success} 18%, transparent)`
                          : t.bgElev,
                  color:
                    m.role === "user"
                      ? t.accent
                      : m.role === "tool"
                        ? t.success
                        : t.text,
                  fontFamily: t.fontMono,
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  marginRight: 6,
                }}
              >
                {m.role}
              </span>
              <span style={{ color: t.textMuted }}>
                {summarizeMessage(m)}
              </span>
            </li>
          ))}
        </ol>
      )}
      <div
        style={{
          marginTop: 10,
          fontSize: 11,
          color: t.textSubtle,
          fontStyle: "italic",
        }}
      >
        Plus the system configuration (see top of conversation) and the tools Neo had access to.
      </div>
    </div>
  );
}

function summarizeMessage(m: AgentMessage): string {
  if (m.role === "tool") {
    return `tool result (${m.content.length.toLocaleString()} chars)`;
  }
  const t = m.content.replace(/\s+/g, " ").trim();
  return t.length > 120 ? t.slice(0, 120) + "…" : t;
}

function ToolCallCard({
  invocation,
  onClick,
  resultRevealed = true,
}: {
  invocation: AgentToolInvocation;
  onClick?: (inv: AgentToolInvocation) => void;
  /** When false, the "What the tool returned" section is hidden and a
   *  "waiting…" placeholder shows instead. Lets the active round tell
   *  the true story: args sent at stage N, result arrives at stage N+1,
   *  slider positions between them show only args. */
  resultRevealed?: boolean;
}) {
  const t = useLensTheme();
  const [open, setOpen] = useState(false);
  const preview = shortArgs(invocation.arguments);
  const errored = invocation.error === true;
  const friendlyVerb = toolVerb(invocation);
  // Card carries an accent dashed edge while the result is still
  // pending so the "in-flight" state reads at a glance even when
  // collapsed.
  const borderStyle = resultRevealed ? "solid" : "dashed";
  return (
    <div
      style={{
        border: `1px ${borderStyle} ${errored ? t.error : t.border}`,
        borderLeft: `3px ${borderStyle} ${errored ? t.error : t.accent}`,
        borderRadius: 6,
        background: t.bg,
        overflow: "hidden",
      }}
    >
      <div
        onClick={() => {
          setOpen((v) => !v);
          onClick?.(invocation);
        }}
        style={{
          padding: "8px 12px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 12,
        }}
      >
        <span style={{ color: t.textMuted, fontFamily: t.fontSans }}>
          {friendlyVerb}
        </span>
        <span style={{ color: errored ? t.error : t.accent, fontWeight: 600, fontFamily: t.fontMono }}>
          {invocation.name}
        </span>
        {preview && (
          <span style={{ color: t.textMuted, fontFamily: t.fontMono }}>
            ({preview})
          </span>
        )}
        <span style={{ flex: 1 }} />
        {!resultRevealed && (
          <span
            style={{
              fontSize: 10,
              padding: "1px 6px",
              borderRadius: 3,
              background: `color-mix(in srgb, ${t.accent} 18%, transparent)`,
              color: t.accent,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
            title="Args sent; waiting for the tool to return"
          >
            in flight
          </span>
        )}
        {invocation.decisionUpdate &&
          Object.keys(invocation.decisionUpdate).length > 0 && (
            <span
              style={{
                fontSize: 10,
                padding: "1px 6px",
                borderRadius: 3,
                background: `color-mix(in srgb, ${t.warning} 20%, transparent)`,
                color: t.warning,
                fontWeight: 600,
                textTransform: "uppercase",
              }}
              title="This tool changed what skill is active"
            >
              skill change
            </span>
          )}
        <span style={{ color: t.textSubtle }}>{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div style={{ padding: "8px 12px", borderTop: `1px solid ${t.border}` }}>
          <Label t={t}>What Neo asked for</Label>
          <JsonBlock value={invocation.arguments} />
          {resultRevealed && invocation.result && (
            <>
              <Label t={t} style={{ marginTop: 10 }}>
                What the tool returned
              </Label>
              <pre
                style={{
                  margin: 0,
                  padding: "8px 10px",
                  background: t.bgElev,
                  borderRadius: 4,
                  fontSize: 11,
                  fontFamily: t.fontMono,
                  color: errored ? t.error : t.text,
                  maxHeight: 280,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                {invocation.result}
              </pre>
            </>
          )}
          {!resultRevealed && (
            <div
              style={{
                marginTop: 10,
                padding: "10px 12px",
                border: `1px dashed ${t.border}`,
                borderRadius: 4,
                fontSize: 12,
                color: t.textSubtle,
                fontStyle: "italic",
              }}
            >
              Neo has sent the args; advance the slider to see the result this tool returned.
            </div>
          )}
          {resultRevealed && invocation.decisionUpdate &&
            Object.keys(invocation.decisionUpdate).length > 0 && (
              <>
                <Label t={t} style={{ marginTop: 10 }}>
                  What changed in Neo's state
                </Label>
                <JsonBlock value={invocation.decisionUpdate} />
              </>
            )}
        </div>
      )}
    </div>
  );
}

function toolVerb(inv: AgentToolInvocation): string {
  if (inv.name === "list_skills") return "Asked for";
  if (inv.name === "read_skill") return "Activated";
  if (inv.name === "ask_human" || inv.name === "ask_user") return "Asked user for";
  return "Called tool";
}

function Label({
  t,
  children,
  style,
}: {
  t: ReturnType<typeof useLensTheme>;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        fontSize: 10,
        color: t.textSubtle,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        fontWeight: 600,
        marginBottom: 4,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  const t = useLensTheme();
  return (
    <pre
      style={{
        margin: 0,
        padding: "8px 10px",
        background: t.bgElev,
        borderRadius: 4,
        fontSize: 11,
        fontFamily: t.fontMono,
        color: t.text,
        maxHeight: 200,
        overflow: "auto",
      }}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function shortArgs(args: Record<string, unknown>): string {
  const keys = Object.keys(args);
  if (keys.length === 0) return "";
  if (keys.length === 1) {
    const v = args[keys[0]];
    if (typeof v === "string" && v.length < 40) return `${keys[0]}: "${v}"`;
  }
  return keys.join(", ");
}

export { ToolCallCard };

/**
 * Build a `Map<iterKey, {firstStageIndex, lastStageIndex}>` from the
 * stages array. Used to round-trip focusIndex ↔ iteration block.
 *
 * - An iteration's range = the min/max stage indices that fall inside
 *   the matching `turnIndex` + `iterIndex` pair.
 * - Stages with no `iterIndex` (user→agent message, final agent→user)
 *   are rolled into the nearest iteration: user message → first iter
 *   of that turn; final answer → last iter of that turn.
 *
 * Wrapped in a hook so it memoizes against the stages array identity.
 */
function useIterationStageRanges(
  stages: readonly Stage[] | undefined,
): Map<string, { firstStageIndex: number; lastStageIndex: number }> {
  return React.useMemo(() => {
    const map = new Map<string, { firstStageIndex: number; lastStageIndex: number }>();
    if (!stages?.length) return map;
    // Per-turn iteration lists so we can attach boundary stages.
    const turnIters = new Map<number, number[]>();
    for (const s of stages) {
      if (s.iterIndex === undefined) continue;
      const list = turnIters.get(s.turnIndex) ?? [];
      if (!list.includes(s.iterIndex)) list.push(s.iterIndex);
      turnIters.set(s.turnIndex, list);
    }
    stages.forEach((s, idx) => {
      let iter = s.iterIndex;
      if (iter === undefined) {
        const iters = turnIters.get(s.turnIndex);
        if (!iters?.length) return;
        // user → agent (message from user): attach to FIRST iter.
        // agent → user (final answer):       attach to LAST iter.
        iter = s.from === "user" ? iters[0] : iters[iters.length - 1];
      }
      const key = `${s.turnIndex}.${iter}`;
      const prev = map.get(key);
      if (!prev) {
        map.set(key, { firstStageIndex: idx, lastStageIndex: idx });
      } else {
        map.set(key, {
          firstStageIndex: Math.min(prev.firstStageIndex, idx),
          lastStageIndex: Math.max(prev.lastStageIndex, idx),
        });
      }
    });
    return map;
  }, [stages]);
}

/**
 * Aggregated mutation summary for an iteration — OR of all `mutations`
 * on the stages that belong to this iteration. Drives the per-round
 * "Touched: System Prompt · Tools" annotation in the commentary so the
 * reader can see which of the three LLM primitives actually changed
 * as a result of this round, without having to click through to the
 * right panel.
 */
interface IterAggregatedMutations {
  systemPrompt: boolean;
  tools: boolean;
  systemPromptDeltaChars: number;
  toolsAdded: number;
  toolsRemoved: number;
  /** Concatenated text that the System Prompt received across all
   *  stages in this round — usually the body of a `read_skill` return
   *  that got attributed here via the `pending` mechanism. */
  systemPromptAdded: string;
  /** Skill id that activated in this round (if any). */
  activatedSkillId?: string;
  /** Tool names that came online during this round. */
  toolsAddedList: string[];
}


/** Find the iteration key whose stage range contains the focus index. */
function keyForStage(
  ranges: Map<string, { firstStageIndex: number; lastStageIndex: number }>,
  focusIndex: number,
): string | null {
  for (const [key, r] of ranges) {
    if (focusIndex >= r.firstStageIndex && focusIndex <= r.lastStageIndex) return key;
  }
  return null;
}
