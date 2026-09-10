/**
 * <BookmarksTab> — the reader's marks on the Why Lens, riding the ONE cursor.
 *
 * THE LAWS THIS FILE KEEPS:
 *
 *   1. ONE CURSOR. Props in (`step`, `positions`, the movement `port`), a
 *      move out through `moveTo` — the same funnel every other mover uses. A
 *      bookmark jump is `port.toMark` (the library's `jumpToMark`, seated on
 *      the step the Lens owns) and a miss never moves. No local position.
 *   2. NEVER IN THE RECORD. A bookmark is a row in a sidecar the host's store
 *      keeps; the snapshot and the log are never written.
 *   3. OMIT, NEVER DENY. An entry whose stop this recording does not hold is
 *      shown greyed with the label "not in this recording" — not dropped.
 *   4. NO CLAIM SENTENCES. Every string this tab prints is a value of `LABELS`
 *      (`test/served/no-own-claims.test.ts` walks this file) or computed data
 *      — a stop's own label, a commit index, the reader's own note.
 *   5. PERSISTENCE IS A LABEL. An unavailable store, or a snapshot with no
 *      `runId`, is said on screen; nothing throws.
 */

import React from 'react';

import type { Bookmark } from '../../core/bookmarks/index.js';
import type { CursorPosition } from '../../core/group/cursorPositionsAtDrill.js';
import type { LensCursorPort } from '../../core/timeTravel/lensCursorPort.js';
import type { BookmarkPersistence } from '../hooks/useBookmarkSidecar.js';
import { T } from '../theme/index.js';

/** Every string this tab owns. Labels, never sentences about the run. */
export const LABELS = Object.freeze({
  tab: 'Bookmarks',
  bookmarkThisStop: 'Bookmark this stop',
  removeBookmark: 'Remove bookmark',
  jump: 'Jump',
  remove: 'Remove',
  note: 'note',
  addNote: 'add a note',
  commit: 'commit',
  notInRecording: 'not in this recording',
  savedInBrowser: 'saved in this browser',
  notSaved: 'bookmarks not saved',
  noRunId: 'no run id',
  none: 'no bookmarks yet',
  orphaned: 'from another reading',
} as const);

const PERSISTENCE_LABEL: Record<BookmarkPersistence, string> = {
  saved: LABELS.savedInBrowser,
  unavailable: LABELS.notSaved,
  'no-key': LABELS.noRunId,
};

export interface BookmarksTabProps {
  readonly bookmarks: readonly Bookmark[];
  readonly orphaned: readonly Bookmark[];
  readonly persistence: BookmarkPersistence;
  /** The active axis — the stop's own label and commit come from here. */
  readonly positions: readonly CursorPosition[];
  /** THE cursor's step. */
  readonly step: number;
  /** The movement port the Lens opened (with these bookmarks as its marks). */
  readonly port: LensCursorPort;
  /** The ONE funnel. */
  readonly moveTo: (step: number) => void;
  readonly onAdd: (bookmark: Bookmark) => void;
  readonly onRemove: (runtimeStageId: string) => void;
  readonly onNote: (runtimeStageId: string, note: string) => void;
}

