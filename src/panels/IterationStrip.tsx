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
    turn.iterations.map((iter) => ({
      key: `${turn.index}.${iter.index}`,
      turn: turn.index + 1,
      iter: iter.index,
      label: chipLabel(iter),
      tools: iter.toolCalls.length,
      durationMs: iter.durationMs ?? 0,
      stopReason: iter.stopReason,
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
        const isFinal = c.stopReason === "stop" || c.stopReason === "end_turn";
        return (
          <button
            key={c.key}
            onClick={() => onSelect?.(c.key)}
            style={{
              background: active ? t.accent : "transparent",
              color: active ? "#fff" : t.textMuted,
              border: `1px solid ${active ? t.accent : t.border}`,
              borderRadius: 4,
              padding: "4px 8px",
              fontSize: 11,
              fontFamily: "ui-monospace, monospace",
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
            title={`turn ${c.turn} · iter ${c.iter} · ${c.tools} tool call${
              c.tools === 1 ? "" : "s"
            }${c.stopReason ? ` · ${c.stopReason}` : ""}`}
          >
            t{c.turn}.i{c.iter} · {c.label} {isFinal ? "✓" : ""}
          </button>
        );
      })}
    </div>
  );
}

function chipLabel(iter: { toolCalls: readonly unknown[]; durationMs?: number }): string {
  const d = iter.durationMs ?? 0;
  const secs = d >= 1000 ? `${(d / 1000).toFixed(1)}s` : `${Math.round(d)}ms`;
  const toolBit = iter.toolCalls.length > 0 ? `${iter.toolCalls.length}t` : "final";
  return `${secs} · ${toolBit}`;
}
