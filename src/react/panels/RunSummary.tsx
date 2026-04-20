/**
 * RunSummary — the after-run footer. Replaces the old "Every tool Neo
 * called" right sidebar, which tried to be live but was really a
 * summary. Here it's honest: renders only when at least one turn has
 * completed (`finalContent !== ""`) and folds nicely when the run
 * extends with follow-up turns.
 *
 * Sections:
 *   • Tools used — per-tool count + total duration
 *   • Skills activated — ids with count
 *   • Tokens — input → output, per-turn breakdown
 *   • Wall time — total elapsed across all turns
 */
import { useState } from "react";
import type { AgentTimeline } from "../../core/types";
import { useLensTheme } from "../theme/useLensTheme";

export interface RunSummaryProps {
  readonly timeline: AgentTimeline;
}

export function RunSummary({ timeline }: RunSummaryProps) {
  const t = useLensTheme();
  const [open, setOpen] = useState(false);

  const completedTurns = timeline.turns.filter((turn) => turn.finalContent !== "");
  if (completedTurns.length === 0) return null;

  // Aggregate tool usage across ALL turns in the run.
  const toolCounts = new Map<string, { count: number; totalMs: number }>();
  for (const tc of timeline.tools) {
    const prev = toolCounts.get(tc.name) ?? { count: 0, totalMs: 0 };
    toolCounts.set(tc.name, {
      count: prev.count + 1,
      totalMs: prev.totalMs + (tc.durationMs ?? 0),
    });
  }
  const toolList = [...toolCounts.entries()].sort((a, b) => b[1].count - a[1].count);

  // Skills that got activated via read_skill during the run.
  const activatedSkills = new Set<string>();
  for (const tc of timeline.tools) {
    if (tc.name === "read_skill") {
      const id = tc.arguments?.id;
      if (typeof id === "string") activatedSkills.add(id);
    }
  }

  const totalIn = timeline.turns.reduce((s, turn) => s + turn.totalInputTokens, 0);
  const totalOut = timeline.turns.reduce((s, turn) => s + turn.totalOutputTokens, 0);
  const totalMs = timeline.turns.reduce((s, turn) => s + turn.totalDurationMs, 0);
  const totalIters = timeline.turns.reduce((s, turn) => s + turn.iterations.length, 0);

  return (
    <div
      data-fp-lens="run-summary"
      style={{
        borderTop: `1px solid ${t.border}`,
        background: t.bgElev,
        fontFamily: t.fontSans,
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "8px 14px",
          background: "transparent",
          border: "none",
          color: t.textMuted,
          fontFamily: "inherit",
          fontSize: 12,
          cursor: "pointer",
          textAlign: "left",
          fontWeight: 400,
        }}
      >
        <span style={{ fontSize: 10 }}>{open ? "▾" : "▸"}</span>
        <span
          style={{
            fontSize: 10,
            color: t.textSubtle,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontWeight: 600,
          }}
        >
          Run summary
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: t.textMuted }}>
          {timeline.tools.length} tool call{timeline.tools.length === 1 ? "" : "s"} ·{" "}
          {activatedSkills.size} skill{activatedSkills.size === 1 ? "" : "s"} ·{" "}
          {totalIn.toLocaleString()}→{totalOut.toLocaleString()} tok ·{" "}
          {(totalMs / 1000).toFixed(1)}s
        </span>
      </button>
      {open && (
        <div
          style={{
            padding: "6px 14px 14px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
            fontSize: 12,
            color: t.text,
          }}
        >
          <section>
            <Label t={t}>Tools used · {timeline.tools.length}</Label>
            {toolList.length === 0 ? (
              <div style={{ color: t.textSubtle, fontSize: 11, fontStyle: "italic" }}>
                None.
              </div>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {toolList.map(([name, stats]) => (
                  <li
                    key={name}
                    style={{
                      display: "flex",
                      gap: 8,
                      padding: "3px 0",
                      fontFamily: t.fontMono,
                      fontSize: 11,
                    }}
                  >
                    <span style={{ color: t.accent, flex: 1 }}>{name}</span>
                    <span style={{ color: t.textMuted }}>×{stats.count}</span>
                    <span style={{ color: t.textSubtle, minWidth: 60, textAlign: "right" }}>
                      {stats.totalMs > 0 ? `${Math.round(stats.totalMs)}ms` : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <Label t={t}>Skills activated · {activatedSkills.size}</Label>
            {activatedSkills.size === 0 ? (
              <div style={{ color: t.textSubtle, fontSize: 11, fontStyle: "italic" }}>
                None.
              </div>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {[...activatedSkills].map((id) => (
                  <li
                    key={id}
                    style={{
                      padding: "3px 0",
                      fontFamily: t.fontMono,
                      fontSize: 11,
                      color: t.text,
                    }}
                  >
                    {id}
                  </li>
                ))}
              </ul>
            )}

            <div style={{ marginTop: 10 }}>
              <Label t={t}>Totals</Label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: "3px 10px",
                  marginTop: 4,
                  fontSize: 11,
                  color: t.textMuted,
                }}
              >
                <span>Tokens</span>
                <span style={{ color: t.text, fontFamily: t.fontMono }}>
                  {totalIn.toLocaleString()} → {totalOut.toLocaleString()}
                </span>
                <span>Wall time</span>
                <span style={{ color: t.text, fontFamily: t.fontMono }}>
                  {(totalMs / 1000).toFixed(2)}s
                </span>
                <span>LLM calls</span>
                <span style={{ color: t.text, fontFamily: t.fontMono }}>
                  {totalIters}
                </span>
                <span>Turns</span>
                <span style={{ color: t.text, fontFamily: t.fontMono }}>
                  {completedTurns.length}
                </span>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Label({
  t,
  children,
}: {
  t: ReturnType<typeof useLensTheme>;
  children: React.ReactNode;
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
      }}
    >
      {children}
    </div>
  );
}
