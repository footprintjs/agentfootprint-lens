/**
 * `selectSkillRoute` — fold a recording's event log into the ROUTING RECORD:
 * where the skill-graph cursor stood on every iteration, what moved it, what
 * the model was refused, and what it was looking at when it asked.
 *
 * Pattern: pure function over the lens event log (`recorder.selectEventLog()`),
 *          same shape as `selectHops` — no framework, no caching, no state.
 * Role:    the STRUCTURED half of routing. Until now every routing fact in this
 *          package went through `defaultHumanizer` and came out a `string`;
 *          a panel that wants to draw the graph, group by skill, or answer
 *          "why was I refused" had to re-parse prose. This is the same facts,
 *          still typed.
 *
 * THE TWO VOCABULARIES (do not conflate them — they answer different questions):
 *
 *   • `SkillCursorCause` — `context.evaluated.cursorMove.by`. "What moved the
 *     cursor on THIS iteration." Nine values, `'stay'` and `'route'` among them.
 *   • `SkillTurnVerdict` — `skill.turn_routed.by`. "Which tier decided where the
 *     TURN started." Six values, `'menu'` among them — and `'menu'` is not a
 *     cursor cause at all (a menu is an offer; the cursor has not moved yet).
 *
 * They are kept on different TYPES at different levels (`SkillHop.by` vs
 * `SkillTurnStart.by`) rather than in one field with a merged union, because a
 * merged union is exactly the mistake a reader cannot see themselves making.
 *
 * THE ONE-ITERATION LAG (measured on a real run, not assumed):
 *
 *   iter 1  the model calls `read_skill('audit-log')` → the gate refuses;
 *           `skill.rejected { iteration: 1 }`
 *   iter 2  the Evaluate stage resolves the cursor and finds no pending pick →
 *           `context.evaluated { iteration: 2, cursorMove: { by: 'stay' } }`
 *
 * The refusal and its CONSEQUENCE are stamped with different iterations, so a
 * naive same-iteration join shows a refusal beside the cursor state that
 * preceded it. Each refusal therefore carries `cursorAfter` — the next
 * iteration's cursor row — which is what makes "the pick was refused AND the
 * cursor did not move" one fact instead of two rows a reader has to pair up.
 * `undefined` when the run ended on the refusing iteration: no next row exists,
 * and inventing one would be a claim about a resolution that never ran.
 *
 * ERA NOTE (the `humanizeRouting` precedent, same reasoning): several of these
 * events postdate the agentfootprint version this package compiles against
 * (`agent.evidence_checked` shipped in 9.35.0, after the 9.30.0 devDependency),
 * so they are matched by raw type STRING and read through structural mirrors.
 * A recording from an older era simply carries fewer fields, and the house law
 * holds throughout: report ONLY what the event carries — an absent field is
 * absent, never guessed.
 */

import type { EventLogEntry } from '../types.js';

// ─── The two vocabularies ────────────────────────────────────────────────

/**
 * How the skill-graph cursor moved on one iteration — agentfootprint's
 * `CursorMoveCause`, all nine of it (`skillGraph.ts`). The library's own
 * `ContextEvaluatedPayload` docstring lists only seven; it is stale (missing
 * `'tool-proposal'` and `'decider'`) and the union is the source of truth.
 *
 * The `(string & {})` arm keeps a future era's tenth value readable instead of
 * un-assignable, while editors still autocomplete the nine that exist.
 */
export type SkillCursorCause =
  | 'entry' // a start rule matched (cold start)
  | 'route' // an author-declared edge fired
  | 'model-pick' // the model's accepted `read_skill` pick moved it
  | 'tool-proposal' // an accepted `propose-transition` tool effect moved it
  | 'intent' // the turn-start scorer routed the turn
  | 'continuity' // the inherited conversation cursor held
  | 'decider' // a configured tier-3 decider resolved an outstanding menu
  | 'stay' // nothing fired; the cursor is sticky and stayed put
  | 'none' // no cursor at all
  | (string & {});

