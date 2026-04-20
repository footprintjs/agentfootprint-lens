/**
 * deriveStages — turn an `AgentTimeline` into an ordered list of
 * "stages" (edges in the node flowchart).
 *
 * Each stage is one directed edge between two of the four nodes:
 *
 *     USER ──── message ────▶ AGENT ──── tool call ────▶ TOOL
 *       ▲                      │  ▲                       │
 *       └──── final answer ────┘  └── activation ── SKILL  │
 *                                       ▲                 │
 *                                       └── tool result ──┘
 *
 * Grounding rule from the spec: every stage maps to one of the three
 * LLM primitives (System Prompt · Message · Tool). Skills aren't a
 * fourth primitive — they're a *bracket* wrapping whichever primitive
 * they use to reach the LLM. So the SKILL node is optional and only
 * shows when a skill activation actually happens.
 *
 * Derivation is pure: given the same timeline you always get the same
 * stage sequence. Safe to re-run on every render; live updates simply
 * append new stages as new events arrive.
 */
import type { AgentTimeline, AgentToolInvocation } from "./types";

export type StageNodeId = "user" | "agent" | "tool" | "skill";

/** Which of the three LLM primitives this stage touches. */
export type StagePrimitive = "message" | "tool" | "system-prompt";

/**
 * Which of the three Agent-input channels this stage MUTATED.
 * Drives the per-port highlight inside the Agent node. A single stage
 * can touch multiple — e.g. a `read_skill` return simultaneously adds
 * a tool-role message, grows the System Prompt (skill body injected),
 * and surfaces new Tools (autoActivate-gated tools go live).
 */
export interface StageMutations {
  /** A message appended to the conversation this step. */
  readonly messages?: boolean;
  /** The System Prompt sent on the NEXT LLM call changed this step. */
  readonly systemPrompt?: boolean;
  /** The Tools list sent on the NEXT LLM call changed this step. */
  readonly tools?: boolean;
  /** Count of tools added this step (when known). */
  readonly toolsAdded?: number;
  /** Count of tools removed this step (when known). */
  readonly toolsRemoved?: number;
  /** System-prompt delta in characters (when known). */
  readonly systemPromptDeltaChars?: number;
  /**
   * Actual text that was appended to the System Prompt this step —
   * e.g. the skill body delivered by a `read_skill` return. Captured
   * at the moment we know it (the return stage) and propagated via
   * `pending` to the stage that's attributed with the mutation. This
   * is what lets the mutation drill-down show the real diff instead
   * of an "isn't captured" placeholder.
   */
  readonly systemPromptAdded?: string;
  /** Skill id that activated this step (from `read_skill` args). */
  readonly activatedSkillId?: string;
  /** Names of tools that came online as a result of this step. */
  readonly toolsAddedList?: readonly string[];
}

export interface Stage {
  /** 0-based stage index across the whole run. */
  readonly index: number;
  /** Source node. */
  readonly from: StageNodeId;
  /** Destination node. */
  readonly to: StageNodeId;
  /** Human-friendly one-line description (appears on the edge). */
  readonly label: string;
  /** Which LLM primitive carries this stage — for vocabulary grounding. */
  readonly primitive: StagePrimitive;
  /**
   * What CHANGED on the Agent's three input channels (System Prompt,
   * Messages, Tools) when this stage fired. Per-port highlights on
   * the Agent node read from here.
   */
  readonly mutations: StageMutations;
  /**
   * Which turn + iteration this stage belongs to. Lets the UI jump
   * the Messages panel to the same moment when a stage is clicked.
   */
  readonly turnIndex: number;
  readonly iterIndex?: number;
  /**
   * Secondary node that should ALSO light up for this stage. Used when
   * a skill activation is a bracket over another primitive — e.g. a
   * `read_skill` tool call lights both TOOL (primary) and SKILL
   * (secondary). `undefined` for non-bracketed stages.
   */
  readonly alsoLights?: StageNodeId;
  /** Tool or skill name, when applicable. */
  readonly toolName?: string;
  /**
   * If this stage belongs to a round that fired MULTIPLE tool calls
   * concurrently (LLM emitted them in one response), the total count.
   * `undefined` for single-tool rounds. Drives the "parallel N" badge
   * on the Tool node so users can see "this isn't a single tool call
   * — three are happening at the same logical step" without reading
   * the commentary.
   */
  readonly parallelCount?: number;
  /**
   * What *kind* of tool this is from the user's mental model:
   *   • "skill"      — a skill-management tool (list_skills / read_skill).
   *   • "ask-human"  — a clarification-from-user tool.
   *   • undefined    — a regular data/action tool.
   * Lets UI labels render as `Tool (Skill)` / `Tool (Ask user)` /
   * just `Tool` while the underlying edges still flow Agent ↔ Tool.
   */
  readonly toolKind?: "skill" | "ask-human";
  /** Token usage attributed to this stage (if LLM call). */
  readonly tokens?: { readonly input?: number; readonly output?: number };
  /** Wall-clock duration in ms (if the source event provided it). */
  readonly durationMs?: number;
}

