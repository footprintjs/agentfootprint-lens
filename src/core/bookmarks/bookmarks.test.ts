/**
 * Bookmarks core — the sidecar round trip, orphan reporting, the store law
 * (never throw; unavailable is a fact, not an error), and the key.
 */

import { describe, expect, it } from 'vitest';

import {
  bookmarkKey,
  bookmarksToMarks,
  fromSidecar,
  localStorageBookmarkStore,
  memoryBookmarkStore,
  noBookmarkStore,
  toSidecar,
  type Bookmark,
} from './index.js';

const snapshot = {
  runId: '1788974111932-0000000001',
  commitValues: 'full',
  commitLog: [
    { runtimeStageId: 'seed#0', stageId: 'seed' },
    { runtimeStageId: 'call-llm#3', stageId: 'call-llm' },
    { runtimeStageId: 'sf-route#4', stageId: 'sf-route' },
  ],
  subflowResults: {
    'sf-route#4': { treeContext: { history: [{ runtimeStageId: 'sf-route/pick#0' }] } },
  },
};

const marks: Bookmark[] = [
  { runtimeStageId: 'call-llm#3', commitIdx: 1, label: 'the bad call', madeAt: 10 },
  { runtimeStageId: 'sf-route/pick#0', commitIdx: 0, madeAt: 20 },
];

describe('bookmarkKey', () => {
  it('is runId plus a fingerprint of the log opening — stable while the log grows', () => {
    const a = bookmarkKey(snapshot);
    const grown = { ...snapshot, commitLog: [...snapshot.commitLog, { runtimeStageId: 'final#9', stageId: 'final' }] };
    expect(a).toMatch(/^run:1788974111932-0000000001:[0-9a-f]{8}$/);
    expect(bookmarkKey(grown)).toBe(a);
  });
  it('differs when the log OPENS differently under the same runId, and is undefined with no runId', () => {
    const other = { ...snapshot, commitLog: [{ runtimeStageId: 'resume#5', stageId: 'resume' }] };
    expect(bookmarkKey(other)).not.toBe(bookmarkKey(snapshot));
    expect(bookmarkKey({ commitLog: [] })).toBeUndefined();
    expect(bookmarkKey(undefined)).toBeUndefined();
    expect(bookmarkKey('text')).toBeUndefined();
  });
});

describe('sidecar round trip', () => {
  it('toSidecar → JSON → fromSidecar gives the same bookmarks back, in order', () => {
    const key = bookmarkKey(snapshot)!;
    const json = JSON.stringify(toSidecar(key, marks));
    const read = fromSidecar(json, snapshot);
    expect(read.bookmarks).toEqual(marks);
    expect(read.orphaned).toEqual([]);
  });
  it('a bookmark on a subflow stop counts as in the recording (the mount’s own log is read)', () => {
    const read = fromSidecar(toSidecar('k', [marks[1]!]), snapshot);
    expect(read.bookmarks).toHaveLength(1);
  });
  it('reports a stop the recording no longer holds as ORPHANED — never dropped', () => {
    const truncated = { ...snapshot, commitLog: snapshot.commitLog.slice(0, 1), subflowResults: {} };
    const read = fromSidecar(toSidecar('k', marks), truncated);
    expect(read.bookmarks).toEqual([]);
    expect(read.orphaned.map((b) => b.runtimeStageId)).toEqual(['call-llm#3', 'sf-route/pick#0']);
  });
  it('synthesised addresses the UI hands in count as present', () => {
    const rootMark: Bookmark = { runtimeStageId: '__root__#0', commitIdx: 0, madeAt: 1 };
    expect(fromSidecar(toSidecar('k', [rootMark]), snapshot).orphaned).toHaveLength(1);
    expect(fromSidecar(toSidecar('k', [rootMark]), snapshot, ['__root__#0']).bookmarks).toHaveLength(1);
  });
  it('a damaged document reads as empty; damaged rows are skipped; duplicates keep the first', () => {
    expect(fromSidecar('not json', snapshot)).toEqual({ bookmarks: [], orphaned: [] });
    expect(fromSidecar({ bookmarks: 'nope' }, snapshot)).toEqual({ bookmarks: [], orphaned: [] });
    const read = fromSidecar(
      { bookmarks: [null, { commitIdx: 1 }, marks[0], { ...marks[0], label: 'later copy' }] },
      snapshot,
    );
    expect(read.bookmarks).toEqual([marks[0]]);
  });
  it('bookmarksToMarks names each mark by its address and resolves its step on the axis in hand', () => {
    const axis = [{ runtimeStageId: '__root__#0' }, { runtimeStageId: 'call-llm#3' }];
    expect(bookmarksToMarks(marks, axis)).toEqual([
      { name: 'call-llm#3', runtimeStageId: 'call-llm#3', step: 1 },
      { name: 'sf-route/pick#0', runtimeStageId: 'sf-route/pick#0', step: -1 },
    ]);
  });
});

describe('stores', () => {
  it('memoryBookmarkStore: available, get/set/remove by key, detached copies', () => {
    const store = memoryBookmarkStore();
    expect(store.available).toBe(true);
    expect(store.get('k')).toBeUndefined();
    const doc = toSidecar('k', marks);
    store.set('k', doc);
    expect(store.get('k')).toEqual(doc);
    expect(store.get('k')).not.toBe(doc);
    store.remove('k');
    expect(store.get('k')).toBeUndefined();
  });
  it('localStorageBookmarkStore over a working Storage: persists under a namespaced key', () => {
    const backing = new Map<string, string>();
    const store = localStorageBookmarkStore({
      getItem: (k) => backing.get(k) ?? null,
      setItem: (k, v) => void backing.set(k, v),
      removeItem: (k) => void backing.delete(k),
    });
    expect(store.available).toBe(true);
    store.set('run:1:abc', toSidecar('run:1:abc', marks));
    expect([...backing.keys()]).toEqual(['agentfootprint-lens:bookmarks:run:1:abc']);
    expect(store.get('run:1:abc')?.bookmarks).toEqual(marks);
  });
  it('a Storage that throws on the probe makes an UNAVAILABLE store — and nothing throws', () => {
    const store = localStorageBookmarkStore({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
    });
    expect(store.available).toBe(false);
    expect(() => store.set('k', toSidecar('k', marks))).not.toThrow();
    expect(store.get('k')).toBeUndefined();
  });
  it('a Storage that fails mid-session (quota) downgrades the store rather than the caller', () => {
    let writes = 0;
    const store = localStorageBookmarkStore({
      getItem: () => null,
      setItem: () => {
        writes += 1;
        if (writes > 2) throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    });
    expect(store.available).toBe(true); // the probe was write #1
    store.set('k', toSidecar('k', marks)); // #2 ok
    expect(() => store.set('k', toSidecar('k', marks))).not.toThrow(); // #3 throws inside
    expect(store.available).toBe(false);
  });
  it('a corrupt stored document reads as absent, not as a throw', () => {
    const store = localStorageBookmarkStore({
      getItem: () => '{broken',
      setItem: () => {},
      removeItem: () => {},
    });
    expect(store.get('k')).toBeUndefined();
  });
  it('noBookmarkStore is the explicit off switch', () => {
    const store = noBookmarkStore();
    expect(store.available).toBe(false);
    store.set('k', toSidecar('k', marks));
    expect(store.get('k')).toBeUndefined();
  });
});
