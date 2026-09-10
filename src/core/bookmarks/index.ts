/**
 * Bookmarks — the reader's mark, beside a recording, never in it.
 * See `types.ts` for the WHY and `README.md` in this folder for the laws.
 */

export type { Bookmark, BookmarkSidecar, BookmarkStore, SidecarReading } from './types.js';
export { bookmarkKey, type KeyedSnapshot } from './bookmarkKey.js';
export { toSidecar, fromSidecar, bookmarksToMarks, addressesOf } from './sidecar.js';
export {
  localStorageBookmarkStore,
  memoryBookmarkStore,
  noBookmarkStore,
  BOOKMARK_STORAGE_PREFIX,
} from './stores.js';
