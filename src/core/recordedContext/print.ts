import type { RecordedContextCall, RecordedContextView } from './types.js';
import { contextPayloads } from './payload.js';
import { recordedModelInputLabel } from './evidence.js';

/** Display the native coordinates, never derive an owner from ID spelling. */
export function contextCallLabel(call: RecordedContextCall): string {
  return `Call ${call.call} · ${call.meta.runId} · composition ${JSON.stringify(call.meta.compositionPath ?? [])}` +
    ` · mount ${JSON.stringify(call.meta.subflowPath ?? [])} · iteration ${call.iteration}` +
    ` · stage ${JSON.stringify(call.meta.runtimeStageId ?? null)}`;
}

function fenced(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  let width = 3;
  for (const match of text.matchAll(/`+/g)) width = Math.max(width, match[0].length + 1);
  const fence = '`'.repeat(width);
  return `${fence}\n${text}\n${fence}`;
}

/** Full dictionary once, then recorded deltas; no truncation of expanded text. */
export function printRecordedContext(view: RecordedContextView): string {
  const payloads = contextPayloads(view);
  const lines = ['# Recorded context dictionary', 'Each value is stored once. IDs below refer to this dictionary.'];
  for (const piece of view.dictionary) lines.push(`\n## ${JSON.stringify(piece.id)}`, fenced(piece.value));
  lines.push('\n# Context by call');
  for (const [index, call] of view.calls.entries()) {
    lines.push(`\n## ${contextCallLabel(call)}`,
      `Added: ${JSON.stringify(call.added)}`, `Removed: ${JSON.stringify(call.removed)}`,
      `Unchanged: ${call.unchanged}`, `Recorded counts: ${JSON.stringify(call.counts)}`,
      `Source event index: ${call.eventIndex}`);
    if (call.meta.runtimeStageId !== undefined) lines.push(`Stage: ${JSON.stringify(call.meta.runtimeStageId)}`);
    if (call.order !== undefined) lines.push(`Recorded order: ${JSON.stringify(call.order)}`);
    const evidence = view.toolInputs?.[index];
    if (evidence?.status === 'unavailable') lines.push(`Exact model-input evidence unavailable: ${evidence.reason}.`);
    else if (evidence?.status === 'available') {
      lines.push('Tool messages for this exact model call (independent of stored step results):');
      if (evidence.messages.length === 0) lines.push('No readable tool messages in this call view.');
      for (const message of evidence.messages) lines.push(
        `${recordedModelInputLabel(message.status)} · tool call ${JSON.stringify(message.toolCallId)}` +
        `${message.ticket ? ' · ticket-shaped input' : ''}`, '```text', payloads.format(message.content), '```');
      for (const gap of evidence.gaps) lines.push(`Input gap: ${gap}`);
    }
  }
  if (view.droppedEvents !== undefined) lines.push(`\nDropped events: ${view.droppedEvents}`);
  if (view.firstRetainedEventIndex !== undefined) lines.push(`First retained event index: ${view.firstRetainedEventIndex}`);
  return lines.join('\n');
}
