/**
 * `storyMarks` — the story's beats joined to the ledger, as chips a host hands
 * the player (agentfootprint-lens 0.67.0; agentfootprint 9.111.0, whose
 * `agentThinkingTrace()` stamps `toolCallId` on the story's ask and return
 * beats).
 *
 * WHY. The Story Lens (the AgentThinkingUI player) is the most used view, and
 * the record now declares, per call, what the model was doing before it asked
 * (its `basis` row: direct or exploratory, what it expected, the proposition
 * it was testing, what it predicted) and what it made of each result after
 * (its CURRENT standing: fact, open, noise, ruled-out — or nothing at all).
 * The story must show these as chips on the beats. But the PLAYER stays
 * generic — it renders a `Trace` and a `marks` prop and knows nothing of a
 * ledger — and the JOIN is data logic, so it lives here as a pure fold: a host
 * calls `storyMarks(trace, record)` and hands the result to the player's
 * `marks` prop. Four layers kept apart: the player (components), this fold
 * (data logic), the record (data), the host (business logic: which stop).
 *
 * THE LAWS THIS FILE KEEPS:
 *
 *   1. NEVER INFER. A beat with no `toolCallId` gets no marks — never a join
 *      by tool name or by order. A result no standing row names is
 *      `undeclared` — that word, never `open`. A row the ledger never wrote
 *      is never drawn.
 *   2. ZERO-COST WHEN UNARMED. A record with no ledger row gets no chips on
 *      any beat: every entry is `undefined`.
 *   3. THE STOP'S OWN PICTURE. The record handed in is the fold at ONE stop
 *      (`contextAt(...).keys`) or the run's end; the marks reflect that stop.
 *      A return beat whose standing is declared later reads `undeclared` at
 *      an earlier stop and `noise` at a later one; the answer beat has marks
 *      only once the record names the answer (a standing declared on it, a
 *      contingent row on it, or `unsupportedValues`). The host re-folds per
 *      stop, the way it already reads `contextAt` per stop.
 *   4. NO SENTENCE OF ITS OWN. Every chip label is a value off the record —
 *      the model's own words verbatim (a proposition, a `predicts`), a
 *      standing word, a basis word, a count — or a `LABELS` entry;
 *      `test/served/no-own-claims.test.ts` walks this file.
 *   5. A SHAPE THE LENS DOES NOT OWN. The rows are narrowed by the SAME folds
 *      the Findings band, the Reasoning lens and the Proof map already use
 *      (`foldFindings` → `standingOf`, `foldReasoning` → `basisOf`,
 *      `foldProofMap` → `contingentOf` / `judgmentOf` / `unsupportedOf`),
 *      reused, never rewritten; a row that does not fit is passed over.
 *
 * Pure: no React, no clock, no randomness — the same input twice gives
 * deep-equal marks.
 */
import { foldProofMap, type ProofFold } from './ProofMap.js';
import { foldReasoning, type BasisShape } from './ReasoningLens.js';
import type { StandingShape } from './FindingsBand.js';

/** Every string this fold owns — names for chips, never a sentence. */
export const LABELS = Object.freeze({
  /** The basis word `direct`, printed as the record spells it. */
  direct: 'direct',
  /** The basis word `exploratory`, printed under the story's word for it. */
  hypothesis: 'hypothesis',
  expect: 'expect',
  /** The prefix of the `predicts` chip; the model's words follow. */
  predicts: 'predicts:',
  fact: 'fact',
  open: 'open',
  noise: 'noise',
  ruledOut: 'ruled-out',
  undeclared: 'undeclared',
  sought: 'sought',
  judged: 'judged',
  /** The answer chip's first bucket: results standing as `fact`. */
  stoodOn: 'stood on',
  contingent: 'contingent',
  unsupported: 'unsupported',
});

// ─── The player's shape ────────────────────────────────────────────────────

/** The five tones the player's `Mark` takes (agentthinkingui 0.33.0). */
export type StoryTone = 'neutral' | 'good' | 'warn' | 'bad' | 'muted';

