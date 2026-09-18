/**
 * <ReasoningLens> — the model's declared reasoning, before and after each
 * tool call, at the cursor (agentfootprint 9.103.0, `AgentState.findingsLedger`).
 *
 * WHY. The Findings band groups the ledger by STANDING — what the model
 * stands on, keeps open, ruled out. This lens reads the same fold the other
 * way round, BY CALL: one card per tool call in call order, each carrying
 * what the model declared before the call ran (its `basis` row: direct or
 * exploratory, what it expected, and — on a record that carries them — the
 * proposition it was testing and what it predicted), what the result was
 * (a placement ticket's ref and bytes, or the result's size in chars; and
 * whether the wire at the stop's epoch carried it collapsed to a ticket),
 * and what the model declared about the result afterwards (its CURRENT
 * standing — the last standing row per `toolCallId`, `FindingsBand.tsx ·
 * foldFindings`, reused not re-derived — with the assertions, the `settles`,
 * the `line`, and where the declaration landed). A trailing card for the
 * answer turn, once a standing was declared on the answer, counts the fold's
 * buckets under the served piece's own field names.
 *
 * THE LAWS THIS FILE KEEPS:
 *
 *   1. OMIT, NEVER DENY. The lens renders nothing at all when the fold at the
 *      stop holds neither `findingsLedger` nor `coverageDeclared` (an unarmed
 *      run whose tools declared nothing, or a stop before the first
 *      declaration of either); with declarations and no ledger it draws the
 *      Coverage band alone (0.65.0) — no cards, no count, no view toggle; a
 *      card prints no field the row does not carry; a result no standing row
 *      names is UNDECLARED — that word, never `open`.
 *   2. NO SENTENCE OF ITS OWN. Every printed string is a value off the record
 *      — a basis, a proposition, an assertion, a `settles`, a `line`, an id —
 *      or a `LABELS` entry; `test/served/no-own-claims.test.ts` walks this file.
 *   3. ONE CURSOR. The view reads the fold at the stop it is handed — the
 *      host's `cursor`, or the `shared` address read over this view's axis —
 *      and holds no cursor of its own: with neither it reads the run's end,
 *      stateless, and mounts no mover. Calls after the cursor are not drawn,
 *      because the fold at the stop does not hold them yet.
 *   4. A SHAPE THE LENS DOES NOT OWN. Every row is narrowed by its shape
 *      (`basisOf`, `standingOf` through `foldFindings`, `placedTicketOf`,
 *      `collapsedTicketOf`) and a row that does not fit is passed over.
 *
 * `foldReasoning(...)` is the pure fold the lens renders — exported for a
 * consumer with its own UI. The card's `details` disclosure is a native
 * `<details>` element: the open/closed bit is the browser's, not a second
 * cursor.
 *
 * THE EXCHANGE VIEW (0.63.0). A second view of the SAME beats, laid out as
 * the exchange between the two parties — the model on the left, the tools on
 * the right — showing only what crossed the wire, as the JSON it was: per
 * tool call the model's emission with its `_findings` declaration (the
 * assistant message in `history` whose `toolCalls[]` carries the id — verbatim
 * by the record's law, never rebuilt from the ledger; when `history` no longer
 * carries it the ledger's basis row stands in, labelled `from ledger`), the
 * tool's result as the tool message holds it (a placement ticket drawn as the
 * ticket; the collapsed ticket the wire at the stop's epoch served instead,
 * when it did), the standing the next call declared for it (the cards'
 * AFTER, reused); then, at the answer epoch, what was served for the answer
 * turn (the served view's `source: 'findings'` piece, its `text` verbatim)
 * and the answer the model gave (`history`'s closing assistant message, else
 * `finalContent`, else `llmLatestContent` once `llmLatestToolCalls` is empty
 * — the record's own field named on the beat). The view toggle is React
 * state — it is not the cursor. `foldExchange(...)` is its pure fold.
 *
 * THE COVERAGE BAND (0.65.0). Under either view, the tools' DECLARED
 * coverage at the same stop — `coverageDeclared`, the tracked key the
 * dispatch loop appends to when a tool returns `coverage(...)` or
 * `absent(...)` (agentfootprint 9.109) — drawn by `<CoverageRows>`
 * (`CoverageBand.tsx`) from the rows this lens already read at the stop, so
 * the stop is folded once. The owner's ruling: the boundary the library used
 * to append to the answer belongs in the lens, so a reader sees the merged
 * boundary (with the tool that declared each item) and every declaration by
 * call under the cards, moving with the same cursor. The band is the one
 * thing drawn when the record carries declarations but no ledger.
 */
import React, { useMemo, useState } from 'react';

import { contextAt, type ContextAt } from '../../core/context/contextAt.js';
import type { LensCursor } from '../../core/cursor/lensCursor.js';
import { lensCursorFrom } from '../../core/cursor/lensCursor.js';
import type { CursorPosition } from '../../core/group/cursorPositionsAtDrill.js';
import { scrubAxisFor } from '../../core/group/scrubAxisFor.js';
import type { LensRecorder } from '../../core/LensRecorder.js';
import { tagAxisPositions } from '../../core/tags/tagAxis.js';
import type { EventLogEntry } from '../../core/types.js';
import { snapshotLogKey, snapshotOfRunner } from '../../core/utils/snapshotOfRunner.js';
import { T } from '../theme/index.js';
import { TimeTravel } from '../TimeTravel.js';
import type { SharedCursor } from '../useSharedCursor.js';
import { MILESTONE_AXIS } from './ContextView.js';
import { CoverageRows } from './CoverageBand.js';
import { foldFindings, type AssertionShape, type FindingsFold, type StandingShape } from './FindingsBand.js';
import { collapsedTicketOf } from './ServedTab.js';

