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
 * Everything printed is the record: key paths, values, stage ids, commit
 * indices, event names, the Served row's verdict badge. `LABELS` is every
 * string this view owns — names for things on the screen, never a sentence
 * about the run (test/served/no-own-claims.test.ts walks this file).
 */
import React, { useMemo, useState } from 'react';

import { contextAt, type ContextAt, type ContextKey } from '../../core/context/contextAt.js';
import type { LensCursor } from '../../core/cursor/lensCursor.js';
import { lensCursorFrom } from '../../core/cursor/lensCursor.js';
import type { CursorPosition } from '../../core/group/cursorPositionsAtDrill.js';
import type { ServedCursor } from '../../core/served/types.js';
import { tagAxisPositions } from '../../core/tags/tagAxis.js';
import type { EventLogEntry } from '../../core/types.js';
import { snapshotLogKey, snapshotOfRunner } from '../../core/utils/snapshotOfRunner.js';
import { Badge } from './ServedBadge.js';

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
  served: 'served',
  why: 'why',
  epoch: 'epoch',
  system: 'system',
  tools: 'tools',
  redacted: 'redacted',
  skipped: 'skipped',
  foldError: 'fold error',
  servedError: 'served error',
  previous: 'previous',
  next: 'next',
  json: 'JSON',
  empty: '{ }',
});

/** The milestone kinds a standalone view walks — the library's own tag vocabulary. */
export const MILESTONE_AXIS: readonly string[] = Object.freeze([
  'milestone:iteration',
  'milestone:slot',
  'milestone:llm-turn',
  'milestone:tool-call',
  'milestone:decision',
]);

export interface ContextViewProps {
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
  /** The recording's event stream, for the `why` band (a replay's `getEntries()`). */
  readonly events?: readonly EventLogEntry[];
  /** Show the fold as JSON instead of the key table. */
  readonly initialMode?: 'keys' | 'json';
}

function positionsOf(snapshot: unknown): readonly CursorPosition[] {
  return tagAxisPositions(snapshot, MILESTONE_AXIS, []) ?? [];
}

function servedCursorOf(cursor: LensCursor): ServedCursor {
  return {
    runtimeStageId: cursor.at.runtimeStageId,
    commitIdx: cursor.at.commitIdx,
  };
}

function previousOf(
  cursor: LensCursor,
  positions: readonly CursorPosition[] | undefined,
): ServedCursor | undefined {
  if (cursor.at.step <= 0) return undefined;
  const p = positions?.[cursor.at.step - 1];
  return p !== undefined ? { runtimeStageId: p.runtimeStageId, commitIdx: p.commitIdx } : undefined;
}

export function ContextView(props: ContextViewProps): React.ReactElement {
  const { runner, events } = props;
  const fresh = snapshotOfRunner(runner);
  const logKey = snapshotLogKey(fresh);
  const snapshot = useMemo(() => fresh, [runner, logKey]);
  const ownPositions = useMemo(
    () => (props.cursor === undefined ? positionsOf(snapshot) : undefined),
    [snapshot, props.cursor],
  );
  const [ownStep, setOwnStep] = useState(0);
  const cursor: LensCursor =
    props.cursor ??
    lensCursorFrom(
      ownPositions ?? [],
      Math.min(ownStep, Math.max(0, (ownPositions?.length ?? 1) - 1)),
      setOwnStep,
    );
  const [mode, setMode] = useState<'keys' | 'json'>(props.initialMode ?? 'keys');

  const context = useMemo(
    () =>
      contextAt(snapshot, servedCursorOf(cursor), {
        previous: props.previous ?? previousOf(cursor, ownPositions),
        events,
      }),
    [snapshot, cursor.at.runtimeStageId, cursor.at.commitIdx, cursor.at.step, ownPositions, events],
  );

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
          {props.cursor === undefined && (
            <>
              <button
                type="button"
                style={btn}
                disabled={cursor.at.step <= 0}
                onClick={() => cursor.moveTo(cursor.at.step - 1)}
                data-testid="context-prev"
              >
                {LABELS.previous}
              </button>
              <button
                type="button"
                style={btn}
                disabled={cursor.at.step >= cursor.total - 1}
                onClick={() => cursor.moveTo(cursor.at.step + 1)}
                data-testid="context-next"
              >
                {LABELS.next}
              </button>
            </>
          )}
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
      <Facts context={context} />
      {mode === 'json' ? <JsonPane context={context} /> : <KeyTable context={context} />}
      <ServedBand context={context} />
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
        <ValueCell value={k.value} />
      </td>
    </tr>
  );
}

function ValueCell({ value }: { readonly value: unknown }): React.ReactElement {
  const text = JSON.stringify(value);
  const short = text === undefined ? '' : text.length > 160 ? `${text.slice(0, 157)}…` : text;
  return <span title={text}>{short}</span>;
}

function JsonPane({ context }: { readonly context: ContextAt }): React.ReactElement {
  const object: Record<string, unknown> = {};
  for (const k of context.keys) object[k.path] = k.value;
  return (
    <pre style={{ ...mono, ...pre }} data-testid="context-json">
      {JSON.stringify(object, null, 2)}
    </pre>
  );
}

function ServedBand({ context }: { readonly context: ContextAt }): React.ReactElement | null {
  const served = context.served;
  if (served === undefined) return null;
  const { row, checks } = served;
  return (
    <div style={band} data-testid="context-served" data-epoch={row.view.epoch}>
      <span style={dim}>
        {LABELS.served} · {LABELS.epoch} {row.view.epoch} · {LABELS.system}
      </span>{' '}
      <Badge check={checks.system} /> <span style={dim}>{LABELS.tools}</span>{' '}
      <Badge check={checks.toolNames} />
    </div>
  );
}

function WhyBand({ context }: { readonly context: ContextAt }): React.ReactElement | null {
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
