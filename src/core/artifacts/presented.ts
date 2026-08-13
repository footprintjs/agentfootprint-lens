/**
 * Reading `present` calls back out of history — and the placeholder copy.
 *
 * The ref the model handed to the screen lives INSIDE the `present` tool
 * result (`{ presented: true, ref, as, snapshot }`) — the one thing provider
 * message history keeps typed and durable — and, when the run was recorded,
 * on the `agentfootprint.artifacts.presented` event. No parsing refs out of
 * prose: a regex over assistant text is the exact string-convention bug the
 * ecosystem spent releases killing.
 *
 * The placeholder is the load-bearing detail: when an artifact has expired,
 * the store can no longer describe what's gone, so the snapshot carried at
 * speak time is the pane's WHOLE diet —
 *
 *   Chart — "Q3 sales by region" (bar-chart, 41.0 KB) — expired; re-run to regenerate.
 *
 * Never a blank pane, never a stale copy pretending to be live. This is
 * `#REF!`, taught manners.
 */

import { formatBytes } from '../bugReport/selection.js';
import type { PresentedCallView, PresentSnapshotView } from './types.js';

/** The event a wire-recorded `present` rides. Matched by raw type string —
 *  the lens compiles against an older event union (humanizeRouting precedent). */
const PRESENTED_EVENT_TYPE = 'agentfootprint.artifacts.presented';

/** Validate the snapshot half of a presented shape. */
function readSnapshot(value: unknown): PresentSnapshotView | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const s = value as Record<string, unknown>;
  if (typeof s.kind !== 'string' || typeof s.mediaType !== 'string' || typeof s.bytes !== 'number')
    return undefined;
  return {
    kind: s.kind,
    mediaType: s.mediaType,
    bytes: s.bytes,
    ...(typeof s.label === 'string' && { label: s.label }),
  };
}

/** ref + as + snapshot — the common trunk of the tool result and the event. */
function readPresentedShape(
  value: Record<string, unknown>,
): Omit<PresentedCallView, 'toolCallId' | 'iteration'> | undefined {
  if (typeof value.ref !== 'string' || typeof value.as !== 'string') return undefined;
  const snapshot = readSnapshot(value.snapshot);
  if (!snapshot) return undefined;
  return { ref: value.ref, as: value.as, snapshot };
}

/**
 * Read one tool RESULT as a `present` result, if it is one.
 *
 * Accepts the value as history stores it — the JSON string on the
 * `role: 'tool'` message — or the already-parsed object. Branches on
 * `presented: true` (the field the result carries for exactly this walk).
 * Returns `undefined` for anything else: this is a filter over arbitrary tool
 * results, and "not a present call" is a legitimate answer, not a swallowed
 * error.
 */
export function readPresentedResult(value: unknown): PresentedCallView | undefined {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (parsed === null || typeof parsed !== 'object') return undefined;
  const record = parsed as Record<string, unknown>;
  if (record.presented !== true) return undefined;
  const trunk = readPresentedShape(record);
  if (!trunk) return undefined;
  return {
    ...trunk,
    ...(typeof record.toolCallId === 'string' && { toolCallId: record.toolCallId }),
  };
}

/**
 * Collect every presented artifact from an event log — a `Recording.events`
 * array or a `LensRecorder` event log (entries carrying `{ event }` are
 * unwrapped). Tolerant of `null` holes and foreign shapes: recordings from
 * other eras walk cleanly, and a malformed presented payload is skipped, not
 * invented.
 */
export function presentedFromEvents(
  events: ReadonlyArray<unknown> | null | undefined,
): PresentedCallView[] {
  if (!events) return [];
  const found: PresentedCallView[] = [];
  for (const item of events) {
    if (item === null || typeof item !== 'object') continue;
    const wrapper = item as Record<string, unknown>;
    const event =
      typeof wrapper.type === 'string'
        ? wrapper
        : wrapper.event !== null && typeof wrapper.event === 'object'
          ? (wrapper.event as Record<string, unknown>)
          : undefined;
    if (!event || event.type !== PRESENTED_EVENT_TYPE) continue;
    const payload = event.payload;
    if (payload === null || typeof payload !== 'object') continue;
    const record = payload as Record<string, unknown>;
    const trunk = readPresentedShape(record);
    if (!trunk) continue;
    found.push({
      ...trunk,
      ...(typeof record.toolCallId === 'string' && { toolCallId: record.toolCallId }),
      ...(typeof record.iteration === 'number' && { iteration: record.iteration }),
    });
  }
  return found;
}

/** `'chart/spec'` → `'Chart'`; `'dataset/rows'` → `'Dataset'`; `''` → `'Artifact'`. */
function kindNoun(kind: string): string {
  const head = kind.split('/')[0]?.trim() ?? '';
  if (head.length === 0) return 'Artifact';
  return head[0]!.toUpperCase() + head.slice(1);
}

/**
 * The descriptive head every pane state shares —
 * `Chart — "Q3 sales by region" (bar-chart, 41.0 KB)` — built from the
 * snapshot alone. A snapshot with no label names the ref instead: a fact the
 * call always carries, never an invented title.
 */
export function describePresented(presented: PresentedCallView): string {
  const { snapshot } = presented;
  const name = snapshot.label !== undefined ? `"${snapshot.label}"` : presented.ref;
  return `${kindNoun(snapshot.kind)} — ${name} (${presented.as}, ${formatBytes(snapshot.bytes)})`;
}

/**
 * The stated absence, rendered from the snapshot alone — no store round-trip
 * beyond the failed head. Missing, expired and another-session's ref all
 * answer one indistinguishable not-found by design, and this one line covers
 * them all:
 *
 *   Chart — "Q3 sales by region" (bar-chart, 41.0 KB) — expired; re-run to regenerate.
 */
export function artifactPlaceholder(presented: PresentedCallView): string {
  return `${describePresented(presented)} — expired; re-run to regenerate.`;
}