/** Every string this lens owns — names for fields and chips, never a sentence. */
export const LABELS = Object.freeze({
  lens: 'Reasoning',
  calls: 'calls',
  iteration: 'iteration',
  basis: 'basis',
  expect: 'expect',
  malformed: 'malformed',
  /** The `proposition` field — what the model said it was testing. */
  tested: 'tested',
  predicts: 'predicts',
  result: 'result',
  chars: 'chars',
  bytes: 'bytes',
  ref: 'ref',
  placed: 'placed',
  collapsed: 'collapsed',
  standing: 'standing',
  undeclared: 'undeclared',
  sought: 'sought',
  settles: 'settles',
  line: 'line',
  declaredOn: 'declared on',
  unknownId: 'unknown id',
  conflict: 'conflict',
  details: 'details',
  assertions: 'assertions',
  ticket: 'ticket',
  answer: 'answer',
  facts: 'facts',
  limitations: 'limitations',
  evidenceRefs: 'evidenceRefs',
  nextSteps: 'nextSteps',
  noise: 'noise',
  serve: 'serve',
  answerAsk: 'answer ask',
  /** The exchange view (0.63.0). */
  view: 'view',
  cards: 'cards',
  exchange: 'exchange',
  model: 'model',
  tool: 'tool',
  call: 'call',
  served: 'served',
  args: 'args',
  findings: '_findings',
  fromLedger: 'from ledger',
  lines: 'lines',
});

// ─── The row shapes this lens reads beyond the band's ────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** A basis row, as read: what the model declared BEFORE the call ran. */
export interface BasisShape {
  readonly toolCallId: string;
  readonly toolName?: string;
  readonly iteration?: number;
  readonly basis: string;
  readonly expect?: string;
  readonly malformed?: number;
  /** What the model said it was testing (a record that carries it). */
  readonly proposition?: string;
  /** What the model said the result would show (a record that carries it). */
  readonly predicts?: string;
}

function basisOf(row: unknown): BasisShape | undefined {
  if (!isRecord(row) || row.kind !== 'basis') return undefined;
  if (typeof row.toolCallId !== 'string' || typeof row.basis !== 'string') return undefined;
  return {
    toolCallId: row.toolCallId,
    basis: row.basis,
    ...(typeof row.toolName === 'string' ? { toolName: row.toolName } : {}),
    ...(typeof row.iteration === 'number' ? { iteration: row.iteration } : {}),
    ...(typeof row.expect === 'string' ? { expect: row.expect } : {}),
    ...(typeof row.malformed === 'number' ? { malformed: row.malformed } : {}),
    ...(typeof row.proposition === 'string' ? { proposition: row.proposition } : {}),
    ...(typeof row.predicts === 'string' ? { predicts: row.predicts } : {}),
  };
}

/** A placement ticket (`PlacedToolResult`): the ref and the stored size, read by shape. */
export interface PlacedShape {
  readonly ref: string;
  readonly bytes?: number;
  readonly kind?: string;
}

function placedTicketOf(value: unknown): PlacedShape | undefined {
  let v: unknown = value;
  if (typeof v === 'string' && v.startsWith('{')) {
    try {
      v = JSON.parse(v);
    } catch {
      return undefined;
    }
  }
  if (!isRecord(v) || v.placed !== true || typeof v.ref !== 'string') return undefined;
  return {
    ref: v.ref,
    ...(typeof v.bytes === 'number' ? { bytes: v.bytes } : {}),
    ...(typeof v.kind === 'string' ? { kind: v.kind } : {}),
  };
}

/** The result as the lens can size it: a ticket, or the chars the record holds. */
export type ResultShape = { readonly placed: PlacedShape } | { readonly chars: number };

function resultShapeOf(value: unknown): ResultShape {
  const placed = placedTicketOf(value);
  if (placed !== undefined) return { placed };
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
  return { chars: text.length };
}

/** The tool results on the record by id: `history`'s `role: 'tool'` messages, then the batch. */
function resultsById(history: readonly unknown[] | undefined, toolResults: readonly unknown[] | undefined): ReadonlyMap<string, unknown> {
  const out = new Map<string, unknown>();
  for (const m of history ?? []) {
    if (isRecord(m) && m.role === 'tool' && typeof m.toolCallId === 'string' && !out.has(m.toolCallId)) out.set(m.toolCallId, m.content);
  }
  for (const r of toolResults ?? []) {
    if (isRecord(r) && typeof r.toolCallId === 'string' && !out.has(r.toolCallId)) out.set(r.toolCallId, r.result);
  }
  return out;
}

/** A collapsed ticket as the wire carried it: the standing, and the content string itself. */
export interface CollapsedShape {
  readonly standing: string;
  readonly content: string;
}

/** The collapsed tickets on the wire at the epoch, by the result's id. */
function collapsedById(asSent: readonly unknown[] | undefined): ReadonlyMap<string, CollapsedShape> {
  const out = new Map<string, CollapsedShape>();
  for (const m of asSent ?? []) {
    if (!isRecord(m) || m.role !== 'tool' || typeof m.content !== 'string') continue;
    const t = collapsedTicketOf(m.content);
    if (t !== undefined) out.set(t.toolCallId, { standing: t.standing, content: m.content });
  }
  return out;
}

// ─── The fold ─────────────────────────────────────────────────────────────

/** One tool call as the lens draws it: before, result, after. */
export interface ReasoningCard {
  readonly toolCallId: string;
  readonly before: BasisShape;
  /** The result as the record holds it; absent when no result names the id. */
  readonly result?: ResultShape;
  /** The standing the wire at the epoch collapsed this result under; absent when served verbatim. */
  readonly collapsed?: string;
  /** The CURRENT standing row about this result; absent = undeclared. */
  readonly after?: StandingShape;
  /** The keys of the conflict rows naming this result as a witness. */
  readonly conflicts: readonly string[];
}

/** The answer turn's card: the fold's buckets under the served piece's field names. */
export interface AnswerCard {
  readonly facts: number;
  readonly limitations: number;
  readonly evidenceRefs: number;
  readonly nextSteps: number;
  readonly noise: number;
  readonly undeclared: number;
  /** The run constant `findingsServe`, when the record carries it. */
  readonly serve?: string;
  /** The run constant `findingsAnswerAsk`, when the record carries it. */
  readonly answerAsk?: unknown;
}

export interface ReasoningFold {
  readonly cards: readonly ReasoningCard[];
  /** Present once a standing row was declared on the answer. */
  readonly answer?: AnswerCard;
  /** The band's own fold, which this one stands on. */
  readonly findings: FindingsFold;
}

