/**
 * Humanizer — transforms a v2 event into a natural-language commentary line.
 *
 * Pattern: Strategy (GoF). The default implementation ships with Lens;
 *          consumers can override per-domain or whole.
 * Role:    Feeds the analyst-view commentary panel + any other
 *          natural-language surface (logs, chat bubbles, exports).
 * Emits:   N/A — pure fn.
 *
 * Contract: a humanizer returns a string (rendered) or `null` (skip
 * this event — too low-signal for commentary). Never throws; any
 * unknown event is rendered as a terse `[type]` fallback.
 */

import type { AgentfootprintEvent } from 'agentfootprint';
import {
  defaultCommentaryTemplates,
  extractCommentaryVars,
  renderCommentary,
  selectCommentaryKey,
  type CommentaryTemplates,
} from 'agentfootprint';

export type Humanizer = (event: AgentfootprintEvent) => string | null;

/**
 * Default humanizer — the library's canonical rendering. Covers every
 * event domain; consumers who want domain-specific wording compose
 * their own via `humanizeWith` (below).
 */
export const defaultHumanizer: Humanizer = (event) => {
  switch (event.type) {
    // Composition
    case 'agentfootprint.composition.enter':
      return `Entered ${event.payload.kind} "${event.payload.name}" with ${event.payload.childCount} children.`;
    case 'agentfootprint.composition.exit':
      return `${event.payload.kind} finished — ${event.payload.status} in ${event.payload.durationMs}ms.`;
    case 'agentfootprint.composition.fork_start':
      return `Fanning out ${event.payload.branches.length} branches.`;
    case 'agentfootprint.composition.merge_end':
      return `Merged ${event.payload.mergedBranchCount} branches via ${event.payload.strategy}.`;
    case 'agentfootprint.composition.route_decided':
      return `Routed to "${event.payload.chosen}" — ${event.payload.rationale}`;
    case 'agentfootprint.composition.iteration_start':
      return `Iteration ${event.payload.iteration} begins.`;
    case 'agentfootprint.composition.iteration_exit':
      return `Iteration ${event.payload.iteration} ended (${event.payload.reason}).`;

    // Agent
    case 'agentfootprint.agent.turn_start':
      return `Agent turn begins: "${event.payload.userPrompt}".`;
    case 'agentfootprint.agent.turn_end':
      return `Agent turn complete: "${event.payload.finalContent}" (${event.payload.iterationCount} iterations, ${event.payload.totalInputTokens}+${event.payload.totalOutputTokens} tokens).`;
    case 'agentfootprint.agent.iteration_start':
      return `ReAct iteration ${event.payload.iterIndex}.`;
    case 'agentfootprint.agent.iteration_end':
      return `Iteration ${event.payload.iterIndex} ended (${event.payload.toolCallCount} tool calls).`;
    case 'agentfootprint.agent.route_decided':
      return `Agent routed to "${event.payload.chosen}" — ${event.payload.rationale}`;

    // Stream
    case 'agentfootprint.stream.llm_start':
      return `Calling ${event.payload.provider}/${event.payload.model} (iter ${event.payload.iteration}, ${event.payload.messagesCount} messages, ${event.payload.toolsCount} tools).`;
    case 'agentfootprint.stream.llm_end':
      return `Model replied in ${event.payload.durationMs}ms (${event.payload.usage.input}+${event.payload.usage.output} tokens, ${event.payload.toolCallCount} tool calls, stop: ${event.payload.stopReason}).`;
    case 'agentfootprint.stream.tool_start':
      return `Calling tool "${event.payload.toolName}" with ${JSON.stringify(event.payload.args)}.`;
    case 'agentfootprint.stream.tool_end':
      return `Tool "${event.payload.toolCallId}" returned in ${event.payload.durationMs}ms${event.payload.error === true ? ' (error)' : ''}.`;
    case 'agentfootprint.stream.token':
      return null; // too low-signal for the analyst view

    // Context
    case 'agentfootprint.context.injected':
      return `Injected ${event.payload.slot}: "${event.payload.contentSummary}" (from ${event.payload.source}).`;
    case 'agentfootprint.context.slot_composed':
      return `Slot "${event.payload.slot}" composed (iter ${event.payload.iteration}, ${event.payload.budget.used}/${event.payload.budget.cap} tokens).`;
    case 'agentfootprint.context.evicted':
      return `Evicted from "${event.payload.slot}" — ${event.payload.reason} (survived ${event.payload.survivalMs}ms).`;
    case 'agentfootprint.context.budget_pressure':
      return `Budget pressure on "${event.payload.slot}": ${event.payload.projectedTokens}/${event.payload.capTokens} tokens → plan: ${event.payload.planAction}.`;

    // Cost
    case 'agentfootprint.cost.tick':
      return `Cost +$${event.payload.estimatedUsd.toFixed(6)} — cumulative $${event.payload.cumulative.estimatedUsd.toFixed(6)}.`;
    case 'agentfootprint.cost.limit_hit':
      return `⚠ Cost budget ${event.payload.limit} crossed — actual ${event.payload.actual} (${event.payload.action}).`;

    // Permission
    case 'agentfootprint.permission.check':
      return `Permission: ${event.payload.capability} → "${event.payload.target}" = ${event.payload.result}${event.payload.rationale ? ` (${event.payload.rationale})` : ''}.`;
    case 'agentfootprint.permission.gate_opened':
      return `Gate "${event.payload.gateId}" opened by ${event.payload.openedBy}.`;
    case 'agentfootprint.permission.gate_closed':
      return `Gate "${event.payload.gateId}" closed — ${event.payload.reason}.`;

    // Pause
    case 'agentfootprint.pause.request':
      return `⏸ Paused — ${event.payload.reason}.`;
    case 'agentfootprint.pause.resume':
      return `▶ Resumed after ${event.payload.pausedDurationMs}ms.`;

    // Eval / memory / skill (consumer-emitted, often domain-specific)
    case 'agentfootprint.eval.score':
      return `Eval "${event.payload.metricId}" = ${event.payload.value}${event.payload.threshold !== undefined ? ` (threshold ${event.payload.threshold})` : ''}.`;
    case 'agentfootprint.eval.threshold_crossed':
      return `Eval "${event.payload.metricId}" crossed ${event.payload.threshold} ${event.payload.direction} → ${event.payload.value}.`;
    case 'agentfootprint.memory.strategy_applied':
      return `Memory strategy "${event.payload.strategyKind}" applied — ${event.payload.reason}.`;
    case 'agentfootprint.memory.written':
      return `Memory write: "${event.payload.memoryId}" — ${event.payload.contentSummary} (${event.payload.source}).`;
    case 'agentfootprint.skill.activated':
      return `Skill "${event.payload.skillId}" activated — ${event.payload.reason}.`;
    case 'agentfootprint.skill.deactivated':
      return `Skill "${event.payload.skillId}" deactivated — ${event.payload.reason}.`;

    // Error
    case 'agentfootprint.error.fatal':
      return `⛔ Fatal error in ${event.payload.stage}: ${event.payload.error}.`;

    default:
      return `[${event.type}]`;
  }
};

