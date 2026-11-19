import { runInNewContext } from 'node:vm';
import { stateAt, type FoldSource } from 'foottrace';
import { describe, expect, it, vi } from 'vitest';
import { contextAt } from '../../src/core/context/contextAt.js';
import * as comparison from '../../src/core/context/sameRecordedValue.js';

const stop = (commitIdx: number) => ({ runtimeStageId: 'stage', commitIdx });
const bundle = (path: string, verb: string, patch: Record<string, unknown>) => ({
  runtimeStageId: 'stage', trace: [{ path, verb }], ...(verb === 'merge' ? { updates: patch } : { overwrite: patch }),
});

function compareToOriginal(source: FoldSource, here: number, there: number) {
  const current = stateAt(source, here).state;
  const prior = stateAt(source, there).state;
  const model = contextAt(source, stop(here), { previous: stop(there) });
  const expected = Object.entries(current).map(([path, value]) => [
    path, !(path in prior) ? 'entered' : JSON.stringify(prior[path]) === JSON.stringify(value) ? 'unchanged' : 'changed',
  ]);
  expect(model.keys.map(key => [key.path, key.since])).toEqual(expected);
  expect(model.left).toEqual(Object.keys(prior).filter(key => !(key in current)));
}

describe('historical Context changes', () => {
  it('tracks an own key that shares its name with an inherited property', () => {
    const snapshot = { initialState: {}, commitLog: [
      bundle('toString', 'set', { toString: 'recorded' }), bundle('toString', 'delete', {}),
    ] };
    expect(contextAt(snapshot, stop(0), { previous: stop(-1) }).keys[0]?.since).toBe('entered');
    expect(contextAt(snapshot, stop(1), { previous: stop(0) }).left).toEqual(['toString']);
  });

  it('matches the serialized folds in either direction, including same-value writes and dotted keys', () => {
    const initialState = { 'a.b': { n: 1 }, list: [1], bag: { a: 1, b: 2 }, dates: new Date(0) };
    const log = [
      bundle('a.b\u001fn', 'set', { 'a.b': { n: 1 } }),
      bundle('list', 'append', { list: [2] }),
      bundle('bag', 'set', { bag: { b: 2, a: 1 } }),
      bundle('a.b\u001fn', 'set', { 'a.b': { n: 2 } }),
      bundle('new', 'merge', { new: { p: 2 } }),
      bundle('dates', 'set', { dates: new Date(0).toJSON() }),
      bundle('list', 'delete', {}),
      { runtimeStageId: 'stage', trace: [], overwrite: { bag: 'metadata alone does not write' } },
    ];
    const stops = [-1, 0, 2, 4, 6, 7, 99];
    for (const source of [{ initialState, commitLog: log }, { initialState, history: log }]) {
      for (const to of stops) for (const from of stops) compareToOriginal(source, to, from);
    }
    const replacement = { ...initialState, 'a.b': { n: 42 } };
    compareToOriginal({ initialState: replacement, commitLog: log }, 0, -1);
  });

  it('preserves reported gaps, checks the remaining evidence and preserves readable raw trace metadata', () => {
    const commitLog = [
      bundle('n', 'set', { n: 1 }),
      null,
      { runtimeStageId: 'bad', trace: [null], overwrite: { n: 900 } },
      { runtimeStageId: 'bad', trace: [{ path: 'n', verb: 'set' }], overwrite: [] },
      bundle('n', 'set', { n: 2 }),
    ];
    for (const here of [2, 3, 4]) compareToOriginal({ commitLog }, here, 0);
    compareToOriginal({ commitLog }, 0, 4);
    const damaged = contextAt({ commitLog }, stop(3));
    expect(damaged.skipped).toEqual([1, 2, 3]);
    // The raw trace still names a writer, while the fold reports that its malformed patch was skipped.
    expect(damaged.keys[0]?.wroteAt).toBe(3);
    expect(damaged.rows).toEqual([{ path: 'n', verb: 'set' }]);
  });

  it('skips the exact value comparison only for keys the admitted interval does not touch', () => {
    const rows = Array.from({ length: 1024 }, (_, i) => ({ i }));
    const recording = { initialState: { inventory: rows, mutable: 0 }, commitLog: [
      bundle('mutable', 'set', { mutable: 1 }), bundle('inventory', 'set', { inventory: rows }),
    ] };
    const check = vi.spyOn(comparison, 'sameRecordedValue');
    try {
      const read = (here: number, there: number) => contextAt(recording, stop(here), { previous: stop(there) });
      expect(read(0, -1).keys.find(k => k.path === 'inventory')?.since).toBe('unchanged');
      expect(check.mock.calls.some(([value]) => Array.isArray(value))).toBe(false);
      expect(read(0, 1).keys.find(k => k.path === 'inventory')?.since).toBe('unchanged');
      expect(check.mock.calls.some(([value]) => Array.isArray(value))).toBe(true);
    } finally { check.mockRestore(); }
  });

  it('preserves the JSON distinctions for historical array slots, object keys, numbers, and Dates', () => {
    const pairs: [unknown, unknown][] = [
      [[, undefined, NaN], [null, null, Infinity]],
      [{ omitted: undefined, a: 1, b: 2 }, { a: 1, b: 2 }],
      [{ a: 1, b: 2 }, { b: 2, a: 1 }],
      [new Date(0), new Date(0).toISOString()], [new Date(NaN), null],
      [runInNewContext('new Date(0)'), new Date(0).toISOString()],
      [new Uint8Array([4, 5]), { 0: 4, 1: 5 }],
      [new Map([['a', 1]]), {}], [undefined, null],
    ];
    for (const [a, b] of pairs) {
      expect(comparison.sameRecordedValue(a, b)).toBe(JSON.stringify(a) === JSON.stringify(b));
    }
  });
});
