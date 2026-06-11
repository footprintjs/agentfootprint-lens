/**
 * <ToolChoicePanel> — per-iteration tool-choice margins (RFC-002 C7).
 *
 * Visualizes one `toolChoiceRecorder` call at a time: horizontal bars of
 * the offered-tool scores (chosen highlighted), a margin badge, and the
 * ⚠ NARROW / ⚠ PROXY-DISAGREEMENT flags — plus a run-summary line with
 * the flagged-call count.
 *
 * ONE-CURSOR law: the visible call is DERIVED from the Lens cursor via
 * `selectToolChoiceCall` (exact → within-subflow → nearest-previous).
 * The panel owns no call index, no second slider, no parallel data path
 * (see `memory/lens_v0_1_one_cursor_architecture.md`).
 *
 * Honest-claim discipline (RFC-002 §2): the caption states that margins
 * are embedding-geometry PROXIES between the choice context and the
 * tool descriptions — never model internals. Bars are normalized to the
 * top score, so a close call LOOKS close — honesty by construction.
 *
 * U3 windowing: the score-bar list threshold-gates through
 * `useWindowedList` (default 300, same contract as EventStream) so a
 * huge tool catalog renders only the scrolled-to window.
 */

import React from 'react';
import type { ToolChoiceCall, ToolChoiceSummary } from 'agentfootprint/observe';
import type { CursorPosition } from '../../core/group/cursorPositionsAtDrill.js';
import { selectToolChoiceCall } from '../../core/selectors/selectToolChoiceCall.js';
import { useWindowedList } from '../hooks/useWindowedList.js';
import { T } from '../theme/index.js';

export interface ToolChoicePanelProps {
  /** All recorded tool-offering LLM calls (from `useToolChoice`). */
  readonly calls: readonly ToolChoiceCall[];
  /** Run-summary counts — drives the flagged-call summary line. */
  readonly summary?: ToolChoiceSummary;
  /** The ONE Lens cursor — the visible call derives from it. */
  readonly cursorRuntimeStageId: string;
  /** Cursor position kind — discriminates Run·start vs Run·end. */
  readonly cursorKind?: CursorPosition['kind'];
  /** True while the lazy scoring read is in flight. */
  readonly pending?: boolean;
  /** Last read error — rendered, never swallowed. */
  readonly error?: string;
  /** Offered-tool row count past which windowing engages. Default 300. */
  readonly virtualizeThreshold?: number;
  /** Fixed row height (px) for windowed bar rows. Default 22. */
  readonly rowHeight?: number;
}

const SKIP_LABELS: Record<string, string> = {
  'nothing-chosen': 'model answered without invoking a tool — nothing to score',
  'chosen-not-offered': 'chosen tool was not in the offered catalog (wiring anomaly)',
};