/**
 * Which TIER decided where a turn started — agentfootprint's
 * `SkillTurnRoutedPayload.by`. NOT the cursor vocabulary: `'menu'` lives only
 * here (an offer is not a move), and `'route'` / `'model-pick'` / `'stay'` live
 * only in {@link SkillCursorCause}.
 */
export type SkillTurnVerdict =
  | 'entry'
  | 'intent'
  | 'continuity'
  | 'menu'
  | 'decider'
  | 'none'
  | (string & {});

// ─── The folded shapes ───────────────────────────────────────────────────

/** What the message said that routed a hop (`match:` rules only). */
export interface SkillRouteWitness {
  readonly text: string;
  readonly keyword?: string;
}

/** A skill the run knew about — the catalog the model was offered. */
export interface SkillRouteNode {
  readonly id: string;
  /** The catalog description, verbatim — the same text the model read. */
  readonly description?: string;
  /** The cursor stood here on at least one iteration. */
  readonly visited: boolean;
}

/** One (turn, iteration) address — how a hop is referred to from elsewhere. */
export interface SkillHopRef {
  readonly turnIndex: number;
  readonly iteration: number;
}

/** A hop the cursor was OBSERVED to take, aggregated over the run. */
export interface SkillObservedEdge {
  /** The cursor before the hop. `undefined` = cold start (there was none). */
  readonly from?: string;
  readonly to: string;
  readonly by: SkillCursorCause;
  /** Every (turn, iteration) this hop was taken on, in order. */
  readonly takenAt: readonly SkillHopRef[];
  /** The author's caption, when `routing[]` named this edge. */
  readonly label?: string;
  /** The compiled trigger kind of the declared edge, when there was one. */
  readonly triggerKind?: string;
}

/** An edge the AUTHOR declared, as reported by `routing[]` provenance. */
export interface SkillDeclaredEdge {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly triggerKind?: string;
}

/** The cursor row that FOLLOWED a refusal — the proof it did or did not move. */
export interface SkillCursorAfter {
  readonly iteration: number;
  readonly from?: string;
  readonly to?: string;
  readonly by?: SkillCursorCause;
  /** `false` is the refusal's whole point: the pick changed nothing. */
  readonly moved: boolean;
}

/** A `read_skill` pick the gate refused. */
export interface SkillRefusal {
  readonly requestedId: string;
  readonly currentSkillId?: string;
  /** The REACHABILITY set named in the re-prompt (not the offered menu). */
  readonly allowed: readonly string[];
  /** `'guard'` / `'rails'` when a POSTURE refused, absent for reachability. */
  readonly posture?: string;
  readonly turnIndex: number;
  readonly iteration: number;
  /** The provider's tool-call id of the refused call, when it was paired. */
  readonly toolCallId?: string;
  /**
   * The refusal sentence the MODEL read — the refused `read_skill` call's own
   * tool result, paired by tool-call id. Absent when the recording carried no
   * `stream.tool_end` for it (a truncated log, or a refusal raised outside a
   * tool call).
   */
  readonly refusalText?: string;
  /** Where the cursor stood on the next iteration — see the lag note above. */
  readonly cursorAfter?: SkillCursorAfter;
}

/** Two tool results of one batch matched edges to different targets. */
export interface SkillRouteConflict {
  readonly fromSkillId?: string;
  readonly winner?: { readonly toolName?: string; readonly target?: string; readonly toolCallId?: string };
  readonly losers: readonly {
    readonly toolName?: string;
    readonly target?: string;
    readonly toolCallId?: string;
  }[];
  /** `'tool-proposal'` when proposals conflicted rather than declared edges. */
  readonly source?: string;
}

/** An accepted pick a declared edge outranked. */
export interface SkillSuperseded {
  readonly volunteeredId: string;
  readonly wonId?: string;
  readonly fromSkillId?: string;
  readonly source?: string;
}

/** One tool as it was SENT to the model on this iteration. */
export interface SkillToolAsSent {
  readonly name: string;
  /** Verbatim, as the model saw it. */
  readonly description?: string;
}

