/**
 * CommentaryPanel — the "analyst view" side strip.
 *
 * Renders agentfootprint v2's two teaching surfaces side-by-side:
 *   1. Per-slot injection ledger (from selectContextBySource) —
 *      "Messages: +3 from RAG, +5 from memory" etc. This is the
 *      pedagogical payload: a student can SEE which context-engineering
 *      pattern injected what into which API slot.
 *   2. Chronological narrative (from selectCommentary) — humanized
 *      line per event ("Thinking", "Running add", "Got result").
 *
 * Pure renderer — all data comes from the recorder's typed selectors.
 * A Vue / Angular / CLI consumer renders the same data the same way.
 */
import type {
  AgentTimelineRecorder,
  ContextBySource,
  ContextSlotSummary,
  ContextSourceSummary,
  CommentaryLine,
} from "agentfootprint";
import { useLensTheme } from "../theme/useLensTheme";

export interface CommentaryPanelProps {
  readonly recorder: AgentTimelineRecorder;
  /** Re-render sentinel — parent bumps this when new events arrive so
   *  the panel re-reads the selectors (they're memoized; new events
   *  invalidate the cache). */
  readonly version?: number;
  /** Optional event-stream cursor for scrubbing / time-travel. */
  readonly cursor?: number;
  /** Panel height. Defaults to `auto`. */
  readonly height?: number | string;
}

export function CommentaryPanel({ recorder, version, cursor, height }: CommentaryPanelProps) {
  void version; // dependency for re-render only
  const t = useLensTheme();
  const contextBySource = recorder.selectContextBySource(cursor);
  const commentary = recorder.selectCommentary(cursor);

  const totalInjections = contextBySource.slots.reduce((n, s) => n + s.totalInjections, 0);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 12,
        background: t.bg,
        color: t.text,
        fontFamily: t.fontSans,
        fontSize: 13,
        height: height ?? "auto",
        overflow: "auto",
      }}
    >
      <ContextLedger contextBySource={contextBySource} totalInjections={totalInjections} />
      <Narrative commentary={commentary} />
    </div>
  );
}

// ── Context ledger block — per slot, per source breakdown ──────────────

function ContextLedger({
  contextBySource,
  totalInjections,
}: {
  contextBySource: ContextBySource;
  totalInjections: number;
}) {
  const t = useLensTheme();

  if (totalInjections === 0) {
    return (
      <section>
        <SectionHeader label="Context Engineering" />
        <EmptyHint text="No context injections yet — no RAG, skills, memory, or instructions fired this run." />
      </section>
    );
  }

  return (
    <section>
      <SectionHeader label="Context Engineering" badge={`${totalInjections} injection${totalInjections === 1 ? "" : "s"}`} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
        {contextBySource.slots.map((slot) => (
          <SlotRow key={slot.slot} slot={slot} />
        ))}
      </div>
      {/* Dotted-rect annotation when dynamic tools fired. Conventionally
          any source emits `toolsFromSkill: true` or `toolsAdded: N` on
          the Tools slot — show it as the "N tools added" badge per the
          vision. */}
      <DynamicToolsBadge contextBySource={contextBySource} />
    </section>
  );
}

function SlotRow({ slot }: { slot: ContextSlotSummary }) {
  const t = useLensTheme();
  const slotLabel = {
    "system-prompt": "System Prompt",
    messages: "Messages",
    tools: "Tools",
  }[slot.slot];

  if (slot.totalInjections === 0) {
    return (
      <div style={{ opacity: 0.45, display: "flex", alignItems: "center", gap: 8 }}>
        <SlotBadge text={slotLabel} inactive />
        <span style={{ fontSize: 12 }}>no injections</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <SlotBadge text={slotLabel} />
      <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 6 }}>
        {slot.sources.map((source) => (
          <SourcePill key={source.source} source={source} />
        ))}
      </div>
    </div>
  );
}

function SlotBadge({ text, inactive }: { text: string; inactive?: boolean }) {
  const t = useLensTheme();
  return (
    <div
      style={{
        flex: "0 0 auto",
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        padding: "2px 6px",
        borderRadius: 3,
        background: inactive ? "transparent" : t.bgElev,
        border: `1px solid ${t.border}`,
        color: inactive ? t.textMuted : t.text,
        minWidth: 90,
        textAlign: "center",
      }}
    >
      {text}
    </div>
  );
}

