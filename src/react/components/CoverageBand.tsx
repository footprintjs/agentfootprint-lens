/**
 * <CoverageBand> — what the tools DECLARED they checked, did not check, and
 * can never cover, at the cursor (agentfootprint 9.109,
 * `AgentState.coverageDeclared`).
 *
 * WHY. A tool that returns `coverage(result, {...})` or `absent({...})` hands
 * the run three lists only the tool knows — `checked`, `notChecked`,
 * `cannotCover` — and the dispatch loop appends one `DeclaredCoverage` row per
 * declaration to the TRACKED key `coverageDeclared`, in the order the results
 * landed (`stages/toolCalls.ts · declareCoverage`). Under
 * `.limitsTravelWithTheAnswer()` the library folds every row into one block
 * and appends it to the answer (`coverage/answer.ts ·
 * composeAnswerWithCoverage`): the three sections in that order, each deduped
 * by `coverage/items.ts · sameItem` and folded at twelve entries. The owner's
 * ruling (2026-09-18): that block belongs in the LENS, not on the answer the
 * end user reads — so this band shows everything the append showed, and
 * more: the merged boundary WITH the tool names that declared each item (the
 * append never said which), and under it every declaration by call, as the
 * record holds it. The key is tracked, so the fold at a stop already answers
 * "what had landed by then": a stop before the first declaration draws
 * nothing, a later stop draws what the tools had declared by that stop.
 *
 * THE LAWS THIS FILE KEEPS:
 *
 *   1. OMIT, NEVER DENY. No `coverageDeclared` at the stop, or an empty one,
 *      and nothing is drawn — an agent whose tools never declare has no
 *      band; an empty section is not rendered; a row prints no field it
 *      does not carry (`toolCallId`, `lookedFor`).
 *   2. THE LIBRARY'S OWN EQUALITY. The boundary dedupes with `sameItem`
 *      copied byte for byte from `agentfootprint · coverage/items.ts` — the
 *      same ground is the same `what` AND the same `why` (absent reads as
 *      empty) — never an equality of this file's own. Two entries that differ
 *      only in `why` are two entries, here as in the append.
 *   3. NO SENTENCE OF ITS OWN. Every printed string is a value off the record
 *      — a `what`, a `why`, a `lookedFor`, a tool name, an id, the record's
 *      own word for `kind` — or a `LABELS` entry; the section headings are
 *      the record's own field names. `test/served/no-own-claims.test.ts`
 *      walks this file.
 *   4. ONE CURSOR. The band reads the fold at the stop it is handed — the
 *      host's `cursor`, or the `shared` address read over this view's axis —
 *      and holds no cursor of its own; it mounts NO mover (a band sits under
 *      a view, and the view holds the transport: `<ReasoningLens>` mounts it
 *      with the cursor the lens already resolved). With neither it reads the
 *      run's end, stateless.
 *   5. A SHAPE THE LENS DOES NOT OWN. The rows came off a recording as JSON,
 *      so every row is narrowed by its shape (`coverageRecordOf`) and a row
 *      that does not fit is passed over, one by one, the way
 *      `FindingsBand.tsx · standingOf` reads a row.
 *   6. STATELESS. The fold past twelve entries opens in a native `<details>`
 *      (the `<ServedGraph>` precedent): the open bit is the browser's, not a
 *      second cursor and not React state.
 *
 * `foldCoverage(rows)` is the pure fold — exported for a consumer with its
 * own UI — and `<CoverageRows rows>` the band over rows already in hand, so
 * a view that has folded the stop once mounts the band without folding again.
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

/**
 * Every string this band owns — names for the band, its two parts and its
 * fields, never a sentence. The three section headings are the record's own
 * field names (`DeclaredCoverage.checked` / `notChecked` / `cannotCover`).
 */
export const LABELS = Object.freeze({
  band: 'coverage',
  declarations: 'declarations',
  /** The merged view — the three sections the answer's appended block carried. */
  boundary: 'the answer’s boundary',
  byCall: 'by call',
  checked: 'checked',
  notChecked: 'notChecked',
  cannotCover: 'cannotCover',
  lookedFor: 'looked for',
  iteration: 'iteration',
  more: 'more',
});

// ─── The row shapes this band reads (narrowed, never trusted whole) ──────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** One piece of ground as the record carries it: the author's `what`, and its `why` when written. */
export interface CoverageItemShape {
  readonly what: string;
  readonly why?: string;
}

/** The three lists of one declaration, by the record's own field names. */
export type CoverageSection = 'checked' | 'notChecked' | 'cannotCover';