/** Something a SKILL put into the prompt on this iteration. */
export interface SkillInjectionSeen {
  readonly slot: string;
  /** The skill that injected it. */
  readonly skillId?: string;
  readonly summary: string;
  /** The full text, when the recording captured it (`rawContent`). */
  readonly text?: string;
}

/** The evidence gate's verdict on an iteration's answer (agentfootprint 9.35.0+). */
export interface SkillEvidenceCheck {
  readonly posture?: string;
  readonly candidates?: number;
  readonly unsupported: readonly { readonly value: string; readonly shape?: string }[];
  readonly action?: 'grounded' | 'flagged' | 'revision-asked' | 'refused' | (string & {});
  readonly afterRevision?: boolean;
  /** The evidence index hit its ceiling — the verdict judged a partial corpus. */
  readonly evidenceTruncated?: boolean;
}

/** The turn-start verdict — one per turn on a cascade graph. */
export interface SkillTurnStart {
  readonly turnIndex: number;
  readonly by: SkillTurnVerdict;
  readonly from?: string;
  readonly to?: string;
  readonly scorer?: string;
  readonly scores: readonly {
    readonly id: string;
    readonly score: number;
    readonly relevance: number;
  }[];
  readonly runnerUp?: { readonly id: string; readonly gap: number };
  readonly decisive?: boolean;
  readonly witness?: SkillRouteWitness;
  readonly offered?: readonly string[];
  readonly stayOffered?: boolean;
  readonly policy?: {
    readonly nearTieMargin?: number;
    readonly menuSize?: number;
    readonly floor?: number;
  };
  readonly window?: number;
  readonly droppedResume?: { readonly id: string; readonly reason?: string };
  readonly decider?: { readonly provider?: string; readonly model?: string; readonly picked?: string };
}

/**
 * One iteration of the run, from the routing point of view. There is a hop for
 * every iteration the log mentions — including iterations whose evaluation
 * carried no `cursorMove` (`by` is then `undefined`), because dropping those
 * would drop the refusals and tool menus stamped on them.
 */
export interface SkillHop {
  readonly turnIndex: number;
  readonly iteration: number;
  /** The evaluate stage this iteration's cursor resolved at, when known —
   *  the lens's ONE cursor, so a view can jump straight to it. */
  readonly runtimeStageId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly by?: SkillCursorCause;
  /** Did the cursor actually change? Computed once so no view re-derives it. */
  readonly moved: boolean;
  readonly witness?: SkillRouteWitness;
  /** The turn-start menu this pick resolved, when the move closed one. */
  readonly offered?: readonly string[];
  /** The accepted pick was reachable but NOT on the offered menu. */
  readonly declinedOffer?: boolean;
  readonly activeIds: readonly string[];
  /** Entries whose own rule matched but which the cursor law kept off the wire. */
  readonly supersededIds: readonly string[];
  readonly refusals: readonly SkillRefusal[];
  readonly conflicts: readonly SkillRouteConflict[];
  readonly superseded: readonly SkillSuperseded[];
  /** The tool catalog as sent on this iteration — what the model chose from. */
  readonly toolsAsSent: readonly SkillToolAsSent[];
  /** `read_skill`'s description, verbatim: the menu that told the model what
   *  was reachable. The highest-value field here — it is the model's own view
   *  of the graph, and it is free on `stream.llm_start`. */
  readonly readSkillDescription?: string;
  /** What the active skills put into the prompt on this iteration. */
  readonly skillInjections: readonly SkillInjectionSeen[];
  readonly evidence?: SkillEvidenceCheck;
}

/** The whole routing record for a run. */
export interface SkillRoute {
  /**
   * Did this run route at all? `true` when the log carried ANY routing fact —
   * a skill catalog, a cursor move, a turn verdict, a refusal, a conflict, a
   * superseded pick. `false` on an agent with no skills, so a view says "this
   * run had no skill graph" instead of drawing an empty one. Note that
   * `context.evaluated` fires on EVERY agent run (the injection engine
   * evaluates whether or not skills exist), so its mere presence proves
   * nothing and is deliberately not the signal.
   */
  readonly hasRouting: boolean;
  readonly nodes: readonly SkillRouteNode[];
  readonly hops: readonly SkillHop[];
  readonly observedEdges: readonly SkillObservedEdge[];
  readonly declaredEdges: readonly SkillDeclaredEdge[];
  readonly turns: readonly SkillTurnStart[];
}

