/**
 * The sidecar's two directions: cursor marks → a document, and a document
 * (possibly from disk, possibly damaged) → the bookmarks a recording can still
 * place, with the ones it cannot REPORTED rather than dropped.
 */

import type { Mark } from 'footprintjs/trace';

import { mountLogsOf } from '../utils/snapshotOfRunner.js';
import type { Bookmark, BookmarkSidecar, SidecarReading } from './types.js';

/** The document, from the bookmarks in hand. */
export function toSidecar(key: string, bookmarks: readonly Bookmark[]): BookmarkSidecar {
  return { version: 1, key, bookmarks: bookmarks.map(cloneBookmark) };
}

/**
 * The cursor's seeds. `Mark.name` IS the address — one bookmark per stop is
 * the toggle's whole semantics, and footprintjs replaces a mark by name, so
 * re-marking a stop updates rather than duplicates. `step` is resolved
 * against the axis in force; `-1` when the stop is not on it (the library
 * resolves by `runtimeStageId` first and reads `step` only for bookends).
 */
export function bookmarksToMarks(
  bookmarks: readonly Bookmark[],
  positions: readonly { readonly runtimeStageId: string }[],
): Mark[] {
  return bookmarks.map((b) => ({
    name: b.runtimeStageId,
    runtimeStageId: b.runtimeStageId,
    step: positions.findIndex((p) => p.runtimeStageId === b.runtimeStageId),
  }));
}

/**
 * Every address the recording holds a commit for — the run's own log and each
 * mounted subflow's (walked once, through the `#n`-keyed half of the
 * dual-keyed `subflowResults` — `mountLogsOf`), so a bookmark made while
 * drilled is still "in this recording". Duck-typed like every recording read.
 */
export function addressesOf(snapshot: unknown): ReadonlySet<string> {
  const out = new Set<string>();
  const addFrom = (log: unknown): void => {
    if (!Array.isArray(log)) return;
    for (const bundle of log) {
      const id = (bundle as { runtimeStageId?: unknown } | null)?.runtimeStageId;
      if (typeof id === 'string' && id !== '') out.add(id);
    }
  };
  const s = snapshot as { commitLog?: unknown } | null | undefined;
  if (s === null || typeof s !== 'object') return out;
  addFrom(s.commitLog);
  for (const mount of mountLogsOf(snapshot)) addFrom(mount.log);
  return out;
}

function cloneBookmark(b: Bookmark): Bookmark {
  return {
    runtimeStageId: b.runtimeStageId,
    commitIdx: b.commitIdx,
    ...(b.label !== undefined ? { label: b.label } : {}),
    madeAt: b.madeAt,
  };
}

/** One row of a document, narrowed; `undefined` for a row that is not a bookmark. */
function readBookmark(row: unknown): Bookmark | undefined {
  const r = row as Partial<Record<keyof Bookmark, unknown>> | null;
  if (r === null || typeof r !== 'object') return undefined;
  if (typeof r.runtimeStageId !== 'string' || r.runtimeStageId === '') return undefined;
  const commitIdx = typeof r.commitIdx === 'number' && Number.isFinite(r.commitIdx) ? r.commitIdx : -1;
  const madeAt = typeof r.madeAt === 'number' && Number.isFinite(r.madeAt) ? r.madeAt : 0;
  return {
    runtimeStageId: r.runtimeStageId,
    commitIdx,
    ...(typeof r.label === 'string' && r.label !== '' ? { label: r.label } : {}),
    madeAt,
  };
}

/**
 * Read a document against a recording.
 *
 * `json` may be the parsed document, its JSON text, or anything a store
 * handed back; a row that is not a bookmark is skipped, and a document that
 * is not a sidecar reads as empty. A bookmark whose stop the recording does
 * not hold — a recording that was truncated, or a sidecar filed under the
 * wrong key — lands in `orphaned`, never silently on the floor.
 *
 * `extraAddresses` are stops the UI synthesises and the log does not hold
 * (the Why Lens's `__root__#0` bookends); they count as present.
 *
 * @example
 * ```ts
 * const { bookmarks, orphaned } = fromSidecar(store.get(key), snapshot);
 * orphaned.length;   // shown greyed as "not in this recording"
 * ```
 */
export function fromSidecar(
  json: unknown,
  snapshot: unknown,
  extraAddresses: readonly string[] = [],
): SidecarReading {
  let doc: unknown = json;
  if (typeof doc === 'string') {
    try {
      doc = JSON.parse(doc);
    } catch {
      doc = undefined;
    }
  }
  const rows = (doc as { bookmarks?: unknown } | null)?.bookmarks;
  if (!Array.isArray(rows)) return { bookmarks: [], orphaned: [] };
  const present = new Set<string>([...addressesOf(snapshot), ...extraAddresses]);
  const bookmarks: Bookmark[] = [];
  const orphaned: Bookmark[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const b = readBookmark(row);
    if (b === undefined || seen.has(b.runtimeStageId)) continue;
    seen.add(b.runtimeStageId);
    (present.has(b.runtimeStageId) ? bookmarks : orphaned).push(b);
  }
  return { bookmarks, orphaned };
}
