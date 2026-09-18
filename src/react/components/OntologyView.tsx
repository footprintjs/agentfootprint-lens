/**
 * <OntologyView> — the map the application DECLARED, drawn from the record
 * (agentfootprint 9.106.0, `AgentState.ontology`).
 *
 * WHY. An armed agent (`.ontology(defineOntology({...}))`) seeds its whole
 * map ONCE as the run constant `ontology` — `{ id, version, hash, spec }` —
 * and every call of the run is served one system piece composed from it.
 * The owner's ruling: an ontology is a MAP, not a door — it does not provide
 * a way to get data; it tells what each term is, which source holds it and
 * which registered tool reads it from there, so a model that finds no data
 * can say which node or source would help further. This view draws that map
 * off the record: sources in one column, the terms they hold in the next,
 * the terms no source holds in a third under the declaration's own heading
 * (`known, not held here`), `held by` as source→term edges labelled with the
 * `via` tool names, relations as term→term edges labelled with the author's
 * relation word. Beside the chart, the same data as a list — for a screen
 * reader, and for a test.
 *
 * THE LAWS THIS FILE KEEPS:
 *
 *   1. OMIT, NEVER DENY. The view renders nothing at all when the fold at the
 *      stop holds no `ontology` (an agent that declared no map, or a stop
 *      before the seed); a node prints no field the declaration does not
 *      carry — the `configured` chip appears only on a source that wrote it.
 *   2. NO SENTENCE OF ITS OWN. Every printed string is a value off the record
 *      — an id, a meaning, a unit, an alias, a coverage sentence, a relation
 *      word, a tool name — or a `LABELS` entry; a long value is CLIPPED, the
 *      whole on hover, never paraphrased. `test/served/no-own-claims.test.ts`
 *      walks this file.
 *   3. THE SAME BYTES TWICE. Layout is a function of the spec alone: nodes
 *      sorted by id (the served piece's own order), rows by index, edges as
 *      straight or elbow lines — no force layout, no measurement, no
 *      randomness, no clock. A run's map draws identically on every render.
 *   4. ONE CURSOR. The key is a run constant, so the map is the same at every
 *      stop after the seed — the view still reads the fold AT THE CURSOR
 *      (the host's `cursor`, or the `shared` address read over this view's
 *      axis) and mounts the shared transport when it holds the address, so a
 *      host that lays it beside the other views keeps one cursor; with
 *      neither it reads the run's end, stateless, and mounts no mover.
 *   5. A SHAPE THE VIEW DOES NOT OWN. The record is narrowed by shape
 *      (`ontologyRecordOf`); a value that does not fit draws nothing.
 *
 * `foldOntology(record)` is the pure fold and `layoutOntology(fold)` the pure
 * layout — both exported for a consumer with its own UI.
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
import { TimeTravel } from '../TimeTravel.js';
import type { SharedCursor } from '../useSharedCursor.js';
import { MILESTONE_AXIS } from './ContextView.js';

/** Every string this view owns — names for headings, fields and chips, never a sentence. */
export const LABELS = Object.freeze({
  view: 'Ontology',
  version: 'version',
  hash: 'hash',
  nodes: 'nodes',
  sources: 'sources',
  edges: 'edges',
  /** The declaration's own heading for a term with no source (the served piece's line). */
  unheld: 'known, not held here',
  heldBy: 'held by',
  relations: 'relations',
  via: 'via',
  unit: 'unit',
  aliases: 'aliases',
  coverage: 'coverage',
  configured: 'configured',
  chart: 'chart',
  list: 'list',
});

// ─── The record, read by shape ─────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStringArray = (v: unknown): v is readonly string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');

/** Where a term is held, as declared: the source, the tools that read it there, the author's coverage sentence. */
export interface HeldShape {
  readonly node: string;
  readonly source: string;
  readonly via: readonly string[];
  readonly coverage?: string;
}

/** A term as declared. */
export interface TermShape {
  readonly id: string;
  readonly meaning: string;
  readonly unit?: string;
  readonly aliases: readonly string[];
  readonly held: readonly HeldShape[];
}

/** A source as declared; `configured` only when the author wrote it. */
export interface SourceShape {
  readonly id: string;
  readonly meaning: string;
  readonly coverage?: string;
  readonly configured?: boolean;
}

