/**
 * core/context/contextAt — the context object at a stop, with who wrote each
 * key, what moved since the previous stop, and what was served beside it.
 *
 * THE JOIN, nothing more. Three records already exist and this file writes
 * none of its own:
 *
 *   1. the COMMIT LOG — `stateAt(snapshot, commitIdx)` is the object at the
 *      stop; the trace rows of the bundles up to it name, per top-level key,
 *      the stage that last wrote it (`runtimeStageId`) and the first that
 *      did; the bundle's own rows are the DELTA of the stop;
 *   2. the RECEIPT at the stop's epoch — `servedRowAt` (the Served tab's own
 *      core) says what crossed into the model call and what the catalogue
 *      withheld; it is handed through untouched, never re-derived;
 *   3. the EVENT STREAM — entries stamped with the stages that wrote this
 *      stop's delta, or with the stop's own stage, are the "why" beside the
 *      keys; names only, no sentence.
 *
 * Join keys: `runtimeStageId` (commit log ⟂ events), `epoch` (commit log ⟂
 * receipt, through `servedRowAt`). A key the fold holds with no writer row —
 * the run's initial state, or a row the log lost — is `wroteBy: undefined`:
 * UNATTRIBUTED, never guessed (the reads law: omit, never deny). Owners are
 * stage ids, because that is what the record says; a word like "host" or
 * "model" is a reader's mapping, not this file's.
 *
 * Pure; frozen returns; no React. Consumers with their own UI read this.
 */
import * as trace from 'footprintjs/trace';
import { stateAt } from 'footprintjs/trace';
import type { FoldSource, FoldedState } from 'footprintjs/trace';

import type { EventLogEntry } from '../types.js';
import { servedRowAt, servedRowForEpoch } from '../served/servedRowAt.js';
import { sincePrevious, type SincePrevious } from '../served/sincePrevious.js';
import { verify, type ServedVerification } from '../served/verify.js';
import type { ServedCursor, ServedRow } from '../served/types.js';

/** The slice of a footprintjs commit bundle this file reads — narrowed per row, never trusted whole. */
interface TraceRow {
  readonly path: string;
  readonly verb: string;
}
interface CommitBundle {
  readonly idx?: number;
  readonly runtimeStageId: string;
  readonly trace?: readonly TraceRow[];
}

/** One top-level key of the context object at the stop. */
export interface ContextKey {
  readonly path: string;
  readonly value: unknown;
  /** The stage that LAST wrote the key, from its trace row; absent = unattributed. */
  readonly wroteBy?: string;
  /** The commit index of that last write. */
  readonly wroteAt?: number;
  /** The first commit that wrote the key — when it ENTERED the context. */
  readonly enteredAt?: number;
  /** The verb of the last write, from the trace row. */
  readonly verb?: string;
  /** How the key moved since the previous stop (absent when no previous stop was given). */
  readonly since?: 'entered' | 'changed' | 'unchanged';
}

/** What is served beside the object at this stop — the Served tab's own row, handed through. */
export interface ContextServed {
  readonly row: ServedRow;
  readonly checks: ServedVerification;
  readonly since?: SincePrevious;
}

export interface ContextAt {
  readonly cursor: ServedCursor;
  /** Every top-level key of the fold at the stop, in the fold's key order. */
  readonly keys: readonly ContextKey[];
  /** Keys the previous stop held that this one does not (only with a previous stop). */
  readonly left: readonly string[];
  /** The trace rows the stop's own bundle wrote — its delta as the log spells it. */
  readonly rows: readonly { readonly path: string; readonly verb: string }[];
  /** The fold's honesty facts, as `stateAt` reports them. */
  readonly basis?: FoldedState['basis'];
  readonly redacted: boolean;
  readonly skipped?: readonly number[];
  readonly foldError?: string;
  /** The served side at this stop's epoch, when the stop is at or after a model call. */
  readonly served?: ContextServed;
  /** The Served core refused this snapshot — its message, verbatim; `served` is then absent. */
  readonly servedError?: string;
  /** Event names raised by the stages that wrote this stop's delta, or by its own stage. */
  readonly why: readonly {
    readonly seq: number;
    readonly name: string;
    readonly runtimeStageId: string;
  }[];
}

export interface ContextAtOptions {
  /** The previous stop on the reader's axis — enables `since` and `left`. */
  readonly previous?: ServedCursor;
  /** The recording's event stream, when the reader has one (a replay's `getEntries()`). */
  readonly events?: readonly EventLogEntry[];
}

/**
 * The top-level key a trace-row path names. footprintjs 9.22.0 exports
 * `pathSegments` (its paths are joined with U+001F since then); the lens's
 * peer floor is 9.17.0, whose paths are dotted and which has no such export —
 * so the helper is read at call time, the way `tagStops` is, and a floor
 * substrate gets the split it used (0.53.4: a consumer on 9.21.1 could not
 * even bundle the lens while this was a static import).
 */
export function firstSegment(path: string): string | undefined {
  const helper = (trace as { pathSegments?: (p: string) => string[] }).pathSegments;
  if (typeof helper === 'function') return helper(path)[0];
  const unit = path.indexOf('\u001F');
  if (unit >= 0) return path.slice(0, unit);
  const dot = path.indexOf('.');
  return dot >= 0 ? path.slice(0, dot) : path;
}

interface WriterFacts {
  readonly wroteBy: string;
  readonly wroteAt: number;
  readonly enteredAt: number;
  readonly verb: string;
}

function logOf(snapshot: unknown): readonly CommitBundle[] {
  const s = snapshot as { commitLog?: unknown } | null | undefined;
  return Array.isArray(s?.commitLog) ? (s.commitLog as CommitBundle[]) : [];
}

