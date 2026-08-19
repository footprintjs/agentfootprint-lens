/**
 * `selectSkillBeats` — the routing record as a TIME axis, and the resolver that
 * puts the Lens's ONE cursor on it.
 *
 * Pattern: pure functions over `selectSkillRoute`'s output — no framework, no
 *          state, no caching. `selectSkillRoute` answers "what happened";
 *          this answers "what is true AT this point", which is the only extra
 *          question a scrubbing view asks.
 * Role:    the headless half of the SkillGraph debugger. A beat is one hop
 *          plus the facts that ACCUMULATE (where the cursor stands, what has
 *          been visited) and the SENTENCE the library already writes for it.
 *
 * THE ONE-CURSOR LAW (this package's founding rule, `lens_v0_1_one_cursor`):
 * a beat is NOT a second cursor. It carries the hop's `runtimeStageId` — the
 * lens's own address — and {@link selectSkillBeatAt} RESOLVES the one cursor
 * onto the beat list. Nothing here stores a position; a view that renders
 * beats must derive the active one from the cursor on every render, and move
 * the cursor (never a local index) when the reader clicks a beat.
 *
 * WHERE THE SENTENCES COME FROM (and why none are written here):
 * `headline` and `notes` are `humanizeCursorMove` / `humanizeSkillRejected` /
 * `humanizeRouteConflict` / `humanizeTurnRouted` — the SAME builders
 * `defaultHumanizer` composes for the Commentary panel. A product-facing rail
 * shows the library's sentences revealed in cursor order; it does not get its
 * own prose, because two prose systems drift and only one of them is tested.
 * The two exceptions are spelled out at {@link fallbackHeadline} — both are
 * formatters over the hop's own fields, for the two cases the humanizer
 * answers `null` to.
 *
 * WHAT IS DELIBERATELY NOT DERIVED — the reachable set:
 * The gate rewrites `read_skill`'s description every iteration with the
 * reachable set, so the words are on the record — as PROSE. Parsing them back
 * into ids would re-create the exact mistake `selectSkillRoute` exists to
 * remove (a view re-parsing sentences), and would break on the first era that
 * rewords the menu. So `reachable` is filled only from a TYPED list, and it
 * names which one it used ({@link SkillReachableSet.source}):
 *
 *   `'refusal'`        `skill.rejected.allowed` — the gate's own reachability
 *                      set. Exact, but present only on iterations where the
 *                      model was refused.
 *   `'declared-edges'` the edges `context.evaluated`'s `routing[]` named. A
 *                      LOWER BOUND: `routing[]` names an edge only once it
 *                      fires, so a graph's unfired edges are missing.
 *
 * Neither is "the reachable set at this frame" in general, and `undefined`
 * (no typed list at all) is the honest third answer — absent, never empty.
 */

import {
  humanizeCursorMove,
  humanizeRouteConflict,
  humanizeSkillRejected,
  humanizeTurnRouted,
} from '../humanizeRouting.js';
import type {
  SkillCursorCause,
  SkillHop,
  SkillRoute,
  SkillTurnStart,
} from './selectSkillRoute.js';

// ─── Shapes ──────────────────────────────────────────────────────────────

/** A reachable set, and the typed field it was read from — never prose. */
export interface SkillReachableSet {
  readonly ids: readonly string[];
  /** Which typed field supplied it. See the header for what each one means. */
  readonly source: 'refusal' | 'declared-edges';
}

/**
 * One stop on the routing axis: an iteration's hop, plus what is TRUE there.
 *
 * Everything accumulating (`cursorSkillId`, `visited`) is computed once, in
 * run order, so no view re-folds the run to answer "where am I".
 */
