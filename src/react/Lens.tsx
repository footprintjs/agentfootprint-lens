/**
 * Lens — the single public component consumers call.
 *
 * Hand it a runtimeSnapshot, name your app via `appName`, and Lens
 * takes over: renders the live agent view and the Explainable Trace
 * surface as two tabs. Consumer writes one JSX tag:
 *
 *   import { Lens } from "agentfootprint-lens";
 *
 *   <Lens runtimeSnapshot={agent.getSnapshot()} appName="Neo" />
 *
 * Explainable Trace is always available — Lens renders it internally
 * from the same runtime snapshot via `<ExplainableShell>` from
 * `footprint-explainable-ui`. Consumers don't have to wire the trace
 * view themselves.
 *
 * Skills are optional. If the app doesn't register any skills, the
 * Skills button + modal simply don't render — no empty state.
 */
import { useEffect, useReducer, useState } from "react";
import type { ReactNode } from "react";
import { ExplainableShell, FootprintTheme } from "footprint-explainable-ui";
import type { ThemeTokens, NarrativeEntry } from "footprint-explainable-ui";
import { AgentLens } from "./AgentLens";
import type { AgentLensProps } from "./AgentLens";
import { Tabs } from "./components/Tabs/Tabs";
import { SelfSizingRoot } from "./layout/SelfSizingRoot";
import { resolve as resolveLensTheme, useLensTheme } from "./theme/useLensTheme";
import { useLiveTimeline } from "./hooks/useLiveTimeline";

/**
 * Shape every agentfootprint runner exposes — all Lens needs to feed
 * itself from a runner: subscribe to its events, read its snapshot, and
 * (optionally) narrative entries + spec. Accept partial implementations
 * so Lens works with user-built runners that only implement what they
 * need. Not all fields present? Lens renders the empty state for any
 * missing channel.
 */
export interface LensRunner {
  /**
   * Preferred path (agentfootprint 1.21+): attach a recorder directly
   * to the executor's emit channel. Lens uses this when available so
   * the AgentTimelineRecorder receives full EmitEvent (with real
   * runtimeStageId + subflowPath), enabling multi-agent grouping.
   * Falls back to `observe()` for older runner versions.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attachRecorder?: (recorder: any) => () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  observe?: (handler: (event: any) => void) => (() => void);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getSnapshot?: () => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getNarrativeEntries?: () => readonly any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getSpec?: () => any;
}

export interface LensProps {
  /**
   * Runtime snapshot from `agent.getSnapshot()`. Lens parses this
   * into an agent-shaped timeline for the Lens tab and hands the
   * raw snapshot to `<ExplainableShell>` for the Trace tab.
   * `null` renders the empty-state copy.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly runtimeSnapshot?: any | null;
  /** Pre-parsed timeline for the Lens tab. When set, wins over
   *  `runtimeSnapshot` for the Lens tab specifically. The Trace tab
   *  still reads from `runtimeSnapshot`. */
  readonly timeline?: AgentLensProps["timeline"];
  /** Consumer app name — e.g. "Neo". Rendered as a brand label at
   *  the left of the tab strip. Omit for no brand. */
  readonly appName?: string;
  /** Optional system prompt forwarded to the Lens tab's Messages panel. */
  readonly systemPrompt?: string;
  /** Optional skills. If omitted, the Skills UI doesn't render. */
  readonly skills?: AgentLensProps["skills"];
  /** Explicit active-skill override. */
  readonly activeSkillId?: AgentLensProps["activeSkillId"];
  /** Tool-call click callback for consumers wiring a drill-down. */
  readonly onToolCallClick?: AgentLensProps["onToolCallClick"];
  /** Initial tab on mount. Defaults to "lens". */
  readonly defaultTabId?: "lens" | "trace";
  /** Extra trailing slot on the tab strip — e.g. theme toggle,
   *  width expander. */
  readonly trailingSlot?: ReactNode;
  /** Keep both tabs mounted (preserves scroll / internal state on
   *  tab switch). Default false — only the selected tab is mounted. */
  readonly renderAll?: boolean;
  /**
   * Optional OVERRIDE for the Explainable Trace tab's content. The
   * tab itself is always present — pass a custom node here to render
   * a fancier trace surface (e.g. `<ExplainableShell>` with
   * `renderFlowchart` wired up, or `<TracedFlowchartView>` alongside
   * a narrative panel). When omitted, Lens renders a default
   * `<ExplainableShell runtimeSnapshot={...} />` for you.
   */
  readonly traceView?: ReactNode;
  /**
   * Structured narrative entries from `executor.getNarrativeEntries()`.
   * Forwarded to the default Explainable Trace tab — the adapter
   * groups entries by stageId so each snapshot's "Insights → Story"
   * panel shows the rich per-stage narrative. Without this, stages
   * show "Narrative not available".
   *
   * This is the single narrative prop you need; the flat string form
   * (`executor.getNarrative()`) is derivable from these entries and is
   * NOT a separate input.
   */
  readonly narrativeEntries?: readonly NarrativeEntry[];
  /**
   * FlowChart spec from `executor.getSpec()` / `chart.toSpec()`.
   * Forwarded to the default trace view so the flowchart panel
   * renders the stage topology. Without it, the trace tab shows a
   * snapshot list but no flowchart.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly spec?: any | null;
  /**
   * Theme tokens. When supplied, Lens wraps its tree in
   * `<FootprintTheme tokens={theme}>` internally — consumers don't
   * have to import FootprintTheme themselves. When omitted, Lens
   * inherits from whatever `<FootprintTheme>` ancestor wraps it (so
   * apps that already manage theming app-wide don't double-wrap).
   *
   * Import presets from `footprint-explainable-ui` for quick dark /
   * light modes:
   *
   *   import { coolDark, coolLight } from "footprint-explainable-ui";
   *   <Lens theme={dark ? coolDark : coolLight} .../>
   */
  readonly theme?: ThemeTokens;
  /**
   * The runner to watch — any object with `observe()` + `getSnapshot()`.
   * When supplied, Lens auto-subscribes to the runner's event stream,
   * tracks its snapshot, and reads narrativeEntries + spec. Consumers
   * don't pass timeline / runtimeSnapshot / narrativeEntries / spec
   * manually. This is the recommended integration for app code.
   *
   *     const agent = useLens(() => Agent.create(...).build());
   *     <Lens for={agent} />
   *
   * Takes precedence over the explicit props when present. Omit to
   * drive Lens explicitly (replay scenarios, custom ingestion, testing).
   *
   * The prop is named `for` because it reads naturally as
   * "Lens for this runner" — valid in JSX despite being a JS keyword.
   */
  readonly for?: LensRunner | null;
}

