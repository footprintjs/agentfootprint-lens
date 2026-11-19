import { defaultCommentaryTemplates, selectCommentaryKey } from 'agentfootprint';
import type { AgentfootprintEvent } from 'agentfootprint/events';

// AgentFootprint 15 owns tool outcome routing. The historical commentary
// runtime has one completion key for every outcome and lacks both templates.
const hasOutcomeKeys = defaultCommentaryTemplates['stream.tool_end.executionUnknown'] !== undefined;
export const commentaryDefaults = hasOutcomeKeys ? defaultCommentaryTemplates : {
  'stream.tool_end.notExecuted': 'The tool call was not executed.',
  'stream.tool_end.executionUnknown': 'The record does not say whether the tool ran.',
  ...defaultCommentaryTemplates,
};

interface EndFields { entered?: unknown; error?: unknown; notExecuted?: unknown }
export function readableToolFlags({ entered, error, notExecuted }: EndFields): boolean {
  return [entered, error, notExecuted].every(field => field === undefined || typeof field === 'boolean');
}

function ownField(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}

function settledCall(marker: unknown): boolean {
  const paused = ownField(marker, 'pausedCall');
  return typeof ownField(paused, 'toolName') === 'string' && typeof ownField(paused, 'toolCallId') === 'string';
}

export function commentaryKey(event: AgentfootprintEvent): string | null | undefined {
  if (hasOutcomeKeys) return selectCommentaryKey(event);
  if (event.type === 'agentfootprint.stream.tool_start') {
    return settledCall(event.payload.notDispatched) ? 'stream.tool_start.notDispatched' : 'stream.tool_start';
  }
  if (event.type !== 'agentfootprint.stream.tool_end') return selectCommentaryKey(event);
  const fields = event.payload as EndFields & { notDispatched?: unknown };
  if (settledCall(fields.notDispatched)) return null; // its start already names the paused call
  if (fields.notDispatched !== undefined || !readableToolFlags(fields)) return 'stream.tool_end.executionUnknown';
  if (fields.notExecuted === true || fields.entered === false) return 'stream.tool_end.notExecuted';
  return fields.entered === true ? 'stream.tool_end' : 'stream.tool_end.executionUnknown';
}
