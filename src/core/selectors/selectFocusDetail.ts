/**
 * `selectFocusDetail` — pull the debug-pane detail for one focused step.
 *
 * Pattern: single forward scan of the event log to find the events
 *          bracketing this step. Returns the LLM reasoning / decision
 *          / tool args / tool result that belongs to the selected
 *          step, or `undefined` if the step has no bound detail.
 * Role:    Feeds the right-side Debug Pane in Lens (or equivalent
 *          detail view in other frameworks). Pure — framework-agnostic.
 */

import type { StepNode } from 'agentfootprint/observe';
import type { EventLogEntry } from '../types.js';
import type { FocusDetail } from './types.js';

/**
 * Extract detail for the given step from the event log.
 *
 * Match strategy: the step was opened by an `llm_start` (for LLM
 * steps) or `tool_start` (for tool steps) whose `runOffsetMs` aligns
 * with `step.startOffsetMs`. We walk the log, find that event, then
 * read the matching `_end` event plus any nearby `agent.route_decided`
 * to fill in the detail fields.
 *
 * Zero caching. Small log = cheap to re-run per render.
 */
export function selectFocusDetail(
  step: StepNode | undefined,
  log: readonly EventLogEntry[],
): FocusDetail | undefined {
  if (!step) return undefined;
  const isLLM =
    step.kind === 'user->llm' ||
    step.kind === 'tool->llm' ||
    step.kind === 'llm->user';
  const isTool = step.kind === 'llm->tool';
  if (!isLLM && !isTool) return undefined;

  // Find the opening event closest to step.startOffsetMs.
  const openType = isLLM
    ? 'agentfootprint.stream.llm_start'
    : 'agentfootprint.stream.tool_start';
  let openIdx = -1;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let i = 0; i < log.length; i++) {
    const entry = log[i];
    if (entry.event.type !== openType) continue;
    const delta = Math.abs(entry.runOffsetMs - step.startOffsetMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      openIdx = i;
    }
  }
  if (openIdx === -1) return { stepId: step.id, kind: step.kind };

  const detail: Writable<FocusDetail> = { stepId: step.id, kind: step.kind };

  if (isTool) {
    // Tool step: open = stream.tool_start carries args; end carries result.
    const openEvent = log[openIdx].event as StreamToolStartEvent;
    detail.toolArgs = openEvent.payload.args;
    // Find the matching tool_end — same toolCallId, next in sequence.
    for (let i = openIdx + 1; i < log.length; i++) {
      const e = log[i].event;
      if (
        e.type === 'agentfootprint.stream.tool_end' &&
        (e as StreamToolEndEvent).payload.toolCallId === openEvent.payload.toolCallId
      ) {
        detail.toolResult = String((e as StreamToolEndEvent).payload.result ?? '');
        break;
      }
    }
    return detail;
  }

  // LLM step: walk forward to find stream.llm_end + any nearby route_decided.
  for (let i = openIdx + 1; i < log.length; i++) {
    const e = log[i].event;
    if (e.type === 'agentfootprint.stream.llm_end') {
      const p = (e as StreamLLMEndEvent).payload;
      detail.llmReasoning = p.content;
      // Event payload uses { input, output }; our public FocusDetail
      // type uses { in, out } to match StepNode.tokens. Rename here.
      detail.tokens = { in: p.usage.input, out: p.usage.output };
      break;
    }
  }
  for (let i = openIdx + 1; i < Math.min(log.length, openIdx + 12); i++) {
    const e = log[i].event;
    if (e.type === 'agentfootprint.agent.route_decided') {
      const p = (e as AgentRouteDecidedEvent).payload;
      detail.llmDecision = { route: p.chosen, rationale: p.rationale };
      break;
    }
  }
  return detail;
}

type Writable<T> = { -readonly [K in keyof T]: T[K] };

// Narrowing types — we accept unknown in the event payloads and
// cast locally. No module augmentation on the core event types.
interface StreamToolStartEvent {
  readonly type: 'agentfootprint.stream.tool_start';
  readonly payload: {
    readonly toolCallId: string;
    readonly toolName: string;
    readonly args: Record<string, unknown>;
  };
}
interface StreamToolEndEvent {
  readonly type: 'agentfootprint.stream.tool_end';
  readonly payload: {
    readonly toolCallId: string;
    readonly result: unknown;
  };
}
interface StreamLLMEndEvent {
  readonly type: 'agentfootprint.stream.llm_end';
  readonly payload: {
    readonly content: string;
    readonly toolCallCount: number;
    readonly usage: { readonly input: number; readonly output: number };
  };
}
interface AgentRouteDecidedEvent {
  readonly type: 'agentfootprint.agent.route_decided';
  readonly payload: {
    readonly chosen: string;
    readonly rationale?: string;
  };
}