/** One chip on one beat — the player's `Mark`, with the tone always set. */
export interface StoryMark {
  readonly label: string;
  readonly tone: StoryTone;
  /** The whole value when the label is clipped, or the record's own word behind a story word. */
  readonly title?: string;
}

/** A story beat as this fold reads it: its kind, and the call it belongs to when the recorder stamped one. */
export interface StoryBeatShape {
  readonly kind: string;
  readonly toolCallId?: string;
}

/** The player's trace, narrowed to what the join reads. */
export interface StoryTraceShape {
  readonly steps: ReadonlyArray<StoryBeatShape>;
}

/** One key of the fold at a stop, as `contextAt(...).keys` spells it. */
export interface StoryKeyShape {
  readonly path: string;
  readonly value: unknown;
}

/**
 * The record at ONE stop: the two keys the join reads, either as an object
 * (the run's end — `snapshot.sharedState`, or a hand-built record) or as the
 * key rows `contextAt(...).keys` hands a host.
 */
export type StoryRecord =
  | { readonly findingsLedger?: unknown; readonly unsupportedValues?: unknown }
  | ReadonlyArray<StoryKeyShape>;

/** The marks per beat: `marks[i]` decorates `trace.steps[i]`; `undefined` = no chips on that beat. */
export type StoryMarks = ReadonlyArray<ReadonlyArray<StoryMark> | undefined>;

// ─── Reading the record ────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

interface RecordKeys {
  readonly rows: readonly unknown[];
  readonly unsupportedValues?: unknown;
}

/** The two keys, from either record shape; the ledger is `[]` when the key is absent or not an array. */
function keysOf(record: StoryRecord): RecordKeys {
  if (Array.isArray(record)) {
    let ledger: unknown;
    let unsupported: unknown;
    for (const k of record as ReadonlyArray<unknown>) {
      if (!isRecord(k) || typeof k.path !== 'string') continue;
      if (k.path === 'findingsLedger') ledger = k.value;
      else if (k.path === 'unsupportedValues') unsupported = k.value;
    }
    return { rows: Array.isArray(ledger) ? ledger : [], unsupportedValues: unsupported };
  }
  const r = record as { readonly findingsLedger?: unknown; readonly unsupportedValues?: unknown };
  return { rows: Array.isArray(r.findingsLedger) ? r.findingsLedger : [], unsupportedValues: r.unsupportedValues };
}

// ─── The chips ─────────────────────────────────────────────────────────────

/** The most characters a chip label quotes; the whole value rides in `title`. */
export const CLIP = 40;

function clip(text: string): string {
  return text.length <= CLIP ? text : `${text.slice(0, CLIP - 1)}…`;
}

const mark = (label: string, tone: StoryTone, title?: string): StoryMark =>
  Object.freeze(title !== undefined ? { label, tone, title } : { label, tone });

/** The basis chip: `direct` as the record spells it; `exploratory` under the story's word, the record's in the title. */
function basisMark(basis: string): StoryMark {
  if (basis === 'exploratory') return mark(LABELS.hypothesis, 'muted', basis);
  return mark(basis, 'neutral');
}

function expectTone(expect: string): StoryTone {
  if (expect === 'high') return 'good';
  if (expect === 'low') return 'muted';
  return 'neutral';
}

/** The ask beat's chips, from its basis row. */
function askMarks(before: BasisShape): readonly StoryMark[] {
  const out: StoryMark[] = [basisMark(before.basis)];
  if (before.expect !== undefined) out.push(mark(`${LABELS.expect} ${before.expect}`, expectTone(before.expect)));
  if (before.proposition !== undefined) out.push(mark(clip(before.proposition), 'neutral', before.proposition));
  if (before.predicts !== undefined) out.push(mark(`${LABELS.predicts} ${clip(before.predicts)}`, 'neutral', before.predicts));
  return Object.freeze(out);
}

function standingTone(standing: string): StoryTone {
  if (standing === 'fact') return 'good';
  if (standing === 'open') return 'neutral';
  if (standing === 'noise') return 'warn';
  if (standing === 'ruled-out') return 'bad';
  return 'neutral';
}