/** A relation as declared, in the author's own word. */
export interface RelationShape {
  readonly from: string;
  readonly to: string;
  readonly relation: string;
  readonly meaning?: string;
}

/** The run constant `ontology` as the view reads it. */
export interface OntologyRecordShape {
  readonly id: string;
  readonly version: string;
  readonly hash: string;
  readonly nodes: Readonly<Record<string, unknown>>;
  readonly sources: Readonly<Record<string, unknown>>;
  readonly edges: readonly unknown[];
}

/** Narrow the committed key to the shape the view draws; anything else is nothing. */
export function ontologyRecordOf(value: unknown): OntologyRecordShape | undefined {
  if (!isRecord(value)) return undefined;
  const { id, version, hash, spec } = value;
  if (typeof id !== 'string' || typeof version !== 'string' || typeof hash !== 'string' || !isRecord(spec)) return undefined;
  if (!isRecord(spec.nodes) || !isRecord(spec.sources)) return undefined;
  return {
    id,
    version,
    hash,
    nodes: spec.nodes,
    sources: spec.sources,
    edges: Array.isArray(spec.edges) ? spec.edges : [],
  };
}

function heldOf(node: string, value: unknown, sources: Record<string, unknown>): HeldShape | undefined {
  if (!isRecord(value) || typeof value.source !== 'string' || !(value.source in sources)) return undefined;
  return {
    node,
    source: value.source,
    via: isStringArray(value.via) ? value.via : [],
    ...(typeof value.coverage === 'string' ? { coverage: value.coverage } : {}),
  };
}

function termOf(id: string, value: unknown, sources: Record<string, unknown>): TermShape | undefined {
  if (!isRecord(value) || typeof value.meaning !== 'string') return undefined;
  const held = Array.isArray(value.sources) ? value.sources.map((s) => heldOf(id, s, sources)).filter((h): h is HeldShape => h !== undefined) : [];
  return {
    id,
    meaning: value.meaning,
    ...(typeof value.unit === 'string' ? { unit: value.unit } : {}),
    aliases: isStringArray(value.aliases) ? value.aliases : [],
    held,
  };
}

function sourceOf(id: string, value: unknown): SourceShape | undefined {
  if (!isRecord(value) || typeof value.meaning !== 'string') return undefined;
  return {
    id,
    meaning: value.meaning,
    ...(typeof value.coverage === 'string' ? { coverage: value.coverage } : {}),
    ...(typeof value.configured === 'boolean' ? { configured: value.configured } : {}),
  };
}

function relationOf(value: unknown): RelationShape | undefined {
  if (!isRecord(value) || typeof value.from !== 'string' || typeof value.to !== 'string' || typeof value.relation !== 'string') return undefined;
  return {
    from: value.from,
    to: value.to,
    relation: value.relation,
    ...(typeof value.meaning === 'string' ? { meaning: value.meaning } : {}),
  };
}

// ─── The fold ──────────────────────────────────────────────────────────────

export interface OntologyFold {
  readonly id: string;
  readonly version: string;
  readonly hash: string;
  /** Every term, sorted by id — the served piece's own order. */
  readonly terms: readonly TermShape[];
  /** Every source, sorted by id. */
  readonly sources: readonly SourceShape[];
  /** Every declared holding, in term order then declaration order. */
  readonly held: readonly HeldShape[];
  /** Every relation, in declaration order (the hash's order). */
  readonly relations: readonly RelationShape[];
  /** The ids of the terms no source holds, sorted. */
  readonly unheld: readonly string[];
}

const byId = <A extends { readonly id: string }>(a: A, b: A): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Fold the record into the lists the view draws. Pure; sorted by id where the piece sorts. */
export function foldOntology(record: OntologyRecordShape): OntologyFold {
  const terms = Object.entries(record.nodes)
    .map(([id, v]) => termOf(id, v, record.sources))
    .filter((t): t is TermShape => t !== undefined)
    .sort(byId);
  const sources = Object.entries(record.sources)
    .map(([id, v]) => sourceOf(id, v))
    .filter((s): s is SourceShape => s !== undefined)
    .sort(byId);
  const relations = record.edges.map(relationOf).filter((r): r is RelationShape => r !== undefined);
  return Object.freeze({
    id: record.id,
    version: record.version,
    hash: record.hash,
    terms: Object.freeze(terms),
    sources: Object.freeze(sources),
    held: Object.freeze(terms.flatMap((t) => t.held)),
    relations: Object.freeze(relations),
    unheld: Object.freeze(terms.filter((t) => t.held.length === 0).map((t) => t.id)),
  });
}

