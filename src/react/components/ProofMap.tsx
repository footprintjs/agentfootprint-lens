/**
 * <ProofMap> — what the answer rests on, as ONE graph drawn from the record
 * at the cursor (agentfootprint 9.110.0, `AgentState.findingsLedger` with
 * its `contingent` rows; `unsupportedValues`; the run constant `ontology`).
 *
 * WHY. A proof a person can trust needs a dependency diagram: what rests on
 * what, drawn so the reader sees at a glance which lemma every conclusion
 * stands on and which of those lemmas was set aside. Our record holds every
 * one of those edges already — the standings the model declared on the
 * answer, the results each call produced, the tool each call ran, the source
 * the map says a tool reads, the values the model USED that came only from
 * results it had itself called open, noise or ruled out (the library's
 * `contingent` row: "no towers on unverified lemmas"), and the values no
 * result carried at all. Nobody drew them in one place. This view does:
 * columns left to right — the ANSWER, the CALLS (each carrying its declared
 * standing as a chip colour; undeclared = dashed), the TOOLS, the SOURCES
 * (from the ontology's own `via` join, when a map was declared) — with the
 * `stands on` edges from the answer to every result declared on it, `calls`
 * edges call → tool, `reads` edges tool → source, and two overlays in their
 * own strokes: `contingent` (dashed, the warning colour: from the user of
 * the value — the answer, or the call whose arguments carried it — to each
 * carrier, labelled with the carrier's standing, the value in the title) and
 * `conflict` (the error colour, between the witnesses of one key). Beside the
 * chart, the same data as a list — for a screen reader, and for a test.
 *
 * THE LAWS THIS FILE KEEPS:
 *
 *   1. OMIT, NEVER DENY. The view renders nothing at all when the fold at the
 *      stop holds no `findingsLedger` (an unarmed run, or a stop before the
 *      first basis row) — a proof map is a reading of declared standings, and
 *      a run that declared none has nothing to draw, the `<FindingsBand>` /
 *      `<ReasoningLens>` precedent. Before the answer, the answer column is
 *      simply absent and the map is the calls' map. A node prints no field
 *      the record does not carry; a result no standing row names is
 *      UNDECLARED — that word, dashed, never `open`.
 *   2. NEVER INFER. Every edge is a row: a `stands on` edge is a standing row
 *      with `declaredOn: 'answer'`; a `contingent` edge is a `contingent`
 *      row's carrier; a `conflict` edge is a `conflict` row's witness pair;
 *      a `reads` edge is a `via` name in the declared map. The judge's
 *      standing (a `judgment` row) is a SECOND, dimmer chip, never merged
 *      with the model's.
 *   3. NO SENTENCE OF ITS OWN. Every printed string is a value off the record
 *      — an id, a tool name, a standing word, a value, a key, a source's
 *      meaning — or a `LABELS` entry; `test/served/no-own-claims.test.ts`
 *      walks this file.
 *   4. THE SAME BYTES TWICE. Layout is a function of the fold alone: calls in
 *      ledger order (the basis rows' own order), tools and sources sorted by
 *      id, one lane per overlay edge in row order — no force layout, no
 *      measurement, no randomness, no clock.
 *   5. ONE CURSOR. The view reads the fold at the stop it is handed — the
 *      host's `cursor`, or the `shared` address read over this view's axis —
 *      and holds no cursor of its own; with neither it reads the run's end,
 *      stateless, and mounts no mover.
 *   6. A SHAPE THE VIEW DOES NOT OWN. Every row is narrowed by its shape
 *      (`foldFindings` for standings and conflicts, `contingentOf`,
 *      `judgmentOf`, `ontologyRecordOf`, `unsupportedOf`) and a row that does
 *      not fit is passed over.
 *
 * `foldProofMap(input)` is the pure fold and `layoutProofMap(fold)` the pure
 * layout — both exported for a consumer with its own UI.
 */
import React, { useMemo } from 'react';

