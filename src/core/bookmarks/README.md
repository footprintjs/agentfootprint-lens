# bookmarks/ — the reader's mark, beside the recording

**Why.** footprintjs's declared-tags design names three marks that end in the
same operation and differ in who puts them: a *declared tag* is the author's
(build time, stamped into the commit bundle), a *derived tag* is a predicate at
read time, a *bookmark* is the reader's choice. footprintjs 9.17 keeps
bookmarks on the cursor (`mark` / `marks` / `jumpToMark`) and, by its own law,
nowhere else — the log and the snapshot are the run's record, not the reader's
notes. That left a bookmark with no home once the page closed. This folder is
that home: a **sidecar** keyed to one recording, in a store the host chooses.

## Laws

1. **Never in the record.** Nothing here writes into a snapshot or a log. The
   sidecar is a separate document; `toSidecar` / `fromSidecar` are its only
   two directions.
2. **The cursor's marks are the runtime truth.** The store only *seeds*
   `TimeTravelOptions.marks` when a recording is opened
   (`openLensCursor(positions, { marks })`) and is written back when the reader
   changes one. A mark is named by its address (`runtimeStageId`), so marking a
   stop twice updates rather than duplicates, and the mark survives a change of
   axis.
3. **Omit, never deny.** `fromSidecar` reports a bookmark whose stop the
   recording does not hold as `orphaned` — shown greyed, "not in this
   recording" — and never drops it. A write keeps orphans in the document.
4. **A store never throws.** `BookmarkStore.available` is the fact; an
   unavailable store (no `localStorage`, a quota, a private window) means no
   persistence, said on screen as a label. `get` is `undefined`, `set` a no-op.
5. **No key, no sidecar.** `bookmarkKey` is the run's `runId` plus a fingerprint
   of the log's opening (first address, first stage, encoding) — stable while a
   live run grows, distinct across two resumed snapshots that share a runId. A
   snapshot with no `runId` has no key; the UI says "no run id".

## Example

```ts
import {
  bookmarkKey, fromSidecar, toSidecar, localStorageBookmarkStore,
} from 'agentfootprint-lens/core';

const store = localStorageBookmarkStore();      // `available: false` on a server
const key = bookmarkKey(snapshot);              // 'run:<runId>:<fingerprint>'
if (key !== undefined) {
  const { bookmarks, orphaned } = fromSidecar(store.get(key), snapshot);
  // …seed a cursor: timeTravel(snapshot, { marks: bookmarksToMarks(bookmarks, positions) })
  store.set(key, toSidecar(key, [...bookmarks, ...orphaned, made]));
}
```

Tests: `bookmarks.test.ts` (round trip, orphans, the store law, the key);
`src/react/Lens.bookmarks.test.tsx` (the one cursor under the tab).