/** One `DeclaredCoverage` row, as read: the call it came from and its three lists. */
export interface DeclaredCoverageShape {
  /** The record's own word — `absence` or `ledger` on a 9.109 record; printed, never mapped. */
  readonly kind: string;
  readonly toolName: string;
  readonly toolCallId?: string;
  readonly iteration: number;
  /** What the search was for — an absence carries it. */
  readonly lookedFor?: string;
  readonly checked: readonly CoverageItemShape[];
  readonly notChecked: readonly CoverageItemShape[];
  readonly cannotCover: readonly CoverageItemShape[];
}

function itemOf(v: unknown): CoverageItemShape | undefined {
  if (!isRecord(v) || typeof v.what !== 'string' || v.what.length === 0) return undefined;
  return Object.freeze({ what: v.what, ...(typeof v.why === 'string' ? { why: v.why } : {}) });
}

/** A list as the record carries it: absent reads as empty; a value that is not an array does not fit. */
function listOf(v: unknown): readonly CoverageItemShape[] | undefined {
  if (v === undefined) return Object.freeze([]);
  if (!Array.isArray(v)) return undefined;
  return Object.freeze(
    v.flatMap((entry) => {
      const item = itemOf(entry);
      return item !== undefined ? [item] : [];
    }),
  );
}

/** Narrow one row of `coverageDeclared` to the shape the band draws; anything else is nothing. */
export function coverageRecordOf(value: unknown): DeclaredCoverageShape | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.kind !== 'string' || value.kind.length === 0) return undefined;
  if (typeof value.toolName !== 'string' || typeof value.iteration !== 'number') return undefined;
  const checked = listOf(value.checked);
  const notChecked = listOf(value.notChecked);
  const cannotCover = listOf(value.cannotCover);
  if (checked === undefined || notChecked === undefined || cannotCover === undefined) return undefined;
  return Object.freeze({
    kind: value.kind,
    toolName: value.toolName,
    iteration: value.iteration,
    ...(typeof value.toolCallId === 'string' ? { toolCallId: value.toolCallId } : {}),
    ...(typeof value.lookedFor === 'string' ? { lookedFor: value.lookedFor } : {}),
    checked,
    notChecked,
    cannotCover,
  });
}

// ─── The fold ─────────────────────────────────────────────────────────────

/**
 * The library's own equality, copied byte for byte from `agentfootprint ·
 * coverage/items.ts · sameItem`: two entries are the same ground when they
 * say the same two things. Not an equality of this file's own.
 */
export function sameItem(a: CoverageItemShape, b: CoverageItemShape): boolean {
  return a.what === b.what && (a.why ?? '') === (b.why ?? '');
}

/** One merged entry: the ground, and the tools that declared it, in landed order. */
export interface BoundaryItem extends CoverageItemShape {
  readonly declaredBy: readonly string[];
}

/** The merged view — the three sections the appended block carried, in its order. */
export interface CoverageBoundary {
  readonly checked: readonly BoundaryItem[];
  readonly notChecked: readonly BoundaryItem[];
  readonly cannotCover: readonly BoundaryItem[];
}

export interface CoverageFold {
  readonly boundary: CoverageBoundary;
  /** Every well-formed declaration, in landed order — no dedupe across calls. */
  readonly calls: readonly DeclaredCoverageShape[];
}

/** Merge one section across the calls the way the append merges it (`mergeItems`), keeping who declared each entry. */
function mergeSection(calls: readonly DeclaredCoverageShape[], section: CoverageSection): readonly BoundaryItem[] {
  const out: { what: string; why?: string; declaredBy: string[] }[] = [];
  for (const call of calls) {
    for (const item of call[section]) {
      const seen = out.find((s) => sameItem(s, item));
      if (seen === undefined) out.push({ ...item, declaredBy: [call.toolName] });
      else if (!seen.declaredBy.includes(call.toolName)) seen.declaredBy.push(call.toolName);
    }
  }
  return Object.freeze(out.map((entry) => Object.freeze({ ...entry, declaredBy: Object.freeze(entry.declaredBy) })));
}

/**
 * Fold the rows for reading: the boundary (each section merged across the
 * calls in landed order, deduped by `sameItem`, every entry stamped with the
 * tools that declared it) and the calls themselves. Pure; a row that does
 * not fit the shape is passed over.
 */
export function foldCoverage(rows: readonly unknown[]): CoverageFold {
  const calls = Object.freeze(
    rows.flatMap((row) => {
      const call = coverageRecordOf(row);
      return call !== undefined ? [call] : [];
    }),
  );
  return Object.freeze({
    boundary: Object.freeze({
      checked: mergeSection(calls, 'checked'),
      notChecked: mergeSection(calls, 'notChecked'),
      cannotCover: mergeSection(calls, 'cannotCover'),
    }),
    calls,
  });
}