import { contextAt } from '../../core/context/contextAt.js';
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
import type { ConflictItem } from '../../core/context/findings.js';
import {
  proofMapAt,
  type ContingentShape,
  type ProofAnswer,
  type ProofCall,
  type ProofFold,
  type ProofSource,
} from '../../core/context/proofMap.js';
import {
  GEOMETRY,
  overlayLabels,
  layoutProofMap,
  proofNodeKey,
  type PlacedNode,
  type ProofEdgeKind,
  type ProofLayout,
  type ProofNodeKind,
} from '../../core/context/proofMapLayout.js';

export {
  foldProofMap,
  type CarrierShape,
  type ContingentShape,
  type ProofAnswer,
  type ProofCall,
  type ProofFold,
  type ProofMapInput,
  type ProofSource,
} from '../../core/context/proofMap.js';
export {
  GEOMETRY,
  layoutProofMap,
  type PlacedEdge,
  type PlacedNode,
  type ProofEdgeKind,
  type ProofLayout,
  type ProofNodeKind,
} from '../../core/context/proofMapLayout.js';

/** Every string this view owns — names for columns, edges, chips and fields, never a sentence. */
export const LABELS = Object.freeze({
  view: 'Proof map',
  answer: 'answer',
  calls: 'calls',
  tools: 'tools',
  sources: 'sources',
  standsOn: 'stands on',
  reads: 'reads',
  contingent: overlayLabels.contingent,
  conflict: overlayLabels.conflict,
  unsupported: 'unsupported',
  undeclared: 'undeclared',
  judged: 'judged',
  assertions: 'assertions',
  basis: 'basis',
  standing: 'standing',
  carriers: 'carriers',
  declaredOn: 'declared on',
  value: 'value',
  chart: 'chart',
  list: 'list',
});

// ─── The view ──────────────────────────────────────────────────────────────

export interface ProofMapProps {
  /** The recording or a runner with `getLastSnapshot()` — the same input the Context view takes. */
  readonly runner: unknown;
  /** THE cursor, when a host holds it per axis. */
  readonly cursor?: LensCursor;
  /**
   * The HOST's one cursor across every lens it mounts (`useSharedCursor`).
   * Read over the recorder's grouped axis when `recorder` is given, else
   * over the milestone axis read off the snapshot. `cursor` wins when supplied.
   * With neither, the view reads the run's END — stateless, no mover.
   */
  readonly shared?: SharedCursor;
  /** The recorder whose grouped axis a `shared` view reads. */
  readonly recorder?: LensRecorder;
  /** The recording's event stream, handed to `contextAt` (a replay's `getEntries()`). */
  readonly events?: readonly EventLogEntry[];
}

function positionsOf(snapshot: unknown): readonly CursorPosition[] {
  return tagAxisPositions(snapshot, MILESTONE_AXIS, []);
}

const noMove = (): void => undefined;

export function ProofMap(props: ProofMapProps): React.ReactElement | null {
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
    () => contextAt(snapshot, foldCursorOf(cursor.at), { events }),
    [snapshot, cursor.at.runtimeStageId, cursor.at.commitIdx, cursor.at.foldCommitIdx, events],
  );
  const fold = useMemo(() => proofMapAt(context), [context]);
  const layout = useMemo(() => (fold === undefined ? undefined : layoutProofMap(fold)), [fold]);

  // THE transport: the same component the other views mount. It belongs here
  // when the cursor is the shared address — a per-axis `cursor` from a slot
  // brings the host's mover — and only while the address stands on this axis.
  const mover = props.cursor === undefined && shared !== undefined && cursor.total > 0 && cursor.at.step >= 0;

  // Omit, never deny: no ledger at the stop, nothing drawn — but the
  // TRANSPORT stays whenever this view holds the shared address (0.66.1). A
  // person who stepped back to a stop before the first row must be able to
  // step forward again from here; a view that took the mover with it left
  // them standing in an empty pane with no way out (the first host's report).
  const drawn = fold !== undefined && layout !== undefined;
  if (!drawn && !mover) return null;
  return (
    <div
      style={panel}
      data-testid="proof-map"
      data-drawn={String(drawn)}
      {...(drawn && {
        'data-answer': String(fold.answer !== undefined),
        'data-calls': fold.calls.length,
        'data-contingent': fold.contingent.length,
      })}
      data-step={cursor.at.step}
      data-commit={cursor.at.commitIdx}
    >
      <div style={header}>
        <span style={title}>{LABELS.view}</span>
        {/* The counts are DATA at every stop: at a stop before the first row
            they read 0 · 0, which is what the record holds there — the sign
            that an empty pane is the record's, not a failure (0.66.2). */}
        <span style={dim} data-testid="proof-counts">
          {drawn ? fold.calls.length : 0} {LABELS.calls} · {drawn ? fold.tools.length : 0} {LABELS.tools}
          {drawn && fold.sources !== undefined && (
            <>
              {' · '}
              {fold.sources.length} {LABELS.sources}
            </>
          )}
        </span>
      </div>
      {mover && (
        <div data-testid="proof-transport">
          <TimeTravel
            total={cursor.total}
            focusSeq={Math.max(0, cursor.at.step)}
            onFocusChange={(n) => cursor.moveTo(n)}
            isLive={false}
            compact
          />
        </div>
      )}
      {drawn && (
        <div style={body}>
          <Chart fold={fold} layout={layout} />
          <List fold={fold} />
        </div>
      )}
    </div>
  );
}