export interface ReasoningInput {
  /** The ledger as the fold holds it at the stop (`findingsLedger`). */
  readonly rows: readonly unknown[];
  /** The state's `toolResults` at the same stop. */
  readonly toolResults?: readonly unknown[];
  /** The state's `history` at the same stop — the tool messages hold every result. */
  readonly history?: readonly unknown[];
  /** The served wire at the stop's epoch (`messages.asSent`), for the collapsed tickets. */
  readonly asSent?: readonly unknown[];
  readonly findingsServe?: unknown;
  readonly findingsAnswerAsk?: unknown;
  /** The served view's `system.pieces` at the stop's epoch (0.63.0, the exchange's served beat). */
  readonly pieces?: readonly unknown[];
  /** The state's `finalContent` at the stop (0.63.0, the answer beat). */
  readonly finalContent?: unknown;
  /** The state's `llmLatestContent` / `llmLatestToolCalls` at the stop (0.63.0, the answer beat). */
  readonly llmLatestContent?: unknown;
  readonly llmLatestToolCalls?: unknown;
}

/**
 * Fold the ledger BY CALL. The basis rows give the calls in call order (the
 * ledger is append-only, a basis row lands before its call runs); the
 * standings come from `foldFindings` — the LAST standing row per result is
 * the current one — and every other fact is looked up by the result's id.
 * Pure; a row that does not fit its kind's shape is passed over.
 */
export function foldReasoning(input: ReasoningInput): ReasoningFold {
  const findings = foldFindings(input.rows, input.toolResults);
  const results = resultsById(input.history, input.toolResults);
  const collapsed = collapsedById(input.asSent);
  const witnessed = new Map<string, string[]>();
  for (const c of findings.conflicts) {
    for (const w of c.witnesses) {
      const keys = witnessed.get(w.toolCallId) ?? [];
      keys.push(c.key);
      witnessed.set(w.toolCallId, keys);
    }
  }
  const seen = new Set<string>();
  const cards: ReasoningCard[] = [];
  for (const row of input.rows) {
    const before = basisOf(row);
    if (before === undefined || seen.has(before.toolCallId)) continue;
    seen.add(before.toolCallId);
    const id = before.toolCallId;
    const after = findings.standings.get(id);
    const onWire = collapsed.get(id);
    cards.push(
      Object.freeze({
        toolCallId: id,
        before,
        ...(results.has(id) ? { result: resultShapeOf(results.get(id)) } : {}),
        ...(onWire !== undefined ? { collapsed: onWire.standing } : {}),
        ...(after !== undefined ? { after } : {}),
        conflicts: Object.freeze(witnessed.get(id) ?? []),
      }),
    );
  }
  const answered = Array.from(findings.standings.values()).some((s) => s.declaredOn === 'answer');
  const answer: AnswerCard | undefined = answered
    ? Object.freeze({
        facts: findings.facts.length,
        limitations: findings.ruledOut.length,
        evidenceRefs: findings.open.length,
        nextSteps: findings.open.filter((s) => s.settles !== undefined).length,
        noise: findings.noise.length,
        undeclared: findings.undeclared.length,
        ...(typeof input.findingsServe === 'string' ? { serve: input.findingsServe } : {}),
        ...(input.findingsAnswerAsk !== undefined ? { answerAsk: input.findingsAnswerAsk } : {}),
      })
    : undefined;
  return Object.freeze({
    cards: Object.freeze(cards),
    ...(answer !== undefined ? { answer } : {}),
    findings,
  });
}

// ─── The exchange fold (0.63.0) ───────────────────────────────────────────

/** The emission as the assistant message in `history` carries it: `toolCalls[i]`. */
export interface EmittedCallShape {
  readonly id: string;
  readonly name?: string;
  readonly args?: Record<string, unknown>;
}

/** The tool calls the record's assistant messages emitted, by id, first message wins. */
function emittedById(history: readonly unknown[] | undefined): ReadonlyMap<string, EmittedCallShape> {
  const out = new Map<string, EmittedCallShape>();
  for (const m of history ?? []) {
    if (!isRecord(m) || m.role !== 'assistant' || !Array.isArray(m.toolCalls)) continue;
    for (const c of m.toolCalls) {
      if (!isRecord(c) || typeof c.id !== 'string' || out.has(c.id)) continue;
      out.set(c.id, {
        id: c.id,
        ...(typeof c.name === 'string' ? { name: c.name } : {}),
        ...(isRecord(c.args) ? { args: c.args } : {}),
      });
    }
  }
  return out;
}

/** The model's beat for one call: the emission, split into its `_findings` block and the rest. */
export interface CallBeat {
  readonly kind: 'call';
  readonly side: 'model';
  readonly toolCallId: string;
  readonly toolName?: string;
  /** `args._findings` as emitted — or, `fromLedger`, the basis row's own declaration. */
  readonly findings?: unknown;
  /** The remaining args as emitted; absent when the emission is not on the record. */
  readonly args?: Record<string, unknown>;
  /** `history` no longer carries the emission; the ledger's basis row stands in. */
  readonly fromLedger: boolean;
}

/** The tool's beat for one call: the result as the tool message holds it, and what the wire served instead. */
export interface ResultBeat {
  readonly kind: 'result';
  readonly side: 'tool';
  readonly toolCallId: string;
  readonly toolName?: string;
  /** The content as the record holds it (a string, or the batch's value). */
  readonly content: unknown;
  /** The placement ticket, when the content is one. */
  readonly placed?: PlacedShape;
  /** The ticket the wire at the stop's epoch carried in place of this result. */
  readonly collapsed?: CollapsedShape;
  /** The standing a later call (or the answer) declared for it — the cards' AFTER. */
  readonly after?: StandingShape;
}

/** What was served for the answer turn: the `source: 'findings'` piece, its text verbatim. */
export interface ServedBeat {
  readonly kind: 'served';
  readonly side: 'model';
  readonly source: string;
  readonly text: string;
}

