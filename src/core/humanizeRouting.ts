/**
 * humanizeRouting — natural-language lines for the skill-graph ROUTING
 * events (agentfootprint 9.16.0 / 9.17.0):
 *
 *   • `agentfootprint.skill.turn_routed`   — the turn-start routing verdict
 *   • `agentfootprint.skill.route_conflict`— edge-vs-edge inside one tool batch
 *   • `agentfootprint.skill.rejected`      — now with a `posture` refusal reason
 *   • `context.evaluated`'s `cursorMove`   — the model-pick decorations
 *                                            (`offered` / `declinedOffer`)
 *
 * Pattern: pure sentence builders, composed by `defaultHumanizer`.
 * Role:    plain-language commentary for a NON-developer reader.
 *
 * Era note (the budget_pressure precedent, applied at the TYPE level):
 * `turn_routed` / `route_conflict` postdate the agentfootprint version this
 * package compiles against, so its `AgentfootprintEvent` union does not name
 * them yet. They are matched by raw type STRING and their payloads are read
 * through the local structural interfaces below — mirrors of the shipped
 * shapes (agentfootprint src/events/payloads.ts), every field optional-safe.
 * A recording from an older era simply carries fewer fields, and the
 * house law applies: render ONLY what the event carries — an absent field
 * means its clause is OMITTED, never guessed.
 *
 * Vocabulary note — TWO vocabularies, and they are not the same list:
 *
 *   • `turn_routed.by` (which TIER decided where the turn started) ships as
 *     `'entry' | 'intent' | 'continuity' | 'menu' | 'decider' | 'none'`.
 *     `'entry'` is the recorded vocabulary for rule-won starts, `'menu'` for an
 *     in-band menu, `'decider'` for a tier-3 resolver (agentfootprint 9.19.0).
 *     Design-era aliases (`'rule'`, `'model-pick'`) are tolerated as synonyms
 *     so a recording from an intermediate build still renders.
 *   • `cursorMove.by` (what moved the CURSOR this iteration) ships as
 *     `'entry' | 'route' | 'model-pick' | 'tool-proposal' | 'intent' |
 *     'continuity' | 'decider' | 'stay' | 'none'` — nine causes, the union
 *     `CursorMoveCause` in agentfootprint's `skillGraph.ts`. The library's own
 *     `ContextEvaluatedPayload` docstring lists only seven (it predates
 *     `'tool-proposal'` and `'decider'`); the union is the source of truth.
 *     `'menu'` is NOT one of them — an offer is not a move.
 *
 * Anything outside either list falls back to an honest raw line.
 */

// ─── Structural payload mirrors (events read, never constructed here) ───

/** Mirror of `SkillTurnRoutedPayload` (agentfootprint 9.17.0). */
export interface TurnRoutedLike {
  readonly by: string;
  readonly from?: string;
  readonly to?: string;
  readonly scorer?: string;
  readonly window?: number;
  readonly scores?: ReadonlyArray<{
    readonly id: string;
    readonly score: number;
    readonly relevance: number;
  }>;
  readonly runnerUp?: { readonly id: string; readonly gap: number };
  readonly decisive?: boolean;
  readonly offered?: readonly string[];
  readonly stayOffered?: boolean;
  readonly droppedResume?: { readonly id: string; readonly reason: string };
  readonly policy?: {
    readonly nearTieMargin?: number;
    readonly menuSize?: number;
    readonly floor?: number;
  };
}

/** Mirror of `SkillRouteConflictPayload` (agentfootprint 9.16.0). */
export interface RouteConflictLike {
  readonly iteration?: number;
  readonly fromSkillId?: string;
  readonly winner?: {
    readonly toolCallId?: string;
    readonly toolName?: string;
    readonly target?: string;
  };
  readonly losers?: ReadonlyArray<{
    readonly toolCallId?: string;
    readonly toolName?: string;
    readonly target?: string;
  }>;
}

/** Mirror of `SkillRejectedPayload` + the 9.17.0 `posture` widening. */
export interface SkillRejectedLike {
  readonly requestedId: string;
  readonly currentSkillId?: string;
  /** The REACHABILITY set (hops + open skills) — NOT the offered menu. A
   *  guard refusal fires only AFTER reachability passed, so under
   *  posture='guard' this list always contains the refused `requestedId`
   *  itself; the menu the model was shown is not on the event at all. */
  readonly allowed?: readonly string[];
  readonly iteration?: number;
  readonly posture?: string; // 'guard' | 'rails' when a posture refused
}

/**
 * Mirror of `ContextEvaluatedPayload.cursorMove` — the 9.17.0 decorations
 * (`offered` / `declinedOffer`) and the 9.28.0 `witness` included.
 *
 * `by` is typed as the NINE shipped causes plus a `(string & {})` arm, so
 * editors autocomplete the real vocabulary while a future era's tenth value
 * still reads (and renders through the honest raw fallback).
 */
