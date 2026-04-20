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
import { useState } from "react";
import type { ReactNode } from "react";
import { ExplainableShell, FootprintTheme } from "footprint-explainable-ui";
import type { ThemeTokens } from "footprint-explainable-ui";
import { AgentLens } from "./AgentLens";
import type { AgentLensProps } from "./AgentLens";
import { Tabs } from "./components/Tabs/Tabs";
import { SelfSizingRoot } from "./layout/SelfSizingRoot";
import { useLensTheme } from "./theme/useLensTheme";

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
  theme,
}: LensProps) {
  const t = useLensTheme();
  const [selectedId, setSelectedId] = useState<string>(defaultTabId);

  const agentLensProps: AgentLensProps = {
    runtimeSnapshot,
    ...(timeline !== undefined ? { timeline } : {}),
    ...(systemPrompt !== undefined ? { systemPrompt } : {}),
    ...(skills !== undefined ? { skills } : {}),
    ...(activeSkillId !== undefined ? { activeSkillId } : {}),
    ...(onToolCallClick !== undefined ? { onToolCallClick } : {}),
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
            <ExplainableShell runtimeSnapshot={runtimeSnapshot ?? null} />
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