/** The answer the model gave, and which field of the record holds it. */
export interface AnswerBeat {
  readonly kind: 'answer';
  readonly side: 'model';
  readonly text: string;
  readonly from: 'history' | 'finalContent' | 'llmLatestContent';
}

export type ExchangeBeat = CallBeat | ResultBeat | ServedBeat | AnswerBeat;

export interface ExchangeFold {
  readonly beats: readonly ExchangeBeat[];
  /** The cards' fold, which this one stands on. */
  readonly reasoning: ReasoningFold;
}

/** The basis row's declaration as the ledger spells it, for a call `history` no longer carries. */
function ledgerFindings(before: BasisShape): Record<string, unknown> {
  return {
    basis: before.basis,
    ...(before.expect !== undefined ? { expect: before.expect } : {}),
    ...(before.proposition !== undefined ? { proposition: before.proposition } : {}),
    ...(before.predicts !== undefined ? { predicts: before.predicts } : {}),
  };
}

function callBeatOf(card: ReasoningCard, emitted: ReadonlyMap<string, EmittedCallShape>): CallBeat {
  const id = card.toolCallId;
  const e = emitted.get(id);
  const toolName = e?.name ?? card.before.toolName;
  if (e === undefined) {
    return Object.freeze({
      kind: 'call',
      side: 'model',
      toolCallId: id,
      ...(toolName !== undefined ? { toolName } : {}),
      findings: ledgerFindings(card.before),
      fromLedger: true,
    });
  }
  const { _findings, ...rest } = e.args ?? {};
  return Object.freeze({
    kind: 'call',
    side: 'model',
    toolCallId: id,
    ...(toolName !== undefined ? { toolName } : {}),
    ...(_findings !== undefined ? { findings: _findings } : {}),
    ...(e.args !== undefined ? { args: Object.freeze(rest) } : {}),
    fromLedger: false,
  });
}

function resultBeatOf(card: ReasoningCard, content: unknown, collapsed: CollapsedShape | undefined, toolName: string | undefined): ResultBeat {
  const placed = placedTicketOf(content);
  return Object.freeze({
    kind: 'result',
    side: 'tool',
    toolCallId: card.toolCallId,
    ...(toolName !== undefined ? { toolName } : {}),
    content,
    ...(placed !== undefined ? { placed } : {}),
    ...(collapsed !== undefined ? { collapsed } : {}),
    ...(card.after !== undefined ? { after: card.after } : {}),
  });
}

