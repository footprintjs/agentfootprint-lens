/**
 * The headless half of typed HITL: reading the component out of an awaiting
 * payload, building the structured decision, and rendering it as words.
 *
 * The governing law, stated once and honored everywhere here: **decisions
 * land as STRUCTURED facts on the record; natural language is a rendering of
 * the decision, never the record.** `decisionSentence` exists so a screen can
 * say "Approved by alice@ops" after the click — the sentence is display; the
 * `{ approved, by, at }` object that posted is the fact.
 */

import type {
  AskComponentView,
  ConsentDecisionView,
  DecisionRequestBody,
  PendingAskView,
} from './types.js';

/**
 * The ONE reader of "the component of this awaiting payload" — era-robust.
 *
 * agentfootprint 9.24 lifts the component onto `PendingAsk.component`, one
 * place for every pause kind. This reader checks that place first, then walks
 * the three homes inside `pauseData` (top-level `component` for a plain
 * `askHuman`, `checkIn.component` for a consent gate, `ask.component` for a
 * middleware ask) — the same walk agentfootprint's own `readAskComponent`
 * does — so a hand-rolled host that forwards `pauseData` without the lift
 * still shows its person the typed question.
 *
 * Duck-shaped on purpose: a value that is not a plausible component is
 * reported absent, never guessed at — the pane then renders the prose
 * `question` exactly as every pre-9.24 screen did.
 */
export function readAwaitingComponent(awaiting: unknown): AskComponentView | undefined {
  if (typeof awaiting !== 'object' || awaiting === null) return undefined;
  const pending = awaiting as PendingAskView;
  const direct = asComponent(pending.component);
  if (direct) return direct;
  const bag = pending.pauseData;
  if (typeof bag !== 'object' || bag === null) return undefined;
  const homes = bag as {
    component?: unknown;
    checkIn?: { component?: unknown };
    ask?: { component?: unknown };
  };
  return (
    asComponent(homes.component) ??
    asComponent(
      typeof homes.checkIn === 'object' && homes.checkIn !== null
        ? homes.checkIn.component
        : undefined,
    ) ??
    asComponent(
      typeof homes.ask === 'object' && homes.ask !== null ? homes.ask.component : undefined,
    )
  );
}

/** A plausible AskComponent, or nothing — never a guess. */
function asComponent(value: unknown): AskComponentView | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const c = value as { componentId?: unknown };
  if (typeof c.componentId !== 'string' || c.componentId.length === 0) return undefined;
  return value as AskComponentView;
}

/**
 * Is this awaiting payload a CONSENT gate — a tool `checkIn` or a middleware
 * `ask`? Those are answered with the approve/decline vocabulary
 * ({@link approveDecision} / {@link declineDecision}); a plain `askHuman`
 * pause is answered with whatever value the tool's author documented.
 * agentfootprint's wire REFUSES a consent gate answered with a bare value, so
 * a screen that gets this wrong is told loudly — this predicate is how a
 * screen gets it right the first time.
 */
export function isConsentAsk(awaiting: unknown): boolean {
  if (typeof awaiting !== 'object' || awaiting === null) return false;
  const pending = awaiting as PendingAskView;
  return (
    (typeof pending.checkIn === 'object' && pending.checkIn !== null) ||
    (typeof pending.ask === 'object' && pending.ask !== null)
  );
}

/** Options for {@link approveDecision} / {@link declineDecision}. */
export interface ConsentDecisionInput {
  /** Who decided — an operator id, an email. REQUIRED: an audit row with no
   *  actor is the accepted-and-silently-wrong record these gates exist to
   *  prevent. */
  readonly by: string;
  /** Optional free-text note. On decline it is surfaced to the model. */
  readonly note?: string;
}

/**
 * Approve a pending consent gate — the paused tool executes on resume.
 * Byte-compatible with agentfootprint's `checkInApproved()` (mirrored by
 * value; the lens never imports agentfootprint — peer-era law).
 */
export function approveDecision(input: ConsentDecisionInput): ConsentDecisionView {
  return buildConsent(true, input, 'approveDecision');
}

/** Decline a pending consent gate — the tool is NOT executed; the model
 *  receives the decline (and the note) and adapts in-loop. */
export function declineDecision(input: ConsentDecisionInput): ConsentDecisionView {
  return buildConsent(false, input, 'declineDecision');
}

