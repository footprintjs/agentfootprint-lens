/**
 * The two shipped stores. Both keep the store law: never throw, report
 * availability, and own the serialisation.
 *
 *   `localStorageBookmarkStore()` — the default. Probes `localStorage` once
 *     with a write + remove; a browser that refuses (private mode, a quota,
 *     no DOM at all on a server) makes an UNAVAILABLE store, and the UI
 *     prints a label instead of persisting. Every later call is wrapped too:
 *     a quota hit mid-session downgrades the store rather than the page.
 *
 *   `memoryBookmarkStore()` — a Map. For tests, and for a host that persists
 *     elsewhere and wants the session's marks without the disk.
 */

import type { BookmarkSidecar, BookmarkStore } from './types.js';

/** The storage key namespace; the sidecar key follows it. */
export const BOOKMARK_STORAGE_PREFIX = 'agentfootprint-lens:bookmarks:';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function readSidecar(text: string | null): BookmarkSidecar | undefined {
  if (text === null) return undefined;
  try {
    const doc = JSON.parse(text) as Partial<BookmarkSidecar> | null;
    if (doc === null || typeof doc !== 'object' || !Array.isArray(doc.bookmarks)) return undefined;
    return { version: 1, key: typeof doc.key === 'string' ? doc.key : '', bookmarks: doc.bookmarks };
  } catch {
    return undefined;
  }
}

/**
 * A store over any `Storage`-shaped object (`localStorage` by default).
 *
 * @param storage the backing; defaults to `globalThis.localStorage`, reached
 *   inside a try so a runtime where the accessor itself throws is simply
 *   unavailable.
 */
export function localStorageBookmarkStore(storage?: StorageLike): BookmarkStore {
  let backing: StorageLike | undefined;
  try {
    backing = storage ?? (globalThis as { localStorage?: StorageLike }).localStorage;
    if (backing !== undefined) {
      const probe = `${BOOKMARK_STORAGE_PREFIX}__probe__`;
      backing.setItem(probe, '1');
      backing.removeItem(probe);
    }
  } catch {
    backing = undefined;
  }
  let available = backing !== undefined;
  const guard = <T>(op: (s: StorageLike) => T, fallback: T): T => {
    if (!available || backing === undefined) return fallback;
    try {
      return op(backing);
    } catch {
      // A quota or a revoked backing mid-session: from here on nothing
      // persists, and `available` says so on the next render.
      available = false;
      return fallback;
    }
  };
  return {
    get available(): boolean {
      return available;
    },
    get: (key) => guard((s) => readSidecar(s.getItem(BOOKMARK_STORAGE_PREFIX + key)), undefined),
    set: (key, sidecar) => guard((s) => s.setItem(BOOKMARK_STORAGE_PREFIX + key, JSON.stringify(sidecar)), undefined),
    remove: (key) => guard((s) => s.removeItem(BOOKMARK_STORAGE_PREFIX + key), undefined),
  };
}

/** A Map-backed store: always available, never persists past the process. */
export function memoryBookmarkStore(): BookmarkStore & { readonly size: number } {
  const docs = new Map<string, BookmarkSidecar>();
  return {
    available: true,
    get size(): number {
      return docs.size;
    },
    get: (key) => {
      const doc = docs.get(key);
      return doc === undefined ? undefined : readSidecar(JSON.stringify(doc));
    },
    set: (key, sidecar) => {
      docs.set(key, JSON.parse(JSON.stringify(sidecar)) as BookmarkSidecar);
    },
    remove: (key) => {
      docs.delete(key);
    },
  };
}

/** A store that is never available — what a host passes to switch persistence off, said on screen. */
export function noBookmarkStore(): BookmarkStore {
  return { available: false, get: () => undefined, set: () => {}, remove: () => {} };
}