export function deriveStages(timeline: AgentTimeline): Stage[] {
  const stages: Stage[] = [];
  let idx = 0;
  const push = (s: Omit<Stage, "index">) => {
    stages.push({ ...s, index: idx++ });
  };

  // Mutations that were PROMISED by a prior stage but only take
  // effect on the NEXT outgoing LLM call. The canonical case is
  // `read_skill`: the return leg appends a tool-role Message, but
  // System Prompt + Tools injections only land when the NEXT
  // iteration starts (via autoActivate + AgentInstruction.activeWhen).
  // We hold them here and merge into the next `agent → …` edge we
  // emit, then clear.
  let pending: StageMutations | null = null;
  const consumePending = (base: StageMutations): StageMutations => {
    if (!pending) return base;
    const merged: StageMutations = { ...base, ...pending };
    pending = null;
    return merged;
  };

  for (const turn of timeline.turns) {
    // 1. USER → AGENT: the prompt. Mutates Messages only, plus any
    //    pending mutations promised from a prior turn's last stage.
    push({
      from: "user",
      to: "agent",
      label: truncate(turn.userPrompt, 60),
      primitive: "message",
      turnIndex: turn.index,
      mutations: consumePending({ messages: true }),
    });

    for (const iter of turn.iterations) {
      // A round with > 1 tool call means the LLM fired all of them
      // concurrently (parallel fanout). Carry that count onto each
      // tool stage so UIs can annotate "parallel N" without having to
      // walk sibling stages.
      const parallelCount = iter.toolCalls.length > 1 ? iter.toolCalls.length : undefined;
      for (const tc of iter.toolCalls) {
        const kind = classifyTool(tc);
        if (kind === "skill-management") {
          // Outgoing: Agent → Tool (the LLM making the skill call).
          // This is an LLM-outgoing edge, so pending mutations from a
          // *prior* read_skill — if any — surface here.
          push({
            from: "agent",
            to: "tool",
            alsoLights: "skill",
            label: skillManagementLabel(tc),
            primitive: "tool",
            turnIndex: turn.index,
            iterIndex: iter.index,
            toolName: tc.name,
            toolKind: "skill",
            mutations: consumePending({ messages: true }),
          });
          // Return leg: only a tool-role Message is added RIGHT NOW.
          // SP + Tools mutations caused by read_skill take effect on
          // the NEXT outgoing LLM call (autoActivate fires at the
          // start of the next iteration, not here). Defer them via
          // `pending` so they appear on the correct edge.
          const isReadSkill = tc.name === "read_skill";
          push({
            from: "tool",
            to: "agent",
            alsoLights: "skill",
            label: isReadSkill
              ? `Skill body delivered (+${tc.result.length} chars) — will activate next step`
              : `Skills list (${countSkills(tc.result)} skills)`,
            primitive: "tool",
            turnIndex: turn.index,
            iterIndex: iter.index,
            toolName: tc.name,
            toolKind: "skill",
            mutations: { messages: true },
          });
          if (isReadSkill) {
            const spDelta = tc.result.length;
            const activatedSkillId =
              (tc.arguments?.id as string | undefined) ?? undefined;
            pending = {
              systemPrompt: true,
              tools: true,
              systemPromptDeltaChars: spDelta,
              // Stash the ACTUAL content that just entered the System
              // Prompt + the skill id that activated. These ride along
              // `pending` and land on the next outgoing LLM edge where
              // the mutation is attributed, so the UI can render a
              // real diff instead of a "not captured" placeholder.
              systemPromptAdded: tc.result,
              ...(activatedSkillId ? { activatedSkillId } : {}),
            };
          }
        } else if (kind === "ask-human") {
          push({
            from: "agent",
            to: "user",
            label: askHumanLabel(tc),
            primitive: "message",
            turnIndex: turn.index,
            iterIndex: iter.index,
            toolName: tc.name,
            toolKind: "ask-human",
            mutations: consumePending({ messages: true }),
          });
        } else {
          // Regular tool. Outgoing edge is the LLM's next call — so
          // it consumes any pending mutations from a prior read_skill.
          push({
            from: "agent",
            to: "tool",
            label: `Called ${tc.name}`,
            primitive: "tool",
            turnIndex: turn.index,
            iterIndex: iter.index,
            toolName: tc.name,
            ...(parallelCount ? { parallelCount } : {}),
            mutations: consumePending({ messages: true }),
          });
          push({
            from: "tool",
            to: "agent",
            label: truncate(tc.result, 80),
            primitive: "tool",
            turnIndex: turn.index,
            iterIndex: iter.index,
            toolName: tc.name,
            ...(parallelCount ? { parallelCount } : {}),
            mutations: { messages: true },
          });
        }
      }
    }

    // Final AGENT → USER: last LLM call's output. Also consumes
    // pending (in case the very last iteration before Finalize was
    // a read_skill — unusual, but possible).
    //
    // Attach this stage to the LAST iter of the turn so the
    // "ready to answer" round (which has no tool calls, and would
    // otherwise produce no stages) gets a valid stage range. Without
    // this the range map is missing a key for that round and UIs
    // fall back to defaults — e.g. the commentary's "active/past/
    // future" dimming would get confused and mark the final round
    // active regardless of slider position.
    if (turn.finalContent) {
      const lastIter = turn.iterations[turn.iterations.length - 1];
      push({
        from: "agent",
        to: "user",
        label: truncate(turn.finalContent, 80),
        primitive: "message",
        turnIndex: turn.index,
        ...(lastIter ? { iterIndex: lastIter.index } : {}),
        mutations: consumePending({ messages: true }),
      });
    }
  }

  return stages;
}

