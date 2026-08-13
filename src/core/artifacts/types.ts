/**
 * Artifacts (render-by-ref) — the shapes the lens speaks when it redeems a
 * claim ticket.
 *
 * agentfootprint 9.21–9.23 taught tools to check large results into an
 * ARTIFACT STORE and hand the model a ~30-token ticket (`art_…`); the model
 * finishes with `present({ ref, as, label? })`, and the tool result carries a
 * DESCRIPTION SNAPSHOT of the parcel. The lens is the screen's half of that
 * handshake: it redeems the ref (head for the render decision, get for the
 * payload) and renders a REGISTERED component for the artifact's kind — never
 * markup the model wrote.
 *
 * These types are STRUCTURAL MIRRORS of the agentfootprint shapes, not
 * imports: the lens supports agentfootprint ^7 || ^8 || ^9 as a peer, and a
 * named import of a symbol an older agentfootprint does not export is a
 * module-link error that would take the whole bundle down (the
 * `BugReportButton` / `humanizeRouting` precedent). The wire the resolvers
 * speak is a published JSON grammar, so mirroring is exact, not guesswork.
 */

/** The claim ticket's description — what `artifact-head` returns and what a
 *  consumer decides from. Never the bytes. Mirrors `ArtifactMeta`. */
export interface ArtifactMetaView {
  /** The ticket itself — an opaque minted string (`art_…`). */
  readonly ref: string;
  /** Consumer vocabulary, declared by the producer: `'dataset/rows'`,
   *  `'chart/spec'`, `'report/csv'`. The registry key. */
  readonly kind: string;
  /** MIME type of the payload: `'application/json'`, `'text/csv'`, … */
  readonly mediaType: string;
  /** Payload size in bytes. */
  readonly bytes: number;
  /** The human name: `"Q3 sales by region"`. */
  readonly label?: string;
  /** `sha-256:<hex>` integrity digest, when the mint asked for one. */
  readonly digest?: string;
  /** Unix ms when the ref stops resolving — stated, never sprung. */
  readonly expiresAt?: number;
  /** The join to the trace: which run / tool call minted it. */
  readonly origin?: { readonly runId?: string; readonly toolCallId?: string };
  /** Derivation facts — the refs this artifact was computed from. */
  readonly parentRefs?: readonly string[];
  /** Unix ms when the artifact was stored. */
  readonly createdAt?: number;
}

/** The description snapshot a `present` tool result carries at speak time —
 *  meta only, so an expired artifact still renders an honest placeholder
 *  from history alone. Mirrors `PresentSnapshot`. */
export interface PresentSnapshotView {
  readonly kind: string;
  readonly mediaType: string;
  readonly bytes: number;
  readonly label?: string;
}

/** One `present` call, as the lens reads it out of a recording or a
 *  conversation transcript. Mirrors `PresentedResult` (the tool result) and
 *  the `agentfootprint.artifacts.presented` event payload. */
export interface PresentedCallView {
  /** The ticket the model handed to the screen. */
  readonly ref: string;
  /** The model's consumer vocabulary for HOW to render (`'bar-chart'`,
   *  `'table'`) — display data. The registry keys on the artifact's KIND. */
  readonly as: string;
  /** The parcel's description at speak time — the placeholder's whole diet. */
  readonly snapshot: PresentSnapshotView;
  /** The presenting tool call — the join to the trace, when known. */
  readonly toolCallId?: string;
  readonly iteration?: number;
}

/**
 * What redeeming a ref resolved to. Exactly one arm — a component branches,
 * it never throws.
 *
 *  - `live`    the ref resolves; `meta` always, `data` iff the verb was `get`.
 *  - `absent`  the store's ONE indistinguishable "no data" — missing, expired,
 *              and another-session's ref all wear this shape by design, so a
 *              leaked ref probes nothing. The pane renders its stated absence
 *              FROM THE SNAPSHOT ALONE; this arm deliberately carries nothing.
 *  - `failed`  the resolution DOOR did not answer the question — network,
 *              no store attached, a wire that cannot carry artifacts. The
 *              message is the server's own sentence, verbatim: agentfootprint
 *              refusals teach, and a paraphrase teaches worse.
 */
export type ArtifactResolution =
  | { readonly status: 'live'; readonly meta: ArtifactMetaView; readonly data?: unknown }
  | { readonly status: 'absent' }
  | { readonly status: 'failed'; readonly message: string; readonly code?: string };

/**
 * How the lens redeems refs — the ONE abstraction every render-by-ref surface
 * takes. Two implementations ship: {@link import('./resolvers.js').httpArtifactResolver}
 * (over a served agent's wire ops, session identity on every request) and
 * {@link import('./resolvers.js').storeArtifactResolver} (over a directly
 * passed store, for same-process demos and tests).
 */
export interface ArtifactResolver {
  /** The ticket's metadata — the render decision. Never pays for bytes. */
  head(ref: string): Promise<ArtifactResolution>;
  /** Metadata + payload — render it. */
  get(ref: string): Promise<ArtifactResolution>;
}
