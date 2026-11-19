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
 * standing — the last standing row per `toolCallId`, `core/context/findings.ts ·
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

import { contextAt } from '../../core/context/contextAt.js';
import type { ResultShape } from '../../core/context/reasoningResult.js';
import type { AnswerCard, BasisShape, ReasoningCard } from '../../core/context/reasoning.js';
import type { CallBeat, ResultBeat, ServedBeat, AnswerBeat, ExchangeBeat } from '../../core/context/reasoningExchange.js';
import { reasoningAt } from '../../core/context/reasoningAt.js';
import type { LensCursor } from '../../core/cursor/lensCursor.js';
import { lensCursorFrom } from '../../core/cursor/lensCursor.js';
import { foldCursorOf } from '../../core/cursor/foldAt.js';
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
import type { AssertionShape, StandingShape } from '../../core/context/findings.js';

export {
  foldReasoning, type BasisShape, type CollapsedShape, type ReasoningCard, type AnswerCard, type ReasoningFold, type ReasoningInput,
} from '../../core/context/reasoning.js';
export {
  foldExchange, type EmittedCallShape, type CallBeat, type ResultBeat, type ServedBeat, type AnswerBeat, type ExchangeBeat, type ExchangeFold,
} from '../../core/context/reasoningExchange.js';
export type { PlacedShape, ResultShape } from '../../core/context/reasoningResult.js';

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
  return tagAxisPositions(snapshot, MILESTONE_AXIS, []);
}

const noMove = (): void => undefined;

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
    () => contextAt(snapshot, foldCursorOf(cursor.at), { events }),
    [snapshot, cursor.at.runtimeStageId, cursor.at.commitIdx, cursor.at.foldCommitIdx, events],
  );
  const model = useMemo(() => reasoningAt(context), [context]);
  const { reasoning: fold, coverage: declared } = model;

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
  const drawn = fold !== undefined || declared !== undefined;
  if (!drawn && !mover) return null;
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
        {/* The count is DATA at every stop — 0 before the first row (0.66.2). */}
        <span style={dim}>
          {fold !== undefined ? fold.cards.length : 0} {LABELS.calls}
        </span>
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
      {view === 'exchange' && model.exchange !== undefined && <Exchange beats={model.exchange().beats} />}
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
      {beat.followingText !== undefined && <Clipped text={beat.followingText} testId="reasoning-beat-content" />}
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
