import { describe, expect, it, vi } from 'vitest';
import type { RecordedInvocation } from '../../core/recordingSourceCodec/index.js';
import { createPayloadCache, MAX_CACHED_PAYLOADS, splitReply } from './payloadCache.js';

const request = (id: string): RecordedInvocation => ({ invocationPath: [id], mountRuntimeStageId: id, subflowId: id.split('#')[0]! });
const reply = (id: string) => ({ result: { big: 'dropped' }, payloads: { exit: { status: 'ready', value: `exit of ${id}` } } });
type Read = (r: RecordedInvocation, signal: AbortSignal) => unknown;
function cache(capacity = 2, read: ReturnType<typeof vi.fn<Read>> = vi.fn<Read>(async r => reply(r.mountRuntimeStageId))) {
  const changed = vi.fn();
  return { store: createPayloadCache({ capacity, read, changed }), read, changed };
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('the payload store: payloads apart from the renderer’s loaded children', () => {
  it('reads once per invocation, keeps only the admitted payloads, and never rejects', async () => {
    const { store, read, changed } = cache();
    expect(MAX_CACHED_PAYLOADS).toBe(64);
    const a = store.want(request('a#1')), b = store.want(request('a#1'));
    expect(store.view().reads.get('a#1')).toBe('loading');
    await Promise.all([a, b]);
    expect(read).toHaveBeenCalledTimes(1);
    expect([...store.view().ready]).toEqual([['a#1', { exit: { status: 'ready', value: 'exit of a#1' } }]]);
    expect(JSON.stringify([...store.view().ready])).not.toContain('dropped');
    expect(changed).toHaveBeenCalled();
  });

  it('records a failed or malformed read as failed, and does not read it again while it is kept', async () => {
    const read = vi.fn<Read>(async r => {
      if (r.mountRuntimeStageId === 'bad#1') throw new Error('host refused');
      return { result: 1, payloads: { entry: { status: 'ready' } } };
    });
    const { store } = cache(4, read);
    await expect(store.want(request('bad#1'))).resolves.toBeUndefined();
    await store.want(request('odd#2'));
    expect([...store.view().reads]).toEqual([['bad#1', 'error'], ['odd#2', 'error']]);
    await store.want(request('bad#1'));
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('cancels a read nobody holds any more, and keeps a held entry past the capacity', async () => {
    const signals: AbortSignal[] = [];
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const read = vi.fn<Read>(async (r, signal) => { signals.push(signal); await gate; return reply(r.mountRuntimeStageId); });
    const { store } = cache(1, read);
    const first = new AbortController(), second = new AbortController();
    void store.want(request('a#1'), first.signal); void store.want(request('a#1'), second.signal);
    await flush();
    first.abort();
    expect(signals[0]!.aborted).toBe(false);
    second.abort();
    expect(signals[0]!.aborted).toBe(true);
    expect(store.view().reads.size + store.view().ready.size).toBe(0);
    release(); await flush();
    expect(store.view().ready.size).toBe(0);

    const held = new AbortController();
    for (const id of ['x#1', 'y#2', 'z#3']) await store.want(request(id), held.signal);
    expect([...store.view().ready.keys()]).toEqual(['x#1', 'y#2', 'z#3']);
    held.abort();
    // Unheld, only `capacity` (1) stay: the most recently wanted.
    expect([...store.view().ready.keys()]).toEqual(['z#3']);
  });

  it('evicts the least recently wanted unheld entries first', async () => {
    const { store, read } = cache(2);
    for (const id of ['a#1', 'b#2']) await store.want(request(id));
    await store.want(request('a#1'));
    await store.want(request('c#3'));
    expect([...store.view().ready.keys()].sort()).toEqual(['a#1', 'c#3']);
    await store.want(request('b#2'));
    expect(read).toHaveBeenCalledTimes(4);
  });

  it('takes an explicit child reply’s payloads in place of a read, and stops on dispose', async () => {
    let seen: AbortSignal | undefined;
    const read = vi.fn<Read>((_r, signal) => { seen = signal; return new Promise(() => {}); });
    const { store } = cache(2, read);
    void store.want(request('a#1'));
    await flush();
    store.put('a#1', { entry: { status: 'ready', value: 'from the drill' } });
    expect(seen!.aborted).toBe(true);
    expect(store.view().ready.get('a#1')).toEqual({ entry: { status: 'ready', value: 'from the drill' } });
    store.put('b#2', null);
    expect(store.view().ready.get('b#2')).toBeNull();
    void store.want(request('c#3'));
    await flush();
    store.dispose();
    expect(seen!.aborted).toBe(true);
    expect(store.view().ready.size + store.view().reads.size).toBe(0);
  });
});

describe('splitReply — only the payloads member is taken out', () => {
  it('returns a reply without payloads as the same object, and copies the rest of one with payloads', () => {
    const plain = { result: { a: 1 }, graph: { nodes: [] } };
    expect(splitReply(plain)).toEqual({ forward: plain, payloads: null });
    expect(splitReply(plain).forward).toBe(plain);
    let calls = 0;
    const withPayloads = { result: { a: 1 }, graph: { nodes: [] }, payloads: { exit: { status: 'ready', value: 'x' } } };
    Object.defineProperty(withPayloads, 'narrativeEntries', { enumerable: true, get() { calls++; return []; } });
    const split = splitReply(withPayloads);
    expect(Object.keys(split.forward as object)).toEqual(['result', 'graph', 'narrativeEntries']);
    expect((split.forward as { result: unknown }).result).toBe(withPayloads.result);
    expect(Object.getOwnPropertyDescriptor(split.forward, 'narrativeEntries')?.get).toBeTypeOf('function');
    expect(split.payloads).toEqual({ exit: { status: 'ready', value: 'x' } });
    expect(calls).toBe(0);
    const accessor = { result: 1 } as Record<string, unknown>;
    Object.defineProperty(accessor, 'payloads', { enumerable: true, get() { calls++; return {}; } });
    expect(() => splitReply(accessor)).toThrow('The recorded invocation reply could not be read.');
    expect(calls).toBe(0);
  });

  it('reads `payloads: undefined` (allowed by the reply type) as a reply without payloads', () => {
    const split = splitReply({ result: { a: 1 }, payloads: undefined });
    expect(split.payloads).toBeNull();
    expect(Object.keys(split.forward as object)).toEqual(['result']);
  });
});