export interface SelectSkillRouteArgs {
  /** The lens event log, in order (`recorder.selectEventLog()`). */
  readonly log: readonly EventLogEntry[];
}

// ─── Event types read here (raw strings — see the era note) ──────────────

const EVALUATED = 'agentfootprint.context.evaluated';
const INJECTED = 'agentfootprint.context.injected';
const LLM_START = 'agentfootprint.stream.llm_start';
const TOOL_START = 'agentfootprint.stream.tool_start';
const TOOL_END = 'agentfootprint.stream.tool_end';
const REJECTED = 'agentfootprint.skill.rejected';
const ROUTE_CONFLICT = 'agentfootprint.skill.route_conflict';
const REROUTE_SUPERSEDED = 'agentfootprint.skill.reroute_superseded';
const TURN_ROUTED = 'agentfootprint.skill.turn_routed';
const TURN_START = 'agentfootprint.agent.turn_start';
const ITERATION_START = 'agentfootprint.agent.iteration_start';
const EVIDENCE_CHECKED = 'agentfootprint.agent.evidence_checked';

/** The gate's own tool — the one whose description carries the menu. */
const READ_SKILL = 'read_skill';

// ─── Small readers (payloads are data, never trusted shapes) ─────────────

type Payload = Record<string, unknown>;

function payloadOf(entry: EventLogEntry): Payload {
  const p = (entry.event as { payload?: unknown }).payload;
  return p !== null && typeof p === 'object' ? (p as Payload) : {};
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function strList(v: unknown): readonly string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function obj(v: unknown): Payload | undefined {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Payload) : undefined;
}

/**
 * `{ key: value }` when the value is there, `{}` when it is not — the
 * "absent ⇒ omitted" law as one expression, so every optional field on every
 * folded shape obeys it the same way instead of each spread re-deriving it.
 */
function some<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return value === undefined ? {} : ({ [key]: value } as { [P in K]?: V });
}

function witnessOf(v: unknown): SkillRouteWitness | undefined {
  const w = obj(v);
  const text = str(w?.text);
  if (text === undefined) return undefined;
  const keyword = str(w?.keyword);
  return keyword === undefined ? { text } : { text, keyword };
}

// ─── The fold ────────────────────────────────────────────────────────────

/** A hop under construction — the readonly `SkillHop` is built from it at the end. */
interface HopDraft {
  turnIndex: number;
  iteration: number;
  runtimeStageId?: string;
  from?: string;
  to?: string;
  by?: SkillCursorCause;
  witness?: SkillRouteWitness;
  offered?: readonly string[];
  declinedOffer?: boolean;
  activeIds: readonly string[];
  supersededIds: readonly string[];
  refusals: SkillRefusal[];
  conflicts: SkillRouteConflict[];
  superseded: SkillSuperseded[];
  toolsAsSent: readonly SkillToolAsSent[];
  readSkillDescription?: string;
  skillInjections: SkillInjectionSeen[];
  evidence?: SkillEvidenceCheck;
}

/**
 * Did the cursor change on this iteration? A cold start (no `from`, a `to`) IS
 * a move — the cursor went from nowhere to somewhere; `by: 'stay'` never is,
 * and `by: 'none'` has no `to` to move to.
 */
function didMove(d: Pick<HopDraft, 'by' | 'from' | 'to'>): boolean {
  return d.by !== undefined && d.to !== undefined && d.to !== d.from;
}

/**
 * A refusal that has been recorded but whose SENTENCE has not arrived yet —
 * the gate fires `skill.rejected` between the refused call's `tool_start` and
 * its `tool_end`, so the text the model read is always one event behind.
 */
interface PendingRefusal {
  /** Where the refusal was filed, so the result can be written back to it. */
  draftKey: string;
  index: number;
  requestedId: string;
  /** Still waiting for the tool result that carries the refusal sentence. */
  awaitingResult: boolean;
}

