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
import { protectedToolArguments } from '../toolArgumentDisplay.js';
import { toolStepId } from '../toolStepDisplay.js';

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
  if (isTool && 'toolArgumentBinding' in step) {
    // Missing entries can make the last start look unique. Recorder sequence
    // numbers start at zero and increase by one in this ordered log.
    const completePrefix = log[0]?.seq === 0 && log[log.length - 1]?.seq === log.length - 1;
    if (step.toolArgumentBinding === 'ambiguous' || (step.toolArgumentBinding === 'unmatched' && !completePrefix)) {
      return { stepId: step.id, kind: step.kind };
    }
  }

  // Find the opening event closest to step.startOffsetMs.
  const openType = isLLM
    ? 'agentfootprint.stream.llm_start'
    : 'agentfootprint.stream.tool_start';
  let openIdx = -1;
  let bestDelta = Number.POSITIVE_INFINITY;
  const nativeTool = isTool && step.runtimeStageId !== undefined &&
    step.id.startsWith(toolStepId(step.runtimeStageId, ''));
  for (let i = 0; i < log.length; i++) {
    const entry = log[i];
    if (entry.event.type !== openType) continue;
    if (entry.event.type === 'agentfootprint.stream.tool_start') {
      const { meta, payload } = entry.event;
      if (step.runtimeStageId !== undefined && meta.runtimeStageId !== undefined && step.runtimeStageId !== meta.runtimeStageId) continue;
      if (nativeTool) {
        if (step.id !== toolStepId(meta.runtimeStageId, payload.toolCallId)) continue;
        if (openIdx !== -1) return { stepId: step.id, kind: step.kind };
        openIdx = i;
        continue;
      }
      if (step.toolName !== undefined && step.toolName !== payload.toolName) continue;
    }
    const delta = Math.abs(entry.runOffsetMs - step.startOffsetMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      openIdx = i;
    } else if (isTool && delta === bestDelta) openIdx = -1; // Ambiguous legacy calls cannot borrow one another's args.
  }
  if (openIdx === -1) return { stepId: step.id, kind: step.kind };

  const detail: Writable<FocusDetail> = { stepId: step.id, kind: step.kind };

  if (isTool) {
    // Tool step: open = stream.tool_start carries args; end carries result.
    const openEvent = log[openIdx].event;
    if (openEvent.type !== 'agentfootprint.stream.tool_start') return detail;
    // A legacy name/time match only identifies a candidate. Every tool start,
    // including one with a different name, can claim its stage and call ID.
    if (!nativeTool && log.some(({ event }, i) => i !== openIdx
      && event.type === 'agentfootprint.stream.tool_start'
      && event.meta.runtimeStageId === openEvent.meta.runtimeStageId
      && event.payload.toolCallId === openEvent.payload.toolCallId)) return detail;
    if (step.toolName !== undefined && step.toolName !== openEvent.payload.toolName) return detail;
    const display = protectedToolArguments(openEvent.payload);
    if (display === undefined) detail.toolArgs = openEvent.payload.args;
    else Object.assign(detail, display);
    // Find the matching tool_end — same toolCallId, next in sequence.
    for (let i = openIdx + 1; i < log.length; i++) {
      const e = log[i].event;
      if (
        e.type === 'agentfootprint.stream.tool_end' &&
        (e as StreamToolEndEvent).payload.toolCallId === openEvent.payload.toolCallId &&
        (!step.runtimeStageId || !e.meta.runtimeStageId || step.runtimeStageId === e.meta.runtimeStageId)
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