export interface SkillBeat {
  /** Position in the beat list. A LIST INDEX, not a cursor — see the header. */
  readonly index: number;
  readonly turnIndex: number;
  readonly iteration: number;
  /** The evaluate stage this iteration resolved at — the lens's ONE cursor
   *  address for this beat. Absent when the recording carried no stage id. */
  readonly runtimeStageId?: string;
  /** The fold row this beat projects, verbatim — every fact, un-summarized. */
  readonly hop: SkillHop;
  /** Where the cursor stands AFTER this beat. Carried forward across
   *  iterations that recorded no `cursorMove`, so a beat always knows the
   *  skill in play; `undefined` only before the first one. */
  readonly cursorSkillId?: string;
  readonly cause?: SkillCursorCause;
  readonly moved: boolean;
  /** The skill the MODEL picked on this beat (`by: 'model-pick'`). */
  readonly modelPickedId?: string;
  /** Skills the gate refused on this beat, in the order they were asked for. */
  readonly refusedIds: readonly string[];
  /** Every skill the cursor has stood in up to AND INCLUDING this beat. */
  readonly visited: readonly string[];
  /** A typed reachable set, when one is on the record. See the header. */
  readonly reachable?: SkillReachableSet;
  /** The stop's name, as a strip spells it ("Iteration 3"). */
  readonly label: string;
  /** The library's sentence for this hop — `humanizeCursorMove`. */
  readonly headline: string;
  /** The library's sentences for what ELSE the beat carried: the turn-start
   *  verdict, refusals, route conflicts, superseded picks. In that order. */
  readonly notes: readonly string[];
}

export interface SelectSkillBeatsArgs {
  readonly route: SkillRoute;
}

// ─── The projection ──────────────────────────────────────────────────────

/**
 * The two cases `humanizeCursorMove` answers `null` to, and what a routing
 * view says instead. Both are formatters over the hop's OWN fields — never a
 * story, and never a sentence a different cause could have produced.
 *
 *   NO CAUSE      the iteration carried no `cursorMove` at all. The beat still
 *                 exists (refusals and menus are stamped on such iterations),
 *                 so it states the ABSENCE — a fact about the record.
 *   UNDECORATED   a `'model-pick'` without the 9.17.0 menu decorations. The
 *   MODEL PICK    humanizer stays deliberately silent there because an
 *                 undecorated pick is low signal in a COMMENTARY stream; in a
 *                 routing view the pick is the whole point, so the movement
 *                 clause is rendered — the same clause, minus the menu it does
 *                 not have.
 */
function fallbackHeadline(hop: SkillHop): string {
  if (hop.by === undefined) {
    return hop.refusals.length > 0
      ? 'This iteration recorded no cursor resolution — only the refusal below.'
      : 'This iteration recorded no cursor resolution.';
  }
  if (hop.by === 'model-pick') {
    if (hop.to === undefined) return 'The model made a pick.';
    const from = hop.from !== undefined && hop.from !== hop.to ? `, moving from "${hop.from}"` : '';
    return `The model chose "${hop.to}"${from}.`;
  }
  const to = hop.to !== undefined ? ` → "${hop.to}"` : '';
  return `The skill in play was settled by "${hop.by}"${to}.`;
}

/** The library's line for a superseded pick. Kept beside the other three
 *  humanizers even though `humanizeRouting` ships none: the fields are the
 *  whole sentence, so there is nothing to interpret. */
function supersededLine(s: {
  readonly volunteeredId: string;
  readonly wonId?: string;
  readonly fromSkillId?: string;
}): string {
  const from = s.fromSkillId !== undefined ? ` from "${s.fromSkillId}"` : '';
  return s.wonId !== undefined
    ? `The model volunteered "${s.volunteeredId}", but the author's edge${from} to "${s.wonId}" outranked it.`
    : `The model volunteered "${s.volunteeredId}", but an author-declared edge${from} outranked it.`;
}

/** Turn-start verdicts, indexed by the turn they opened. */
function turnsByIndex(turns: readonly SkillTurnStart[]): Map<number, SkillTurnStart[]> {
  const byTurn = new Map<number, SkillTurnStart[]>();
  for (const t of turns) {
    const rows = byTurn.get(t.turnIndex);
    if (rows === undefined) byTurn.set(t.turnIndex, [t]);
    else rows.push(t);
  }
  return byTurn;
}

