/**
 * MessagesPanel — the primary Lens surface. Chat-shaped view of an agent
 * run with turn boundaries, iteration markers, and expandable tool calls.
 *
 * Data comes from `fromAgentSnapshot(runtimeSnapshot).turns`. Each turn
 * is:
 *   • one user message
 *   • one or more assistant iterations (each may request N tool calls)
 *   • tool role bubbles bound to their assistant parent
 *   • final assistant bubble
 *
 * Theme is read via `useLensTheme()` which maps FootprintTheme tokens
 * into Lens's semantic palette. Consumers get free light/dark support
 * by wrapping their app in `<FootprintTheme tokens={coolLight|coolDark}>`
 * — no Lens-specific theme API to learn.
 */
import { useState } from "react";
import type {
  AgentIteration,
  AgentMessage,
  AgentTimeline,
  AgentToolInvocation,
  AgentTurn,
} from "../adapters/types";
import { useLensTheme } from "../theme/useLensTheme";

export interface MessagesPanelProps {
  readonly timeline: AgentTimeline;
  /**
   * Called when the user clicks a tool-call card. Host app surfaces it
   * in the Tool Call Inspector. When omitted, clicking is a no-op.
   */
  readonly onToolCallClick?: (invocation: AgentToolInvocation) => void;
  /** Optional system-prompt text to render in the collapsible preamble. */
  readonly systemPrompt?: string;
}

export function MessagesPanel({
  timeline,
  onToolCallClick,
  systemPrompt,
}: MessagesPanelProps) {
  const t = useLensTheme();
  return (
    <div
      data-fp-lens="messages-panel"
      style={{
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
      {systemPrompt && <SystemBubble text={systemPrompt} />}
      {timeline.turns.map((turn) => (
        <TurnBlock key={turn.index} turn={turn} onToolCallClick={onToolCallClick} />
      ))}
    </div>
  );
}

function SystemBubble({ text }: { text: string }) {
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
        <strong>SYSTEM</strong> {open ? "▾" : "▸"} {open ? "" : preview}
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
  onToolCallClick,
}: {
  turn: AgentTurn;
  onToolCallClick?: (inv: AgentToolInvocation) => void;
}) {
  const t = useLensTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <TurnHeader turn={turn} />
      <UserBubble text={turn.userPrompt} />
      {turn.iterations.map((iter) => (
        <IterationBlock key={iter.index} iter={iter} onToolCallClick={onToolCallClick} />
      ))}
      {turn.finalContent && turn.iterations.length > 0 && (
        <div style={{ fontSize: 11, color: t.textSubtle, textAlign: "center" }}>
          turn {turn.index + 1} final · {turn.iterations.length} iter · {turn.totalInputTokens}→
          {turn.totalOutputTokens} tok · {(turn.totalDurationMs / 1000).toFixed(1)}s
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
      <span>Turn {turn.index + 1}</span>
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

function IterationBlock({
  iter,
  onToolCallClick,
}: {
  iter: AgentIteration;
  onToolCallClick?: (inv: AgentToolInvocation) => void;
}) {
  const t = useLensTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <IterationBadge iter={iter} />
      {iter.assistantContent && (
        <div
          style={{
            background: t.bgElev,
            border: `1px solid ${t.border}`,
            borderRadius: `2px ${t.radius} ${t.radius} ${t.radius}`,
            padding: "10px 14px",
            maxWidth: 820,
            whiteSpace: "pre-wrap",
          }}
        >
          {iter.assistantContent}
        </div>
      )}
      {iter.toolCalls.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 12 }}>
          {iter.toolCalls.map((tc) => (
            <ToolCallCard key={tc.id} invocation={tc} onClick={onToolCallClick} />
          ))}
        </div>
      )}
    </div>
  );
}

function IterationBadge({ iter }: { iter: AgentIteration }) {
  const t = useLensTheme();
  const bits: string[] = [`iter ${iter.index}`];
  if (iter.model) bits.push(iter.model);
  if (iter.inputTokens !== undefined)
    bits.push(`${iter.inputTokens}→${iter.outputTokens ?? "?"} tok`);
  if (iter.durationMs !== undefined) bits.push(`${(iter.durationMs / 1000).toFixed(2)}s`);
  if (iter.stopReason) bits.push(iter.stopReason);
  return (
    <div
      style={{
        alignSelf: "flex-start",
        fontSize: 10,
        color: t.textSubtle,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        fontWeight: 600,
        fontFamily: t.fontMono,
      }}
    >
      {bits.join(" · ")}
    </div>
  );
}

function ToolCallCard({
  invocation,
  onClick,
}: {
  invocation: AgentToolInvocation;
  onClick?: (inv: AgentToolInvocation) => void;
}) {
  const t = useLensTheme();
  const [open, setOpen] = useState(false);
  const preview = shortArgs(invocation.arguments);
  const errored = invocation.error === true;
  return (
    <div
      style={{
        border: `1px solid ${errored ? t.error : t.border}`,
        borderLeft: `3px solid ${errored ? t.error : t.accent}`,
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
          fontFamily: t.fontMono,
        }}
      >
        <span style={{ color: errored ? t.error : t.accent, fontWeight: 600 }}>
          {invocation.name}
        </span>
        <span style={{ color: t.textMuted }}>({preview})</span>
        <span style={{ flex: 1 }} />
        {invocation.decisionUpdate && Object.keys(invocation.decisionUpdate).length > 0 && (
          <span
            style={{
              fontSize: 10,
              padding: "1px 6px",
              borderRadius: 3,
              background: `color-mix(in srgb, ${t.warning} 20%, transparent)`,
              color: t.warning,
              fontFamily: t.fontSans,
              fontWeight: 600,
              textTransform: "uppercase",
            }}
          >
            decisionUpdate
          </span>
        )}
        <span style={{ color: t.textSubtle }}>{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div style={{ padding: "8px 12px", borderTop: `1px solid ${t.border}` }}>
          <Label t={t}>args</Label>
          <JsonBlock value={invocation.arguments} />
          {invocation.result && (
            <>
              <Label t={t} style={{ marginTop: 10 }}>
                result
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
          {invocation.decisionUpdate &&
            Object.keys(invocation.decisionUpdate).length > 0 && (
              <>
                <Label t={t} style={{ marginTop: 10 }}>
                  decisionUpdate
                </Label>
                <JsonBlock value={invocation.decisionUpdate} />
              </>
            )}
        </div>
      )}
    </div>
  );
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

function _assertUnused(_: AgentMessage) {
  // Exported type is referenced from ./index.ts; keeping the import
  // for bundler tree-shaking consistency without introducing a new
  // linter warning on a "used-elsewhere" type import.
  void _;
}
_assertUnused;