/**
 * Compose a humanizer with consumer overrides. Overrides run first;
 * when they return `undefined`, the default humanizer fills in. This
 * keeps consumer code small — they only author lines for the events
 * they care about.
 *
 * @example
 *   const humanizer = humanizeWith({
 *     'agentfootprint.stream.tool_start': (e) =>
 *       `🛠️  ${e.payload.toolName}(${JSON.stringify(e.payload.args)})`,
 *   });
 */
export function humanizeWith(
  overrides: Partial<{
    [K in AgentfootprintEvent['type']]: (
      event: Extract<AgentfootprintEvent, { type: K }>,
    ) => string | null | undefined;
  }>,
): Humanizer {
  return (event) => {
    const override = (overrides as Record<string, (e: AgentfootprintEvent) => string | null | undefined>)[
      event.type
    ];
    if (override) {
      const result = override(event);
      if (result !== undefined) return result;
    }
    return defaultHumanizer(event);
  };
}

/**
 * Options for `makeTeachingHumanizer` — the factory that produces a
 * humanizer with the consumer's app name woven into the narrative.
 */
export interface TeachingHumanizerOptions {
  /**
   * Name of the system that orchestrates the LLM. Substituted as the
   * **active** actor in every narrative line ("Neo dispatched the
   * tool", "Chatbot called the LLM"). The LLM is always the **passive**
   * actor that *suggests* / *responds* / *produces* — never *acts*.
   *
   * This split reflects the architectural truth: LLMs don't dispatch
   * tools, your code does. The narrative voice teaches that.
   *
   * Default: `'Chatbot'` — a generic, capitalized proper noun for "the
   * system that hosts the LLM and decides what to do with its output."
   *
   * Examples:
   *   appName: undefined / 'Chatbot'  → "Chatbot dispatched the tool"
   *   appName: 'Neo'                   → "Neo dispatched the tool"
   *   appName: 'MDS Triage'            → "MDS Triage dispatched the tool"
   */
  readonly appName?: string;