/**
 * Project the routing record onto the time axis: one beat per hop, in run
 * order, each carrying what accumulated up to it.
 *
 * Never throws, and never invents: a route with no hops projects to no beats
 * (which is what a run with no skill graph must look like).
 *
 * @example
 * ```ts
 * const route = selectSkillRoute({ log: recorder.selectEventLog() });
 * const beats = selectSkillBeats({ route });
 * const here  = selectSkillBeatAt(beats, cursorRuntimeStageId);
 * here?.headline;      // 'Moved from "support" to "billing" — …'
 * here?.visited;       // ['support', 'billing']
 * ```
 */
export function selectSkillBeats({ route }: SelectSkillBeatsArgs): readonly SkillBeat[] {
  const byTurn = turnsByIndex(route.turns);
  const seenTurn = new Set<number>();
  const visited: string[] = [];
  const seenSkill = new Set<string>();
  // Declared targets per source skill — the `'declared-edges'` lower bound.
  const declaredFrom = new Map<string, string[]>();
  for (const e of route.declaredEdges) {
    const rows = declaredFrom.get(e.from);
    if (rows === undefined) declaredFrom.set(e.from, [e.to]);
    else if (!rows.includes(e.to)) rows.push(e.to);
  }

  let cursor: string | undefined;

  return route.hops.map((hop, index) => {
    // `from` first: on a cold start there is none, and on every later hop it
    // is where the cursor already stood — so the visited list stays in the
    // order the run walked it.
    for (const id of [hop.from, hop.to]) {
      if (id === undefined || seenSkill.has(id)) continue;
      seenSkill.add(id);
      visited.push(id);
    }
    if (hop.to !== undefined) cursor = hop.to;
    else if (hop.from !== undefined) cursor = hop.from;

    const notes: string[] = [];
    // The turn-start verdict opens the first beat of its turn.
    if (!seenTurn.has(hop.turnIndex)) {
      seenTurn.add(hop.turnIndex);
      for (const t of byTurn.get(hop.turnIndex) ?? []) notes.push(humanizeTurnRouted(t));
    }
    for (const r of hop.refusals) {
      notes.push(
        humanizeSkillRejected({
          requestedId: r.requestedId,
          ...(r.currentSkillId !== undefined ? { currentSkillId: r.currentSkillId } : {}),
          allowed: r.allowed,
          ...(r.posture !== undefined ? { posture: r.posture } : {}),
        }),
      );
    }
    for (const c of hop.conflicts) notes.push(humanizeRouteConflict(c));
    for (const s of hop.superseded) notes.push(supersededLine(s));

    // No cause ⇒ no move to narrate. `humanizeCursorMove` is not asked to
    // invent one (an empty `by` would fall through to its unknown-era arm and
    // print a sentence about a cause that does not exist).
    const headline =
      (hop.by === undefined
        ? null
        : humanizeCursorMove({
            ...(hop.from !== undefined ? { from: hop.from } : {}),
            ...(hop.to !== undefined ? { to: hop.to } : {}),
            by: hop.by,
            ...(hop.offered !== undefined ? { offered: hop.offered } : {}),
            ...(hop.declinedOffer !== undefined ? { declinedOffer: hop.declinedOffer } : {}),
            ...(hop.witness !== undefined ? { witness: hop.witness } : {}),
          })) ?? fallbackHeadline(hop);

    // Reachability: the gate's own list when a refusal put one on the record,
    // else the declared edges leaving the skill the cursor stood in BEFORE the
    // hop (which is the position the reachability question was asked from).
    const askedFrom = hop.from ?? hop.to;
    const declared = askedFrom !== undefined ? declaredFrom.get(askedFrom) : undefined;
    const allowed = hop.refusals.find((r) => r.allowed.length > 0)?.allowed;
    const reachable: SkillReachableSet | undefined =
      allowed !== undefined
        ? { ids: allowed, source: 'refusal' }
        : declared !== undefined && declared.length > 0
          ? { ids: declared, source: 'declared-edges' }
          : undefined;

    return {
      index,
      turnIndex: hop.turnIndex,
      iteration: hop.iteration,
      ...(hop.runtimeStageId !== undefined ? { runtimeStageId: hop.runtimeStageId } : {}),
      hop,
      ...(cursor !== undefined ? { cursorSkillId: cursor } : {}),
      ...(hop.by !== undefined ? { cause: hop.by } : {}),
      moved: hop.moved,
      ...(hop.by === 'model-pick' && hop.to !== undefined ? { modelPickedId: hop.to } : {}),
      refusedIds: hop.refusals.map((r) => r.requestedId),
      visited: [...visited],
      ...(reachable !== undefined ? { reachable } : {}),
      label: `Iteration ${hop.iteration}`,
      headline,
      notes,
    } satisfies SkillBeat;
  });
}