/** The return beat's chips: the current standing (or `undeclared`), `sought`, the judge's word beside the model's. */
function returnMarks(standing: StandingShape | undefined, judged: string | undefined): readonly StoryMark[] {
  const out: StoryMark[] = [];
  if (standing === undefined) out.push(mark(LABELS.undeclared, 'muted'));
  else {
    out.push(mark(standing.standing, standingTone(standing.standing)));
    if (standing.sought === true) out.push(mark(LABELS.sought, 'muted'));
  }
  if (judged !== undefined) out.push(mark(`${LABELS.judged} ${judged}`, 'muted'));
  return Object.freeze(out);
}

/** The count of results whose CURRENT standing is the word. */
function countOf(standings: ReadonlyMap<string, StandingShape>, word: string): number {
  let n = 0;
  for (const s of standings.values()) if (s.standing === word) n += 1;
  return n;
}

/** The answer beat's chips: the buckets' counts, then `contingent N`, then `unsupported N`. */
function answerMarks(proof: ProofFold): readonly StoryMark[] | undefined {
  const answer = proof.answer;
  if (answer === undefined) return undefined;
  const standings = proof.findings.standings;
  const buckets: string[] = [];
  const stoodOn = countOf(standings, 'fact');
  const open = countOf(standings, 'open');
  const noise = countOf(standings, 'noise');
  const ruledOut = countOf(standings, 'ruled-out');
  if (stoodOn > 0) buckets.push(`${LABELS.stoodOn} ${stoodOn}`);
  if (open > 0) buckets.push(`${LABELS.open} ${open}`);
  if (noise > 0) buckets.push(`${LABELS.noise} ${noise}`);
  if (ruledOut > 0) buckets.push(`${LABELS.ruledOut} ${ruledOut}`);
  const out: StoryMark[] = [];
  if (buckets.length > 0) out.push(mark(buckets.join(' · '), stoodOn > 0 ? 'good' : 'neutral'));
  if (answer.contingent.length > 0) out.push(mark(`${LABELS.contingent} ${answer.contingent.length}`, 'warn'));
  if (answer.unsupported.length > 0) out.push(mark(`${LABELS.unsupported} ${answer.unsupported.length}`, 'bad'));
  return out.length > 0 ? Object.freeze(out) : undefined;
}

// ─── The fold ──────────────────────────────────────────────────────────────

/**
 * Join the story's beats to the ledger at one stop. `marks[i]` decorates
 * `trace.steps[i]`: an `ask` beat with a `toolCallId` and a basis row gets
 * the basis chips; a `return` beat with a `toolCallId` gets its CURRENT
 * standing (the last standing row wins — `foldFindings`), `sought`, and the
 * judge's word; the `answer` beat gets the buckets' counts once the record
 * names the answer; every other beat, every beat without a `toolCallId`, and
 * every beat of a record with no ledger row gets `undefined`. Pure.
 */
export function storyMarks(trace: StoryTraceShape, record: StoryRecord): StoryMarks {
  const keys = keysOf(record);
  const steps = trace.steps;
  if (keys.rows.length === 0) return Object.freeze(steps.map((): undefined => undefined));
  const reasoning = foldReasoning({ rows: keys.rows });
  const proof = foldProofMap({ rows: keys.rows, unsupportedValues: keys.unsupportedValues });
  const basisById = new Map<string, BasisShape>();
  for (const card of reasoning.cards) basisById.set(card.toolCallId, card.before);
  const judgedById = new Map<string, string>();
  for (const call of proof.calls) if (call.judged !== undefined) judgedById.set(call.toolCallId, call.judged);
  const standings = proof.findings.standings;
  const answer = answerMarks(proof);
  return Object.freeze(
    steps.map((step): readonly StoryMark[] | undefined => {
      if (step.kind === 'answer') return answer;
      if (typeof step.toolCallId !== 'string') return undefined;
      if (step.kind === 'ask') {
        const before = basisById.get(step.toolCallId);
        return before === undefined ? undefined : askMarks(before);
      }
      if (step.kind === 'return') return returnMarks(standings.get(step.toolCallId), judgedById.get(step.toolCallId));
      return undefined;
    }),
  );
}