/**
 * Fold the log into the routing record.
 *
 * Never throws: a payload that is not the shape this reads contributes nothing
 * rather than aborting the fold — a debugger that dies on one malformed event
 * is worse than one that shows the rest of the run.
 *
 * @example
 * ```ts
 * const route = selectSkillRoute({ log: recorder.selectEventLog() });
 * const refused = route.hops.flatMap((h) => h.refusals);
 * // "audit-log was refused on iteration 1, and the cursor stayed at triage"
 * refused[0].requestedId;            // 'audit-log'
 * refused[0].allowed;                // ['volume-lookup']
 * refused[0].cursorAfter?.by;        // 'stay'
 * refused[0].cursorAfter?.moved;     // false
 * ```
 */
export function selectSkillRoute(args: SelectSkillRouteArgs): SkillRoute {
  const { log } = args;

  const drafts = new Map<string, HopDraft>();
  const catalog = new Map<string, string | undefined>();
  const visited = new Set<string>();
  const declared = new Map<string, SkillDeclaredEdge>();
  const turns: SkillTurnStart[] = [];
  const pendingRefusals: PendingRefusal[] = [];
  /** Open tool calls, by the provider's call id — `tool_end` carries no name. */
  const openCalls = new Map<string, { name: string; requestedId?: string }>();

  let hasRouting = false;
  // The running address. Iterations restart at 1 on every turn, so a hop key
  // without the turn would collide across turns of one conversation.
  let turnIndex = 0;
  let iteration = 0;

  const keyOf = (t: number, i: number): string => `${t}:${i}`;

  const draftAt = (t: number, i: number): HopDraft => {
    const key = keyOf(t, i);
    let draft = drafts.get(key);
    if (draft === undefined) {
      draft = {
        turnIndex: t,
        iteration: i,
        activeIds: [],
        supersededIds: [],
        refusals: [],
        conflicts: [],
        superseded: [],
        toolsAsSent: [],
        skillInjections: [],
      };
      drafts.set(key, draft);
    }
    return draft;
  };

  for (const entry of log) {
    const type = str((entry.event as { type?: unknown }).type) ?? '';
    const p = payloadOf(entry);

    // Keep the running address current BEFORE the event is folded: every
    // iteration-stamped payload updates it, and the un-stamped events
    // (tool_start / tool_end) inherit whatever the last stamp said — which is
    // exactly where they ran.
    if (type === TURN_START) {
      turnIndex = num(p.turnIndex) ?? turnIndex;
      iteration = 0;
      continue;
    }
    if (type === ITERATION_START) {
      turnIndex = num(p.turnIndex) ?? turnIndex;
      iteration = num(p.iterIndex) ?? iteration;
      draftAt(turnIndex, iteration);
      continue;
    }
    const stamped = num(p.iteration);
    if (stamped !== undefined) iteration = stamped;

    switch (type) {
      case EVALUATED: {
        const draft = draftAt(turnIndex, iteration);
        // The evaluate stage IS where the cursor resolved, so its stage id is
        // the one a view should move the lens cursor to for this hop.
        draft.runtimeStageId = entry.runtimeStageId ?? draft.runtimeStageId;
        draft.activeIds = strList(p.activeIds);
        draft.supersededIds = strList(p.supersededIds);

        for (const row of Array.isArray(p.skillCatalog) ? p.skillCatalog : []) {
          const c = obj(row);
          const id = str(c?.id);
          if (id === undefined) continue;
          hasRouting = true;
          if (!catalog.has(id)) catalog.set(id, str(c?.description));
        }

        for (const row of Array.isArray(p.routing) ? p.routing : []) {
          const r = obj(row);
          const to = str(r?.injectionId);
          const from = str(r?.from);
          // Only a `route` entry names an edge; `entry` / `tree` / `model`
          // provenance says how a skill is REACHABLE, not that an edge exists.
          if (to === undefined || from === undefined) continue;
          const edgeKey = `${from}->${to}`;
          if (!declared.has(edgeKey)) {
            const label = str(r?.label);
            const triggerKind = str(r?.triggerKind);
            declared.set(edgeKey, {
              from,
              to,
              ...(label !== undefined ? { label } : {}),
              ...(triggerKind !== undefined ? { triggerKind } : {}),
            });
          }
        }

        const move = obj(p.cursorMove);
        if (move !== undefined) {
          hasRouting = true;
          draft.from = str(move.from);
          draft.to = str(move.to);
          draft.by = str(move.by);
          draft.witness = witnessOf(move.witness);
          if (Array.isArray(move.offered)) draft.offered = strList(move.offered);
          if (typeof move.declinedOffer === 'boolean') draft.declinedOffer = move.declinedOffer;
          if (draft.to !== undefined) visited.add(draft.to);
          if (draft.from !== undefined) visited.add(draft.from);
        }
        break;
      }

      case LLM_START: {
        const draft = draftAt(turnIndex, iteration);
        const tools: SkillToolAsSent[] = [];
        for (const row of Array.isArray(p.tools) ? p.tools : []) {
          const t = obj(row);
          const name = str(t?.name);
          if (name === undefined) continue;
          const description = str(t?.description);
          tools.push(description === undefined ? { name } : { name, description });
          // The gate rewrites this description every iteration with the
          // reachable set — it is the model's own view of the graph, and the
          // only place a reader can see the menu the model was actually given.
          if (name === READ_SKILL && description !== undefined) {
            draft.readSkillDescription = description;
          }
        }
        draft.toolsAsSent = tools;
        break;
      }

      case INJECTED: {
        // Skill-sourced injections only: this is the ROUTING record, and a
        // user message or the base prompt is not a routing fact.
        if (str(p.source) !== 'skill') break;
        const draft = draftAt(turnIndex, iteration);
        const slot = str(p.slot) ?? 'unknown';
        const skillId = str(p.sourceId);
        const text = str(p.rawContent);
        draft.skillInjections.push({
          slot,
          ...(skillId !== undefined ? { skillId } : {}),
          summary: str(p.contentSummary) ?? '',
          ...(text !== undefined ? { text } : {}),
        });
        break;
      }

      case TOOL_START: {
        const id = str(p.toolCallId);
        const name = str(p.toolName);
        if (id === undefined || name === undefined) break;
        const requestedId = str(obj(p.args)?.id);
        openCalls.set(id, { name, ...(requestedId !== undefined ? { requestedId } : {}) });
        break;
      }

      case TOOL_END: {
        const id = str(p.toolCallId);
        if (id === undefined) break;
        const call = openCalls.get(id);
        openCalls.delete(id);
        if (call === undefined || call.name !== READ_SKILL) break;
        const result = str(p.result);
        if (result === undefined) break;
        // Pair the refusal with the sentence the model read back. The gate
        // fires `skill.rejected` BETWEEN this call's start and end, so the
        // still-unanswered refusal for this same requested id is this call's.
        for (let i = pendingRefusals.length - 1; i >= 0; i--) {
          const pending = pendingRefusals[i]!;
          if (!pending.awaitingResult) continue;
          if (call.requestedId !== undefined && pending.requestedId !== call.requestedId) continue;
          const draft = drafts.get(pending.draftKey);
          const refusal = draft?.refusals[pending.index];
          if (refusal === undefined) continue;
          draft!.refusals[pending.index] = { ...refusal, toolCallId: id, refusalText: result };
          pending.awaitingResult = false;
          break;
        }
        break;
      }

      case REJECTED: {
        hasRouting = true;
        const requestedId = str(p.requestedId);
        if (requestedId === undefined) break;
        const draft = draftAt(turnIndex, iteration);
        const currentSkillId = str(p.currentSkillId);
        const posture = str(p.posture);
        draft.refusals.push({
          requestedId,
          ...(currentSkillId !== undefined ? { currentSkillId } : {}),
          allowed: strList(p.allowed),
          ...(posture !== undefined ? { posture } : {}),
          turnIndex,
          iteration,
        });
        pendingRefusals.push({
          draftKey: keyOf(turnIndex, iteration),
          index: draft.refusals.length - 1,
          requestedId,
          awaitingResult: true,
        });
        break;
      }

      case ROUTE_CONFLICT: {
        hasRouting = true;
        const draft = draftAt(turnIndex, iteration);
        const outcome = (row: Payload): SkillRouteConflict['losers'][number] => ({
          ...some('toolName', str(row.toolName)),
          ...some('target', str(row.target)),
          ...some('toolCallId', str(row.toolCallId)),
        });
        const winner = obj(p.winner);
        draft.conflicts.push({
          ...some('fromSkillId', str(p.fromSkillId)),
          ...some('winner', winner !== undefined ? outcome(winner) : undefined),
          losers: (Array.isArray(p.losers) ? p.losers : [])
            .map((row) => obj(row))
            .filter((l): l is Payload => l !== undefined)
            .map(outcome),
          ...some('source', str(p.source)),
        });
        break;
      }

      case REROUTE_SUPERSEDED: {
        hasRouting = true;
        const volunteeredId = str(p.volunteeredId);
        if (volunteeredId === undefined) break;
        const draft = draftAt(turnIndex, iteration);
        draft.superseded.push({
          volunteeredId,
          ...some('wonId', str(p.wonId)),
          ...some('fromSkillId', str(p.fromSkillId)),
          ...some('source', str(p.source)),
        });
        break;
      }

      case TURN_ROUTED: {
        hasRouting = true;
        const by = str(p.by);
        if (by === undefined) break;
        const scores = (Array.isArray(p.scores) ? p.scores : [])
          .map((row) => obj(row))
          .filter((s): s is Payload => s !== undefined)
          .map((s) => ({
            id: str(s.id) ?? '',
            score: num(s.score) ?? 0,
            relevance: num(s.relevance) ?? 0,
          }));
        const runnerUp = obj(p.runnerUp);
        const runnerUpId = str(runnerUp?.id);
        const policy = obj(p.policy);
        const dropped = obj(p.droppedResume);
        const droppedId = str(dropped?.id);
        const decider = obj(p.decider);
        turns.push({
          turnIndex,
          by,
          ...some('from', str(p.from)),
          ...some('to', str(p.to)),
          ...some('scorer', str(p.scorer)),
          scores,
          ...some(
            'runnerUp',
            runnerUpId !== undefined
              ? { id: runnerUpId, gap: num(runnerUp?.gap) ?? 0 }
              : undefined,
          ),
          ...some('decisive', typeof p.decisive === 'boolean' ? p.decisive : undefined),
          ...some('witness', witnessOf(p.witness)),
          ...some('offered', Array.isArray(p.offered) ? strList(p.offered) : undefined),
          ...some('stayOffered', typeof p.stayOffered === 'boolean' ? p.stayOffered : undefined),
          ...some(
            'policy',
            policy !== undefined
              ? {
                  ...some('nearTieMargin', num(policy.nearTieMargin)),
                  ...some('menuSize', num(policy.menuSize)),
                  ...some('floor', num(policy.floor)),
                }
              : undefined,
          ),
          ...some('window', num(p.window)),
          ...some(
            'droppedResume',
            droppedId !== undefined
              ? { id: droppedId, ...some('reason', str(dropped?.reason)) }
              : undefined,
          ),
          ...some(
            'decider',
            decider !== undefined
              ? {
                  ...some('provider', str(decider.provider)),
                  ...some('model', str(decider.model)),
                  ...some('picked', str(decider.picked)),
                }
              : undefined,
          ),
        });
        break;
      }

      case EVIDENCE_CHECKED: {
        const draft = draftAt(turnIndex, iteration);
        const unsupported = (Array.isArray(p.unsupported) ? p.unsupported : [])
          .map((row) => obj(row))
          .filter((u): u is Payload => u !== undefined)
          .map((u) => ({ value: str(u.value) ?? '', ...some('shape', str(u.shape)) }));
        draft.evidence = {
          ...some('posture', str(p.posture)),
          ...some('candidates', num(p.candidates)),
          unsupported,
          ...some('action', str(p.action)),
          ...some('afterRevision', typeof p.afterRevision === 'boolean' ? p.afterRevision : undefined),
          ...some(
            'evidenceTruncated',
            typeof p.evidenceTruncated === 'boolean' ? p.evidenceTruncated : undefined,
          ),
        };
        break;
      }

      default:
        break;
    }
  }

  // ── Link each refusal to the cursor row that answered it ───────────────
  // The lag is the law (see the header): the resolution of an iteration's pick
  // is reported by the NEXT iteration's evaluate. No next row ⇒ no claim.
  for (const draft of drafts.values()) {
    if (draft.refusals.length === 0) continue;
    const next = drafts.get(keyOf(draft.turnIndex, draft.iteration + 1));
    if (next === undefined || next.by === undefined) continue;
    const cursorAfter: SkillCursorAfter = {
      iteration: next.iteration,
      ...(next.from !== undefined ? { from: next.from } : {}),
      ...(next.to !== undefined ? { to: next.to } : {}),
      by: next.by,
      moved: didMove(next),
    };
    draft.refusals = draft.refusals.map((refusal) => ({ ...refusal, cursorAfter }));
  }

  // ── Freeze the drafts, in the order the run produced them ──────────────
  const hops: SkillHop[] = [...drafts.values()].map((d) => ({
    turnIndex: d.turnIndex,
    iteration: d.iteration,
    ...(d.runtimeStageId !== undefined ? { runtimeStageId: d.runtimeStageId } : {}),
    ...(d.from !== undefined ? { from: d.from } : {}),
    ...(d.to !== undefined ? { to: d.to } : {}),
    ...(d.by !== undefined ? { by: d.by } : {}),
    moved: didMove(d),
    ...(d.witness !== undefined ? { witness: d.witness } : {}),
    ...(d.offered !== undefined ? { offered: d.offered } : {}),
    ...(d.declinedOffer !== undefined ? { declinedOffer: d.declinedOffer } : {}),
    activeIds: d.activeIds,
    supersededIds: d.supersededIds,
    refusals: d.refusals,
    conflicts: d.conflicts,
    superseded: d.superseded,
    toolsAsSent: d.toolsAsSent,
    ...(d.readSkillDescription !== undefined
      ? { readSkillDescription: d.readSkillDescription }
      : {}),
    skillInjections: d.skillInjections,
    ...(d.evidence !== undefined ? { evidence: d.evidence } : {}),
  }));

  // ── The graph: catalog nodes, the hops the cursor was seen to take ─────
  const nodes: SkillRouteNode[] = [...catalog.entries()].map(([id, description]) => ({
    id,
    ...(description !== undefined ? { description } : {}),
    visited: visited.has(id),
  }));
  // A cursor position the catalog never listed is still a node of the graph
  // the run walked — report it rather than silently dropping the hop's target.
  for (const id of visited) {
    if (!catalog.has(id)) nodes.push({ id, visited: true });
  }

  const edges = new Map<string, { edge: SkillObservedEdge; takenAt: SkillHopRef[] }>();
  for (const hop of hops) {
    if (!hop.moved || hop.to === undefined || hop.by === undefined) continue;
    const key = `${hop.from ?? ''}->${hop.to}#${hop.by}`;
    const declaredEdge = hop.from !== undefined ? declared.get(`${hop.from}->${hop.to}`) : undefined;
    let row = edges.get(key);
    if (row === undefined) {
      const takenAt: SkillHopRef[] = [];
      row = {
        edge: {
          ...(hop.from !== undefined ? { from: hop.from } : {}),
          to: hop.to,
          by: hop.by,
          takenAt,
          ...(declaredEdge?.label !== undefined ? { label: declaredEdge.label } : {}),
          ...(declaredEdge?.triggerKind !== undefined
            ? { triggerKind: declaredEdge.triggerKind }
            : {}),
        },
        takenAt,
      };
      edges.set(key, row);
    }
    row.takenAt.push({ turnIndex: hop.turnIndex, iteration: hop.iteration });
  }

  return {
    hasRouting,
    nodes,
    hops,
    observedEdges: [...edges.values()].map((r) => r.edge),
    declaredEdges: [...declared.values()],
    turns,
  };
}