  /**
   * Resolves a tool name to its registry description ("Get current
   * weather for a city"). Cited in the `tool.start` narrative so the
   * student sees WHY the LLM picked this tool: the model matched the
   * task to the registered description.
   *
   * Lens precomputes this from `context.injected` events with
   * `source='registry'` and `slot='tools'` — the same events the
   * library emits when the Tools slot is composed. No additional
   * plumbing required; the description is already in the event log.
   *
   * Pure function. Returning `undefined` (or returning an empty string)
   * falls back to the description-less narrative.
   */
  readonly getToolDescription?: (toolName: string) => string | undefined;

  /**
   * Override the bundled commentary templates from agentfootprint.
   * Spread on top of the defaults — consumers only ship the keys they
   * want to change. Use cases:
   *
   *   • i18n: ship a complete translation
   *       `commentaryTemplates: spanishTemplates`
   *   • per-tenant prose / branding: override 3 lines
   *       `commentaryTemplates: { 'agent.turn_start': '...' }`
   *   • marketing voice: rewrite without forking the package
   *
   * The keys are stable; see
   * `agentfootprint`'s `defaultCommentaryTemplates` for the full list.
   * Substitutions use `{{name}}` placeholders — `appName`,
   * `userPrompt`, `toolName`, `descClause` (composed from
   * `stream.tool_start.desc` / `.noDesc`).
   *
   * Missing keys fall back to the default — partial overrides are safe.
   */
  readonly commentaryTemplates?: Partial<CommentaryTemplates>;
}

/**
 * Factory — builds a `teachingHumanizer` configured with the consumer's
 * app name. Pure prose narration of a run, written for a student
 * learning context engineering. NO technical numbers, NO field dumps,
 * NO library terms. The bottom Commentary panel reads like a paragraph
 * in a book; the right Details panel is where tokens / timings / args /
 * results live.
 *
 * The verb discipline:
 *   • {appName} (the active system)  — *called*, *dispatched*, *returned*,
 *                                       *decided*, *read*, *built*
 *   • LLM (the passive model)         — *suggested*, *responded*,
 *                                       *produced*, *asked for*, *gave*
 *
 * Examples (with appName='Neo'):
 *   agent.turn_start         "User asked Neo: 'what's the weather in SF?'."
 *   stream.llm_start iter 1  "Neo called the LLM."
 *   stream.llm_end +tools    "The LLM responded, suggesting the use of a tool. Neo will dispatch it next."
 *   stream.tool_start        "Neo dispatched the `weather` tool. The LLM's previous response asked for it; Neo extracted the arguments from the conversation."
 *   stream.tool_end          "The `weather` tool returned its result. Neo will pass it back to the LLM as a `messages[role=tool]` entry."
 *   stream.llm_end terminal  "The LLM gave a terminal answer. Neo returned it to the user; the loop exits."
 */
export function makeTeachingHumanizer(
  options: TeachingHumanizerOptions = {},
): Humanizer {
  const appName = options.appName ?? 'Chatbot';
  const getToolDescription = options.getToolDescription;
  // Spread the consumer's overrides on top of agentfootprint's bundled
  // defaults so partial overrides are safe (missing keys fall back).
  // The cast is sound: spreading a Partial only contributes keys whose
  // values are present (string), but TS widens to `string | undefined`
  // through `Partial`. The defaults guarantee every key resolves.
  const templates: CommentaryTemplates = options.commentaryTemplates
    ? ({ ...defaultCommentaryTemplates, ...options.commentaryTemplates } as CommentaryTemplates)
    : defaultCommentaryTemplates;
  const ctx = { appName, getToolDescription };

  return (event) => {
    // 1. Pick a template key. `null` skips, `undefined` falls through.
    const key = selectCommentaryKey(event);
    if (key === null) return null;
    if (key === undefined) return defaultHumanizer(event);

    // 2. Resolve the template. Missing key (consumer overrode AWAY a
    //    bundled key with `undefined`?) falls through to the default
    //    humanizer rather than rendering an empty string.
    const template = templates[key];
    if (template === undefined) return defaultHumanizer(event);

    // 3. Build vars from payload + ctx, render, return.
    const vars = extractCommentaryVars(event, ctx, templates);
    return renderCommentary(template, vars);
  };
}

/**
 * Default `teachingHumanizer` — uses `'Chatbot'` as the app name. For
 * consumer-specific naming, use `makeTeachingHumanizer({ appName })`.
 */
export const teachingHumanizer: Humanizer = makeTeachingHumanizer();