// ─── The layout ────────────────────────────────────────────────────────────

/** The geometry every chart shares — constants, so two renders agree byte for byte. */
export const GEOMETRY = Object.freeze({
  nodeWidth: 168,
  nodeHeight: 44,
  rowGap: 18,
  columnGap: 96,
  /** The lane each relation elbow takes to the right of the term columns, per edge. */
  laneGap: 14,
  padding: 12,
  labelOffset: 4,
});

export interface PlacedNode {
  readonly id: string;
  readonly kind: 'source' | 'term';
  readonly column: number;
  readonly x: number;
  readonly y: number;
}

export interface PlacedEdge {
  readonly kind: 'held' | 'relation';
  readonly from: string;
  readonly to: string;
  /** The SVG path, straight for a holding, an elbow for a relation. */
  readonly path: string;
  /** Where the label sits. */
  readonly labelX: number;
  readonly labelY: number;
  /** The `via` names for a holding; the relation word for a relation. */
  readonly label: string;
  readonly relation?: string;
}

export interface OntologyLayout {
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly PlacedNode[];
  readonly edges: readonly PlacedEdge[];
  /** The x of the unheld column's heading, when the column is drawn. */
  readonly unheldX?: number;
}

const columnX = (column: number): number => GEOMETRY.padding + column * (GEOMETRY.nodeWidth + GEOMETRY.columnGap);
const rowY = (row: number): number => GEOMETRY.padding + GEOMETRY.nodeHeight + row * (GEOMETRY.nodeHeight + GEOMETRY.rowGap);
const centreY = (n: PlacedNode): number => n.y + GEOMETRY.nodeHeight / 2;

/**
 * Place the fold: sources in column 0, held terms in column 1, unheld terms in
 * column 2 (when any); rows by sorted index. A holding is a straight line from
 * the source's right edge to the term's left edge; a relation is an elbow out
 * of `from`'s right edge into a lane right of the term columns and back into
 * `to`'s right edge — one lane per relation, in declaration order. Pure.
 */
export function layoutOntology(fold: OntologyFold): OntologyLayout {
  const heldTerms = fold.terms.filter((t) => t.held.length > 0);
  const unheldTerms = fold.terms.filter((t) => t.held.length === 0);
  const nodes: PlacedNode[] = [
    ...fold.sources.map((s, i) => ({ id: s.id, kind: 'source' as const, column: 0, x: columnX(0), y: rowY(i) })),
    ...heldTerms.map((t, i) => ({ id: t.id, kind: 'term' as const, column: 1, x: columnX(1), y: rowY(i) })),
    ...unheldTerms.map((t, i) => ({ id: t.id, kind: 'term' as const, column: 2, x: columnX(2), y: rowY(i) })),
  ];
  const at = new Map(nodes.map((n) => [`${n.kind}:${n.id}`, n]));
  const columns = unheldTerms.length > 0 ? 3 : heldTerms.length > 0 ? 2 : 1;
  const rightEdge = columnX(columns - 1) + GEOMETRY.nodeWidth;
  const edges: PlacedEdge[] = [];
  for (const h of fold.held) {
    const from = at.get(`source:${h.source}`);
    const to = at.get(`term:${h.node}`);
    if (from === undefined || to === undefined) continue;
    const x1 = from.x + GEOMETRY.nodeWidth;
    const y1 = centreY(from);
    const x2 = to.x;
    const y2 = centreY(to);
    edges.push({
      kind: 'held',
      from: h.source,
      to: h.node,
      path: `M ${x1} ${y1} L ${x2} ${y2}`,
      labelX: (x1 + x2) / 2,
      labelY: (y1 + y2) / 2 - GEOMETRY.labelOffset,
      label: h.via.join(', '),
    });
  }
  fold.relations.forEach((r, i) => {
    const from = at.get(`term:${r.from}`);
    const to = at.get(`term:${r.to}`);
    if (from === undefined || to === undefined) return;
    const lane = rightEdge + GEOMETRY.laneGap * (i + 1);
    const x1 = from.x + GEOMETRY.nodeWidth;
    const y1 = centreY(from);
    const x2 = to.x + GEOMETRY.nodeWidth;
    const y2 = centreY(to);
    edges.push({
      kind: 'relation',
      from: r.from,
      to: r.to,
      path: `M ${x1} ${y1} H ${lane} V ${y2} H ${x2}`,
      labelX: lane + GEOMETRY.labelOffset,
      labelY: (y1 + y2) / 2,
      label: r.relation,
      relation: r.relation,
    });
  });
  const rows = Math.max(fold.sources.length, heldTerms.length, unheldTerms.length, 1);
  const lanes = fold.relations.length;
  return Object.freeze({
    width: rightEdge + GEOMETRY.laneGap * (lanes + 1) + GEOMETRY.padding + 120,
    height: rowY(rows) + GEOMETRY.padding,
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    ...(unheldTerms.length > 0 ? { unheldX: columnX(2) } : {}),
  });
}

