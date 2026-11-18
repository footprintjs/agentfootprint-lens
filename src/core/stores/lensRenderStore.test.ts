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

  it('notifies a subscriber even when another reader first selects between ingestion and the flush', () => {
    const recorder = new LensRecorder();
    let flush!: () => void;
    const store = createLensRenderStore(recorder, r => r.getVersion(), { schedule: callback => { flush = callback; } });
    const listener = vi.fn();
    const off = store.subscribe(listener);
    recorder.clear();
    expect(store.getSnapshot()).toBe(1);
    flush();
    expect(listener).toHaveBeenCalledOnce();
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
