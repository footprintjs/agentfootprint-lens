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
import { useMemo, useState } from "react";
import { fromAgentSnapshot } from "./adapters/fromAgentSnapshot";
import type {
  AgentToolInvocation,
  AgentTimeline,
} from "./adapters/types";
import { MessagesPanel } from "./panels/MessagesPanel";
import { IterationStrip } from "./panels/IterationStrip";
import { ToolCallInspector } from "./panels/ToolCallInspector";
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
}

export function AgentLens({
  runtimeSnapshot,
  timeline: providedTimeline,
  systemPrompt,
  onToolCallClick,
}: AgentLensProps) {
  const t = useLensTheme();
  const timeline = useMemo<AgentTimeline | null>(() => {
    if (providedTimeline) return providedTimeline;
    if (!runtimeSnapshot) return null;
    return fromAgentSnapshot(runtimeSnapshot);
  }, [providedTimeline, runtimeSnapshot]);

  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [selectedIterKey, setSelectedIterKey] = useState<string | null>(null);

  function handleToolClick(inv: AgentToolInvocation) {
    setSelectedToolId(inv.id);
    setSelectedIterKey(`${inv.turnIndex}.${inv.iterationIndex}`);
    onToolCallClick?.(inv);
  }

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

  return (
    <div
      data-fp-lens="shell"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 320px",
        gridTemplateRows: "auto 1fr",
        gridTemplateAreas: '"strip strip" "messages inspector"',
        height: "100%",
        minHeight: 0,
        background: t.bg,
        color: t.text,
        fontFamily: t.fontSans,
      }}
    >
      <div style={{ gridArea: "strip" }}>
        <IterationStrip
          timeline={timeline}
          selectedKey={selectedIterKey}
          onSelect={setSelectedIterKey}
        />
      </div>
      <div style={{ gridArea: "messages", minHeight: 0, overflow: "hidden" }}>
        <MessagesPanel
          timeline={timeline}
          onToolCallClick={handleToolClick}
          {...(derivedSystemPrompt && { systemPrompt: derivedSystemPrompt })}
        />
      </div>
      <div
        style={{
          gridArea: "inspector",
          minHeight: 0,
          overflow: "hidden",
          borderLeft: `1px solid ${t.border}`,
        }}
      >
        <ToolCallInspector
          timeline={timeline}
          selectedId={selectedToolId}
          onSelect={handleToolClick}
        />
      </div>
    </div>
  );
}
