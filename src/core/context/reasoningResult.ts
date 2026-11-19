import { isPlacedToolResult } from 'agentfootprint';

/** The recorded ref and stored size of a placement the producer issued. */
export interface PlacedShape {
  readonly ref: string;
  readonly bytes?: number;
  readonly kind?: string;
}

type CallIdentity = { readonly toolCallId: string; readonly toolName?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A receipt identifies a call ID and a ref, without an iteration or occurrence.
 * Keep its refs only while the records that name the ID agree about its owner.
 */
export function placedRefsByCall(
  receipt: unknown,
  bases: readonly CallIdentity[],
  history: readonly unknown[] | undefined,
  toolResults: readonly unknown[] | undefined,
): ReadonlyMap<string, ReadonlySet<string>> {
  const byCall = new Map<string, Set<string>>();
  if (!Array.isArray(receipt)) return byCall;
  for (const entry of receipt) {
    if (!isRecord(entry) || typeof entry.toolCallId !== 'string' || typeof entry.ref !== 'string') continue;
    const refs = byCall.get(entry.toolCallId);
    if (refs) refs.add(entry.ref);
    else byCall.set(entry.toolCallId, new Set([entry.ref]));
  }
  if (!byCall.size) return byCall;

  const names = new Map<string, string>();
  function observe(seen: Set<string>, id: unknown, name: unknown): void {
    if (typeof id !== 'string' || !byCall.has(id)) return;
    if (seen.has(id) || (typeof name === 'string' && names.has(id) && names.get(id) !== name)) {
      byCall.delete(id);
      return;
    }
    seen.add(id);
    if (typeof name === 'string') names.set(id, name);
  }

  // A single call can appear once in each of these sources. Repetition within
  // one source is ambiguous, even when two calls used the same tool name.
  const basisIds = new Set<string>();
  for (const { toolCallId, toolName } of bases) observe(basisIds, toolCallId, toolName);
  const emissions = new Set<string>();
  const messages = new Set<string>();
  for (const message of history ?? []) {
    if (!isRecord(message)) continue;
    if (message.role === 'tool') {
      observe(messages, message.toolCallId, message.toolName);
    } else if (message.role === 'assistant' && Array.isArray(message.toolCalls)) {
      for (const call of message.toolCalls) {
        if (isRecord(call)) observe(emissions, call.id, call.name);
      }
    }
  }
  const batch = new Set<string>();
  for (const result of toolResults ?? []) {
    if (isRecord(result)) observe(batch, result.toolCallId, result.toolName);
  }
  return byCall;
}

interface PlacedResult {
  readonly placed: PlacedShape;
  /** Text the producer appended after a compact ticket in the served result. */
  readonly followingText?: string;
}

/** End of the initial JSON object; quoted braces are part of the result. */
function objectEnd(text: string): number | undefined {
  if (text[0] !== '{') return undefined;
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted && ch === '\\') i++;
    else if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === '{') depth++;
    else if (!quoted && ch === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return undefined;
}

function placedTicketOf(value: unknown, issuedRefs: ReadonlySet<string> | undefined): PlacedResult | undefined {
  if (!issuedRefs) return undefined;
  let v: unknown = value;
  let followingText: string | undefined;
  if (typeof value === 'string') {
    // AgentFootprint may append a procedure-step or effect note to the JSON
    // it served. Validate the initial value and retain the note verbatim.
    const text = value.trimStart();
    const end = objectEnd(text);
    if (end === undefined) return undefined;
    try {
      v = JSON.parse(text.slice(0, end));
    } catch {
      return undefined;
    }
    const suffix = text.slice(end);
    if (suffix.trim()) followingText = suffix;
  }
  if (!isPlacedToolResult(v) || !issuedRefs.has(v.ref)) return undefined;
  return {
    placed: {
      ref: v.ref,
      ...(typeof v.bytes === 'number' ? { bytes: v.bytes } : {}),
      ...(typeof v.kind === 'string' ? { kind: v.kind } : {}),
    },
    ...(followingText !== undefined && { followingText }),
  };
}

/** The result as the lens can size it: a ticket, or the chars the record holds. */
export type ResultShape = PlacedResult | { readonly chars: number };

export function resultShapeOf(value: unknown, issuedRefs: ReadonlySet<string> | undefined): ResultShape {
  const placed = placedTicketOf(value, issuedRefs);
  if (placed !== undefined) return placed;
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
  return { chars: text.length };
}