/** The served view's first `source: 'findings'` piece, read by shape. */
function findingsPieceOf(pieces: readonly unknown[] | undefined): ServedBeat | undefined {
  for (const p of pieces ?? []) {
    if (!isRecord(p) || p.source !== 'findings' || typeof p.text !== 'string') continue;
    return Object.freeze({ kind: 'served', side: 'model', source: p.source, text: p.text });
  }
  return undefined;
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/**
 * The answer as the record holds it: `history`'s closing assistant message
 * (content, no tool calls, after the last tool message), else `finalContent`,
 * else `llmLatestContent` once `llmLatestToolCalls` carries no call. Absent
 * when none of the three holds one — the run has not answered at the stop.
 */
function answerOf(input: ReasoningInput): AnswerBeat | undefined {
  const history = input.history ?? [];
  const last = history[history.length - 1];
  if (isRecord(last) && last.role === 'assistant' && nonEmpty(last.content) && (!Array.isArray(last.toolCalls) || last.toolCalls.length === 0)) {
    return Object.freeze({ kind: 'answer', side: 'model', text: last.content, from: 'history' });
  }
  if (nonEmpty(input.finalContent)) return Object.freeze({ kind: 'answer', side: 'model', text: input.finalContent, from: 'finalContent' });
  const calls = input.llmLatestToolCalls;
  if (nonEmpty(input.llmLatestContent) && (!Array.isArray(calls) || calls.length === 0)) {
    return Object.freeze({ kind: 'answer', side: 'model', text: input.llmLatestContent, from: 'llmLatestContent' });
  }
  return undefined;
}

/**
 * Fold the exchange, in wire order per call: the model's emission, the tool's
 * result; then what was served for the answer turn and the answer. Stands on
 * `foldReasoning` (the calls, the standings, the wire's tickets) and looks the
 * emission up in `history` by id. Pure; a beat prints only what its row holds.
 */
export function foldExchange(input: ReasoningInput): ExchangeFold {
  const reasoning = foldReasoning(input);
  const emitted = emittedById(input.history);
  const results = resultsById(input.history, input.toolResults);
  const collapsed = collapsedById(input.asSent);
  const beats: ExchangeBeat[] = [];
  for (const card of reasoning.cards) {
    const call = callBeatOf(card, emitted);
    beats.push(call);
    if (results.has(card.toolCallId)) beats.push(resultBeatOf(card, results.get(card.toolCallId), collapsed.get(card.toolCallId), call.toolName));
  }
  const served = findingsPieceOf(input.pieces);
  if (served !== undefined) beats.push(served);
  const answer = answerOf(input);
  if (answer !== undefined) beats.push(answer);
  return Object.freeze({ beats: Object.freeze(beats), reasoning });
}

// ─── The lens ─────────────────────────────────────────────────────────────

export interface ReasoningLensProps {
  /** The recording or a runner with `getLastSnapshot()` — the same input the Context view takes. */
  readonly runner: unknown;
  /** THE cursor, when a host holds it per axis. */
  readonly cursor?: LensCursor;
  /**
   * The HOST's one cursor across every lens it mounts (`useSharedCursor`).
   * Read over the recorder's grouped axis when `recorder` is given, else
   * over the milestone axis read off the snapshot. `cursor` wins when supplied.
   * With neither, the lens reads the run's END — stateless, no mover.
   */
  readonly shared?: SharedCursor;
  /** The recorder whose grouped axis a `shared` view reads. */
  readonly recorder?: LensRecorder;
  /** The recording's event stream, handed to `contextAt` (a replay's `getEntries()`). */
  readonly events?: readonly EventLogEntry[];
  /** The view the lens opens on (0.63.0); the toggle is React state, not the cursor. */
  readonly defaultView?: ReasoningView;
}

/** The two views of the same beats: the cards, or the exchange between model and tools. */
export type ReasoningView = 'cards' | 'exchange';

function positionsOf(snapshot: unknown): readonly CursorPosition[] {
  return tagAxisPositions(snapshot, MILESTONE_AXIS, []) ?? [];
}

const noMove = (): void => undefined;

/** The value of one top-level key of the fold at the stop, when it holds one. */
function keyValue(context: ContextAt, path: string): unknown {
  return context.keys.find((k) => k.path === path)?.value;
}

function arrayValue(context: ContextAt, path: string): readonly unknown[] | undefined {
  const v = keyValue(context, path);
  return Array.isArray(v) ? v : undefined;
}

export function ReasoningLens(props: ReasoningLensProps): React.ReactElement | null {
  const { runner, events, shared, recorder } = props;
  const [view, setView] = useState<ReasoningView>(props.defaultView ?? 'cards');
  const fresh = snapshotOfRunner(runner);
  const logKey = snapshotLogKey(fresh);
  const snapshot = useMemo(() => fresh, [runner, logKey]);
  const ownPositions = useMemo(
    () =>
      props.cursor !== undefined
        ? undefined
        : recorder !== undefined
          ? scrubAxisFor(recorder, 'group')
          : positionsOf(snapshot),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the recorder's axis moves with the log key
    [snapshot, props.cursor, recorder, logKey],
  );
  // ONE cursor: the host's per-axis reading, else the shared address read
  // over this view's axis, else the run's END — a reading, never a state.
  const positions = ownPositions ?? [];
  const cursor: LensCursor =
    props.cursor ??
    (shared !== undefined ? shared.over(positions) : lensCursorFrom(positions, Math.max(0, positions.length - 1), noMove));

  const context = useMemo(
    () => contextAt(snapshot, { runtimeStageId: cursor.at.runtimeStageId, commitIdx: cursor.at.commitIdx }, { events }),
    [snapshot, cursor.at.runtimeStageId, cursor.at.commitIdx, events],
  );
  const rows = arrayValue(context, 'findingsLedger');
  // 0.65.0: the tools' declared coverage at the same stop — a tracked key,
  // so the fold at the stop already holds what had landed by then.
  const coverage = arrayValue(context, 'coverageDeclared');
  const declared = coverage !== undefined && coverage.length > 0 ? coverage : undefined;
  const exchange = useMemo(() => {
    if (rows === undefined) return undefined;
    const toolResults = arrayValue(context, 'toolResults');
    const history = arrayValue(context, 'history');
    const wire = context.served?.row.view.messages.asSent;
    const pieces = context.served?.row.view.system.pieces;
    return foldExchange({
      rows,
      ...(toolResults !== undefined ? { toolResults } : {}),
      ...(history !== undefined ? { history } : {}),
      ...(Array.isArray(wire) ? { asSent: wire } : {}),
      ...(Array.isArray(pieces) ? { pieces } : {}),
      findingsServe: keyValue(context, 'findingsServe'),
      findingsAnswerAsk: keyValue(context, 'findingsAnswerAsk'),
      finalContent: keyValue(context, 'finalContent'),
      llmLatestContent: keyValue(context, 'llmLatestContent'),
      llmLatestToolCalls: keyValue(context, 'llmLatestToolCalls'),
    });
  }, [context, rows]);

  // THE transport (0.63.1): the same component the Lens, the Skill Graph and
  // the Context view mount, moving the same address through the same funnel.
  // It belongs here when the cursor is the shared address — a per-axis
  // `cursor` from a slot brings the host's mover — and only while the address
  // stands on this axis (a transport lit at stop 0 would claim a position).
  // A run with neither a ledger nor a declaration at the stop draws nothing —
  // but the transport stays whenever this lens holds the shared address
  // (0.66.1): a person who stepped back to a stop before the first row must
  // be able to step forward from here.
  const mover = props.cursor === undefined && shared !== undefined && cursor.total > 0 && cursor.at.step >= 0;

  // Omit, never deny: neither a ledger nor a declaration at the stop, nothing
  // drawn. Declarations alone draw the Coverage band alone — no cards, no
  // count, no toggle (0.65.0).
  const drawn = exchange !== undefined || declared !== undefined;
  if (!drawn && !mover) return null;
  const fold = exchange?.reasoning;
  return (
    <div
      style={panel}
      data-testid="reasoning-lens"
      data-drawn={String(drawn)}
      data-step={cursor.at.step}
      data-commit={cursor.at.commitIdx}
      {...(fold !== undefined ? { 'data-calls': fold.cards.length } : {})}
      data-view={view}
    >
      <div style={header}>
        <span style={title}>{LABELS.lens}</span>
        {fold !== undefined && (
          <span style={dim}>
            {fold.cards.length} {LABELS.calls}
          </span>
        )}
        {fold !== undefined && <ViewToggle view={view} onView={setView} />}
      </div>
      {mover && (
        <div data-testid="reasoning-transport">
          <TimeTravel
            total={cursor.total}
            focusSeq={Math.max(0, cursor.at.step)}
            onFocusChange={(n) => cursor.moveTo(n)}
            isLive={false}
            compact
          />
        </div>
      )}
      {fold !== undefined && view === 'cards' && (
        <div style={column} data-testid="reasoning-cards">
          {fold.cards.map((card) => (
            <Card key={card.toolCallId} card={card} />
          ))}
          {fold.answer !== undefined && <Answer answer={fold.answer} />}
        </div>
      )}
      {exchange !== undefined && view === 'exchange' && <Exchange beats={exchange.beats} />}
      {declared !== undefined && (
        <div data-testid="reasoning-coverage">
          <CoverageRows rows={declared} step={cursor.at.step} commit={cursor.at.commitIdx} />
        </div>
      )}
    </div>
  );
}

/**
 * The cards ⇄ exchange toggle: two real buttons in a `tablist`, so the
 * keyboard reaches them and the focus ring is the platform's own (the
 * Served tab's list ⇄ graph toggle, the same shape).
 */
function ViewToggle({ view, onView }: { readonly view: ReasoningView; readonly onView: (view: ReasoningView) => void }): React.ReactElement {
  const button = (value: ReasoningView, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={view === value}
      data-testid={`reasoning-view-${value}`}
      style={toggleButton(view === value)}
      onClick={() => onView(value)}
    >
      {label}
    </button>
  );
  return (
    <span role="tablist" aria-label={LABELS.view} style={toggleRow} data-testid="reasoning-view-toggle">
      {button('cards', LABELS.cards)}
      {button('exchange', LABELS.exchange)}
    </span>
  );
}

// ─── One card ─────────────────────────────────────────────────────────────

const SHORT_ID = 12;

function Card({ card }: { readonly card: ReasoningCard }): React.ReactElement {
  const { before, after } = card;
  const id = card.toolCallId;
  const standing = after?.standing;
  return (
    <div
      style={cardStyle}
      data-testid="reasoning-card"
      data-tool-call-id={id}
      data-basis={before.basis}
      data-standing={standing ?? LABELS.undeclared}
    >
      <div style={row}>
        {before.toolName !== undefined && <code style={strong}>{before.toolName}</code>}
        <code title={id} style={mono} data-testid="reasoning-card-id">
          {id.length > SHORT_ID ? `${id.slice(0, SHORT_ID)}…` : id}
        </code>
        {before.iteration !== undefined && (
          <span style={dim}>
            {LABELS.iteration} {before.iteration}
          </span>
        )}
        <Chip testId="reasoning-basis" color={T.primary}>
          {before.basis}
        </Chip>
        {before.expect !== undefined && (
          <Chip testId="reasoning-expect" color={T.textMuted}>
            {LABELS.expect} {before.expect}
          </Chip>
        )}
        {before.malformed !== undefined && (
          <Chip testId="reasoning-malformed" color={T.warning}>
            {LABELS.malformed} {before.malformed}
          </Chip>
        )}
        {card.conflicts.map((key) => (
          <Chip key={key} testId="reasoning-conflict" color={T.error} title={key}>
            {LABELS.conflict}
          </Chip>
        ))}
      </div>
      <Before before={before} />
      <div style={row} data-testid="reasoning-after">
        <span style={dim}>{LABELS.standing}</span>
        <Chip testId="reasoning-standing" color={standing !== undefined ? standingColor(standing) : T.textMuted}>
          {standing ?? LABELS.undeclared}
        </Chip>
        {after?.sought === true && (
          <Chip testId="reasoning-sought" color={T.textMuted}>
            {LABELS.sought}
          </Chip>
        )}
        {after?.unknownId === true && (
          <Chip testId="reasoning-unknown-id" color={T.warning}>
            {LABELS.unknownId}
          </Chip>
        )}
        {card.collapsed !== undefined && (
          <Chip testId="reasoning-collapsed" color={T.textMuted} title={card.collapsed}>
            {LABELS.collapsed}
          </Chip>
        )}
        {after?.declaredOn !== undefined && (
          <span style={dim} data-testid="reasoning-declared-on">
            {LABELS.declaredOn} <code style={mono}>{after.declaredOn === 'answer' ? after.declaredOn : after.declaredOn.toolCallId}</code>
          </span>
        )}
      </div>
      {after !== undefined && <QuotedLine after={after} />}
      <details style={detailsStyle} data-testid="reasoning-details">
        <summary style={summaryStyle}>{LABELS.details}</summary>
        <Details card={card} />
      </details>
    </div>
  );
}

/** What the model declared BEFORE the call, when the row carries it — else nothing. */
function Before({ before }: { readonly before: BasisShape }): React.ReactElement | null {
  if (before.proposition === undefined && before.predicts === undefined) return null;
  return (
    <div style={mono} data-testid="reasoning-before">
      {before.proposition !== undefined && (
        <div data-testid="reasoning-proposition">
          <span style={dim}>{LABELS.tested}</span> <q>{before.proposition}</q>
        </div>
      )}
      {before.predicts !== undefined && (
        <div data-testid="reasoning-predicts">
          <span style={dim}>{LABELS.predicts}</span> <q>{before.predicts}</q>
        </div>
      )}
    </div>
  );
}

/** The ONE line the simple view quotes: the first assertion, the `settles`, or the `line`. */
function QuotedLine({ after }: { readonly after: StandingShape }): React.ReactElement | null {
  const first = after.assertions[0];
  if (after.standing === 'fact' && first !== undefined) {
    return (
      <div style={mono} data-testid="reasoning-line">
        <AssertionText assertion={first} />
      </div>
    );
  }
  if (after.settles !== undefined) {
    return (
      <div style={mono} data-testid="reasoning-line">
        <span style={dim}>{LABELS.settles}</span> <q>{after.settles}</q>
      </div>
    );
  }
  if (after.line !== undefined) {
    return (
      <div style={mono} data-testid="reasoning-line">
        <span style={dim}>{LABELS.line}</span> <q>{after.line}</q>
      </div>
    );
  }
  return null;
}

/** The disclosure: every assertion, the full ids, the result's size, the ticket on the wire. */
function Details({ card }: { readonly card: ReasoningCard }): React.ReactElement {
  const { after } = card;
  return (
    <div style={{ ...mono, ...detailsBody }}>
      <div>
        <code>{card.toolCallId}</code>
      </div>
      {card.result !== undefined && <ResultLine result={card.result} />}
      {after?.ref !== undefined && (
        <div>
          <span style={dim}>{LABELS.ref}</span> <code>{after.ref}</code>
        </div>
      )}
      {card.collapsed !== undefined && (
        <div data-testid="reasoning-ticket">
          <span style={dim}>{LABELS.ticket}</span> <code>{card.collapsed}</code>
        </div>
      )}
      {after !== undefined && after.assertions.length > 0 && (
        <div>
          <span style={dim}>
            {LABELS.assertions} · {after.assertions.length}
          </span>
          <ul style={list}>
            {after.assertions.map((a, i) => (
              <li key={i} data-testid="reasoning-assertion">
                <AssertionText assertion={a} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {after?.settles !== undefined && (
        <div>
          <span style={dim}>{LABELS.settles}</span> <q>{after.settles}</q>
        </div>
      )}
      {after?.line !== undefined && (
        <div>
          <span style={dim}>{LABELS.line}</span> <q>{after.line}</q>
        </div>
      )}
    </div>
  );
}

/** The result as the record sizes it: the ticket's ref and bytes, or the chars held. */
function ResultLine({ result }: { readonly result: ResultShape }): React.ReactElement {
  if ('placed' in result) {
    return (
      <div data-testid="reasoning-result" data-placed="true">
        <span style={dim}>{LABELS.placed}</span> <code>{result.placed.ref}</code>
        {result.placed.bytes !== undefined && (
          <span style={dim}>
            {' '}
            · {result.placed.bytes} {LABELS.bytes}
          </span>
        )}
      </div>
    );
  }
  return (
    <div data-testid="reasoning-result" data-chars={result.chars}>
      <span style={dim}>{LABELS.result}</span> {result.chars} {LABELS.chars}
    </div>
  );
}

/** `kind/id · predicate = value` — the assertion's own parts. */
function AssertionText({ assertion }: { readonly assertion: AssertionShape }): React.ReactElement {
  return (
    <span>
      <code>
        {assertion.subject.kind}/{assertion.subject.id}
      </code>
      {' · '}
      <code>{assertion.predicate}</code>
      {' = '}
      <code>{valueText(assertion.value)}</code>
    </span>
  );
}

/** A value as the record spells it: a string bare, anything else as JSON. */
function valueText(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value) ?? String(value);
}

// ─── The answer card ──────────────────────────────────────────────────────

function Answer({ answer }: { readonly answer: AnswerCard }): React.ReactElement {
  const counts: readonly (readonly [string, number])[] = [
    [LABELS.facts, answer.facts],
    [LABELS.limitations, answer.limitations],
    [LABELS.evidenceRefs, answer.evidenceRefs],
    [LABELS.nextSteps, answer.nextSteps],
    [LABELS.noise, answer.noise],
    [LABELS.undeclared, answer.undeclared],
  ];
  return (
    <div style={cardStyle} data-testid="reasoning-answer" data-answer-ask={answer.answerAsk === undefined ? '' : String(answer.answerAsk)}>
      <div style={row}>
        <span style={strong}>{LABELS.answer}</span>
        {answer.serve !== undefined && (
          <Chip testId="reasoning-serve" color={T.textMuted}>
            {LABELS.serve} {answer.serve}
          </Chip>
        )}
        {answer.answerAsk !== undefined && (
          <Chip testId="reasoning-answer-ask" color={T.textMuted}>
            {LABELS.answerAsk} {valueText(answer.answerAsk)}
          </Chip>
        )}
      </div>
      <div style={{ ...row, ...mono }}>
        {counts.map(([label, n]) => (
          <span key={label} data-testid="reasoning-count" data-bucket={label} data-count={n}>
            <span style={dim}>{label}</span> {n}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── The exchange view (0.63.0) ───────────────────────────────────────────

/** The beats in wire order, the model's on the left and the tools' on the right. */
function Exchange({ beats }: { readonly beats: readonly ExchangeBeat[] }): React.ReactElement {
  return (
    <div style={exchangeStyle} data-testid="reasoning-exchange" data-beats={beats.length}>
      {beats.map((beat, i) => (
        <Beat key={i} beat={beat} />
      ))}
    </div>
  );
}

function Beat({ beat }: { readonly beat: ExchangeBeat }): React.ReactElement {
  const side = beat.side === 'model' ? modelBeat : toolBeat;
  const id = beat.kind === 'call' || beat.kind === 'result' ? beat.toolCallId : undefined;
  return (
    <div
      style={{ ...cardStyle, ...side }}
      data-testid="reasoning-beat"
      data-side={beat.side}
      data-kind={beat.kind}
      {...(id !== undefined ? { 'data-tool-call-id': id } : {})}
    >
      {beat.kind === 'call' && <CallBody beat={beat} />}
      {beat.kind === 'result' && <ResultBody beat={beat} />}
      {beat.kind === 'served' && <ServedBody beat={beat} />}
      {beat.kind === 'answer' && <AnswerBody beat={beat} />}
    </div>
  );
}

/** The emission: tool name, id, the `_findings` block first, then the remaining args. */
function CallBody({ beat }: { readonly beat: CallBeat }): React.ReactElement {
  return (
    <>
      <div style={row}>
        <span style={dim}>{LABELS.model}</span>
        <span style={strong}>{LABELS.call}</span>
        {beat.toolName !== undefined && <code style={strong}>{beat.toolName}</code>}
        <code style={mono}>{beat.toolCallId}</code>
        {beat.fromLedger && (
          <Chip testId="reasoning-from-ledger" color={T.warning}>
            {LABELS.fromLedger}
          </Chip>
        )}
      </div>
      {beat.findings !== undefined && (
        <div data-testid="reasoning-beat-findings">
          <span style={dim}>{LABELS.findings}</span>
          <Clipped text={pretty(beat.findings)} />
        </div>
      )}
      {beat.args !== undefined && (
        <div data-testid="reasoning-beat-args">
          <span style={dim}>{LABELS.args}</span>
          <Clipped text={pretty(beat.args)} />
        </div>
      )}
    </>
  );
}

/** The result as the tool returned it, the ticket the wire served instead, and the standing declared for it. */
function ResultBody({ beat }: { readonly beat: ResultBeat }): React.ReactElement {
  const standing = beat.after?.standing;
  return (
    <>
      <div style={row}>
        <span style={dim}>{LABELS.tool}</span>
        <span style={strong}>{LABELS.result}</span>
        {beat.toolName !== undefined && <code style={strong}>{beat.toolName}</code>}
        <code style={mono}>{beat.toolCallId}</code>
        {beat.collapsed !== undefined && (
          <Chip testId="reasoning-collapsed" color={T.textMuted} title={beat.collapsed.standing}>
            {LABELS.collapsed} {beat.collapsed.standing}
          </Chip>
        )}
      </div>
      {beat.placed !== undefined ? <ResultLine result={{ placed: beat.placed }} /> : <Clipped text={prettyContent(beat.content)} testId="reasoning-beat-content" />}
      {beat.collapsed !== undefined && (
        <div data-testid="reasoning-beat-ticket">
          <span style={dim}>{LABELS.ticket}</span>
          <Clipped text={prettyContent(beat.collapsed.content)} />
        </div>
      )}
      <div style={row} data-testid="reasoning-after">
        <span style={dim}>{LABELS.standing}</span>
        <Chip testId="reasoning-standing" color={standing !== undefined ? standingColor(standing) : T.textMuted}>
          {standing ?? LABELS.undeclared}
        </Chip>
        {beat.after?.declaredOn !== undefined && (
          <span style={dim} data-testid="reasoning-declared-on">
            {LABELS.declaredOn}{' '}
            <code style={mono}>{beat.after.declaredOn === 'answer' ? beat.after.declaredOn : beat.after.declaredOn.toolCallId}</code>
          </span>
        )}
      </div>
      {beat.after !== undefined && <QuotedLine after={beat.after} />}
    </>
  );
}

/** The findings piece as served for the answer turn, under its own source name. */
function ServedBody({ beat }: { readonly beat: ServedBeat }): React.ReactElement {
  return (
    <>
      <div style={row}>
        <span style={dim}>{LABELS.model}</span>
        <span style={strong}>{LABELS.served}</span>
        <code style={mono}>{beat.source}</code>
      </div>
      <Clipped text={beat.text} testId="reasoning-beat-content" />
    </>
  );
}

/** The answer as the record holds it, and the field it was read from. */
function AnswerBody({ beat }: { readonly beat: AnswerBeat }): React.ReactElement {
  return (
    <>
      <div style={row}>
        <span style={dim}>{LABELS.model}</span>
        <span style={strong}>{LABELS.answer}</span>
        <code style={mono} data-testid="reasoning-answer-from">
          {beat.from}
        </code>
      </div>
      <Clipped text={beat.text} testId="reasoning-beat-content" />
    </>
  );
}

const CLIP_LINES = 12;

/** A `<pre>` of the first lines; the rest behind a native `<details>` (the browser's bit, not a cursor). */
function Clipped({ text, testId }: { readonly text: string; readonly testId?: string }): React.ReactElement {
  const lines = text.split('\n');
  const head = lines.slice(0, CLIP_LINES).join('\n');
  const tail = lines.slice(CLIP_LINES);
  return (
    <div data-testid={testId ?? 'reasoning-clipped'} data-lines={lines.length}>
      <pre style={pre} data-testid="reasoning-pre">
        {head}
      </pre>
      {tail.length > 0 && (
        <details style={detailsStyle} data-testid="reasoning-more">
          <summary style={summaryStyle}>
            {tail.length} {LABELS.lines}
          </summary>
          <pre style={pre} data-testid="reasoning-pre">
            {tail.join('\n')}
          </pre>
        </details>
      )}
    </div>
  );
}

/** A value as JSON, two-space indented. */
function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? String(value);
}

/** A content string pretty-printed when it parses as JSON, else verbatim; a non-string as JSON. */
function prettyContent(content: unknown): string {
  if (typeof content !== 'string') return pretty(content);
  try {
    return pretty(JSON.parse(content));
  } catch {
    return content;
  }
}

// ─── Chips and styles ─────────────────────────────────────────────────────

function standingColor(standing: string): string {
  if (standing === 'fact') return T.success;
  if (standing === 'ruled-out') return T.error;
  if (standing === 'open') return T.warning;
  return T.textMuted;
}

function Chip({
  children,
  color,
  testId,
  title,
}: {
  readonly children: React.ReactNode;
  readonly color: string;
  readonly testId: string;
  readonly title?: string;
}): React.ReactElement {
  return (
    <span style={{ ...chip, borderColor: color, color }} data-testid={testId} {...(title !== undefined ? { title } : {})}>
      {children}
    </span>
  );
}

// One-word CSS literals only: the own-claims walker reads every string.
const panel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 10,
  fontSize: 13,
  fontFamily: T.fontSans,
  color: T.textPrimary,
};
const header: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 };
const title: React.CSSProperties = { fontWeight: 600 };
const strong: React.CSSProperties = { fontWeight: 600 };
const dim: React.CSSProperties = { color: T.textMuted };
const mono: React.CSSProperties = { fontFamily: T.fontMono, fontSize: 12, wordBreak: 'break-word' };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 };
const cardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '6px 8px',
  border: '1px solid',
  borderColor: T.border,
  borderRadius: 6,
  background: T.bgSecondary,
};
const chip: React.CSSProperties = {
  padding: '0 6px',
  borderRadius: 8,
  fontSize: 11,
  border: '1px solid',
  whiteSpace: 'nowrap',
};
const detailsStyle: React.CSSProperties = { fontSize: 12 };
// The exchange: a column of beats, each at most half the width on a wide
// panel and the whole width on a narrow one — `max(50%,min(100%,320px))`
// — the model's on the left, the tools' on the right.
const column: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
const exchangeStyle: React.CSSProperties = column;
const modelBeat: React.CSSProperties = { alignSelf: 'flex-start', width: 'max(50%,min(100%,320px))', borderColor: T.primary };
const toolBeat: React.CSSProperties = { alignSelf: 'flex-end', width: 'max(50%,min(100%,320px))', borderColor: T.border };
const pre: React.CSSProperties = { ...mono, margin: '2px 0 0', whiteSpace: 'pre-wrap', maxWidth: '100%' };
const toggleRow: React.CSSProperties = { display: 'inline-flex', gap: 4, marginLeft: 'auto' };
function toggleButton(on: boolean): React.CSSProperties {
  return {
    fontSize: 10.5,
    padding: '1px 6px',
    borderRadius: 6,
    border: '1px solid',
    borderColor: on ? T.primary : T.border,
    background: on ? T.bgTertiary : T.bgElevated,
    color: on ? T.textPrimary : T.textSecondary,
    cursor: 'pointer',
  };
}
const summaryStyle: React.CSSProperties = { cursor: 'pointer', color: T.textMuted };
const detailsBody: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 4 };
const list: React.CSSProperties = { margin: '2px 0 0', paddingLeft: 18 };