// ─── The chart ─────────────────────────────────────────────────────────────

const SHORT_ID = 12;
const CLIP = 20;

/** The arrowhead, as `x,y` pairs — built from numbers at render so no string holds a shape of its own and the module stays side-effect free. */
const ARROW = [
  [0, 0],
  [8, 4],
  [0, 8],
] as const;
function arrowPoints(): string {
  return ARROW.map((p) => p.join(',')).join(' ');
}

/** A value clipped to the box, the whole on hover — never paraphrased. */
function clip(text: string, max: number = CLIP): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function shortId(id: string): string {
  return id.length > SHORT_ID ? `${id.slice(0, SHORT_ID)}…` : id;
}

/** The chip colour a standing word takes — the four the library names; anything else muted. */
function standingColor(standing: string): string {
  if (standing === 'fact') return T.success;
  if (standing === 'ruled-out') return T.error;
  if (standing === 'noise') return T.warning;
  return T.textMuted;
}

function edgeColor(kind: ProofEdgeKind): string {
  if (kind === 'stands-on') return T.primary;
  if (kind === 'contingent') return T.warning;
  if (kind === 'conflict') return T.error;
  return T.srcTool;
}

function Chart({ fold, layout }: { readonly fold: ProofFold; readonly layout: ProofLayout }): React.ReactElement {
  const calls = new Map(fold.calls.map((c) => [c.toolCallId, c]));
  const sources = new Map((fold.sources ?? []).map((s) => [s.id, s]));
  const arrow = `proof-arrow-${fold.calls.length}-${fold.contingent.length}`;
  return (
    <svg
      role="img"
      aria-label={LABELS.chart}
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      style={chartStyle}
      data-testid="proof-chart"
    >
      <defs>
        <marker id={arrow} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <polygon points={arrowPoints()} fill={T.textMuted} />
        </marker>
      </defs>
      <Headings layout={layout} />
      {layout.edges.map((e, i) => (
        <g key={`${e.kind}:${e.from}:${e.to}:${i}`} data-testid="proof-edge" data-kind={e.kind} data-from={e.from} data-to={e.to}>
          {e.title !== undefined && <title>{e.title}</title>}
          <path
            d={e.path}
            fill="none"
            stroke={edgeColor(e.kind)}
            strokeWidth={e.kind === 'stands-on' ? 1.75 : 1.25}
            strokeDasharray={e.kind === 'contingent' ? '4 3' : undefined}
            markerEnd={`url(#${arrow})`}
          />
          {e.label.length > 0 && (
            <text x={e.labelX} y={e.labelY} style={edgeText} fill={edgeColor(e.kind)} textAnchor={e.kind === 'stands-on' ? 'middle' : 'start'}>
              {e.label}
            </text>
          )}
        </g>
      ))}
      {layout.nodes.map((n) => (
        <Node key={proofNodeKey(n.kind, n.id)} node={n} fold={fold} call={calls.get(n.id)} source={sources.get(n.id)} />
      ))}
    </svg>
  );
}