export function BookmarksTab({
  bookmarks,
  orphaned,
  persistence,
  positions,
  step,
  port,
  moveTo,
  onAdd,
  onRemove,
  onNote,
}: BookmarksTabProps): React.ReactElement {
  const here = positions[step];
  const hereMarked = here !== undefined && bookmarks.some((b) => b.runtimeStageId === here.runtimeStageId);
  // The Lens's ROOT bookends ("Run · start" / "Run · end") share one synthetic
  // address, so a mark on either would resolve to the first. They are not
  // bookmarkable — Home / End reach them on every axis already — and the
  // toggle says so by being disabled there, rather than marking the wrong one.
  const hereIsRootBookend =
    here !== undefined && here.depth === 0 && (here.kind === 'group-start' || here.kind === 'group-end');

  const toggle = (): void => {
    if (here === undefined) return;
    if (hereMarked) {
      onRemove(here.runtimeStageId);
      return;
    }
    // The LIBRARY names the mark — `mark()` on its cursor, seated on this
    // step — and the sidecar keeps what it said.
    const mark = port.mark(step);
    if (mark === undefined) return;
    onAdd({ runtimeStageId: mark.runtimeStageId, commitIdx: here.commitIdx, madeAt: Date.now() });
  };

  const jump = (b: Bookmark): void => {
    const to = port.toMark(step, b.runtimeStageId);
    if (to.ok && to.step !== undefined) moveTo(to.step);
  };

  const stopLabel = (b: Bookmark): string =>
    positions.find((p) => p.runtimeStageId === b.runtimeStageId)?.label ?? b.runtimeStageId;

  return (
    <div data-testid="bookmarks-tab" data-persistence={persistence} style={rootStyle}>
      <div style={headRowStyle}>
        <button
          type="button"
          data-testid="bookmark-toggle"
          aria-pressed={hereMarked}
          disabled={here === undefined || hereIsRootBookend}
          onClick={toggle}
          style={buttonStyle(hereMarked)}
        >
          {hereMarked ? LABELS.removeBookmark : LABELS.bookmarkThisStop}
        </button>
        <span data-testid="bookmark-persistence" style={mutedStyle}>
          {PERSISTENCE_LABEL[persistence]}
        </span>
      </div>

      {bookmarks.length === 0 && orphaned.length === 0 ? (
        <div style={mutedStyle}>{LABELS.none}</div>
      ) : (
        <ul style={listStyle} data-testid="bookmark-list">
          {bookmarks.map((b) => (
            <li
              key={b.runtimeStageId}
              data-testid="bookmark-row"
              data-runtime-stage-id={b.runtimeStageId}
              data-current={here?.runtimeStageId === b.runtimeStageId ? 'true' : undefined}
              style={rowStyle(here?.runtimeStageId === b.runtimeStageId)}
            >
              <button type="button" onClick={() => jump(b)} style={jumpStyle} aria-label={`${LABELS.jump}: ${stopLabel(b)}`}>
                <span style={stopLabelStyle}>{stopLabel(b)}</span>
                <span style={mutedStyle}>
                  {LABELS.commit} {b.commitIdx}
                </span>
              </button>
              <input
                key={b.label ?? ''}
                type="text"
                aria-label={LABELS.note}
                placeholder={LABELS.addNote}
                defaultValue={b.label ?? ''}
                onBlur={(e) => onNote(b.runtimeStageId, e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                style={noteStyle}
              />
              <button
                type="button"
                onClick={() => onRemove(b.runtimeStageId)}
                aria-label={`${LABELS.remove}: ${stopLabel(b)}`}
                style={smallButtonStyle}
              >
                {LABELS.remove}
              </button>
            </li>
          ))}
          {orphaned.map((b) => (
            <li
              key={b.runtimeStageId}
              data-testid="bookmark-row"
              data-orphaned="true"
              data-runtime-stage-id={b.runtimeStageId}
              style={{ ...rowStyle(false), opacity: 0.55 }}
            >
              <span style={stopLabelStyle}>{b.label ?? b.runtimeStageId}</span>
              <span style={mutedStyle}>{LABELS.notInRecording}</span>
              <button
                type="button"
                onClick={() => onRemove(b.runtimeStageId)}
                aria-label={`${LABELS.remove}: ${b.runtimeStageId}`}
                style={smallButtonStyle}
              >
                {LABELS.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const rootStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '8px 10px',
  fontFamily: T.fontSans,
  fontSize: 12,
  color: T.textPrimary,
  overflowY: 'auto',
  minHeight: 0,
};
const headRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' };
const mutedStyle: React.CSSProperties = { color: T.textMuted, fontSize: 11 };
const listStyle: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 };
const rowStyle = (current: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 6px',
  borderRadius: 4,
  border: `1px solid ${current ? T.primary : T.border}`,
  background: T.bgElevated,
});
const stopLabelStyle: React.CSSProperties = { fontWeight: 600, whiteSpace: 'nowrap' };
const jumpStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
  background: 'transparent',
  border: 'none',
  color: T.textPrimary,
  cursor: 'pointer',
  padding: 0,
  textAlign: 'left',
};
const noteStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 60,
  fontSize: 11,
  padding: '2px 6px',
  border: `1px solid ${T.border}`,
  borderRadius: 4,
  background: T.bgPrimary,
  color: T.textPrimary,
};
const buttonStyle = (pressed: boolean): React.CSSProperties => ({
  background: pressed ? T.primary : 'transparent',
  color: pressed ? '#fff' : T.textSecondary,
  border: `1px solid ${pressed ? T.primary : T.border}`,
  borderRadius: 999,
  padding: '2px 10px',
  fontSize: 11,
  cursor: 'pointer',
});
const smallButtonStyle: React.CSSProperties = {
  background: 'transparent',
  color: T.textMuted,
  border: `1px solid ${T.border}`,
  borderRadius: 4,
  padding: '1px 6px',
  fontSize: 10.5,
  cursor: 'pointer',
};