/** Per top-level key, the first and last trace rows up to `commitIdx` (inclusive). */
function writersUpTo(log: readonly CommitBundle[], commitIdx: number): ReadonlyMap<string, WriterFacts> {
  const out = new Map<string, WriterFacts>();
  const last = Math.min(commitIdx, log.length - 1);
  for (let i = 0; i <= last; i++) {
    const bundle = log[i];
    if (bundle === undefined || typeof bundle.runtimeStageId !== 'string' || !Array.isArray(bundle.trace))
      continue;
    for (const row of bundle.trace) {
      const key = firstSegment(row.path);
      if (key === undefined) continue;
      const prior = out.get(key);
      out.set(key, {
        wroteBy: bundle.runtimeStageId,
        wroteAt: i,
        enteredAt: prior?.enteredAt ?? i,
        verb: row.verb,
      });
    }
  }
  return out;
}

function foldAt(snapshot: unknown, commitIdx: number): FoldedState | { readonly error: string } {
  const source: FoldSource | undefined =
    typeof snapshot === 'object' && snapshot !== null ? (snapshot as FoldSource) : undefined;
  try {
    return stateAt(source, commitIdx);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function servedFor(
  snapshot: unknown,
  cursor: ServedCursor,
): { readonly served?: ContextServed; readonly servedError?: string } {
  try {
    const row = servedRowAt(snapshot, cursor);
    if (row === undefined) return {};
    const checks = verify(row.view, row.receipt, row.receipt?.basis.runId ?? '', row.receiptCause);
    const previous =
      row.previousEpoch !== undefined ? servedRowForEpoch(snapshot, row.previousEpoch) : undefined;
    const since = previous !== undefined ? sincePrevious(row, previous) : undefined;
    return {
      served: Object.freeze({
        row,
        checks,
        ...(since !== undefined ? { since } : {}),
      }),
    };
  } catch (e) {
    return { servedError: e instanceof Error ? e.message : String(e) };
  }
}

function whyFor(events: readonly EventLogEntry[] | undefined, stages: ReadonlySet<string>): ContextAt['why'] {
  if (events === undefined || stages.size === 0) return Object.freeze([]);
  const out: { seq: number; name: string; runtimeStageId: string }[] = [];
  for (const entry of events) {
    const id = entry.runtimeStageId;
    if (id === undefined || !stages.has(id)) continue;
    out.push({ seq: entry.seq, name: entry.event.type, runtimeStageId: id });
  }
  return Object.freeze(out);
}

/**
 * The context at `cursor`: the fold's keys with their writers, the delta
 * since `options.previous`, the served side at this epoch, and the events
 * beside the delta. Returns a frozen object; a fold that cannot be replayed
 * reports `foldError` with no keys rather than an empty object pretending to
 * be one.
 */
export function contextAt(
  recording: unknown,
  cursor: ServedCursor,
  options: ContextAtOptions = {},
): ContextAt {
  const log = logOf(recording);
  const folded = foldAt(recording, cursor.commitIdx);
  if ('error' in folded) {
    return Object.freeze({
      cursor,
      keys: Object.freeze([]),
      left: Object.freeze([]),
      rows: Object.freeze([]),
      redacted: false,
      foldError: folded.error,
      why: Object.freeze([]),
    });
  }
  const writers = writersUpTo(log, cursor.commitIdx);
  const previous = options.previous !== undefined ? foldAt(recording, options.previous.commitIdx) : undefined;
  const previousState = previous !== undefined && !('error' in previous) ? previous.state : undefined;

  const keys: ContextKey[] = [];
  for (const [path, value] of Object.entries(folded.state)) {
    const w = writers.get(path);
    const since: ContextKey['since'] | undefined =
      previousState === undefined
        ? undefined
        : !(path in previousState)
          ? 'entered'
          : same(previousState[path], value)
            ? 'unchanged'
            : 'changed';
    keys.push(
      Object.freeze({
        path,
        value,
        ...(w !== undefined
          ? {
              wroteBy: w.wroteBy,
              wroteAt: w.wroteAt,
              enteredAt: w.enteredAt,
              verb: w.verb,
            }
          : {}),
        ...(since !== undefined ? { since } : {}),
      }),
    );
  }
  const left =
    previousState === undefined ? [] : Object.keys(previousState).filter((k) => !(k in folded.state));

  const bundle = log[cursor.commitIdx];
  const rows = Array.isArray(bundle?.trace)
    ? bundle.trace.map((r: TraceRow) => Object.freeze({ path: r.path, verb: r.verb }))
    : [];

  const stages = new Set<string>();
  if (bundle !== undefined && typeof bundle.runtimeStageId === 'string') stages.add(bundle.runtimeStageId);
  for (const k of keys)
    if (k.since !== undefined && k.since !== 'unchanged' && k.wroteBy !== undefined) stages.add(k.wroteBy);

  const skipped =
    folded.skipped !== undefined && folded.skipped.length > 0
      ? folded.skipped.map((g) => g.index)
      : undefined;
  const { served, servedError } = servedFor(recording, cursor);

  return Object.freeze({
    cursor,
    keys: Object.freeze(keys),
    left: Object.freeze(left),
    rows: Object.freeze(rows),
    basis: folded.basis,
    redacted: folded.redacted,
    ...(skipped !== undefined ? { skipped: Object.freeze(skipped) } : {}),
    ...(served !== undefined ? { served } : {}),
    ...(servedError !== undefined ? { servedError } : {}),
    why: whyFor(options.events, stages),
  });
}
