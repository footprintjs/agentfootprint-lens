/**
 * ArtifactResolver implementations — the redemption laws, pinned.
 *
 * httpArtifactResolver: speaks the published wire grammar byte-for-byte
 * ({ op, ref, sessionId } in the body, identity on EVERY request), reads both
 * shipped reply dialects (plain and managed-runtime `status`), maps the ONE
 * indistinguishable not-found to `absent` carrying nothing, and surfaces
 * every other refusal VERBATIM — the server's sentence teaches; a paraphrase
 * teaches worse. It never throws for a wire answer.
 *
 * storeArtifactResolver: the same outcomes over a directly passed store —
 * `null` (missing-or-expired, deliberately ambiguous) → absent; a store that
 * THROWS (integrity refusing corrupt bytes) → failed with the store's words.
 */
import { describe, expect, it } from 'vitest';
import { httpArtifactResolver, storeArtifactResolver } from './resolvers.js';
import type { ArtifactMetaView } from './types.js';

const META: ArtifactMetaView = {
  ref: 'art_h7Kq2v',
  kind: 'chart/spec',
  mediaType: 'application/json',
  bytes: 41984,
  label: 'Q3 sales by region',
  createdAt: 1700000000000,
};

/** A fetch double that records every request and replays scripted replies. */
function fakeFetch(replies: Array<{ status: number; body: unknown }>) {
  const requests: Array<{ url: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
  let call = 0;
  const impl = (async (url: unknown, init?: RequestInit) => {
    requests.push({
      url: String(url),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const reply = replies[Math.min(call++, replies.length - 1)]!;
    return {
      status: reply.status,
      json: async () => reply.body,
    } as unknown as Response;
  }) as typeof fetch;
  return { impl, requests };
}

describe('httpArtifactResolver — the wire grammar', () => {
  it('head POSTs { op: "artifact-head", ref, sessionId } and returns live meta (no data key, ever)', async () => {
    const { impl, requests } = fakeFetch([
      { status: 200, body: { artifact: { ref: META.ref, meta: META } } },
    ]);
    const resolver = httpArtifactResolver({ url: '/invoke', sessionId: 's-1', fetch: impl });
    const outcome = await resolver.head(META.ref);
    expect(outcome).toEqual({ status: 'live', meta: META });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe('/invoke');
    expect(requests[0]!.body).toEqual({ op: 'artifact-head', ref: META.ref, sessionId: 's-1' });
    expect(requests[0]!.headers['content-type']).toBe('application/json');
  });

  it('get POSTs { op: "artifact-get", ref } and returns meta + data', async () => {
    const data = { type: 'bar', series: { west: 130 } };
    const { impl, requests } = fakeFetch([
      { status: 200, body: { artifact: { ref: META.ref, meta: META, data } } },
    ]);
    const resolver = httpArtifactResolver({ url: '/invoke', sessionId: 's-1', fetch: impl });
    const outcome = await resolver.get(META.ref);
    expect(outcome).toEqual({ status: 'live', meta: META, data });
    expect(requests[0]!.body.op).toBe('artifact-get');
  });

  it('carries userId only when given, and omits sessionId when not given', async () => {
    const { impl, requests } = fakeFetch([
      { status: 200, body: { artifact: { ref: META.ref, meta: META } } },
    ]);
    await httpArtifactResolver({ url: '/invoke', fetch: impl }).head(META.ref);
    expect(requests[0]!.body).toEqual({ op: 'artifact-head', ref: META.ref });

    const carrying = fakeFetch([{ status: 200, body: { artifact: { ref: META.ref, meta: META } } }]);
    await httpArtifactResolver({
      url: '/invoke',
      sessionId: 's-1',
      userId: 'u-9',
      fetch: carrying.impl,
    }).head(META.ref);
    expect(carrying.requests[0]!.body.userId).toBe('u-9');
  });

  it('maps 404 ERR_ARTIFACT_NOT_FOUND to absent — carrying NOTHING (missing, expired and foreign are one shape)', async () => {
    const { impl } = fakeFetch([
      {
        status: 404,
        body: { error: `artifact 'art_gone' not found in this session's scope`, code: 'ERR_ARTIFACT_NOT_FOUND' },
      },
    ]);
    const resolver = httpArtifactResolver({ url: '/invoke', sessionId: 's-1', fetch: impl });
    expect(await resolver.head('art_gone')).toEqual({ status: 'absent' });
  });

  it('surfaces every other refusal VERBATIM, with its code', async () => {
    const teaching =
      'this agent has no artifact store — attach one with Agent.create({ artifacts: inMemoryArtifacts() })';
    const { impl } = fakeFetch([
      { status: 501, body: { error: teaching, code: 'ERR_NO_ARTIFACT_STORE' } },
    ]);
    const outcome = await httpArtifactResolver({ url: '/invoke', sessionId: 's-1', fetch: impl }).head(
      META.ref,
    );
    expect(outcome).toEqual({ status: 'failed', message: teaching, code: 'ERR_NO_ARTIFACT_STORE' });
  });

  it('reads the managed-runtime dialect: artifact beside status:"success"; failures beside status:"error"', async () => {
    const success = fakeFetch([
      { status: 200, body: { artifact: { ref: META.ref, meta: META }, status: 'success' } },
    ]);
    expect(
      await httpArtifactResolver({ url: '/invocations', sessionId: 's-1', fetch: success.impl }).head(
        META.ref,
      ),
    ).toEqual({ status: 'live', meta: META });

    const failure = fakeFetch([
      { status: 400, body: { error: 'the wire operation is unknown', status: 'error', code: 'ERR_INVALID_WIRE_OP' } },
    ]);
    expect(
      await httpArtifactResolver({ url: '/invocations', sessionId: 's-1', fetch: failure.impl }).head(
        META.ref,
      ),
    ).toEqual({ status: 'failed', message: 'the wire operation is unknown', code: 'ERR_INVALID_WIRE_OP' });
  });

  it('answers failed (never throws) for an unreachable host and for a non-JSON body', async () => {
    const throwing = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const network = await httpArtifactResolver({ url: 'http://down/invoke', fetch: throwing }).get(
      META.ref,
    );
    expect(network.status).toBe('failed');
    expect((network as { message: string }).message).toContain('http://down/invoke');

    const html = (async () =>
      ({ status: 502, json: async () => { throw new SyntaxError('not json'); } }) as unknown as Response) as unknown as typeof fetch;
    const bad = await httpArtifactResolver({ url: '/invoke', fetch: html }).head(META.ref);
    expect(bad.status).toBe('failed');
    expect((bad as { message: string }).message).toContain('502');
  });

  it('refuses construction without a url, teaching what to pass', () => {
    expect(() => httpArtifactResolver({} as never)).toThrow(/needs `url`/);
  });
});

describe('storeArtifactResolver — the same-process door', () => {
  const store = {
    head: async (_scope: unknown, ref: string) => (ref === META.ref ? META : null),
    get: async (_scope: unknown, ref: string) =>
      ref === META.ref ? { meta: META, data: [1, 2] } : null,
  };

  it('resolves head/get through the store under the STATED scope', async () => {
    const scopes: unknown[] = [];
    const recording = {
      head: async (scope: unknown, ref: string) => {
        scopes.push(scope);
        return store.head(scope, ref);
      },
      get: async (scope: unknown, ref: string) => {
        scopes.push(scope);
        return store.get(scope, ref);
      },
    };
    const resolver = storeArtifactResolver({ store: recording, scope: { conversationId: 'run-1' } });
    expect(await resolver.head(META.ref)).toEqual({ status: 'live', meta: META });
    expect(await resolver.get(META.ref)).toEqual({ status: 'live', meta: META, data: [1, 2] });
    expect(scopes).toEqual([{ conversationId: 'run-1' }, { conversationId: 'run-1' }]);
  });

  it("maps the store's null (missing-or-expired, deliberately ambiguous) to absent", async () => {
    const resolver = storeArtifactResolver({ store, scope: {} });
    expect(await resolver.head('art_gone')).toEqual({ status: 'absent' });
    expect(await resolver.get('art_gone')).toEqual({ status: 'absent' });
  });

  it("surfaces a throwing store (integrity refusal) as failed, in the store's own words", async () => {
    const refusing = {
      head: store.head,
      get: async () => {
        throw new Error("digest mismatch: refusing to deliver corrupt bytes as if whole");
      },
    };
    const outcome = await storeArtifactResolver({ store: refusing, scope: {} }).get(META.ref);
    expect(outcome).toEqual({
      status: 'failed',
      message: 'digest mismatch: refusing to deliver corrupt bytes as if whole',
    });
  });

  it('refuses construction without the two read verbs, and without a stated scope', () => {
    expect(() => storeArtifactResolver({ store: {} as never, scope: {} })).toThrow(
      /head\(scope, ref\)/,
    );
    expect(() => storeArtifactResolver({ store } as never)).toThrow(/needs `scope`/);
  });
});
