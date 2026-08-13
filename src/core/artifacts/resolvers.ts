/**
 * The two shipped ArtifactResolvers.
 *
 * `httpArtifactResolver` speaks the hosting wire's published grammar (9.23.0):
 *
 *   POST <url>  { op: 'artifact-head', ref, sessionId }
 *     → 200 { artifact: { ref, meta } }
 *   POST <url>  { op: 'artifact-get',  ref, sessionId }
 *     → 200 { artifact: { ref, meta, data } }
 *   failure     { error, code }   (managed-runtime dialect adds status:'error')
 *
 * The grammar is spoken here BY VALUE, not imported from
 * `agentfootprint/hosting`: that subpath exists only on 9.2x, and the lens
 * peers back to ^7 — a named import would be a module-link crash on older
 * installs, and the hosting barrel drags `node:http` into a browser bundle.
 * The protocol is the contract; these strings are it.
 *
 * The governing law both resolvers uphold: **an id in a response is safe —
 * the RESOLUTION is governed.** Every HTTP redemption carries the session's
 * identity exactly as every other request on that wire does (body `sessionId`,
 * plus `userId` on wires that carry one); the serving agent enforces scope and
 * redaction at its boundary. `404 ERR_ARTIFACT_NOT_FOUND` is the ONE
 * indistinguishable answer for missing, expired and another-session's ref —
 * these resolvers surface it as `absent` and deliberately carry nothing else,
 * so no UI can accidentally say more than the store chose to.
 */

import type { ArtifactMetaView, ArtifactResolution, ArtifactResolver } from './types.js';

/** The wire spelling of `head` — metadata only, the render-by-ref decision. */
const ARTIFACT_HEAD_OP = 'artifact-head';
/** The wire spelling of `get` — metadata + payload. */
const ARTIFACT_GET_OP = 'artifact-get';
/** The one failure code that means "no data" rather than "the door failed". */
const NOT_FOUND_CODE = 'ERR_ARTIFACT_NOT_FOUND';

export interface HttpArtifactResolverOptions {
  /** The served agent's invoke URL — the SAME path conversation turns POST to
   *  (e.g. `'https://host/invoke'` or a relative `'/invoke'`). */
  readonly url: string;
  /** The session whose runs minted the refs. Redemption is governed by it:
   *  a ref from another session answers the same not-found a missing ref
   *  does. Omit only for a host that binds the session another way (a session
   *  cookie); a wire that requires one will answer its own teaching refusal,
   *  which the resolver surfaces verbatim. */
  readonly sessionId?: string;
  /** The caller's user id, on wires that carry one. */
  readonly userId?: string;
  /** Extra headers (an auth token, a tenant header). `content-type` is set
   *  by the resolver. */
  readonly headers?: Readonly<Record<string, string>>;
  /** The fetch to use. Default: the global `fetch`. Injectable for tests and
   *  for hosts that need credentialed fetch (`credentials: 'include'` — wrap
   *  and forward). */
  readonly fetch?: typeof fetch;
}

/**
 * Redeem refs over a served agent's wire — `standingAgent` + `httpHost` /
 * `nodeHost`, or the managed-runtime dialect (both answer the same
 * `{ artifact: … }` body; the managed one adds `status` beside it, which is
 * read past).
 *
 * Never throws for wire answers: outcomes come back as
 * {@link ArtifactResolution} arms so a pane can branch. A fetch that cannot
 * reach the host at all resolves to `failed` with the network error named.
 */
