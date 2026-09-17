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
 *      stop holds no `findingsLedger` (an unarmed run, or a stop before the
 *      first declaration); a card prints no field the row does not carry; a
 *      result no standing row names is UNDECLARED — that word, never `open`.
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
 */
import React, { useMemo } from 'react';

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
import type { SharedCursor } from '../useSharedCursor.js';
import { MILESTONE_AXIS } from './ContextView.js';
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

/** The collapsed tickets on the wire at the epoch, by the result's id. */
function collapsedById(asSent: readonly unknown[] | undefined): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const m of asSent ?? []) {
    if (!isRecord(m) || m.role !== 'tool') continue;
    const t = collapsedTicketOf(m.content);
    if (t !== undefined) out.set(t.toolCallId, t.standing);
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
        ...(onWire !== undefined ? { collapsed: onWire } : {}),
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
}

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
  const fold = useMemo(() => {
    if (rows === undefined) return undefined;
    const toolResults = arrayValue(context, 'toolResults');
    const history = arrayValue(context, 'history');
    const wire = context.served?.row.view.messages.asSent;
    return foldReasoning({
      rows,
      ...(toolResults !== undefined ? { toolResults } : {}),
      ...(history !== undefined ? { history } : {}),
      ...(Array.isArray(wire) ? { asSent: wire } : {}),
      findingsServe: keyValue(context, 'findingsServe'),
      findingsAnswerAsk: keyValue(context, 'findingsAnswerAsk'),
    });
  }, [context, rows]);

  // Omit, never deny: no ledger at the stop, nothing drawn.
  if (fold === undefined) return null;
  return (
    <div style={panel} data-testid="reasoning-lens" data-step={cursor.at.step} data-commit={cursor.at.commitIdx} data-calls={fold.cards.length}>
      <div style={header}>
        <span style={title}>{LABELS.lens}</span>
        <span style={dim}>
          {fold.cards.length} {LABELS.calls}
        </span>
      </div>
      {fold.cards.map((card) => (
        <Card key={card.toolCallId} card={card} />
      ))}
      {fold.answer !== undefined && <Answer answer={fold.answer} />}
    </div>
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
const summaryStyle: React.CSSProperties = { cursor: 'pointer', color: T.textMuted };
const detailsBody: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 4 };
const list: React.CSSProperties = { margin: '2px 0 0', paddingLeft: 18 };