export const ToolChoicePanel: React.FC<ToolChoicePanelProps> = ({
  calls,
  summary,
  cursorRuntimeStageId,
  cursorKind,
  pending = false,
  error,
  virtualizeThreshold = 300,
  rowHeight = 22,
}) => {
  const call = selectToolChoiceCall(calls, cursorRuntimeStageId, cursorKind);
  const scores = call?.margin?.scores ?? [];
  // Unscored calls still show their offered menu (honest: recorded, not
  // yet ranked) — same row shape, no bar.
  const rowCount = scores.length > 0 ? scores.length : (call?.offered.length ?? 0);
  const w = useWindowedList({
    count: rowCount,
    rowHeight,
    threshold: virtualizeThreshold,
  });

  return (
    <div
      role="region"
      aria-label="Tool choice"
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        fontSize: 12,
        fontFamily: T.fontSans,
        color: T.textPrimary,
      }}
    >
      {/* Run-summary line — flagged-call count (C7 spec). */}
      <div
        style={{
          flex: 'none',
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          padding: '5px 12px',
          borderBottom: `1px solid ${T.border}`,
          fontSize: 11,
        }}
      >
        {summary ? (
          <>
            <span
              style={{
                fontWeight: 600,
                color: summary.flagged > 0 ? T.warning : T.textSecondary,
              }}
            >
              {summary.flagged > 0 ? '⚠ ' : ''}
              {summary.flagged} flagged
            </span>
            <span style={{ color: T.textSecondary }}>
              {summary.scored} scored · {summary.llmCallsWithTools} calls offered tools
            </span>
            {summary.flagged > 0 && (
              <span style={{ color: T.textSecondary }}>
                ({summary.narrow} narrow, {summary.proxyDisagreement} proxy-disagreement)
              </span>
            )}
          </>
        ) : (
          <span style={{ color: T.textSecondary, fontStyle: 'italic' }}>
            {pending ? 'scoring tool choices…' : 'no tool-choice data yet'}
          </span>
        )}
        {pending && summary && (
          <span style={{ color: T.textSecondary, fontStyle: 'italic' }}>updating…</span>
        )}
      </div>

      {error !== undefined && (
        <div
          style={{
            flex: 'none',
            padding: '4px 12px',
            color: T.error,
            borderBottom: `1px solid ${T.border}`,
          }}
        >
          Tool-choice read failed: {error}
        </div>
      )}

      {/* Cursor-derived call view. */}
      <div
        onScroll={w.onScroll}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 12px 0' }}
      >
        {call === undefined ? (
          <div style={{ color: T.textSecondary, fontStyle: 'italic', padding: '4px 0' }}>
            {calls.length === 0
              ? pending
                ? 'Waiting for the first scored call…'
                : 'No LLM call offered tools in this run.'
              : 'No tool-offering LLM call at or before this cursor position.'}
          </div>
        ) : (
          <>
            <CallHeader call={call} />
            {scores.length > 0 ? (
              <div role="list" aria-label="Offered tool scores">
                {w.topPad > 0 && <div style={{ height: w.topPad }} aria-hidden />}
                {scores.slice(w.start, w.end).map((s) => (
                  <ScoreBar
                    key={s.name}
                    name={s.name}
                    score={s.score}
                    maxScore={scores[0]!.score}
                    chosen={call.chosen.includes(s.name)}
                    topScored={call.margin!.topScored === s.name}
                    rowHeight={rowHeight}
                    pinned={w.windowed}
                  />
                ))}
                {w.bottomPad > 0 && <div style={{ height: w.bottomPad }} aria-hidden />}
              </div>
            ) : (
              <div role="list" aria-label="Offered tools (not scored)">
                {w.topPad > 0 && <div style={{ height: w.topPad }} aria-hidden />}
                {call.offered.slice(w.start, w.end).map((t) => (
                  <div
                    key={t.name}
                    role="listitem"
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      color: call.chosen.includes(t.name) ? T.textPrimary : T.textSecondary,
                      ...(w.windowed
                        ? { height: rowHeight, overflow: 'hidden' }
                        : { padding: '2px 0' }),
                    }}
                  >
                    <span style={{ fontFamily: T.fontMono }}>
                      {call.chosen.includes(t.name) ? '✓ ' : ''}
                      {t.name}
                    </span>
                  </div>
                ))}
                {w.bottomPad > 0 && <div style={{ height: w.bottomPad }} aria-hidden />}
              </div>
            )}
          </>
        )}
      </div>

      {/* Honest-claim caption — matches the recorder's discipline. */}
      <div
        style={{
          flex: 'none',
          padding: '4px 12px 6px',
          fontSize: 10,
          color: T.textMuted,
          fontStyle: 'italic',
          borderTop: `1px solid ${T.border}`,
        }}
      >
        Margins are embedding-geometry proxies (choice context ↔ tool descriptions) — not
        model internals.
      </div>
    </div>
  );
};

// ─── Call header: iteration, id, margin badge, flags ───────────────