export function httpArtifactResolver(options: HttpArtifactResolverOptions): ArtifactResolver {
  if (typeof options?.url !== 'string' || options.url.trim().length === 0) {
    throw new Error(
      "httpArtifactResolver needs `url` — the served agent's invoke path, the same one " +
        "conversation turns POST to (e.g. '/invoke' or 'https://host/invoke').",
    );
  }
  const doFetch = options.fetch ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new Error(
      'httpArtifactResolver found no fetch: this runtime has no global fetch and none was ' +
        'passed. Pass one via { fetch } (Node < 18 needs a polyfill).',
    );
  }

  const redeem = async (op: string, ref: string): Promise<ArtifactResolution> => {
    let response: Response;
    try {
      response = await doFetch(options.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...options.headers },
        body: JSON.stringify({
          op,
          ref,
          ...(options.sessionId !== undefined && { sessionId: options.sessionId }),
          ...(options.userId !== undefined && { userId: options.userId }),
        }),
      });
    } catch (err) {
      return {
        status: 'failed',
        message: `Could not reach ${options.url} to redeem '${ref}' (${
          err instanceof Error ? err.name || 'network error' : 'network error'
        }).`,
      };
    }
    let body: Record<string, unknown>;
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      return {
        status: 'failed',
        message: `${options.url} answered ${response.status} with a body that is not JSON — not an artifact wire reply.`,
      };
    }
    const artifact = body?.artifact;
    if (artifact !== null && typeof artifact === 'object') {
      const parcel = artifact as Record<string, unknown>;
      const meta = parcel.meta;
      if (meta === null || typeof meta !== 'object' || typeof (meta as ArtifactMetaView).kind !== 'string') {
        return {
          status: 'failed',
          message: `${options.url} answered with an artifact body carrying no readable meta — not the published wire shape.`,
        };
      }
      return {
        status: 'live',
        meta: meta as ArtifactMetaView,
        ...(op === ARTIFACT_GET_OP && 'data' in parcel && { data: parcel.data }),
      };
    }
    const code = typeof body?.code === 'string' ? body.code : undefined;
    if (code === NOT_FOUND_CODE) return { status: 'absent' };
    // The door refused or errored. Surface ITS sentence — refusals teach.
    const message =
      typeof body?.error === 'string'
        ? body.error
        : `${options.url} answered ${response.status} with no error message.`;
    return { status: 'failed', message, ...(code !== undefined && { code }) };
  };

  return {
    head: (ref) => redeem(ARTIFACT_HEAD_OP, ref),
    get: (ref) => redeem(ARTIFACT_GET_OP, ref),
  };
}

/**
 * The store half of `storeArtifactResolver` — duck-typed against
 * agentfootprint's five-verb `ArtifactStore` port (only the two read verbs
 * are used; a hand-rolled test double needs nothing else).
 */
export interface ArtifactStoreLike {
  head(scope: unknown, ref: string): Promise<ArtifactMetaView | null>;
  get(scope: unknown, ref: string): Promise<{ meta: ArtifactMetaView; data: unknown } | null>;
}

export interface StoreArtifactResolverOptions {
  /** The store itself — `inMemoryArtifacts()`, `sqliteArtifacts(...)`, or any
   *  object with the two read verbs. */
  readonly store: ArtifactStoreLike;
  /**
   * The isolation scope the run's tools minted under — the same
   * tenant/principal/conversation tuple memory scopes on. REQUIRED, not
   * defaulted: a defaulted scope would silently resolve nothing for scoped
   * refs (wrong scope IS "no data"), which is the accepted-and-silently-wrong
   * failure. State the scope; an anonymous run's is `{ conversationId: runId }`.
   */
  readonly scope: unknown;
}

/**
 * Redeem refs against a directly passed store — the same-process door for
 * demos, tests and apps that run the agent in the page's own process. The
 * store's `null` (missing-or-expired, deliberately ambiguous) becomes
 * `absent`; a store that THROWS (an integrity digest mismatch refusing to
 * deliver corrupt bytes) becomes `failed` with the store's own sentence.
 */
export function storeArtifactResolver(options: StoreArtifactResolverOptions): ArtifactResolver {
  const store = options?.store;
  if (
    store === null ||
    typeof store !== 'object' ||
    typeof store.head !== 'function' ||
    typeof store.get !== 'function'
  ) {
    throw new Error(
      'storeArtifactResolver needs `store` — an object with the artifact read verbs ' +
        '`head(scope, ref)` and `get(scope, ref)` (any agentfootprint artifact store qualifies).',
    );
  }
  if (!('scope' in (options as object))) {
    throw new Error(
      'storeArtifactResolver needs `scope` — the isolation tuple the refs were minted under. ' +
        'A wrong scope resolves to "no data" by design, so it must be stated, never guessed.',
    );
  }

  const failed = (ref: string, err: unknown): ArtifactResolution => ({
    status: 'failed',
    message:
      err instanceof Error && err.message
        ? err.message
        : `The store threw while redeeming '${ref}'.`,
  });

  return {
    async head(ref) {
      try {
        const meta = await store.head(options.scope, ref);
        return meta === null ? { status: 'absent' } : { status: 'live', meta };
      } catch (err) {
        return failed(ref, err);
      }
    },
    async get(ref) {
      try {
        const record = await store.get(options.scope, ref);
        return record === null
          ? { status: 'absent' }
          : { status: 'live', meta: record.meta, data: record.data };
      } catch (err) {
        return failed(ref, err);
      }
    },
  };
}
