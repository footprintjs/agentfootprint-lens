/**
 * ToolCallInspector — flat sidebar list of every tool invocation in the
 * run. Primary workflow: skim for errors, click to focus a specific
 * call (mirrors MessagesPanel's selection).
 *
 * v0.1 minimum — name, args preview, latency, error badge. Drill-in to
 * the tool's underlying footprintjs flowchart via explainable-ui is a
 * phase-2 item (requires surfacing per-tool sub-snapshots).
 */
import type { AgentToolInvocation, AgentTimeline } from "../adapters/types";
import { useLensTheme } from "../theme/useLensTheme";

export interface ToolCallInspectorProps {
  readonly timeline: AgentTimeline;
  readonly selectedId?: string | null;
  readonly onSelect?: (invocation: AgentToolInvocation) => void;
}

export function ToolCallInspector({
  timeline,
  selectedId,
  onSelect,
}: ToolCallInspectorProps) {
  const t = useLensTheme();
  return (
    <div
      data-fp-lens="tool-call-inspector"
      style={{
        background: t.bg,
        color: t.text,
        fontFamily: t.fontSans,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          borderBottom: `1px solid ${t.border}`,
          fontSize: 11,
          color: t.textSubtle,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 600,
          background: t.bgElev,
        }}
      >
        Every tool Neo called · {timeline.tools.length}
      </div>
      <div style={{ overflow: "auto", flex: 1 }}>
        {timeline.tools.length === 0 && (
          <div style={{ padding: 14, color: t.textSubtle, fontSize: 12 }}>
            Neo hasn't called any tools yet.
          </div>
        )}
        {timeline.tools.map((tc) => {
          const active = tc.id === selectedId;
          const errored = tc.error === true;
          return (
            <button
              key={tc.id}
              onClick={() => onSelect?.(tc)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                width: "100%",
                textAlign: "left",
                padding: "8px 12px",
                background: active ? t.bgHover : "transparent",
                border: "none",
                borderLeft: `3px solid ${
                  active ? t.accent : errored ? t.error : "transparent"
                }`,
                borderBottom: `1px solid ${t.border}`,
                color: t.text,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "baseline",
                  fontSize: 12,
                  fontFamily: t.fontMono,
                }}
              >
                <span style={{ color: errored ? t.error : t.accent, fontWeight: 600 }}>
                  {tc.name}
                </span>
                <span
                  style={{ color: t.textSubtle, fontSize: 10, marginLeft: "auto" }}
                >
                  t{tc.turnIndex + 1}.i{tc.iterationIndex}
                  {tc.durationMs !== undefined && ` · ${Math.round(tc.durationMs)}ms`}
                </span>
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: t.textMuted,
                  marginTop: 2,
                  fontFamily: t.fontMono,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {shortArgs(tc.arguments)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function shortArgs(args: Record<string, unknown>): string {
  const keys = Object.keys(args);
  if (keys.length === 0) return "— no args —";
  return keys
    .map((k) => {
      const v = args[k];
      if (typeof v === "string") return `${k}: "${v.length > 20 ? v.slice(0, 20) + "…" : v}"`;
      if (typeof v === "number" || typeof v === "boolean") return `${k}: ${v}`;
      return `${k}: …`;
    })
    .join(", ");
}