function Headings({ layout }: { readonly layout: ProofLayout }): React.ReactElement {
  const y = GEOMETRY.padding + 14;
  const heading = (kind: ProofNodeKind, label: string): React.ReactElement | null => {
    const x = layout.columns[kind];
    return x === undefined ? null : (
      <text key={kind} x={x} y={y} style={headingText} fill={T.textMuted} data-testid="proof-column" data-kind={kind}>
        {label}
      </text>
    );
  };
  return (
    <>
      {heading('answer', LABELS.answer)}
      {heading('call', LABELS.calls)}
      {heading('tool', LABELS.tools)}
      {heading('source', LABELS.sources)}
    </>
  );
}

function Node({
  node,
  fold,
  call,
  source,
}: {
  readonly node: PlacedNode;
  readonly fold: ProofFold;
  readonly call?: ProofCall;
  readonly source?: ProofSource;
}): React.ReactElement {
  const { nodeWidth, nodeHeight } = GEOMETRY;
  const standing = node.kind === 'call' ? call?.standing?.standing : undefined;
  const undeclared = node.kind === 'call' && standing === undefined;
  const stroke = node.kind === 'answer' ? T.primary : node.kind === 'call' ? (standing !== undefined ? standingColor(standing) : T.textMuted) : T.srcTool;
  const title = node.kind === 'answer' ? fold.answer?.unsupported.join(' · ') || LABELS.answer : node.kind === 'source' ? (source?.meaning ?? node.id) : node.id;
  return (
    <g
      transform={`translate(${node.x} ${node.y})`}
      data-testid="proof-node"
      data-kind={node.kind}
      data-id={node.id}
      {...(node.kind === 'call' ? { 'data-standing': standing ?? LABELS.undeclared } : {})}
    >
      <title>{title}</title>
      <rect
        width={nodeWidth}
        height={nodeHeight}
        rx={node.kind === 'tool' || node.kind === 'source' ? 2 : 8}
        fill={T.bgSecondary}
        stroke={stroke}
        strokeWidth={node.kind === 'answer' ? 2 : 1.25}
        strokeDasharray={undeclared ? '4 3' : undefined}
      />
      {node.kind === 'answer' && <AnswerNode answer={fold.answer} />}
      {node.kind === 'call' && call !== undefined && <CallNode call={call} />}
      {(node.kind === 'tool' || node.kind === 'source') && (
        <text x={8} y={26} style={nodeIdText} fill={T.textPrimary}>
          {clip(node.id)}
        </text>
      )}
    </g>
  );
}

/** The answer box: its label, and the count of values nothing carried as a chip. */
function AnswerNode({ answer }: { readonly answer?: ProofAnswer }): React.ReactElement {
  const unsupported = answer?.unsupported.length ?? 0;
  return (
    <>
      <text x={8} y={26} style={nodeIdText} fill={T.textPrimary}>
        {LABELS.answer}
      </text>
      {unsupported > 0 && (
        <text x={GEOMETRY.nodeWidth - 8} y={26} style={chipText} fill={T.warning} textAnchor="end" data-testid="proof-unsupported-chip">
          {unsupported} {LABELS.unsupported}
        </text>
      )}
    </>
  );
}

/** A call box: tool name and short id on the first line; the standing chip, the judge's beside it, the assertions count on the second. */
function CallNode({ call }: { readonly call: ProofCall }): React.ReactElement {
  const standing = call.standing?.standing;
  const assertions = call.standing?.assertions.length ?? 0;
  return (
    <>
      <text x={8} y={17} style={nodeIdText} fill={T.textPrimary}>
        {call.toolName !== undefined ? `${clip(call.toolName, 14)} ` : ''}
        <tspan style={monoText} fill={T.textSecondary}>
          {shortId(call.toolCallId)}
        </tspan>
      </text>
      <text x={8} y={34} style={chipText} fill={standing !== undefined ? standingColor(standing) : T.textMuted}>
        {standing ?? LABELS.undeclared}
        {call.judged !== undefined && (
          <tspan fill={T.textMuted} opacity={0.7} data-testid="proof-judged-chip">
            {' · '}
            {LABELS.judged} {call.judged}
          </tspan>
        )}
      </text>
      {assertions > 0 && (
        <text x={GEOMETRY.nodeWidth - 8} y={34} style={chipText} fill={T.textSecondary} textAnchor="end">
          {assertions} {LABELS.assertions}
        </text>
      )}
    </>
  );
}