// ─── The view ──────────────────────────────────────────────────────────────

export interface OntologyViewProps {
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
  return tagAxisPositions(snapshot, MILESTONE_AXIS, []) ?? [];
}

const noMove = (): void => undefined;

/** The value of one top-level key of the fold at the stop, when it holds one. */
function keyValue(context: ContextAt, path: string): unknown {
  return context.keys.find((k) => k.path === path)?.value;
}

export function OntologyView(props: OntologyViewProps): React.ReactElement | null {
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
  const record = ontologyRecordOf(keyValue(context, 'ontology'));
  const fold = useMemo(() => (record === undefined ? undefined : foldOntology(record)), [record]);
  const layout = useMemo(() => (fold === undefined ? undefined : layoutOntology(fold)), [fold]);

  // THE transport: the same component the Lens, the Skill Graph, the Context
  // view and the Reasoning lens mount. It belongs here when the cursor is the
  // shared address — a per-axis `cursor` from a slot brings the host's mover —
  // and only while the address stands on this axis.
  const mover = props.cursor === undefined && shared !== undefined && cursor.total > 0 && cursor.at.step >= 0;

  // Omit, never deny: no map at the stop, nothing drawn — but the transport
  // stays whenever this view holds the shared address (0.66.1), so a person
  // standing at a stop before the seed can step forward from here.
  const drawn = fold !== undefined && layout !== undefined;
  if (!drawn && !mover) return null;
  return (
    <div
      style={panel}
      data-testid="ontology-view"
      data-drawn={String(drawn)}
      {...(drawn && { 'data-id': fold.id, 'data-version': fold.version, 'data-hash': fold.hash })}
      data-step={cursor.at.step}
      data-commit={cursor.at.commitIdx}
    >
      {drawn && <Header fold={fold} />}
      {mover && (
        <div data-testid="ontology-transport">
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

// ─── The header ────────────────────────────────────────────────────────────

const SHORT_HASH = 12;

/** The map's identity and its counts — every number is data. */
function Header({ fold }: { readonly fold: OntologyFold }): React.ReactElement {
  return (
    <div style={header} data-testid="ontology-header">
      <span style={title}>{LABELS.view}</span>
      <code style={mono} data-testid="ontology-id">
        {fold.id}
      </code>
      <span style={dim}>
        {LABELS.version} <code style={mono}>{fold.version}</code>
      </span>
      <span style={dim}>
        {LABELS.hash}{' '}
        <code style={mono} title={fold.hash} data-testid="ontology-hash">
          {fold.hash.length > SHORT_HASH ? `${fold.hash.slice(0, SHORT_HASH)}…` : fold.hash}
        </code>
      </span>
      <span style={dim} data-testid="ontology-counts">
        {fold.terms.length} {LABELS.nodes} · {fold.sources.length} {LABELS.sources} · {fold.held.length + fold.relations.length}{' '}
        {LABELS.edges}
      </span>
    </div>
  );
}

// ─── The chart ─────────────────────────────────────────────────────────────

const CLIP = 28;

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

function Chart({ fold, layout }: { readonly fold: OntologyFold; readonly layout: OntologyLayout }): React.ReactElement {
  const terms = new Map(fold.terms.map((t) => [t.id, t]));
  const sources = new Map(fold.sources.map((s) => [s.id, s]));
  const arrow = `ontology-arrow-${fold.hash.slice(0, SHORT_HASH)}`;
  const { nodeWidth, nodeHeight } = GEOMETRY;
  return (
    <svg
      role="img"
      aria-label={LABELS.chart}
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      style={chartStyle}
      data-testid="ontology-chart"
    >
      <defs>
        <marker id={arrow} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <polygon points={arrowPoints()} fill={T.textMuted} />
        </marker>
      </defs>
      <text x={columnX(0)} y={GEOMETRY.padding + 14} style={headingText} fill={T.textMuted}>
        {LABELS.sources}
      </text>
      {layout.nodes.some((n) => n.column === 1) && (
        <text x={columnX(1)} y={GEOMETRY.padding + 14} style={headingText} fill={T.textMuted}>
          {LABELS.nodes}
        </text>
      )}
      {layout.unheldX !== undefined && (
        <text x={layout.unheldX} y={GEOMETRY.padding + 14} style={headingText} fill={T.textMuted} data-testid="ontology-chart-unheld">
          {LABELS.unheld}
        </text>
      )}
      {layout.edges.map((e, i) => (
        <g
          key={`${e.kind}:${e.from}:${e.to}:${i}`}
          data-testid="ontology-chart-edge"
          data-kind={e.kind}
          data-from={e.from}
          data-to={e.to}
          {...(e.relation !== undefined ? { 'data-relation': e.relation } : {})}
        >
          <path
            d={e.path}
            fill="none"
            stroke={e.kind === 'held' ? T.srcTool : T.primary}
            strokeWidth={1.25}
            strokeDasharray={e.kind === 'held' ? undefined : '4 3'}
            markerEnd={`url(#${arrow})`}
          />
          {e.label.length > 0 && (
            <text x={e.labelX} y={e.labelY} style={edgeText} fill={e.kind === 'held' ? T.srcTool : T.primary} textAnchor={e.kind === 'held' ? 'middle' : 'start'}>
              {e.label}
            </text>
          )}
        </g>
      ))}
      {layout.nodes.map((n) => {
        const term = terms.get(n.id);
        const source = sources.get(n.id);
        const shape = n.kind === 'source' ? source : term;
        const meaning = shape?.meaning ?? '';
        const held = n.kind === 'term' && term !== undefined && term.held.length > 0;
        return (
          <g
            key={`${n.kind}:${n.id}`}
            transform={`translate(${n.x} ${n.y})`}
            data-testid="ontology-chart-node"
            data-kind={n.kind}
            data-node={n.id}
            {...(n.kind === 'term' ? { 'data-held': String(held) } : {})}
          >
            <title>{n.kind === 'source' && source?.coverage !== undefined ? `${meaning} · ${source.coverage}` : meaning}</title>
            <rect
              width={nodeWidth}
              height={nodeHeight}
              rx={n.kind === 'source' ? 2 : 8}
              fill={T.bgSecondary}
              stroke={n.kind === 'source' ? T.srcTool : held ? T.primary : T.textMuted}
              strokeWidth={n.kind === 'source' ? 2 : 1.25}
              strokeDasharray={n.kind === 'term' && !held ? '4 3' : undefined}
            />
            <text x={8} y={17} style={nodeIdText} fill={T.textPrimary}>
              {clip(n.id, 20)}
            </text>
            {n.kind === 'term' && term?.unit !== undefined && (
              <text x={nodeWidth - 8} y={17} style={chipText} fill={T.warning} textAnchor="end">
                {clip(term.unit, 12)}
              </text>
            )}
            {n.kind === 'source' && source?.configured !== undefined && (
              <text x={nodeWidth - 8} y={17} style={chipText} fill={source.configured ? T.success : T.warning} textAnchor="end">
                {LABELS.configured}
              </text>
            )}
            <text x={8} y={34} style={nodeMeaningText} fill={T.textSecondary}>
              {clip(n.kind === 'source' && source?.coverage !== undefined ? `${meaning} · ${source.coverage}` : meaning)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── The list ──────────────────────────────────────────────────────────────

/** The same data as the chart, in reading order: terms, sources, holdings, relations, the unheld. */
function List({ fold }: { readonly fold: OntologyFold }): React.ReactElement {
  return (
    <div style={listStyle} data-testid="ontology-list" aria-label={LABELS.list}>
      <Group label={LABELS.nodes} count={fold.terms.length} testId="ontology-nodes">
        {fold.terms.map((t) => (
          <li key={t.id} data-testid="ontology-node" data-node={t.id} data-held={String(t.held.length > 0)}>
            <code style={strong}>{t.id}</code> <span>{t.meaning}</span>
            {t.unit !== undefined && (
              <Chip color={T.warning} testId="ontology-unit">
                {LABELS.unit} {t.unit}
              </Chip>
            )}
            {t.aliases.length > 0 && (
              <span style={dim} data-testid="ontology-aliases">
                {' '}
                {LABELS.aliases} {t.aliases.join(', ')}
              </span>
            )}
          </li>
        ))}
      </Group>
      <Group label={LABELS.sources} count={fold.sources.length} testId="ontology-sources">
        {fold.sources.map((s) => (
          <li key={s.id} data-testid="ontology-source" data-source={s.id} {...(s.configured !== undefined ? { 'data-configured': String(s.configured) } : {})}>
            <code style={strong}>{s.id}</code> <span>{s.meaning}</span>
            {s.configured !== undefined && (
              <Chip color={s.configured ? T.success : T.warning} testId="ontology-configured">
                {LABELS.configured} {String(s.configured)}
              </Chip>
            )}
            {s.coverage !== undefined && (
              <span style={dim} data-testid="ontology-source-coverage">
                {' '}
                {LABELS.coverage} <q>{s.coverage}</q>
              </span>
            )}
          </li>
        ))}
      </Group>
      {fold.held.length > 0 && (
        <Group label={LABELS.heldBy} count={fold.held.length} testId="ontology-held-by">
          {fold.held.map((h, i) => (
            <li key={`${h.node}:${h.source}:${i}`} data-testid="ontology-held" data-node={h.node} data-source={h.source}>
              <code style={strong}>{h.node}</code> <span style={dim}>←</span> <code style={strong}>{h.source}</code>
              {h.via.length > 0 && (
                <span style={dim} data-testid="ontology-via">
                  {' '}
                  {LABELS.via} <code style={mono}>{h.via.join(', ')}</code>
                </span>
              )}
              {h.coverage !== undefined && (
                <span style={dim} data-testid="ontology-held-coverage">
                  {' '}
                  {LABELS.coverage} <q>{h.coverage}</q>
                </span>
              )}
            </li>
          ))}
        </Group>
      )}
      {fold.relations.length > 0 && (
        <Group label={LABELS.relations} count={fold.relations.length} testId="ontology-relations">
          {fold.relations.map((r, i) => (
            <li key={`${r.from}:${r.relation}:${r.to}:${i}`} data-testid="ontology-edge" data-from={r.from} data-to={r.to} data-relation={r.relation}>
              <code style={strong}>{r.from}</code> <code style={relationWord}>{r.relation}</code> <code style={strong}>{r.to}</code>
              {r.meaning !== undefined && (
                <span style={dim} data-testid="ontology-edge-meaning">
                  {' '}
                  <q>{r.meaning}</q>
                </span>
              )}
            </li>
          ))}
        </Group>
      )}
      {fold.unheld.length > 0 && (
        <Group label={LABELS.unheld} count={fold.unheld.length} testId="ontology-unheld-group">
          {fold.unheld.map((id) => (
            <li key={id} data-testid="ontology-unheld" data-node={id}>
              <code style={strong}>{id}</code>
            </li>
          ))}
        </Group>
      )}
    </div>
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

function Chip({ children, color, testId }: { readonly children: React.ReactNode; readonly color: string; readonly testId: string }): React.ReactElement {
  return (
    <span style={{ ...chip, borderColor: color, color }} data-testid={testId}>
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
const relationWord: React.CSSProperties = { fontFamily: T.fontMono, fontSize: 12, color: T.primary };
const body: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16 };
const chartStyle: React.CSSProperties = { maxWidth: '100%', height: 'auto', fontFamily: T.fontSans, background: T.bgPrimary, borderRadius: 6 };
const headingText: React.CSSProperties = { fontSize: 11, fontWeight: 600 };
const edgeText: React.CSSProperties = { fontSize: 10, fontFamily: T.fontMono };
const nodeIdText: React.CSSProperties = { fontSize: 12, fontWeight: 600, fontFamily: T.fontMono };
const nodeMeaningText: React.CSSProperties = { fontSize: 10 };
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