export interface CursorMoveLike {
  readonly from?: string;
  readonly to?: string;
  readonly by:
    | 'entry'
    | 'route'
    | 'model-pick'
    | 'tool-proposal'
    | 'intent'
    | 'continuity'
    | 'decider'
    | 'stay'
    | 'none'
    | (string & {});
  readonly offered?: readonly string[];
  readonly declinedOffer?: boolean;
  /** WHAT the message said that routed this hop — `match:` rules only. */
  readonly witness?: { readonly text: string; readonly keyword?: string };
}

// ─── Small shared formatters ─────────────────────────────────────────────

/** Raw scorer score → short human number ("0.87"). */
function fmtScore(n: number): string {
  return String(Number(n.toFixed(2)));
}

/** Softmax relevance share → whole percent ("44%"). */
function fmtShare(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function quoteList(ids: readonly string[]): string {
  return ids.join(', ');
}

/** "billing" → `"billing"`, undefined → undefined. */
function q(id: string | undefined): string | undefined {
  return id === undefined ? undefined : `"${id}"`;
}

/** The movement clause shared by several verdicts:
 *  from+to (different) → Moved from A to B; same / no from → started/stayed. */
function movement(p: { from?: string; to?: string }): string {
  const { from, to } = p;
  if (to !== undefined && from !== undefined) {
    return from === to ? `Stayed in ${q(to)}` : `Moved from ${q(from)} to ${q(to)}`;
  }
  if (to !== undefined) return `Turn started in ${q(to)}`;
  if (from !== undefined) return `Stayed in ${q(from)}`;
  return 'The turn was routed';
}

/** The droppedResume clause — appended to any verdict it decorates. */
function droppedResumeNote(p: TurnRoutedLike): string {
  const d = p.droppedResume;
  if (!d) return '';
  return ` The conversation's saved place (${q(d.id)}) no longer exists in this deployment.`;
}

// ─── agentfootprint.skill.turn_routed ────────────────────────────────────

export function humanizeTurnRouted(p: TurnRoutedLike): string {
  switch (p.by) {
    case 'entry':
    case 'rule': // design-era alias for 'entry'
      return `${movement(p)} — a rule matched (tier 1).${droppedResumeNote(p)}`;

    case 'intent': {
      // Tier-2 scorer decided. Winner score = scores[0] (ranked best-first);
      // the runner-up's own score comes from its scores[] row.
      const winner = p.scores?.[0];
      const ruRow =
        p.runnerUp && p.scores ? p.scores.find((s) => s.id === p.runnerUp!.id) : undefined;
      let clause = ' — intent';
      if (winner) {
        clause += ` scored ${fmtScore(winner.score)}`;
        if (ruRow) clause += ` vs ${fmtScore(ruRow.score)} for runner-up ${q(ruRow.id)}`;
        else if (p.runnerUp)
          clause += `, ${fmtScore(p.runnerUp.gap)} ahead of ${q(p.runnerUp.id)}`;
      } else {
        clause += ' matched';
      }
      const scorer = p.scorer ? ` (${p.scorer} scorer)` : '';
      return `${movement(p)}${clause}${scorer}.${droppedResumeNote(p)}`;
    }

    case 'continuity': {
      // Near-tie stays carry the losing numbers; sticky stays carry none.
      const nearTie = p.decisive === false && p.scores && p.scores.length >= 2;
      if (nearTie) {
        const [a, b] = p.scores!;
        const where = p.to ?? p.from;
        const tail = where !== undefined ? `; continuing in ${q(where)}` : '';
        return (
          `Stayed — near-tie between ${q(a.id)} (${fmtShare(a.relevance)}) and ` +
          `${q(b.id)} (${fmtShare(b.relevance)})${tail}.${droppedResumeNote(p)}`
        );
      }
      const where = p.to ?? p.from;
      const head = where !== undefined ? `Stayed in ${q(where)}` : 'Stayed';
      return `${head} — treated as a continuation of the conversation.${droppedResumeNote(p)}`;
    }

    case 'menu':
    case 'model-pick': {
      // A menu went in-band; the turn's start awaits the model's pick
      // (the pick itself lands as a cursorMove `model-pick`).
      let line = 'No single skill won — the model was offered a menu';
      if (p.offered && p.offered.length > 0)
        line += ` of ${p.offered.length}: ${quoteList(p.offered)}`;
      if (p.stayOffered) line += `; 'stay' was on the menu`;
      return `${line}.${droppedResumeNote(p)}`;
    }

    case 'none': {
      // Nothing the loop may act on: a dropped resume, or a rails-mode
      // menu whose offer is recorded but not actionable by the model.
      if (p.droppedResume) {
        let line =
          `The conversation's saved place (${q(p.droppedResume.id)}) no longer exists ` +
          `in this deployment — the turn started fresh.`;
        if (p.offered && p.offered.length > 0)
          line += ` Options on the record: ${quoteList(p.offered)}.`;
        return line;
      }
      if (p.offered && p.offered.length > 0) {
        // WHY the cascade ended in a menu is said only when the event carries
        // the evidence (house law): `decisive: false` with a floor-clearing
        // top score is a near-tie — intent DID match, more than once, and
        // `offered` is the tied set; a top score at/below the recorded floor
        // is honestly unmatched — `offered` is the full menu, so "close
        // candidates" would be a lie there. No numbers → posture-only prose.
        const top = p.scores?.[0]?.score;
        const floor = p.policy?.floor;
        const cleared =
          top !== undefined && Number.isFinite(top) && (floor === undefined || top > floor);
        if (p.decisive === false && (p.scores?.length ?? 0) >= 2 && cleared) {
          return (
            `This message matched ${quoteList(p.offered)} too closely to call, and rails ` +
            `mode does not let the model break the tie — the turn ran on the base prompt.`
          );
        }
        if (top !== undefined && !cleared) {
          return (
            `No rule or intent matched this message strongly enough, and rails mode does ` +
            `not let the model route — the turn ran on the base prompt. The full menu ` +
            `stayed on the record: ${quoteList(p.offered)}.`
          );
        }
        return (
          `Routing ended in a menu, but rails mode does not let the model route — ` +
          `the turn ran on the base prompt. On the record: ${quoteList(p.offered)}.`
        );
      }
      return 'Routing decided nothing this turn — the turn ran on the base prompt.';
    }

    default:
      // Unknown verdict vocabulary (a future era): render honestly, raw.
      return `Turn routing: ${p.by}${p.to !== undefined ? ` → ${q(p.to)}` : ''}.`;
  }
}

// ─── agentfootprint.skill.route_conflict ─────────────────────────────────

const COUNT_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five'] as const;

export function humanizeRouteConflict(p: RouteConflictLike): string {
  const winner = p.winner;
  const losers = p.losers ?? [];
  const winnerClause = winner
    ? `${winner.toolName ?? 'a tool'} → ${q(winner.target) ?? 'its target'} won (first in the batch)`
    : 'the first match in the batch won';

  if (losers.length === 0) {
    return `Tool results conflicted on the next skill — ${winnerClause}.`;
  }

  const count = losers.length + 1;
  const countWord = count < COUNT_WORDS.length ? COUNT_WORDS[count] : String(count);
  const loserClause = losers
    .map((l) => `${l.toolName ?? 'a tool'} → ${q(l.target) ?? 'another skill'}`)
    .join(', ');
  const verb = losers.length === 1 ? 'was' : 'were';
  return (
    `${countWord} tool results wanted different next skills — ${winnerClause}; ` +
    `${loserClause} ${verb} suppressed and ${losers.length === 1 ? 'is' : 'are'} on the record.`
  );
}

// ─── agentfootprint.skill.rejected (with 9.17.0 posture) ─────────────────

export function humanizeSkillRejected(p: SkillRejectedLike): string {
  const pick = `The model tried to switch to ${q(p.requestedId)}`;
  if (p.posture === 'guard') {
    // `allowed` is the reachability set, which ALWAYS contains the refused
    // pick under guard — presenting it as "the menu" would put the refused
    // pick on the very menu it was refused for. The actual offered menu is
    // not on the event, so the sentence labels the set as what it is.
    let line = `${pick}, but that pick was off the menu it was given — refused (guard).`;
    if (p.allowed && p.allowed.length > 0) line += ` Reachable: ${quoteList(p.allowed)}.`;
    return line;
  }
  if (p.posture === 'rails') {
    return `${pick}, but rails mode does not let the model route — refused.`;
  }
  // Today's reachability refusal, unchanged semantics.
  const at = p.currentSkillId !== undefined ? q(p.currentSkillId) : 'the start';
  let line = `${pick}, but it is not reachable from ${at} — refused.`;
  if (p.allowed && p.allowed.length > 0) line += ` Reachable: ${quoteList(p.allowed)}.`;
  return line;
}

// ─── context.evaluated cursorMove — the model-pick decorations ───────────

/**
 * Renders the model-pick line, or `null` to keep the event silent.
 *
 * `context.evaluated` fires every iteration and stays hidden from commentary
 * (low signal); the ONE exception is the iteration a model pick lands WITH
 * its 9.17.0 decorations (`offered` / `declinedOffer`) — the assist-posture
 * divergence the record exists to explain. Undecorated model picks (older
 * recordings) stay silent, exactly as they rendered before.
 */
export function humanizeCursorMovePick(move: CursorMoveLike | undefined): string | null {
  if (!move || move.by !== 'model-pick') return null;
  if (move.offered === undefined && move.declinedOffer === undefined) return null;

  let line =
    move.to !== undefined ? `The model chose ${q(move.to)}` : 'The model made a pick';
  // A declined offer means the pick was NOT on this menu — and the emitter
  // always stamps `offered` alongside `declinedOffer` (they are one resolved
  // menu object), so the menu clause must stay silent here or the sentence
  // claims the pick came "from" a menu it then says the pick was not on.
  if (move.offered !== undefined && move.declinedOffer !== true) {
    line += ` from a ${move.offered.length}-item menu`;
    const rest = move.to !== undefined ? move.offered.filter((id) => id !== move.to) : move.offered;
    if (rest.length > 0) line += ` (${quoteList(rest)} were offered too)`;
  }
  if (move.from !== undefined && move.from !== move.to) {
    line += `, moving from ${q(move.from)}`;
  }
  line += '.';
  if (move.declinedOffer === true) {
    line += ' Its pick was not on the offered menu — the divergence is on the record.';
  }
  return line;
}

// ─── context.evaluated cursorMove — all NINE causes ──────────────────────

/**
 * Where the cursor ended up, in plain words. `Moved from A to B` when it
 * changed, `Started in B` on a cold start, `Stayed in A` when it did not.
 */
function cursorMovement(move: CursorMoveLike): string {
  const { from, to } = move;
  if (to !== undefined && from !== undefined) {
    return from === to ? `Stayed in ${q(to)}` : `Moved from ${q(from)} to ${q(to)}`;
  }
  if (to !== undefined) return `Started in ${q(to)}`;
  if (from !== undefined) return `Stayed in ${q(from)}`;
  return 'The skill in play was settled';
}

/**
 * The evidence clause for a rule that matched on the message TEXT — the
 * `witness` agentfootprint 9.28.0 added. Quoted, never paraphrased: the whole
 * value of a witness is that it is the user's own words.
 */
function witnessNote(move: CursorMoveLike): string {
  const w = move.witness;
  if (!w || typeof w.text !== 'string' || w.text === '') return '';
  return w.keyword !== undefined
    ? ` The message said "${w.text}" — the word ${q(w.keyword)} is what matched.`
    : ` The message said "${w.text}".`;
}

/**
 * Renders the cursor hop for ANY of the nine causes, or `null` to stay silent.
 *
 * Coverage note (why this exists): `humanizeCursorMovePick` renders exactly one
 * cause, `'model-pick'`, and only when the 9.17.0 menu decorations are on it —
 * so on a skill-graph run the other eight causes rendered NOTHING at all, and
 * a reader watching a routed conversation saw no routing. This is that gap
 * closed. `'model-pick'` is deliberately delegated to the existing function
 * rather than rewritten: its sentence (and its silence on an undecorated
 * pick, which is what an older recording carries) is unchanged, byte for byte.
 *
 * The audience is a non-developer, so the vocabulary is deliberately plain:
 * "a rule the author wrote", "a separate chooser", "nothing moved".
 */
export function humanizeCursorMove(move: CursorMoveLike | undefined): string | null {
  if (!move || typeof move.by !== 'string') return null;

  switch (move.by) {
    case 'model-pick':
      // Unchanged — see the note above.
      return humanizeCursorMovePick(move);

    case 'entry':
      return `${cursorMovement(move)} — a rule the author wrote matched this message.${witnessNote(move)}`;

    case 'route':
      return `${cursorMovement(move)} — the author drew this path, and the run took it automatically.`;

    case 'tool-proposal':
      return `${cursorMovement(move)} — a tool asked for this move, and it was allowed.`;

    case 'intent': {
      const fit = move.to !== undefined ? ` ${q(move.to)} fit best` : ' one skill fit best';
      return `${cursorMovement(move)} — this message was compared against the skills, and${fit}.`;
    }

    case 'continuity':
      return `${cursorMovement(move)} — the conversation was already there, so it carried on.`;

    case 'decider':
      return `${cursorMovement(move)} — a separate chooser was asked to settle it, and this is what it picked.`;

    case 'stay': {
      // The sticky-stay clause: the resolver found nothing that could move the
      // cursor. This is the sentence a refused `read_skill` pick ends up
      // explaining, so it says plainly that nothing happened.
      const where = move.to ?? move.from;
      return where !== undefined
        ? `Nothing moved — it stayed in ${q(where)}.`
        : 'Nothing moved — the skill in play stayed as it was.';
    }

    case 'none':
      return 'No skill was in play — nothing routed this turn.';

    default:
      // A future era's cause: say what the record says, invent nothing.
      return `The skill in play was settled by "${move.by}"${
        move.to !== undefined ? ` → ${q(move.to)}` : ''
      }.`;
  }
}