// ─── The list ──────────────────────────────────────────────────────────────

/** The same data as the chart, in reading order: the answer, the calls, the contingent rows, the conflicts, the tools, the sources. */
function List({ fold }: { readonly fold: ProofFold }): React.ReactElement {
  return (
    <div style={listStyle} data-testid="proof-list" aria-label={LABELS.list}>
      {fold.answer !== undefined && <AnswerList answer={fold.answer} />}
      <Group label={LABELS.calls} count={fold.calls.length} testId="proof-calls">
        {fold.calls.map((c) => (
          <CallItem key={c.toolCallId} call={c} />
        ))}
      </Group>
      {fold.contingent.length > 0 && (
        <Group label={LABELS.contingent} count={fold.contingent.length} testId="proof-contingent-rows">
          {fold.contingent.map((c, i) => (
            <ContingentItem key={i} row={c} />
          ))}
        </Group>
      )}
      {fold.findings.conflicts.length > 0 && (
        <Group label={LABELS.conflict} count={fold.findings.conflicts.length} testId="proof-conflicts">
          {fold.findings.conflicts.map((c, i) => (
            <ConflictRow key={i} conflict={c} />
          ))}
        </Group>
      )}
      <Group label={LABELS.tools} count={fold.tools.length} testId="proof-tools">
        {fold.tools.map((t) => (
          <li key={t} data-testid="proof-tool" data-id={t}>
            <code style={strong}>{t}</code>
          </li>
        ))}
      </Group>
      {fold.sources !== undefined && (
        <Group label={LABELS.sources} count={fold.sources.length} testId="proof-sources">
          {fold.sources.map((s) => (
            <li key={s.id} data-testid="proof-source" data-id={s.id} data-tools={s.tools.join(',')}>
              <code style={strong}>{s.id}</code> <span>{s.meaning}</span>
              {s.tools.length > 0 && (
                <span style={dim}>
                  {' '}
                  <span>←</span> <code style={mono}>{s.tools.join(', ')}</code>
                </span>
              )}
            </li>
          ))}
        </Group>
      )}
    </div>
  );
}