function SourcePill({ source }: { source: ContextSourceSummary }) {
  const t = useLensTheme();
  const summary = summarizeDelta(source);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 10,
        background: sourceColor(source.source, t.accent),
        color: "#fff",
        fontSize: 11,
        fontWeight: 500,
      }}
      title={source.labels.join(" · ")}
    >
      <strong style={{ textTransform: "uppercase", letterSpacing: 0.3 }}>{source.source}</strong>
      <span style={{ opacity: 0.85 }}>+{source.count}</span>
      {summary && <span style={{ opacity: 0.85 }}>· {summary}</span>}
    </div>
  );
}

function summarizeDelta(source: ContextSourceSummary): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(source.deltaCount)) {
    if (typeof v === "number") parts.push(`${v} ${k}`);
    else if (v === true) parts.push(k);
  }
  return parts.slice(0, 3).join(", ");
}

function sourceColor(source: string, fallback: string): string {
  const map: Record<string, string> = {
    rag: "#4a90e2",
    memory: "#7cbd5a",
    skill: "#e2a050",
    instructions: "#b07cd4",
  };
  return map[source] ?? fallback;
}

function DynamicToolsBadge({ contextBySource }: { contextBySource: ContextBySource }) {
  const t = useLensTheme();
  const toolsAdded = Number(contextBySource.aggregatedLedger.toolsAdded ?? 0);
  const toolsFromSkill = contextBySource.aggregatedLedger.toolsFromSkill === true;
  if (toolsAdded === 0 && !toolsFromSkill) return null;

  return (
    <div
      style={{
        marginTop: 10,
        padding: "6px 10px",
        border: `1.5px dashed ${t.accent}`,
        borderRadius: 6,
        background: `color-mix(in srgb, ${t.accent} 10%, transparent)`,
        fontSize: 12,
      }}
    >
      <strong>✨ Dynamic tools: </strong>
      {toolsAdded > 0 ? `${toolsAdded} tool${toolsAdded === 1 ? "" : "s"} added` : "tools added"}
      {toolsFromSkill ? " by skill activation" : ""}
    </div>
  );
}

// ── Narrative block — humanized line per event ────────────────────────

function Narrative({ commentary }: { commentary: readonly CommentaryLine[] }) {
  const t = useLensTheme();
  if (commentary.length === 0) {
    return (
      <section>
        <SectionHeader label="Commentary" />
        <EmptyHint text="No events yet — run an agent to see the narrative." />
      </section>
    );
  }

  return (
    <section>
      <SectionHeader label="Commentary" badge={`${commentary.length} event${commentary.length === 1 ? "" : "s"}`} />
      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        {commentary.map((c, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "3px 0",
              borderBottom: i === commentary.length - 1 ? "none" : `1px dashed ${t.border}`,
            }}
          >
            <KindBadge kind={c.kind} />
            <span style={{ flex: 1, color: t.text }}>{c.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function KindBadge({ kind }: { kind: CommentaryLine["kind"] }) {
  const color = { llm: "#4a90e2", tool: "#7cbd5a", turn: "#b07cd4", context: "#e2a050" }[kind];
  return (
    <span
      style={{
        flex: "0 0 auto",
        fontSize: 9,
        fontWeight: 700,
        padding: "2px 5px",
        borderRadius: 3,
        background: color,
        color: "#fff",
        textTransform: "uppercase",
        letterSpacing: 0.4,
        minWidth: 50,
        textAlign: "center",
      }}
    >
      {kind}
    </span>
  );
}

// ── Shared chrome ──────────────────────────────────────────────────────

function SectionHeader({ label, badge }: { label: string; badge?: string }) {
  const t = useLensTheme();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 1.2,
          color: t.textMuted,
        }}
      >
        {label}
      </span>
      {badge && (
        <span
          style={{
            fontSize: 10,
            padding: "1px 6px",
            borderRadius: 8,
            background: t.bgElev,
            color: t.text,
            fontFamily: t.fontMono,
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  const t = useLensTheme();
  return (
    <div style={{ fontSize: 12, color: t.textMuted, fontStyle: "italic" }}>{text}</div>
  );
}