const CallHeader: React.FC<{ call: ToolChoiceCall }> = ({ call }) => {
  const margin = call.margin;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        padding: '2px 0 6px',
      }}
    >
      <span style={{ fontWeight: 600 }}>Iteration {call.iteration}</span>
      <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.textSecondary }}>
        {call.runtimeStageId}
      </span>
      {margin && margin.margin !== undefined && (
        <span
          aria-label="margin"
          style={{
            fontFamily: T.fontMono,
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 8,
            border: `1px solid ${margin.flags.narrow ? T.warning : T.border}`,
            color: margin.flags.narrow ? T.warning : T.textSecondary,
          }}
        >
          margin {margin.margin.toFixed(3)}
        </span>
      )}
      {margin && margin.margin === undefined && (
        <span style={{ fontSize: 10, color: T.textSecondary, fontStyle: 'italic' }}>
          every offered tool was chosen — no competition to measure
        </span>
      )}
      {margin?.flags.narrow && <FlagBadge label="⚠ NARROW" />}
      {margin?.flags.proxyDisagreement && <FlagBadge label="⚠ PROXY-DISAGREEMENT" />}
      {call.skipped !== undefined && (
        <span style={{ fontSize: 10, color: T.textSecondary, fontStyle: 'italic' }}>
          {SKIP_LABELS[call.skipped] ?? call.skipped}
        </span>
      )}
      {margin === undefined && call.skipped === undefined && (
        <span style={{ fontSize: 10, color: T.textSecondary, fontStyle: 'italic' }}>
          not scored yet
        </span>
      )}
    </div>
  );
};

const FlagBadge: React.FC<{ label: string }> = ({ label }) => (
  <span
    style={{
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: '0.05em',
      padding: '1px 6px',
      borderRadius: 8,
      color: T.warning,
      border: `1px solid ${T.warning}`,
      background: `color-mix(in srgb, ${T.warning} 12%, transparent)`,
    }}
  >
    {label}
  </span>
);

// ─── One offered tool's score bar ──────────────────────────────────

const ScoreBar: React.FC<{
  name: string;
  score: number;
  maxScore: number;
  chosen: boolean;
  topScored: boolean;
  rowHeight: number;
  pinned: boolean;
}> = ({ name, score, maxScore, chosen, topScored, rowHeight, pinned }) => {
  // Width relative to the TOP score — close scores produce visually
  // close bars (the honest rendering of a narrow margin). Negative
  // cosines clamp to a sliver; the numeric label carries the truth.
  const pct = maxScore > 0 ? Math.max(0.02, Math.max(0, score) / maxScore) * 100 : 2;
  return (
    <div
      role="listitem"
      data-chosen={chosen}
      data-top-scored={topScored}
      aria-label={`${name}: score ${score.toFixed(3)}${chosen ? ', chosen' : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        ...(pinned ? { height: rowHeight, overflow: 'hidden' } : { padding: '2px 0' }),
      }}
    >
      <span
        style={{
          flex: 'none',
          width: 170,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontFamily: T.fontMono,
          fontSize: 11,
          fontWeight: chosen ? 700 : 400,
          color: chosen ? T.textPrimary : T.textSecondary,
        }}
      >
        {chosen ? '✓ ' : ''}
        {name}
      </span>
      <span style={{ flex: 1, minWidth: 40, display: 'flex', alignItems: 'center' }}>
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: `${pct}%`,
            height: 8,
            borderRadius: 2,
            background: chosen ? T.primary : T.bgTertiary,
            ...(topScored && !chosen ? { outline: `1px solid ${T.warning}` } : {}),
          }}
        />
      </span>
      <span
        style={{
          flex: 'none',
          width: 44,
          textAlign: 'right',
          fontFamily: T.fontMono,
          fontSize: 10,
          color: T.textSecondary,
        }}
      >
        {score.toFixed(3)}
      </span>
      {topScored && !chosen && (
        <span style={{ flex: 'none', fontSize: 9, color: T.warning }}>proxy top pick</span>
      )}
    </div>
  );
};
