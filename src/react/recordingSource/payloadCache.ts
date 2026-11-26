import { readRecordingSubflowPayloads, type RecordedInvocation, type RecordedInvocationPayloads } from '../../core/recordingSourceCodec/index.js';

/** The most invocations whose payloads are kept once no view shows them. */
export const MAX_CACHED_PAYLOADS = 64;

/** A payload read in flight, or one that failed (kept so it is not retried while held). */
export type PayloadReadState = 'loading' | 'error';

export interface PayloadCacheView {
  /** By mount runtime id: the payloads a reply carried, or `null` when it carried none. */
  readonly ready: ReadonlyMap<string, RecordedInvocationPayloads | null>;
  readonly reads: ReadonlyMap<string, PayloadReadState>;
}

/**
 * This package's own store of sub-flow boundary payloads, apart from the
 * renderer's set of loaded children (which stays the person's, for explicit
 * drills). A view holds the invocations it shows with a signal: while held an
 * entry is never evicted, and a read in flight that nobody holds any more is
 * cancelled. At most `capacity` entries are kept once no view holds them,
 * least recently wanted first out. Only admitted payloads are kept: the
 * child's result is dropped as soon as its payloads are read.
 */
export interface PayloadCache {
  /** Hold `request`'s payloads until `signal` aborts (or, with no signal, until they settle). Never rejects: the outcome is in `view()`. */
  want(request: RecordedInvocation, signal?: AbortSignal): Promise<void>;
  /** Payloads that an explicit child load's reply carried. */
  put(id: string, payloads: RecordedInvocationPayloads | null): void;
  view(): PayloadCacheView;
  dispose(): void;
}

interface Entry {
  status: 'loading' | 'ready' | 'error';
  payloads: RecordedInvocationPayloads | null;
  leases: number;
  used: number;
  fetch?: AbortController;
  settled: Promise<void>;
}

const SETTLED = Promise.resolve();

export function createPayloadCache(options: {
  readonly capacity: number;
  /** The host's child read (the recording source's `loadSubflow`). */
  readonly read: (request: RecordedInvocation, signal: AbortSignal) => unknown;
  /** Called after every change `view()` can see. */
  readonly changed: () => void;
}): PayloadCache {
  const entries = new Map<string, Entry>();
  let tick = 0, disposed = false;
  const trim = () => {
    const loose = [...entries].filter(([, entry]) => entry.leases === 0 && entry.status !== 'loading')
      .sort(([, a], [, b]) => a.used - b.used);
    for (let i = 0; i < loose.length - options.capacity; i++) entries.delete(loose[i]![0]);
  };
  const release = (id: string, entry: Entry) => {
    entry.leases--;
    if (disposed || entries.get(id) !== entry || entry.leases > 0) return;
    if (entry.status === 'loading') {
      // Nobody shows it any more: cancel the read rather than fill the store.
      entry.fetch?.abort();
      entries.delete(id);
    } else trim();
    options.changed();
  };
  const settle = (id: string, entry: Entry, status: 'ready' | 'error', payloads: RecordedInvocationPayloads | null) => {
    if (disposed || entries.get(id) !== entry || entry.status !== 'loading') return;
    entry.status = status; entry.payloads = payloads; delete entry.fetch;
    trim(); options.changed();
  };
  const start = (request: RecordedInvocation): Entry => {
    const id = request.mountRuntimeStageId, fetch = new AbortController();
    const entry: Entry = { status: 'loading', payloads: null, leases: 0, used: ++tick, fetch, settled: SETTLED };
    entries.set(id, entry);
    entry.settled = Promise.resolve()
      .then(() => options.read(request, fetch.signal))
      .then(reply => {
        let payloads: RecordedInvocationPayloads | null;
        // A malformed `payloads` member fails the read; it is never kept in part.
        try { payloads = admit(reply); } catch { settle(id, entry, 'error', null); return; }
        settle(id, entry, 'ready', payloads);
      }, () => {
        // A cancelled read is not a failure: its entry is already gone.
        if (!fetch.signal.aborted) settle(id, entry, 'error', null);
      });
    return entry;
  };
  return {
    want(request, signal) {
      if (disposed || signal?.aborted) return SETTLED;
      const id = request.mountRuntimeStageId;
      let entry = entries.get(id);
      const fresh = entry === undefined;
      if (entry === undefined) entry = start(request);
      entry.used = ++tick;
      entry.leases++;
      const held = entry;
      if (signal) signal.addEventListener('abort', () => release(id, held), { once: true });
      else void held.settled.then(() => release(id, held));
      if (fresh) options.changed();
      return held.settled;
    },
    put(id, payloads) {
      if (disposed) return;
      const entry = entries.get(id);
      if (entry === undefined) entries.set(id, { status: 'ready', payloads, leases: 0, used: ++tick, settled: SETTLED });
      else {
        entry.fetch?.abort(); delete entry.fetch;
        entry.status = 'ready'; entry.payloads = payloads; entry.used = ++tick;
      }
      trim(); options.changed();
    },
    view() {
      const ready = new Map<string, RecordedInvocationPayloads | null>(), reads = new Map<string, PayloadReadState>();
      for (const [id, entry] of entries) {
        if (entry.status === 'ready') ready.set(id, entry.payloads);
        else reads.set(id, entry.status);
      }
      return { ready, reads };
    },
    dispose() {
      disposed = true;
      for (const entry of entries.values()) entry.fetch?.abort();
      entries.clear();
    },
  };
}

/** The payloads a reply carried; a malformed member fails the read. */
function admit(reply: unknown): RecordedInvocationPayloads | null {
  return splitReply(reply).payloads;
}

/**
 * Take a reply's `payloads` member out and admit it; everything else goes to
 * the renderer exactly as the host returned it, so a reply without `payloads`
 * (or with `payloads: undefined`, which the reply type allows) is today's reply.
 * Own descriptors are copied, never read through.
 */
export function splitReply(reply: unknown): { readonly forward: unknown; readonly payloads: RecordedInvocationPayloads | null } {
  if (typeof reply !== 'object' || reply === null || Array.isArray(reply)) return { forward: reply, payloads: null };
  const member = Object.getOwnPropertyDescriptor(reply, 'payloads');
  if (member === undefined) return { forward: reply, payloads: null };
  if (!('value' in member)) throw new Error('The recorded invocation reply could not be read.');
  let payloads: RecordedInvocationPayloads | null = null;
  if (member.value !== undefined) {
    const read = readRecordingSubflowPayloads(member.value);
    if (read.status !== 'ready') throw new Error('The recorded invocation reply could not be read.');
    payloads = read.value;
  }
  const forward = Object.create(Object.getPrototypeOf(reply)) as object;
  for (const key of Reflect.ownKeys(reply)) if (key !== 'payloads')
    Object.defineProperty(forward, key, Object.getOwnPropertyDescriptor(reply, key)!);
  return { forward, payloads };
}
