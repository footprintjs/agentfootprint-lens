/**
 * <ContextView> — the context object at the cursor, key by key: who wrote
 * each, what moved since the previous stop, what was served beside it.
 *
 * Standalone, like the Skill Graph: mount it anywhere with a recording and it
 * walks its own milestone axis; or hand it the ONE cursor (`cursor` from
 * `<Lens>`'s detail slot, or `lensCursorFrom`) and it never makes a second.
 *
 *     <ContextView runner={recording} />                       // its own cursor
 *     <ContextView runner={recording} cursor={p.cursor} />     // the Lens's
 *
 * Two layers on the ONE cursor (0.54.0). On top, what the model HAD at this
 * stop: the served document of the stop's epoch — system pieces, messages,
 * tools, each checked against the receipt, and what changed since the
 * previous model call — rendered by `<ServedTab>`, the one owner of that
 * rendering (the Why Lens's Served tab is the same component). Beneath, what
 * it was BUILT from: the record's keys at the stop, who wrote each, what moved
 * since the previous stop; a long value opens in place. Under the record,
 * when the fold at the stop holds `findingsLedger` (an armed run,
 * agentfootprint 9.101.0), the Findings band (0.61.0): the model's own
 * ledger folded for reading by `<FindingsBand>` — its rows and the state's
 * `toolResults` are read off `contextAt(...).keys`, so the band stands on
 * the same fold as the key table and moves with the ONE cursor.
 *
 * Everything printed is the record: key paths, values, stage ids, commit
 * indices, event names, the Served row's pieces and verdicts. `LABELS` is
 * every string this view owns — names for things on the screen, never a
 * sentence about the run (test/served/no-own-claims.test.ts walks this file).
 */
import React, { useMemo, useState } from 'react';

import type { ContextAt, ContextAtOptions, ContextKey, ContextProjection } from '../../core/context/contextAt.js';
import type { ContextValueShape } from '../../core/context/contextValueShapes.js';
import { arrayExceedsPreview, previewRecordedValue } from '../../core/context/previewRecordedValue.js';
import type { LensCursor } from '../../core/cursor/lensCursor.js';
import type { LensRecorder } from '../../core/LensRecorder.js';
import type { ServedCursor } from '../../core/served/types.js';
import type { EventLogEntry } from '../../core/types.js';
import { TimeTravel } from '../TimeTravel.js';
import type { SharedCursor } from '../useSharedCursor.js';
import { FindingsBand } from './FindingsBand.js';
import { TimeBand } from './TimeBand.js';
import { useContextProjection } from '../hooks/useContextProjection.js';
import { ContextServedTab } from './ServedTab.js';

export const LABELS = Object.freeze({
  view: 'Context',
  keys: 'keys',
  wroteBy: 'wrote by',
  at: 'at',
  entered: 'entered',
  changed: 'changed',
  unchanged: 'unchanged',
  left: 'left',
  unattributed: 'unattributed',
  rows: 'rows',
  item: 'item',
  items: 'items',
  served: 'served',
  why: 'why',
  mixedEvents: 'Hiding events from multiple runs.',
  mixedEventsHelp: 'Clear the recorder or pass run-specific events.',
  epoch: 'epoch',
  system: 'system',
  tools: 'tools',
  redacted: 'redacted',
  skipped: 'skipped',
  foldError: 'fold error',
  servedError: 'served error',
  json: 'JSON',
  empty: '{ }',
  more: 'more',
  less: 'less',
  builtFrom: 'built from',
});

export { MILESTONE_AXIS } from '../hooks/useContextProjection.js';

