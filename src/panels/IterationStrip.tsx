/**
 * IterationStrip — horizontal ribbon of LLM calls across the run, one
 * chip per iteration. Click to scroll/pin MessagesPanel to that iter.
 *
 * v0.1 is display-only with the selection callback; parent app owns the
 * scroll behavior.
 */
import type { AgentTimeline } from "../adapters/types";
import { useLensTheme } from "../theme/useLensTheme";

export interface IterationStripProps {
  readonly timeline: AgentTimeline;
  readonly selectedKey?: string | null;
  readonly onSelect?: (key: string) => void;
}

export function IterationStrip({ timeline, selectedKey, onSelect }: IterationStripProps) {
  const t = useLensTheme();
  const chips = timeline.turns.flatMap((turn) =>
    turn.iterations.map((iter, stepIdx) => ({
      key: `${turn.index}.${iter.index}`,
      turn: turn.index + 1,
      step: stepIdx + 1,
      label: stepHeadline(iter),
      durationMs: iter.durationMs ?? 0,
      stopReason: iter.stopReason,
      toolCount: iter.toolCalls.length,
    })),
  );

  return (
    <div
      data-fp-lens="iteration-strip"
      style={{
        display: "flex",
        gap: 4,
        padding: "8px 12px",
        overflowX: "auto",
        borderBottom: `1px solid ${t.border}`,
        background: t.bgElev,
      }}
    >
      {chips.length === 0 && (
        <span style={{ color: t.textSubtle, fontSize: 11 }}>No iterations yet.</span>
      )}
      {chips.map((c) => {
        const active = c.key === selectedKey;
        const isFinal = c.toolCount === 0;
        const secs =
          c.durationMs >= 1000
            ? `${(c.durationMs / 1000).toFixed(1)}s`
            : `${Math.round(c.durationMs)}ms`;
        return (
          <button
            key={c.key}
            onClick={() => onSelect?.(c.key)}
            style={{
              background: active ? t.accent : "transparent",
              color: active ? "#fff" : t.textMuted,
              border: `1px solid ${active ? t.accent : t.border}`,
              borderRadius: 4,
              padding: "4px 10px",
              fontSize: 11,
              fontFamily: t.fontSans,
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
              maxWidth: 280,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={`Question ${c.turn} · Step ${c.step} · ${secs}${
              c.stopReason ? ` · stop: ${c.stopReason}` : ""
            }`}
          >
            <span style={{ fontWeight: 600 }}>Step {c.step}</span>
            <span style={{ opacity: 0.85 }}> · {c.label}</span>
            {isFinal && <span style={{ marginLeft: 6 }}>✓</span>}
          </button>
        );
      })}
    </div>
  );
}

function stepHeadline(iter: {
  toolCalls: readonly { name: string; arguments: Record<string, unknown> }[];
}): string {
  if (iter.toolCalls.length === 0) return "Ready to answer";
  if (iter.toolCalls.length === 1) {
    const tc = iter.toolCalls[0];
    if (tc.name === "list_skills") return "Looking up skills";
    if (tc.name === "read_skill") {
      const id = tc.arguments?.id as string | undefined;
      return id ? `Activated ${id}` : "Activating skill";
    }
    if (tc.name === "ask_human" || tc.name === "ask_user") {
      return "Asked user";
    }
    return `Called tool (${tc.name})`;
  }
  if (iter.toolCalls.length <= 3) {
    return `Called ${iter.toolCalls.length} tools (${iter.toolCalls.map((tc) => tc.name).join(", ")})`;
  }
  return `Called ${iter.toolCalls.length} tools in parallel`;
}