function buildConsent(
  approved: boolean,
  input: ConsentDecisionInput,
  door: string,
): ConsentDecisionView {
  if (typeof input?.by !== 'string' || input.by.trim().length === 0) {
    throw new Error(
      `${door} needs \`by\` — who is deciding (an operator id, an email). The decision is ` +
        `an audit record, and a record with no actor names nobody; it cannot be defaulted.`,
    );
  }
  return {
    approved,
    by: input.by,
    at: Date.now(),
    ...(input.note !== undefined && input.note.length > 0 && { note: input.note }),
  };
}

/** Options for {@link decisionRequestBody}. */
export interface DecisionRequestInput {
  /** The structured decision — the record. For consent gates, the object
   *  {@link approveDecision} / {@link declineDecision} built; for a plain
   *  `askHuman`, whatever value the tool's author documented. */
  readonly decision: unknown;
  /** The session holding the paused run — `awaiting.sessionId`. */
  readonly sessionId?: string;
  /** A new message to ride along; almost always omitted (`''`). */
  readonly input?: string;
}

/**
 * The request body that posts a decision back — agentfootprint's JSON wire
 * shape `{ input, sessionId?, decision }`, where the PRESENCE of `decision`
 * is what makes the request a resume instead of a new message.
 *
 * The lens does not own the POST — the host app does (its URL, its auth, its
 * fetch). This helper only guarantees the body says what the person decided:
 * `JSON.stringify(decisionRequestBody({ decision, sessionId }))` is the whole
 * payload.
 *
 * An `undefined` decision is refused rather than serialized away: JSON drops
 * the key, the wire would read the request as a NEW MESSAGE, and the pause
 * would sit unanswered while the screen believed it had answered — the exact
 * silently-wrong outcome this helper exists to make impossible. (`null` is a
 * fine decision; absence is not.)
 */
export function decisionRequestBody(args: DecisionRequestInput): DecisionRequestBody {
  if (args === null || typeof args !== 'object' || !('decision' in args)) {
    throw new Error(
      'decisionRequestBody needs `decision` — the structured answer to the pending ask. ' +
        'Its presence is what distinguishes a resume from a new message on the wire.',
    );
  }
  if (args.decision === undefined) {
    throw new Error(
      'decisionRequestBody refused `decision: undefined` — JSON drops the key, the wire ' +
        'would read a NEW MESSAGE, and the pause would sit unanswered while the screen ' +
        'believed it answered. Post the actual decision (`null` is allowed; absence is not).',
    );
  }
  return {
    input: args.input ?? '',
    decision: args.decision,
    ...(args.sessionId !== undefined && { sessionId: args.sessionId }),
  };
}

/** How many characters of a structured decision's JSON the sentence quotes
 *  before eliding — the sentence is display, not the record. */
const SENTENCE_JSON_CAP = 120;

/**
 * "Interact-to-NL": render a decision as one plain sentence — **display
 * only**. The record is the structured decision that posted; this sentence is
 * a rendering of it, never a substitute for it, and nothing ever parses it
 * back.
 *
 *   approve/decline → `Approved by alice@ops — "verified with customer".`
 *   a string        → `Answered: "option-42".`
 *   anything else   → `Answered with a structured decision: {...}.`
 */
export function decisionSentence(decision: unknown): string {
  if (isConsentDecision(decision)) {
    const verb = decision.approved ? 'Approved' : 'Declined';
    const note = decision.note !== undefined ? ` — "${decision.note}"` : '';
    return `${verb} by ${decision.by}${note}.`;
  }
  if (typeof decision === 'string') return `Answered: "${decision}".`;
  if (decision === null || typeof decision !== 'object')
    return `Answered: ${String(decision)}.`;
  let json: string;
  try {
    json = JSON.stringify(decision) ?? String(decision);
  } catch {
    json = '[unserializable]';
  }
  if (json.length > SENTENCE_JSON_CAP) json = `${json.slice(0, SENTENCE_JSON_CAP)}…`;
  return `Answered with a structured decision: ${json}.`;
}

/** Is this decision the consent vocabulary? Mirrors `isCheckInDecision`. */
export function isConsentDecision(value: unknown): value is ConsentDecisionView {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ConsentDecisionView).approved === 'boolean' &&
    typeof (value as ConsentDecisionView).by === 'string'
  );
}