export interface ContextViewProps {
  /** Pass the same nested paths selected for recording to show their verified array counts. */
  readonly shapePaths?: ContextAtOptions['shapePaths'];
  /** The recording or a runner with `getLastSnapshot()` — the same input the Served tab takes. */
  readonly runner: unknown;
  /** THE cursor, when a host holds it. Absent: the view walks its own milestone axis. */
  readonly cursor?: LensCursor;
  /**
   * The previous stop on the HOST's axis, when it hands `cursor` (0.53.3) —
   * what `since` (entered / changed / unchanged) and `left` are measured
   * against. A standalone view knows its own previous stop; a slotted one
   * cannot, and without this it claims no direction.
   */
  readonly previous?: ServedCursor;
  /**
   * The HOST's one cursor across every lens it mounts (0.58.0) — the owner
   * `useSharedCursor(recorder)` hands back. The view reads the shared
   * ADDRESS over its axis and its transport moves that address. With
   * `recorder` the axis is the run's GROUPED axis — the same list a Why Lens
   * at `granularity="group"` scrubs, so the two stand on the same stop;
   * without one it is the view's own milestone axis (`MILESTONE_AXIS`, read
   * off the snapshot). `previous` is then the stop before, on that axis.
   * `cursor` wins when supplied.
   *
   * ```tsx
   * const shared = useSharedCursor(recorder);
   * <ContextView runner={recording} recorder={recorder} shared={shared} />
   * ```
   */
  readonly shared?: SharedCursor;
  /** The recorder whose grouped axis a `shared` view reads — omit to read the milestone axis off the snapshot. */
  readonly recorder?: LensRecorder;
  /** The recording's event stream for the `why` band. Defaults to the supplied recorder's entries. */
  readonly events?: readonly EventLogEntry[];
  /** Show the fold as JSON instead of the key table. */
  readonly initialMode?: 'keys' | 'json';
}

export function ContextView(props: ContextViewProps): React.ReactElement {
  const { context, snapshot, cursor, mover } = useContextProjection(props);
  const [mode, setMode] = useState<'keys' | 'json'>(props.initialMode ?? 'keys');

  return (
    <div
      style={panel}
      data-testid="context-view"
      data-step={cursor.at.step}
      data-commit={cursor.at.commitIdx}
    >
      <div style={header}>
        <span style={title}>{LABELS.view}</span>
        <span style={dim}>
          {cursor.at.label} · {cursor.at.step + 1}/{cursor.total}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            type="button"
            style={btn}
            aria-pressed={mode === 'keys'}
            onClick={() => setMode('keys')}
            data-testid="context-mode-keys"
          >
            {LABELS.keys}
          </button>
          <button
            type="button"
            style={btn}
            aria-pressed={mode === 'json'}
            onClick={() => setMode('json')}
            data-testid="context-mode-json"
          >
            {LABELS.json}
          </button>
        </span>
      </div>
      {mover && (
        <div data-testid="context-transport">
          {/* THE transport — the same component the Lens and the Skill Graph
              mount, moving the same cursor through the same funnel. */}
          <TimeTravel
            total={cursor.total}
            focusSeq={Math.max(0, cursor.at.step)}
            onFocusChange={(n) => cursor.moveTo(n)}
            isLive={false}
            compact
          />
        </div>
      )}
      <Facts context={context} />
      <ServedLayer context={context} snapshot={snapshot} cursor={cursor} />
      <div style={dim} data-testid="context-built-from">
        {LABELS.builtFrom} · {context.keys.length} {LABELS.keys}
      </div>
      {mode === 'json' ? <JsonPane context={context} /> : <KeyTable context={context} />}
      {context.ledger && <>
        <FindingsBand rows={context.ledger.rows} toolResults={context.ledger.toolResults} since={context.ledger.since} />
        <TimeBand rows={context.ledger.rows} coverage={context.ledger.coverage} />
      </>}
      <WhyBand context={context} />
    </div>
  );
}

function Facts({ context }: { readonly context: ContextAt }): React.ReactElement | null {
  const facts: string[] = [];
  if (context.redacted) facts.push(LABELS.redacted);
  if (context.skipped !== undefined) facts.push(`${LABELS.skipped} ${context.skipped.join(',')}`);
  if (context.foldError !== undefined) facts.push(`${LABELS.foldError}: ${context.foldError}`);
  if (context.servedError !== undefined) facts.push(`${LABELS.servedError}: ${context.servedError}`);
  if (facts.length === 0) return null;
  return (
    <div style={dim} data-testid="context-facts">
      {facts.join(' · ')}
    </div>
  );
}