// ─── The cursor resolver ─────────────────────────────────────────────────

/** Parse the `#N` executionIndex suffix off a runtimeStageId. */
function execIndex(runtimeStageId: string): number | undefined {
  const hash = runtimeStageId.lastIndexOf('#');
  if (hash < 0) return undefined;
  const n = Number(runtimeStageId.slice(hash + 1));
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

/**
 * Resolve the ONE cursor to the beat in effect there — the same rule
 * `selectToolChoiceCall` resolves a tool-choice call with, for the same
 * reason: the skill view SCRUBS the lens's cursor, it does not keep its own.
 *
 *   1. cursor AT an evaluate stage (exact `runtimeStageId`) → that beat;
 *   2. cursor INSIDE the evaluate stage's subflow (the cursor is the subflow
 *      root, a beat ran under it) → the FIRST such beat after the cursor;
 *   3. otherwise → the nearest-PREVIOUS beat (largest executionIndex ≤ the
 *      cursor's) — "the routing state you are standing in".
 *
 * Bookends: `__root__` at a run-start position is "nothing has routed yet"
 * (`undefined`); at a run-end position it is the whole run (the last beat).
 * An empty cursor (a live run before its first commit) also resolves to the
 * last beat, so a live view follows the run.
 *
 * Monotone with the cursor, and never throws.
 */
export function selectSkillBeatAt(
  beats: readonly SkillBeat[],
  cursorRuntimeStageId: string,
  cursorKind?: string,
): SkillBeat | undefined {
  if (beats.length === 0) return undefined;
  const last = beats[beats.length - 1];

  if (cursorKind === 'user-in') return undefined;
  if (cursorKind === 'user-out') return last;
  if (!cursorRuntimeStageId) return last; // live edge, no positions yet

  const base = cursorRuntimeStageId.split('#')[0] ?? '';
  if (base === '__root__') return cursorKind === 'group-start' ? undefined : last;

  const exact = beats.find((b) => b.runtimeStageId === cursorRuntimeStageId);
  if (exact !== undefined) return exact;

  const cursorIdx = execIndex(cursorRuntimeStageId);
  if (cursorIdx === undefined) return undefined; // unparsable synthetic id

  const prefix = `${base}/`;
  let within: SkillBeat | undefined;
  let withinIdx = Infinity;
  let prev: SkillBeat | undefined;
  let prevIdx = -1;
  for (const b of beats) {
    const id = b.runtimeStageId;
    if (id === undefined) continue;
    const idx = execIndex(id);
    if (idx === undefined) continue;
    if (id.startsWith(prefix) && idx > cursorIdx && idx < withinIdx) {
      within = b;
      withinIdx = idx;
    }
    if (idx <= cursorIdx && idx > prevIdx) {
      prev = b;
      prevIdx = idx;
    }
  }
  return within ?? prev;
}
