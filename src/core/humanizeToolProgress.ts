/**
 * Humanizer line for `agentfootprint.stream.tool_progress` (agentfootprint
 * 9.52.0) — one report filed from INSIDE a still-running tool call by
 * `ctx.progress(payload)`, in call order, between that call's `tool_start` and
 * its `tool_end`.
 *
 * The event splits into two halves and this module treats them differently on
 * purpose:
 *
 *   · `toolCallId` / `toolName` / `iteration` are STAMPED BY THE FRAMEWORK
 *     from the dispatch it is already holding. A tool cannot claim to be
 *     another call, another tool, or another iteration, so these are facts and
 *     the line states them plainly.
 *
 *   · `payload` is the tool AUTHOR's own data, forwarded verbatim and typed
 *     `unknown`. The library neither reads it nor normalizes it — and neither
 *     do we. There is no "hop 3 of 12" to extract, because nothing guarantees
 *     a `hop` or a `total` is in there; one tool sends `{ done, total }`, the
 *     next sends a status string, the next a partial row. So the line renders
 *     a PREVIEW of whatever arrived, and says so when it had to cut it short.
 *     Guessing at semantics here would put words in the tool's mouth.
 *
 * Absence is a real state: a run whose tools never call `ctx.progress` files
 * no `tool_progress` events at all, and nothing here invents one.
 */

/** How much of a payload preview a single stream row carries before it is cut. */
const PREVIEW_LIMIT = 120;

/**
 * Structural mirror of agentfootprint's `ToolProgressPayload`. Every field is
 * optional: this renders events off the wire, including from a recording made
 * by a version that shaped them slightly differently, and a missing field must
 * degrade the sentence rather than crash it.
 */
export interface ToolProgressLike {
  readonly toolCallId?: string;
  readonly toolName?: string;
  readonly iteration?: number;
  readonly payload?: unknown;
}

/**
 * A compact, one-line preview of an author-defined progress payload.
 *
 * Returns `null` when there is nothing showable — no payload at all, or a
 * value with no JSON form (a function, a symbol). `null` means the line ends
 * after the facts, which is honest; an empty string would read as an empty
 * report.
 *
 * A string payload is shown as itself, not as a JSON-quoted string: the tool
 * author wrote a sentence, and re-quoting it adds noise the reader must undo.
 * Everything else goes through `JSON.stringify` — the payload must survive
 * `structuredClone` to have ridden the event channel here at all, so this is
 * near-total; the `catch` covers a hand-built or hand-edited event.
 *
 * Truncation is always STATED, never silent — the row says how much it cut.
 */
export function previewProgressPayload(payload: unknown): string | null {
  if (payload === undefined) return null;
  let text: string;
  if (typeof payload === 'string') {
    text = payload;
  } else {
    try {
      const json = JSON.stringify(payload);
      if (json === undefined) return null; // a function / symbol has no JSON form
      text = json;
    } catch {
      return '(payload could not be shown)';
    }
  }
  if (text.length <= PREVIEW_LIMIT) return text;
  return `${text.slice(0, PREVIEW_LIMIT)}… (truncated; ${text.length - PREVIEW_LIMIT} more chars)`;
}

/**
 * The analyst-view line: the framework's facts, then a preview of the tool's
 * own report.
 *
 *   `walk_graph` reported progress (iteration 1): {"hop":1,"of":3,"node":"svc-a"}
 *
 * The iteration clause is dropped when the number is `0`, which agentfootprint
 * uses to mean "there is no ReAct loop here" — printing "iteration 0" would
 * invent a loop position that does not exist.
 */
export function humanizeToolProgress(payload: ToolProgressLike): string {
  const tool = payload.toolName !== undefined ? `\`${payload.toolName}\`` : 'A tool';
  const iter =
    typeof payload.iteration === 'number' && payload.iteration > 0
      ? ` (iteration ${payload.iteration})`
      : '';
  const preview = previewProgressPayload(payload.payload);
  return preview === null
    ? `${tool} reported progress${iter}.`
    : `${tool} reported progress${iter}: ${preview}`;
}

/**
 * The teaching-view line: same event, no field dump.
 *
 *   The `walk_graph` tool reported progress while it was still running.
 *
 * The teaching humanizer narrates a run for someone learning how agents work,
 * where the point of this event is that a tool call is no longer a silence —
 * not what the tool's own JSON happened to say. The numbers stay in the
 * analyst view and the details panel, which is where that voice keeps them.
 */
export function humanizeToolProgressTeaching(payload: ToolProgressLike): string {
  const tool = payload.toolName !== undefined ? `The \`${payload.toolName}\` tool` : 'A tool';
  return `${tool} reported progress while it was still running.`;
}
