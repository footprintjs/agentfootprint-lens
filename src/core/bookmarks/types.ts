/**
 * Bookmarks — the READER'S mark, kept beside a recording and never in it.
 *
 * footprintjs's design page names three marks that end in the same operation
 * and differ in who puts them: a DECLARED tag is the author's (build time, in
 * the commit bundle), a DERIVED tag is a predicate at read time, and a
 * BOOKMARK is the reader's choice. footprintjs 9.17 holds bookmarks on the
 * cursor (`mark` / `marks` / `jumpToMark`) and, by its own law 4, nowhere
 * else: the commit log and the snapshot are the run's record, not the
 * reader's notes. That leaves a bookmark with no home once the page closes.
 *
 * This folder is that home: a SIDECAR — a small JSON document keyed to one
 * recording, kept in a store the host chooses. The cursor's own marks stay
 * the runtime truth; the sidecar only SEEDS `TimeTravelOptions.marks` when a
 * recording is opened and is written back when the reader changes a mark.
 * Nothing here ever writes into a recording.
 */

/** One bookmark, as it travels in the sidecar. */
export interface Bookmark {
  /**
   * The stop's address — `[subflowPath/]stageId#executionIndex`, the same
   * string footprintjs's `Mark.runtimeStageId` carries. Names the stop on
   * EVERY axis, which is what lets a bookmark survive a change of grouping.
   */
  readonly runtimeStageId: string;
  /** The commit the stop anchored to when the bookmark was made. */
  readonly commitIdx: number;
  /** The reader's optional note. The stop's OWN label is not stored — it is
   *  the axis's to say, at render time. */
  readonly label?: string;
  /** When the reader made it — `Date.now()`. */
  readonly madeAt: number;
}

/** The document a store holds for one recording. */
export interface BookmarkSidecar {
  /** The document's shape, for a reader that finds one on disk. */
  readonly version: 1;
  /** `bookmarkKey(...)` of the recording this sidecar belongs to. */
  readonly key: string;
  readonly bookmarks: readonly Bookmark[];
}

/**
 * What `fromSidecar` found: the bookmarks whose stop the recording still
 * holds, and — separately, never dropped — the ones it does not. OMIT, NEVER
 * DENY: an orphan is reported so the UI can show it greyed and say why.
 */
export interface SidecarReading {
  readonly bookmarks: readonly Bookmark[];
  readonly orphaned: readonly Bookmark[];
}

/**
 * Where sidecars live. Get / set by key; the store owns the serialisation.
 *
 * A store NEVER throws: an unavailable backing (no `localStorage`, a quota, a
 * private window) is reported through `available` and read on screen as a
 * label. `get` on an unavailable store is `undefined`; `set` is a no-op.
 */
export interface BookmarkStore {
  /** `false` ⇒ nothing persists; the UI says so. */
  readonly available: boolean;
  get(key: string): BookmarkSidecar | undefined;
  set(key: string, sidecar: BookmarkSidecar): void;
  remove(key: string): void;
}