// ─── The band ─────────────────────────────────────────────────────────────

export interface CoverageBandProps {
  /** The recording or a runner with `getLastSnapshot()` — the same input the Context view takes. */
  readonly runner: unknown;
  /** THE cursor, when a host holds it per axis. */
  readonly cursor?: LensCursor;
  /**
   * The HOST's one cursor across every lens it mounts (`useSharedCursor`).
   * Read over the recorder's grouped axis when `recorder` is given, else
   * over the milestone axis read off the snapshot. `cursor` wins when supplied.
   * With neither, the band reads the run's END — stateless. No mover is
   * mounted here either way: the view above the band holds the transport.
   */
  readonly shared?: SharedCursor;
  /** The recorder whose grouped axis a `shared` band reads. */
  readonly recorder?: LensRecorder;
  /** The recording's event stream, handed to `contextAt` (a replay's `getEntries()`). */
  readonly events?: readonly EventLogEntry[];
}

function positionsOf(snapshot: unknown): readonly CursorPosition[] {
  return tagAxisPositions(snapshot, MILESTONE_AXIS, []) ?? [];
}

const noMove = (): void => undefined;

/** The value of one top-level key of the fold at the stop, when it holds an array. */
function arrayValue(context: ContextAt, path: string): readonly unknown[] | undefined {
  const v = context.keys.find((k) => k.path === path)?.value;
  return Array.isArray(v) ? v : undefined;
}

export function CoverageBand(props: CoverageBandProps): React.ReactElement | null {
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
  const rows = arrayValue(context, 'coverageDeclared');
  // Omit, never deny: no declaration at the stop, nothing drawn.
  if (rows === undefined || rows.length === 0) return null;
  return <CoverageRows rows={rows} step={cursor.at.step} commit={cursor.at.commitIdx} />;
}

export interface CoverageRowsProps {
  /** `coverageDeclared` as the fold holds it at the stop. */
  readonly rows: readonly unknown[];
  /** The stop's step and commit, when the mounting view knows them — stamped on the root. */
  readonly step?: number;
  readonly commit?: number;
}

/** The band over rows already in hand — what a view that folded the stop once mounts. */
export function CoverageRows(props: CoverageRowsProps): React.ReactElement | null {
  const { rows, step, commit } = props;
  const fold = useMemo(() => foldCoverage(rows), [rows]);
  if (fold.calls.length === 0) return null;
  return (
    <div style={band} data-testid="coverage-band" data-declarations={fold.calls.length} data-step={step} data-commit={commit}>
      <div style={header}>
        <span style={title}>{LABELS.band}</span>
        <span style={dim}>
          {fold.calls.length} {LABELS.declarations}
        </span>
      </div>
      <div style={block} data-testid="coverage-boundary">
        <span style={heading}>{LABELS.boundary}</span>
        <Section section="checked" items={fold.boundary.checked} />
        <Section section="notChecked" items={fold.boundary.notChecked} />
        <Section section="cannotCover" items={fold.boundary.cannotCover} />
      </div>
      <div style={block} data-testid="coverage-calls">
        <span style={heading}>{LABELS.byCall}</span>
        {fold.calls.map((call, i) => (
          <Call key={i} call={call} />
        ))}
      </div>
    </div>
  );
}

// ─── One call ─────────────────────────────────────────────────────────────

const SHORT_ID = 12;

function Call({ call }: { readonly call: DeclaredCoverageShape }): React.ReactElement {
  const id = call.toolCallId;
  return (
    <div
      style={callStyle}
      data-testid="coverage-call"
      data-tool={call.toolName}
      data-kind={call.kind}
      data-iteration={call.iteration}
      {...(id !== undefined ? { 'data-tool-call-id': id } : {})}
    >
      <div style={row}>
        <code style={strong}>{call.toolName}</code>
        {id !== undefined && (
          <code title={id} style={mono} data-testid="coverage-call-id">
            {id.length > SHORT_ID ? `${id.slice(0, SHORT_ID)}…` : id}
          </code>
        )}
        <span style={dim}>
          {LABELS.iteration} {call.iteration}
        </span>
        <Chip testId="coverage-kind" color={T.primary}>
          {call.kind}
        </Chip>
      </div>
      {call.lookedFor !== undefined && (
        <div style={mono} data-testid="coverage-looked-for">
          <span style={dim}>{LABELS.lookedFor}</span> <q>{call.lookedFor}</q>
        </div>
      )}
      <Section section="checked" items={call.checked} />
      <Section section="notChecked" items={call.notChecked} />
      <Section section="cannotCover" items={call.cannotCover} />
    </div>
  );
}

