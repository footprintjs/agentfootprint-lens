import { describe, expect, it, vi } from 'vitest';
import { LensRecorder } from '../LensRecorder.js';
import { createLensRenderStore } from './lensRenderStore.js';

describe('a rendering projection of the recorder', () => {
  it('publishes a burst once and keeps the previous snapshot visible until then', () => {
    const recorder = new LensRecorder();
    const select = vi.fn((r: LensRecorder) => ({ version: r.getVersion() }));
    const flushes: Array<() => void> = [];
    const store = createLensRenderStore(recorder, select, { schedule: flush => { flushes.push(flush); } });
    const first = store.getSnapshot();
    const firstWatch = vi.fn(() => store.getSnapshot());
    const secondWatch = vi.fn(() => store.getSnapshot());
    const off = store.subscribe(firstWatch);
    const offSecond = store.subscribe(secondWatch);
    for (let i = 0; i < 64; i++) recorder.clear();
    expect(flushes).toHaveLength(1);
    expect(store.getSnapshot()).toBe(first);
    expect(select).toHaveBeenCalledTimes(1);
    flushes.shift()!();
    expect(store.getSnapshot().version).toBe(recorder.getVersion());
    expect(firstWatch.mock.results[0]?.value).toBe(secondWatch.mock.results[0]?.value);
    expect(select).toHaveBeenCalledTimes(2);
    off(); offSecond();
  });

  it('pins the selected value at subscribe and at each flush even when listeners do not read', () => {
    const recorder = new LensRecorder();
    let flush!: () => void;
    const store = createLensRenderStore(recorder, r => r.getVersion(), { schedule: callback => { flush = callback; } });
    const listener = vi.fn();
    const off = store.subscribe(listener);
    recorder.clear();
    expect(store.getSnapshot()).toBe(0);
    flush();
    expect(listener).toHaveBeenCalledOnce();
    recorder.clear();
    expect(store.getSnapshot()).toBe(1);
    flush();
    expect(store.getSnapshot()).toBe(2);
    off();
  });

  it('owns separate subscriptions for the same callback and does no selection after the last leaves', () => {
    const recorder = new LensRecorder();
    const select = vi.fn((r: LensRecorder) => r.getVersion());
    let flush!: () => void;
    const store = createLensRenderStore(recorder, select, { schedule: callback => { flush = callback; } });
    const listener = vi.fn();
    const first = store.subscribe(listener);
    const second = store.subscribe(listener);
    recorder.clear();
    flush();
    expect(listener).toHaveBeenCalledTimes(2);
    first();
    second();
    const third = store.subscribe(listener);
    first();
    recorder.clear();
    flush();
    expect(listener).toHaveBeenCalledTimes(3);
    recorder.clear();
    third();
    flush();
    recorder.clear();
    expect(select).toHaveBeenCalledTimes(3);
    expect(store.getSnapshot()).toBe(4);
  });

  it('publishes selector failures to readers and recovers on the next publication', () => {
    const recorder = new LensRecorder();
    let flush!: () => void;
    const store = createLensRenderStore(recorder, r => {
      if (r.getVersion() === 1) throw new Error('unreadable snapshot');
      return r.getVersion();
    }, { schedule: cb => { flush = cb; } });
    const off = store.subscribe(() => {});
    recorder.clear();
    flush();
    expect(() => store.getSnapshot()).toThrow('unreadable snapshot');
    recorder.clear();
    expect(() => store.getSnapshot()).toThrow('unreadable snapshot');
    flush();
    expect(store.getSnapshot()).toBe(2);
    off();
  });

  it('catches a change before subscribe and isolates stale callbacks after the final unsubscribe', () => {
    const recorder = new LensRecorder();
    const select = vi.fn((r: LensRecorder) => r.getVersion());
    const cancel = vi.fn();
    const flushes: Array<() => void> = [];
    const store = createLensRenderStore(recorder, select, { schedule: flush => { flushes.push(flush); return cancel; } });
    expect(store.getSnapshot()).toBe(0);
    recorder.clear();
    const old = vi.fn();
    const off = store.subscribe(old);
    expect(store.getSnapshot()).toBe(1);
    recorder.clear();
    off(); off();
    expect(cancel).toHaveBeenCalledTimes(1);
    const fresh = vi.fn();
    const unsubscribe = store.subscribe(fresh);
    expect(store.getSnapshot()).toBe(2);
    recorder.clear();
    flushes[0]!();
    expect(fresh).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toBe(2);
    flushes[1]!();
    expect(fresh).toHaveBeenCalledOnce();
    expect(old).not.toHaveBeenCalled();
    unsubscribe();
  });
});