export function Lens({
  runtimeSnapshot,
  timeline,
  appName,
  systemPrompt,
  skills,
  activeSkillId,
  onToolCallClick,
  defaultTabId = "lens",
  trailingSlot,
  renderAll = false,
  traceView,
  narrativeEntries,
  spec,
  theme,
  for: runnerProp,
}: LensProps) {
  // When the consumer passes `theme`, resolve it DIRECTLY instead of going
  // through `useLensTheme()`'s context read. The `<FootprintTheme>` wrap at
  // the bottom of this component only affects *descendants*, not the Tabs
  // colors we compute here — so without this, the Tabs fall back to the
  // coolDark defaults even when the consumer asks for a different palette.
  const themedTokens = useLensTheme();
  const t = theme ? resolveLensTheme(theme) : themedTokens;
  const [selectedId, setSelectedId] = useState<string>(defaultTabId);

  // ── `for={runner}` path ─────────────────────────────────────────
  // When a runner is supplied, Lens picks the best wiring path the
  // runner exposes:
  //
  //   1. PREFERRED — `runner.attachRecorder(recorder)` (agentfootprint
  //      1.21+). Lens attaches the canonical `agentTimeline()` recorder
  //      directly to the executor's emit channel. Recorder receives
  //      full EmitEvent (real runtimeStageId + subflowPath) — required
  //      for multi-agent grouping. Also more efficient: no event-shape
  //      translation, no synth ids.
  //
  //   2. FALLBACK — `runner.observe(handler)`. Lens subscribes to the
  //      AgentStreamEvent stream and translates each event to EmitEvent
  //      shape inside `useLiveTimeline`. Older runner versions only
  //      have this path; multi-agent grouping limited.
  //
  // Either way, consumers writing `<Lens for={agent} />` get everything
  // for free. The explicit props (timeline, runtimeSnapshot, ...)
  // remain the "raw" path for replay / test scenarios.
  const autoLens = useLiveTimeline();
  const [, bumpSnapshot] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!runnerProp) return;
    autoLens.reset();

    // Bumper: re-render after each turn so the snapshot accessors
    // (getSnapshot / getNarrativeEntries / getSpec) return final values.
    const onTurnComplete = () => bumpSnapshot();

    // Path 1 — direct recorder attach (agentfootprint 1.21+)
    if (runnerProp.attachRecorder) {
      const detachRecorder = runnerProp.attachRecorder(autoLens.recorder);
      // Still subscribe to observe() purely for the turn-complete bump
      // signal — recorder doesn't drive React re-renders by itself.
      const stopObserve = runnerProp.observe?.((event: unknown) => {
        const type =
          event && typeof event === "object"
            ? (event as { type?: string }).type
            : undefined;
        if (type === "turn_end" || type === "agentfootprint.agent.turn_complete") {
          onTurnComplete();
        }
        // Also force a re-render every event — the recorder updated
        // its internal storage but React doesn't know yet. Cheap
        // because getTimeline() is bounded by run length.
        bumpSnapshot();
      });
      return () => {
        detachRecorder();
        stopObserve?.();
      };
    }

    // Path 2 — observe() + translate (older runners)
    if (!runnerProp.observe) return;
    const stop = runnerProp.observe((event: unknown) => {
      autoLens.ingest(event);
      const type =
        event && typeof event === "object"
          ? (event as { type?: string }).type
          : undefined;
      if (type === "turn_end" || type === "agentfootprint.agent.turn_complete") {
        onTurnComplete();
      }
    });
    return stop;
    // autoLens + bumpSnapshot are stable; runnerProp identity drives resubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runnerProp]);

  // Decide which data source wins: runner-driven (preferred) or explicit props.
  const usingRunner = !!runnerProp?.observe || !!runnerProp?.attachRecorder;
  const resolvedTimeline = usingRunner ? autoLens.timeline : timeline;
  const resolvedSnapshot = usingRunner
    ? (runnerProp?.getSnapshot?.() ?? null)
    : (runtimeSnapshot ?? null);
  const resolvedNarrative = usingRunner
    ? (runnerProp?.getNarrativeEntries?.() as NarrativeEntry[] | undefined)
    : narrativeEntries;
  const resolvedSpec = usingRunner ? runnerProp?.getSpec?.() : spec;

  const agentLensProps: AgentLensProps = {
    runtimeSnapshot: resolvedSnapshot,
    ...(resolvedTimeline !== undefined ? { timeline: resolvedTimeline } : {}),
    ...(systemPrompt !== undefined ? { systemPrompt } : {}),
    ...(skills !== undefined ? { skills } : {}),
    ...(activeSkillId !== undefined ? { activeSkillId } : {}),
    ...(onToolCallClick !== undefined ? { onToolCallClick } : {}),
    // appName doubles as the narration name — when "Neo" is the brand
    // it's also "Neo called list_skills" inside the panel. Consumers
    // who want different brand vs narration can override AgentLens
    // directly with `agentName`, but the common case is "they're the
    // same string" so we forward it implicitly.
    ...(appName !== undefined ? { agentName: appName } : {}),
  };

  const brand = appName ? (
    <span
      data-fp-lens="brand"
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: t.text,
        fontFamily: t.fontSans,
        letterSpacing: "0.01em",
        whiteSpace: "nowrap",
      }}
      title={`Lens · ${appName}`}
    >
      {appName}
    </span>
  ) : null;

  // Lens resolves theme-backed colors from its own `useLensTheme()`
  // (which reads from FootprintTheme context) and hands the literal
  // strings to <Tabs>. Tabs doesn't read theme itself — so the
  // tab+body color match is inspectable in devtools: both paint the
  // EXACT same color string, no CSS-var indirection.
  const shell = (
    <Tabs
      tabs={[
        {
          id: "lens",
          label: "Lens",
          content: <AgentLens {...agentLensProps} />,
        },
        {
          id: "trace",
          label: "Explainable Trace",
          // Consumer-supplied override wins; otherwise render a
          // default `<ExplainableShell>` from the same runtime
          // snapshot so consumers get something useful out of the
          // box without wiring anything.
          content: traceView ?? (
            <ExplainableShell
              runtimeSnapshot={resolvedSnapshot ?? null}
              {...(resolvedNarrative !== undefined
                ? { narrativeEntries: [...resolvedNarrative] }
                : {})}
              {...(resolvedSpec !== undefined ? { spec: resolvedSpec } : {})}
            />
          ),
        },
      ]}
      selectedTabId={selectedId}
      onChange={setSelectedId}
      renderAll={renderAll}
      surface={t.bg}
      textColor={t.text}
      mutedTextColor={t.textMuted}
      borderColor={t.border}
      fontFamily={t.fontSans}
      {...(brand !== null ? { leadingSlot: brand } : {})}
      {...(trailingSlot !== undefined ? { trailingSlot } : {})}
    />
  );

  // Wrap the whole tree in SelfSizingRoot so Lens has a guaranteed
  // usable size no matter what the host's parent chain looks like.
  // SelfSizingRoot handles the fallback (min 400px, max 100dvh) plus
  // CSS containment (isolates Lens from surrounding page layout).
  //
  // When the consumer passes `theme`, Lens also owns the
  // FootprintTheme wrapper. `display: contents` on FootprintTheme's
  // wrapper (shipped alongside this) means it's invisible to layout,
  // so placing it outside SelfSizingRoot is fine — CSS vars still
  // cascade. We put it OUTSIDE so the theme is also active for the
  // SelfSizingRoot's own data-fp-lens attribute hooks.
  const sized = <SelfSizingRoot dataAttr="shell">{shell}</SelfSizingRoot>;
  return theme ? <FootprintTheme tokens={theme}>{sized}</FootprintTheme> : sized;
}