// ─── One section ──────────────────────────────────────────────────────────

/** Entries per section before the fold — the append's own number (`coverage/answer.ts · MAX_ENTRIES_PER_SECTION`). */
const MAX_SHOWN = 12;

/** An item as a section prints it: the ground, and — on the boundary — who declared it. */
type SectionItem = CoverageItemShape & { readonly declaredBy?: readonly string[] };

/** One section: its heading as a chip in the section's colour, the first twelve entries, the rest behind a `<details>`. Rendered only with items. */
function Section({ section, items }: { readonly section: CoverageSection; readonly items: readonly SectionItem[] }): React.ReactElement | null {
  if (items.length === 0) return null;
  const color = sectionColor(section);
  const shown = items.slice(0, MAX_SHOWN);
  const rest = items.slice(MAX_SHOWN);
  return (
    <div data-testid="coverage-section" data-section={section} data-count={items.length}>
      <div style={row}>
        <Chip testId="coverage-section-chip" color={color}>
          {LABELS[section]}
        </Chip>
        <span style={dim}>{items.length}</span>
      </div>
      <ul style={list}>
        {shown.map((item, i) => (
          <Item key={i} item={item} color={color} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details style={detailsStyle} data-testid="coverage-more" data-count={rest.length}>
          <summary style={summaryStyle}>
            +{rest.length} {LABELS.more}
          </summary>
          <ul style={list}>
            {rest.map((item, i) => (
              <Item key={i} item={item} color={color} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** `what` as written, `why` dimmer, and on the boundary the tools that declared it. */
function Item({ item, color }: { readonly item: SectionItem; readonly color: string }): React.ReactElement {
  return (
    <li
      style={{ ...itemStyle, borderLeftColor: color }}
      data-testid="coverage-item"
      {...(item.declaredBy !== undefined ? { 'data-declared-by': item.declaredBy.join(',') } : {})}
    >
      <span data-testid="coverage-what">{item.what}</span>
      {item.why !== undefined && (
        <span style={dim} data-testid="coverage-why">
          {' — '}
          {item.why}
        </span>
      )}
      {item.declaredBy !== undefined && (
        <span style={dim}>
          {' ← '}
          <code style={mono} data-testid="coverage-declared-by">
            {item.declaredBy.join(', ')}
          </code>
        </span>
      )}
    </li>
  );
}

// ─── Chips and styles ─────────────────────────────────────────────────────

/** A chip colour per section, never a sentence: what was covered, what was not, what never can be. */
function sectionColor(section: CoverageSection): string {
  if (section === 'checked') return T.success;
  if (section === 'cannotCover') return T.warning;
  return T.textMuted;
}

function Chip({ children, color, testId }: { readonly children: React.ReactNode; readonly color: string; readonly testId: string }): React.ReactElement {
  return (
    <span style={{ ...chip, borderColor: color, color }} data-testid={testId}>
      {children}
    </span>
  );
}

// One-word CSS literals only: the own-claims walker reads every string.
const band: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  paddingTop: 6,
  borderTop: '1px solid',
  borderTopColor: T.border,
  fontSize: 13,
  fontFamily: T.fontSans,
  color: T.textPrimary,
};
const header: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 };
const title: React.CSSProperties = { fontWeight: 600 };
const heading: React.CSSProperties = { fontWeight: 600, color: T.textSecondary, fontSize: 12 };
const strong: React.CSSProperties = { fontWeight: 600, fontFamily: T.fontMono, fontSize: 12 };
const dim: React.CSSProperties = { color: T.textMuted };
const mono: React.CSSProperties = { fontFamily: T.fontMono, fontSize: 12, wordBreak: 'break-word' };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 };
const block: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
const callStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '6px 8px',
  border: '1px solid',
  borderColor: T.border,
  borderRadius: 6,
  background: T.bgSecondary,
};
const list: React.CSSProperties = { margin: '2px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 2 };
const itemStyle: React.CSSProperties = { paddingLeft: 6, borderLeft: '2px solid', wordBreak: 'break-word' };
const chip: React.CSSProperties = {
  padding: '0 6px',
  borderRadius: 8,
  fontSize: 11,
  border: '1px solid',
  whiteSpace: 'nowrap',
};
const detailsStyle: React.CSSProperties = { fontSize: 12 };
const summaryStyle: React.CSSProperties = { cursor: 'pointer', color: T.textMuted };
