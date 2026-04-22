/**
 * ThinkKitPanel — the "end-user view" chat-style activity breadcrumb.
 *
 * Over the same recorder the Flowchart and Commentary panels use,
 * ThinkKit renders what the END USER cares about:
 *   • A single-line live status pill ("Running influx_get_port_status...")
 *   • A breadcrumb list of completed / in-flight steps with ✓ / ◯ marks
 *
 * Driven by agentfootprint v2 selectors:
 *   recorder.selectStatus()     → current StatusLine
 *   recorder.selectActivities() → humanized Activity[]
 *
 * Domain apps (NEO, etc.) swap `recorder.setHumanizer(...)` to get
 * domain-friendly phrasings ("Checking port status on switch-3" instead
 * of "Running influx_get_port_status") — no UI code change required.
 */
import type { AgentTimelineRecorder, Activity, StatusLine } from "agentfootprint";
import { useLensTheme } from "../theme/useLensTheme";

export interface ThinkKitPanelProps {
  readonly recorder: AgentTimelineRecorder;
  /** Re-render sentinel — parent bumps on each event so selectors re-read. */
  readonly version?: number;
  /** Optional event-stream cursor for scrubbing / time-travel. */
  readonly cursor?: number;
  readonly height?: number | string;
}

export function ThinkKitPanel({ recorder, version, cursor, height }: ThinkKitPanelProps) {
  void version;
  const t = useLensTheme();
  const status = recorder.selectStatus(cursor);
  const activities = recorder.selectActivities(cursor);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 12,
        background: t.bg,
        color: t.text,
        fontFamily: t.fontSans,
        fontSize: 13,
        height: height ?? "auto",
        overflow: "auto",
      }}
    >
      <StatusPill status={status} />
      <ActivityList activities={activities} />
    </div>
  );
}

// ── Status pill (typing bubble equivalent) ─────────────────────────────

function StatusPill({ status }: { status: StatusLine }) {
  const t = useLensTheme();
  const dotColor =
    { llm: "#4a90e2", tool: "#7cbd5a", turn: "#b07cd4", idle: t.textMuted }[status.kind] ??
    t.textMuted;
  const pulsing = status.kind !== "idle" && status.kind !== "turn";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        background: t.bgElev,
        border: `1px solid ${t.border}`,
        borderRadius: 16,
        fontSize: 13,
      }}
    >
      <StatusDot color={dotColor} pulsing={pulsing} />
      <span style={{ fontWeight: 500 }}>
        {status.text || "Idle"}
      </span>
    </div>
  );
}

function StatusDot({ color, pulsing }: { color: string; pulsing: boolean }) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        animation: pulsing ? "thinkkit-pulse 1.2s ease-in-out infinite" : "none",
        boxShadow: pulsing ? `0 0 6px ${color}` : "none",
      }}
    />
  );
}

// ── Activity breadcrumb list ───────────────────────────────────────────

function ActivityList({ activities }: { activities: readonly Activity[] }) {
  const t = useLensTheme();
  if (activities.length === 0) {
    return (
      <div style={{ fontSize: 12, color: t.textMuted, fontStyle: "italic", marginTop: 6 }}>
        No activity yet.
      </div>
    );
  }

  // Inject keyframes once for the pulsing dot on in-flight activities.
  injectThinkKitKeyframes();

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      {activities.map((a) => (
        <li
          key={a.id}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "4px 0",
            opacity: a.done ? 1 : 0.9,
          }}
        >
          <CheckMark done={a.done} kind={a.kind} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: t.text, fontWeight: a.done ? 400 : 500 }}>{a.label}</div>
            {a.meta && (
              <div style={{ color: t.textMuted, fontSize: 11, marginTop: 1 }}>{a.meta}</div>
            )}
          </div>
          {a.iterationIndex !== undefined && (
            <span
              style={{
                flex: "0 0 auto",
                fontSize: 10,
                fontFamily: t.fontMono,
                color: t.textMuted,
              }}
            >
              iter {a.iterationIndex}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function CheckMark({ done, kind }: { done: boolean; kind: Activity["kind"] }) {
  const color = done
    ? "#7cbd5a"
    : { llm: "#4a90e2", tool: "#e2a050", turn: "#b07cd4" }[kind];
  return (
    <span
      style={{
        flex: "0 0 auto",
        width: 16,
        height: 16,
        borderRadius: "50%",
        background: done ? color : "transparent",
        border: `1.5px solid ${color}`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10,
        fontWeight: 700,
        color: "#fff",
        animation: done ? "none" : "thinkkit-ring-pulse 1.4s ease-in-out infinite",
      }}
      aria-label={done ? "done" : "in progress"}
    >
      {done ? "✓" : ""}
    </span>
  );
}

// ── Keyframes (inject once) ────────────────────────────────────────────

const KEYFRAMES_ID = "thinkkit-keyframes";
const KEYFRAMES_CSS = `
@keyframes thinkkit-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.3); }
}
@keyframes thinkkit-ring-pulse {
  0%, 100% { box-shadow: 0 0 0 0 currentColor; }
  50% { box-shadow: 0 0 0 4px transparent; }
}
`;

function injectThinkKitKeyframes(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(KEYFRAMES_ID)) return;
  const el = document.createElement("style");
  el.id = KEYFRAMES_ID;
  el.textContent = KEYFRAMES_CSS;
  document.head.appendChild(el);
}
