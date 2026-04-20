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
import { useEffect, useRef, useState } from "react";
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
  readonly onToolCallClick?: (invocation: AgentToolInvocation) => void;
  readonly systemPrompt?: string;
  readonly selectedIterKey?: string | null;
}

export function MessagesPanel({
  timeline,
  onToolCallClick,
  systemPrompt,
  selectedIterKey,
}: MessagesPanelProps) {
  const t = useLensTheme();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!selectedIterKey || !scrollRef.current) return;
    const target = scrollRef.current.querySelector<HTMLDivElement>(
      `[data-iter-key="${CSS.escape(selectedIterKey)}"]`,
    );
    if (!target) return;
    target.scrollIntoView({ block: "start", behavior: "smooth" });
    target.setAttribute("data-iter-selected", "true");
    const h = window.setTimeout(() => target.removeAttribute("data-iter-selected"), 1200);
    return () => window.clearTimeout(h);
  }, [selectedIterKey]);

  return (
    <div
      ref={scrollRef}
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
        <TurnBlock
          key={turn.index}
          turn={turn}
          allMessages={timeline.messages}
          onToolCallClick={onToolCallClick}
        />
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
        <strong>How Neo is configured</strong> {open ? "▾" : "▸"} {open ? "" : preview}
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
}: {
  turn: AgentTurn;
  allMessages: readonly AgentMessage[];
  onToolCallClick?: (inv: AgentToolInvocation) => void;
}) {
  const t = useLensTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <TurnHeader turn={turn} />
      <UserBubble text={turn.userPrompt} />
      {turn.iterations.map((iter, i) => (
        <IterationBlock
          key={iter.index}
          iter={iter}
          iterPositionInTurn={i + 1}
          turnIndex={turn.index}
          allMessages={allMessages}
          onToolCallClick={onToolCallClick}
        />
      ))}
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
 * actually did (list_skills, read_skill, other tools, or final) and
 * renders a sentence instead of a technical label.
 */
function iterationHeadline(iter: AgentIteration): string {
  if (iter.toolCalls.length === 0) {
    return "Neo is ready to answer";
  }
  if (iter.toolCalls.length === 1) {
    const tc = iter.toolCalls[0];
    if (tc.name === "list_skills") return "Neo is looking up available skills";
    if (tc.name === "read_skill") {
      const id = (tc.arguments?.id as string | undefined) ?? "?";
      return `Neo activated the “${id}” skill`;
    }
    return `Neo called ${tc.name} to get data`;
  }
  // parallel tool calls — summarize
  const names = iter.toolCalls.map((tc) => tc.name);
  if (names.length <= 3) return `Neo called ${names.join(", ")} in parallel`;
  return `Neo gathered data from ${names.length} sources in parallel`;
}

function IterationBlock({
  iter,
  iterPositionInTurn,
  turnIndex,
  allMessages,
  onToolCallClick,
}: {
  iter: AgentIteration;
  iterPositionInTurn: number;
  turnIndex: number;
  allMessages: readonly AgentMessage[];
  onToolCallClick?: (inv: AgentToolInvocation) => void;
}) {
  const t = useLensTheme();
  const [showContext, setShowContext] = useState(false);
  const key = `${turnIndex}.${iter.index}`;
  const headline = iterationHeadline(iter);
  const contextMessages = allMessages.slice(0, iter.messagesSentCount);

  return (
    <div
      data-iter-key={key}
      data-turn-index={turnIndex}
      data-iter-index={iter.index}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: 8,
        margin: -8,
        borderRadius: t.radius,
        outline: "2px solid transparent",
        outlineOffset: 2,
        transition: "outline-color 180ms ease, background 180ms ease",
      }}
    >
      {/* Headline + step metadata (readable sentence on left, subtle
          tech details on right). */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          fontSize: 13,
          color: t.textMuted,
        }}
      >
        <span style={{ color: t.accent, fontWeight: 600 }}>
          Step {iterPositionInTurn}:
        </span>
        <span style={{ color: t.text }}>{headline}</span>
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
}: {
  invocation: AgentToolInvocation;
  onClick?: (inv: AgentToolInvocation) => void;
}) {
  const t = useLensTheme();
  const [open, setOpen] = useState(false);
  const preview = shortArgs(invocation.arguments);
  const errored = invocation.error === true;
  const friendlyVerb = toolVerb(invocation);
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
          {invocation.result && (
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
          {invocation.decisionUpdate &&
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
  return "Called";
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