// ── Helpers ───────────────────────────────────────────────────────

type ToolKind = "skill-management" | "ask-human" | "regular";

function classifyTool(tc: AgentToolInvocation): ToolKind {
  if (tc.name === "list_skills" || tc.name === "read_skill") return "skill-management";
  if (tc.name === "ask_human" || tc.name === "ask_user") return "ask-human";
  return "regular";
}

function skillManagementLabel(tc: AgentToolInvocation): string {
  if (tc.name === "list_skills") return "Asked what skills are available";
  if (tc.name === "read_skill") {
    const id = (tc.arguments?.id as string | undefined) ?? "?";
    return `Activated the "${id}" skill`;
  }
  return `Called ${tc.name}`;
}

function askHumanLabel(tc: AgentToolInvocation): string {
  const q = (tc.arguments?.question as string | undefined) ?? "";
  return q ? `Asked user: ${truncate(q, 50)}` : "Asked user for clarification";
}

function countSkills(result: string): number {
  try {
    const parsed = JSON.parse(result);
    if (Array.isArray(parsed?.skills)) return parsed.skills.length;
    if (Array.isArray(parsed)) return parsed.length;
  } catch {
    /* fall through */
  }
  return 0;
}

function truncate(s: string, max: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length <= max ? one : one.slice(0, max - 1).trim() + "…";
}
