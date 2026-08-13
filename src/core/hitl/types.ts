/**
 * Typed HITL (human-in-the-loop) — the shapes the lens speaks when a paused
 * run asks a person something through a REGISTERED screen component.
 *
 * agentfootprint 9.24 taught every ask door (`askHuman`, the `ask` middleware,
 * `defineTool({ checkInComponent })`) to carry an optional typed half beside
 * the prose question: `{ componentId, props?, propsRef? }`. The id names a
 * component the FRONTEND registered — ids and props only, never markup or
 * code the model wrote (the no-eval law). Small props ride the ask inline;
 * the big half (a 200-option picker's options) rides the ARTIFACT STORE as a
 * `propsRef` claim ticket the screen redeems through the existing artifact
 * wire, under the same session identity every other redemption presents.
 *
 * These types are STRUCTURAL MIRRORS of the agentfootprint shapes, not
 * imports: the lens supports agentfootprint ^7 || ^8 || ^9 as a peer, and a
 * named import of a symbol an older agentfootprint does not export is a
 * module-link error that would take the whole bundle down (the artifacts
 * precedent, `src/core/artifacts/types.ts`). The wire is a published JSON
 * grammar, so mirroring is exact, not guesswork.
 */

/**
 * The typed half of a human ask — WHICH registered screen component collects
 * the answer, and what it renders with. Mirrors `AskComponent` (9.24.0).
 *
 * The component changes how the question is ASKED, never what the answer IS:
 * the decision returns through the same structured field it always did.
 */
export interface AskComponentView {
  /** The id the consuming frontend registered the component under —
   *  consumer vocabulary, never markup (the no-eval law). */
  readonly componentId: string;
  /** Small inline props (plain JSON). They rode the ask — and therefore the
   *  checkpoint — so producers keep them small. */
  readonly props?: Readonly<Record<string, unknown>>;
  /** Claim ticket (`art_…`) for the big half — redeemed through the artifact
   *  wire (`head`/`get`) under the session's own scope. Validated to resolve
   *  when the ask was raised; it can still expire before the screen redeems. */
  readonly propsRef?: string;
}

/**
 * The question a paused run is waiting on, as the hosting wire serves it —
 * the `awaiting` body of an HTTP 202 / SSE `awaiting` event, and the
 * `pending` half of a stored session envelope. Mirrors `PendingAsk`.
 *
 * Every field is optional here because the lens reads payloads from several
 * agentfootprint eras: a pre-9.24 pause simply has no `component`, and the
 * pane falls back to the prose `question` exactly as those eras did.
 */
export interface PendingAskView {
  /** The session holding the paused run — where the decision posts back. */
  readonly sessionId?: string;
  /** The tool that asked, when the run recorded which one. */
  readonly tool?: string;
  /** The question in plain words — always render this when the componentId
   *  is unknown. */
  readonly question?: string;
  /** Present ONLY when a tool declared `checkIn` — a consent gate. Answered
   *  with the approve/decline decision vocabulary. */
  readonly checkIn?: { readonly tool?: string; readonly component?: unknown; readonly [k: string]: unknown };
  /** Present ONLY when a `toolMiddleware` asked — answered with the same
   *  consent vocabulary a check-in uses. */
  readonly ask?: { readonly question?: string; readonly middleware?: string; readonly component?: unknown; readonly [k: string]: unknown };
  /** The typed half, lifted by the host so a screen has ONE place to look
   *  (9.24.0). Older hosts don't carry it — see `readAwaitingComponent`,
   *  which also walks `pauseData`'s three homes. */
  readonly component?: AskComponentView;
  /** Exactly what the tool passed to `askHuman()` / `pauseHere()`,
   *  uninterpreted. */
  readonly pauseData?: unknown;
}

/**
 * A person's answer to a consent gate (a `checkIn` or a middleware `ask`) —
 * the record that lands. Mirrors `CheckInDecision`; produced here by
 * {@link import('./decision.js').approveDecision} /
 * {@link import('./decision.js').declineDecision}. JSON/clone-safe.
 */
export interface ConsentDecisionView {
  /** True to run the tool, false to decline it. */
  readonly approved: boolean;
  /** Who decided — an operator id, an email, a queue name. */
  readonly by: string;
  /** Optional note. On decline it is surfaced to the model so it adapts. */
  readonly note?: string;
  /** When the decision was made (ms since epoch). */
  readonly at: number;
}

/**
 * The request body that answers a pending ask over agentfootprint's JSON
 * wire — `POST <invoke url> { input, sessionId?, decision }`. The PRESENCE
 * of `decision` is what makes it a resume rather than a new message; that is
 * the whole discriminant, and it is a field rather than an inference on
 * purpose. Built by {@link import('./decision.js').decisionRequestBody}.
 */
export interface DecisionRequestBody {
  /** Always present (the wire's `input` is required); `''` for a resume that
   *  carries no new message. */
  readonly input: string;
  /** The structured decision — the record. */
  readonly decision: unknown;
  /** The session holding the paused run. */
  readonly sessionId?: string;
}