function KeyTable({ context }: { readonly context: ContextAt }): React.ReactElement {
  if (context.keys.length === 0 && context.left.length === 0) {
    return (
      <div style={mono} data-testid="context-empty">
        {LABELS.empty}
      </div>
    );
  }
  return (
    <table style={table} data-testid="context-keys">
      <colgroup>
        <col style={{ width: '28%' }} />
        <col style={{ width: '34%' }} />
        <col />
      </colgroup>
      <tbody>
        {context.keys.map((k) => (
          <KeyRow key={k.path} k={k} />
        ))}
        {context.left.map((path) => (
          <tr key={`left:${path}`} data-testid="context-key" data-since="left" style={{ opacity: 0.6 }}>
            <td style={cell}>
              <code>{path}</code>
            </td>
            <td style={cell}>{LABELS.left}</td>
            <td style={cell} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function KeyRow({ k }: { readonly k: ContextKey }): React.ReactElement {
  const since = k.since === undefined ? undefined : LABELS[k.since];
  return (
    <tr
      data-testid="context-key"
      data-path={k.path}
      data-since={k.since ?? ''}
      style={k.since === 'unchanged' ? { opacity: 0.6 } : undefined}
    >
      <td style={cell}>
        <code>{k.path}</code>
        {since !== undefined && <span style={pill}>{since}</span>}
      </td>
      <td style={cell} data-testid="context-wrote-by">
        {k.wroteBy !== undefined ? (
          <>
            <span style={dim}>{LABELS.wroteBy} </span>
            <code>{k.wroteBy}</code>
            <span style={dim}>
              {' '}
              {LABELS.at} #{k.wroteAt} · {k.verb}
            </span>
          </>
        ) : (
          <span style={dim}>{LABELS.unattributed}</span>
        )}
      </td>
      <td style={{ ...cell, ...mono }}>
        {k.shape && <ShapeLabel shape={k.shape} />}
        {k.nestedArrays?.slice(0, 2).map(shape => <ShapeLabel key={JSON.stringify(shape.path)} shape={shape} />)}
        {k.nestedArrays && k.nestedArrays.length > 2 && <span style={dim}>+{k.nestedArrays.length - 2}…</span>}
        <ValueCell row={k} />
      </td>
    </tr>
  );
}

function ShapeLabel({ shape }: { readonly shape: ContextValueShape }): React.ReactElement {
  const nested = shape.path.length > 1;
  return <div style={dim} data-testid={nested ? 'context-array-shape' : 'context-value-shape'}>
    {nested && <>{shape.path.slice(1).join(' › ')} · </>}
    {shape.type}
    {shape.type === 'array' && <> · {shape.arrayLength} {shape.arrayLength === 1 ? LABELS.item : LABELS.items}</>}
  </div>;
}

/** Represent live bigint values as suffixed decimal strings in the on-demand JSON. */
function formatContextJson(value: unknown, space?: number) {
  return JSON.stringify(value, (_key, part: unknown) => typeof part === 'bigint' ? `${part}n` : part, space);
}

/** A value, shortened past 160 characters — and opened in place on a click,
 *  so a system prompt or a tool schema is readable where it sits. */
function ValueCell({ row }: { readonly row: ContextKey }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const preview = useMemo(() => {
    if (arrayExceedsPreview(row.shape?.arrayLength ?? 0) ||
        row.nestedArrays?.some(shape => arrayExceedsPreview(shape.arrayLength ?? 0))) return undefined;
    return previewRecordedValue(row.value);
  }, [row]);
  const expandable = !preview || preview.truncated;
  const full = useMemo(() => open && expandable ? formatContextJson(row.value) : undefined,
    [open, expandable, row]);
  if (!expandable) return <span>{preview.text}</span>;
  return (
    <span data-testid="context-value" data-open={open}>
      {open ? (
        <pre style={{ ...mono, ...pre }} data-testid="context-value-full">
          {full}
        </pre>
      ) : (
        <span>{preview?.text}</span>
      )}{' '}
      <button type="button" style={btn} onClick={() => setOpen(!open)} data-testid="context-value-toggle">
        {open ? LABELS.less : LABELS.more}
      </button>
    </span>
  );
}

function JsonPane({ context }: { readonly context: ContextAt }): React.ReactElement {
  const full = useMemo(() => {
    const object: Record<string, unknown> = Object.create(null);
    for (const k of context.keys) object[k.path] = k.value;
    return formatContextJson(object, 2);
  }, [context]);
  return (
    <pre style={{ ...mono, ...pre }} data-testid="context-json">
      {full}
    </pre>
  );
}

/** What the model HAD at this stop — the served document of the stop's
 *  epoch, rendered by the one owner of that rendering. Absent when no model
 *  call is at or before the stop: nothing is served, nothing is claimed. */
function ServedLayer({
  context,
  snapshot,
  cursor,
}: {
  readonly context: ContextProjection;
  readonly snapshot: unknown;
  readonly cursor: LensCursor;
}): React.ReactElement | null {
  const served = context.served;
  if (served === undefined) return null;
  return (
    <div style={band} data-testid="context-served" data-epoch={served.row.view.epoch}>
      <span style={dim}>
        {LABELS.served} · {LABELS.epoch} {served.row.view.epoch}
      </span>
      <ContextServedTab
        reading={served}
        snapshot={snapshot}
        at={context.cursor}
        // The tab's own jump (to a call's stop) moves THE cursor — a standalone
        // view's own, a slotted view's host's — and a miss never moves it.
        onJumpTo={(runtimeStageId) => {
          const to = cursor.resolve(runtimeStageId);
          if (to.ok && to.step !== undefined) cursor.moveTo(to.step);
        }}
      />
    </div>
  );
}

function WhyBand({ context }: { readonly context: ContextProjection }): React.ReactElement | null {
  if (context.whyWithheld === 'mixed-sources') {
    return <div style={dim} data-testid="context-why-withheld">{LABELS.mixedEvents} {LABELS.mixedEventsHelp}</div>;
  }
  if (context.why.length === 0) return null;
  return (
    <div style={band} data-testid="context-why">
      <span style={dim}>{LABELS.why}</span>
      <ul style={list}>
        {context.why.map((w) => (
          <li key={w.seq} style={mono}>
            <code>{w.name}</code> <span style={dim}>#{w.seq}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const panel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 10,
  fontSize: 13,
};
const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};
const title: React.CSSProperties = { fontWeight: 600 };
const dim: React.CSSProperties = { opacity: 0.7 };
const mono: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 12,
};
const pre: React.CSSProperties = {
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};
const table: React.CSSProperties = {
  borderCollapse: 'collapse',
  width: '100%',
  tableLayout: 'fixed',
};
const cell: React.CSSProperties = {
  wordBreak: 'break-all',
  overflowWrap: 'anywhere',
  padding: '4px 6px',
  verticalAlign: 'top',
  borderTop: '1px solid',
  borderTopColor: 'currentColor',
};
const pill: React.CSSProperties = {
  marginLeft: 6,
  padding: '0 6px',
  borderRadius: 8,
  fontSize: 11,
  border: '1px solid',
  borderColor: 'currentColor',
};
const band: React.CSSProperties = {
  paddingTop: 6,
  borderTop: '1px solid',
  borderTopColor: 'currentColor',
};
const list: React.CSSProperties = { margin: '4px 0 0', paddingLeft: 18 };
const btn: React.CSSProperties = { fontSize: 12, padding: '2px 8px' };