function AnswerList({ answer }: { readonly answer: ProofAnswer }): React.ReactElement {
  return (
    <div data-testid="proof-answer" data-stands-on={answer.standsOn.length} data-unsupported={answer.unsupported.length}>
      <div style={groupHeading}>{LABELS.answer}</div>
      <ul style={list}>
        {answer.standsOn.map((s) => (
          <li key={s.toolCallId} data-testid="proof-stands-on" data-id={s.toolCallId} data-standing={s.standing}>
            <span style={dim}>{LABELS.standsOn}</span> <code style={mono}>{s.toolCallId}</code> <Chip color={standingColor(s.standing)}>{s.standing}</Chip>
          </li>
        ))}
        {answer.unsupported.map((v) => (
          <li key={v} data-testid="proof-unsupported" data-value={v}>
            <Chip color={T.warning}>{LABELS.unsupported}</Chip> <code style={mono}>{v}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CallItem({ call }: { readonly call: ProofCall }): React.ReactElement {
  const standing = call.standing?.standing;
  return (
    <li
      data-testid="proof-call"
      data-id={call.toolCallId}
      {...(call.toolName !== undefined ? { 'data-tool': call.toolName } : {})}
      {...(call.basis !== undefined ? { 'data-basis': call.basis } : {})}
      data-standing={standing ?? LABELS.undeclared}
      {...(call.judged !== undefined ? { 'data-judged': call.judged } : {})}
    >
      {call.toolName !== undefined && <code style={strong}>{call.toolName}</code>} <code style={mono}>{call.toolCallId}</code>
      {call.basis !== undefined && (
        <span style={dim}>
          {' '}
          {LABELS.basis} {call.basis}
        </span>
      )}{' '}
      <Chip color={standing !== undefined ? standingColor(standing) : T.textMuted}>{standing ?? LABELS.undeclared}</Chip>
      {call.standing !== undefined && call.standing.assertions.length > 0 && (
        <span style={dim}>
          {' '}
          {call.standing.assertions.length} {LABELS.assertions}
        </span>
      )}
      {call.judged !== undefined && (
        <Chip color={T.textMuted} testId="proof-judged">
          {LABELS.judged} {call.judged}
        </Chip>
      )}
      {call.conflicts.map((k) => (
        <Chip key={k} color={T.error} title={k}>
          {LABELS.conflict}
        </Chip>
      ))}
    </li>
  );
}

/** One contingent row verbatim: who used the value, the value, every carrier with its standing. */
function ContingentItem({ row }: { readonly row: ContingentShape }): React.ReactElement {
  const on = row.declaredOn === 'answer' ? row.declaredOn : row.declaredOn.toolCallId;
  return (
    <li data-testid="proof-contingent" data-declared-on={on} data-value={row.value}>
      <span style={dim}>{LABELS.declaredOn}</span> <code style={mono}>{on}</code> <span style={dim}>{LABELS.value}</span> <code style={mono}>{row.value}</code>{' '}
      <span style={dim}>{LABELS.carriers}</span>
      {row.carriers.map((c) => (
        <span key={c.toolCallId} data-testid="proof-carrier" data-id={c.toolCallId} data-standing={c.standing}>
          {' '}
          <code style={mono}>{c.toolCallId}</code> <Chip color={standingColor(c.standing)}>{c.standing}</Chip>
        </span>
      ))}
    </li>
  );
}

function ConflictRow({ conflict }: { readonly conflict: ConflictItem }): React.ReactElement {
  return (
    <li data-testid="proof-conflict" data-key={conflict.key}>
      <code style={mono}>{conflict.key}</code>
      {conflict.witnesses.map((w, i) => (
        <span key={i} data-testid="proof-witness" data-id={w.toolCallId} data-standing={w.standing ?? ''}>
          {' '}
          <code style={mono}>{w.toolCallId}</code>
          {w.standing !== undefined && <Chip color={standingColor(w.standing)}>{w.standing}</Chip>}
        </span>
      ))}
    </li>
  );
}

function Group({
  label,
  count,
  testId,
  children,
}: {
  readonly label: string;
  readonly count: number;
  readonly testId: string;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <div data-testid={testId} data-count={count}>
      <div style={groupHeading}>
        {label} · {count}
      </div>
      <ul style={list}>{children}</ul>
    </div>
  );
}

function Chip({ children, color, testId, title }: { readonly children: React.ReactNode; readonly color: string; readonly testId?: string; readonly title?: string }): React.ReactElement {
  return (
    <span style={{ ...chip, borderColor: color, color }} {...(testId !== undefined ? { 'data-testid': testId } : {})} {...(title !== undefined ? { title } : {})}>
      {children}
    </span>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
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
const header: React.CSSProperties = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 };
const title: React.CSSProperties = { fontWeight: 600 };
const strong: React.CSSProperties = { fontWeight: 600, fontFamily: T.fontMono, fontSize: 12 };
const dim: React.CSSProperties = { color: T.textMuted };
const mono: React.CSSProperties = { fontFamily: T.fontMono, fontSize: 12, wordBreak: 'break-word' };
const body: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16 };
const chartStyle: React.CSSProperties = { maxWidth: '100%', height: 'auto', fontFamily: T.fontSans, background: T.bgPrimary, borderRadius: 6 };
const headingText: React.CSSProperties = { fontSize: 11, fontWeight: 600 };
const edgeText: React.CSSProperties = { fontSize: 10, fontFamily: T.fontMono };
const nodeIdText: React.CSSProperties = { fontSize: 12, fontWeight: 600, fontFamily: T.fontMono };
const monoText: React.CSSProperties = { fontWeight: 400 };
const chipText: React.CSSProperties = { fontSize: 9, fontFamily: T.fontMono };
const listStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 240, flex: 1 };
const groupHeading: React.CSSProperties = { fontWeight: 600, color: T.textSecondary, fontSize: 12 };
const list: React.CSSProperties = { margin: '2px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 2 };
const chip: React.CSSProperties = {
  marginLeft: 6,
  padding: '0 6px',
  borderRadius: 8,
  fontSize: 11,
  border: '1px solid',
  whiteSpace: 'nowrap',
};
