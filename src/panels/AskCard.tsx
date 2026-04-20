/**
 * AskCard — shows the user's current question + what step of the run
 * is currently focused. Sits to the right of the vertical StageFlow
 * so you can always read *what was asked* and *where in the work we
 * are* without scrolling.
 *
 * Replaces the old "Every tool Neo called" right sidebar, which was
 * an after-run summary masquerading as a live surface. The live
 * context belongs here; the tool summary moves to the end-of-run
 * footer (see <RunSummary />).
 */
import type { Stage } from "../adapters/deriveStages";
import type { AgentTimeline } from "../adapters/types";
import { useLensTheme } from "../theme/useLensTheme";

export interface AskCardProps {
  readonly timeline: AgentTimeline;
  readonly focusIndex: number;
  readonly stages: readonly Stage[];
}

export function AskCard({ timeline, focusIndex, stages }: AskCardProps) {
  const t = useLensTheme();
  const currentStage = stages[focusIndex];
  const currentTurn =
    currentStage !== undefined ? timeline.turns[currentStage.turnIndex] : timeline.turns[0];
  const currentIter =
    currentStage?.iterIndex !== undefined
      ? currentTurn?.iterations.find((it) => it.index === currentStage.iterIndex)
      : undefined;
  // The tool call this stage refers to, when the stage is a Tool edge.
  const currentTool =
    currentStage?.toolName && currentIter
      ? currentIter.toolCalls.find((tc) => tc.name === currentStage.toolName)
      : undefined;

  return (
    <div
      data-fp-lens="ask-card"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 14,
        background: t.bg,
        fontFamily: t.fontSans,
        color: t.text,
        overflow: "auto",
      }}
    >
      <section>
        <Label t={t}>Your question</Label>
        <div
          style={{
            marginTop: 4,
            padding: "10px 12px",
            background: `color-mix(in srgb, ${t.accent} 12%, ${t.bgElev})`,
            border: `1px solid ${t.border}`,
            borderRadius: 6,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {currentTurn?.userPrompt ?? "No question yet."}
        </div>
      </section>

      {currentStage && (
        <section>
          <Label t={t}>
            Step {focusIndex + 1} / {stages.length}
          </Label>
          {/* The stage label on a tool→agent return is just a truncated
              preview of the same result we render in full below under
              "Tool returned" — skip it to avoid reading the same blob
              twice. For every other stage the label carries unique
              info (user prompt, final answer, "Called X", etc.). */}
          {!(currentTool && currentStage.from === "tool") && (
            <div style={{ marginTop: 4, fontSize: 13, color: t.text, lineHeight: 1.5 }}>
              {currentStage.label}
            </div>
          )}
          <div
            style={{
              marginTop: 8,
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              fontSize: 10,
              color: t.textSubtle,
            }}
          >
            <Pill t={t}>{primitivePill(currentStage)}</Pill>
            <Pill t={t}>
              {friendlyNode(currentStage.from)} → {friendlyNode(currentStage.to)}
            </Pill>
            {currentStage.toolName && (
              <Pill t={t}>{currentStage.toolName}</Pill>
            )}
          </div>
        </section>
      )}

      {/* Agent reasoning is the LLM's text BEFORE it emitted the tool
          call — so it only belongs on OUTGOING agent edges (agent→tool,
          agent→user, agent→skill). On a tool→agent return, the agent
          hasn't yet reasoned about the result — that thought belongs
          to the NEXT iteration, which hasn't started. Showing the
          prior iteration's reasoning on a return edge is misleading. */}
      {currentStage?.from === "agent" && currentIter?.assistantContent && (
        <section>
          <Label t={t}>Agent reasoning</Label>
          <div
            style={{
              marginTop: 4,
              padding: "10px 12px",
              background: t.bgElev,
              border: `1px solid ${t.border}`,
              borderLeft: `3px solid ${t.accent}`,
              borderRadius: 6,
              fontSize: 12,
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
              maxHeight: 220,
              overflow: "auto",
            }}
          >
            {currentIter.assistantContent}
          </div>
        </section>
      )}

      {currentTool && (
        <section>
          <Label t={t}>
            {currentStage?.to === "tool" ? "Arguments" : "Tool returned"}
          </Label>
          <pre
            style={{
              marginTop: 4,
              padding: "8px 10px",
              background: t.bgElev,
              border: `1px solid ${t.border}`,
              borderRadius: 6,
              fontSize: 11,
              fontFamily: t.fontMono,
              color: currentTool.error ? t.error : t.text,
              whiteSpace: "pre-wrap",
              maxHeight: 180,
              overflow: "auto",
              margin: 0,
            }}
          >
            {currentStage?.to === "tool"
              ? JSON.stringify(currentTool.arguments, null, 2)
              : currentTool.result}
          </pre>
        </section>
      )}

      {timeline.turns.length > 1 && (
        <section>
          <Label t={t}>Conversation</Label>
          <div style={{ marginTop: 4, fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
            {timeline.turns.length} question{timeline.turns.length === 1 ? "" : "s"} so far ·{" "}
            {timeline.tools.length} tool call{timeline.tools.length === 1 ? "" : "s"} total
          </div>
        </section>
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
      }}
    >
      {children}
    </div>
  );
}

function Pill({
  t,
  children,
  warn,
}: {
  t: ReturnType<typeof useLensTheme>;
  children: React.ReactNode;
  warn?: boolean;
}) {
  return (
    <span
      style={{
        padding: "1px 6px",
        borderRadius: 3,
        background: warn
          ? `color-mix(in srgb, ${t.warning} 20%, transparent)`
          : t.bgElev,
        color: warn ? t.warning : t.textMuted,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      {children}
    </span>
  );
}

/** Capitalize the node id for display ("agent" → "Agent"). */
function friendlyNode(id: string): string {
  if (!id) return id;
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * Turn a stage's primitive + tool kind into a single display pill.
 * Tools that have a "kind" get a bracketed qualifier so users see
 * *which flavor of Tool* the agent just used:
 *   • Tool (Skill)     — list_skills / read_skill
 *   • Tool (Ask user)  — ask_human
 *   • Tool             — plain data/action tool
 */
function primitivePill(stage: {
  primitive: "system-prompt" | "message" | "tool";
  toolKind?: "skill" | "ask-human";
}): string {
  if (stage.primitive === "system-prompt") return "System Prompt";
  if (stage.primitive === "message") return "Message";
  // primitive === "tool"
  if (stage.toolKind === "skill") return "Tool (Skill)";
  if (stage.toolKind === "ask-human") return "Tool (Ask user)";
  return "Tool";
}
