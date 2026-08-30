/**
 * <BeatStrip> — the run's routing stops as one rail, under the LENS'S OWN
 * transport.
 *
 * TWO PARTS, and only one of them is new:
 *
 *   THE TRANSPORT is `<TimeTravel>` — the component `<Lens>` already ships and
 *   mounts (◀ ▶ ⟳Live, the drag track, ← → Home End). It is not re-implemented
 *   here and must never be: one cursor also means one transport, and a second
 *   faithful slider is the drift class this ecosystem keeps paying for. It is
 *   bound to whatever axis the host gave us — the lens's own step axis when
 *   there is one, the routing-stop projection when this view stands alone.
 *
 *   THE BEAT RAIL is SkillGraph-specific: one card per routing stop, with the
 *   cause that moved the cursor and the skill it landed in. It is a PROJECTION
 *   of the same cursor (which card is lit is derived from it every render), and
 *   clicking one drives the same transport state as the slider above it.
 *
 * A beat whose recording carried no stage id cannot be jumped to; it renders
 * disabled rather than silently doing nothing.
 */

import React from 'react';

import type { SkillBeat } from '../../core/selectors/selectSkillBeats.js';
import { T } from '../theme/index.js';
import { TimeTravel } from '../TimeTravel.js';
import type { SkillLens } from './lens.js';

/** The dot colour per cause — the same vocabulary the route card names. */
function causeColor(beat: SkillBeat): string {
  if (beat.refusedIds.length > 0) return T.error;
  switch (beat.cause) {
    case 'model-pick':
    case 'tool-proposal':
      return T.srcSkill;
    case 'route':
    case 'entry':
      return T.primary;
    case 'stay':
    case 'none':
      return T.textMuted;
    default:
      return T.textSecondary;
  }
}

/**
 * What the shared transport scrubs. `total`/`focus` are the host's axis when
 * it has one (identical numbers to the lens's own transport) and the routing
 * projection otherwise — either way the position is DERIVED, never stored.
 */
export interface BeatTransport {
  readonly total: number;
  readonly focus: number;
  readonly onFocusChange: (position: number) => void;
  /** Whether this transport owns ← → Home End. Off when the page has another. */
  readonly keyboard: boolean;
  /** What the axis is, said in the readout above the rail. */
  readonly axisLabel: string;
  /** The stops ◀ ▶ may land on, when the host narrowed them — positions on
   *  `total`'s axis, handed straight to the shipped transport. Absent ⇒ the
   *  step buttons walk every position, exactly as before. */
  readonly snapSteps?: readonly number[];
}

export interface BeatStripProps {
  readonly beats: readonly SkillBeat[];
  readonly activeIndex?: number;
  readonly lens: SkillLens;
  readonly transport: BeatTransport;
  /** Move THE cursor. The only way this component changes anything. */
  readonly onJumpTo?: (runtimeStageId: string) => void;
}

export function BeatStrip({
  beats,
  activeIndex,
  lens,
  transport,
  onJumpTo,
}: BeatStripProps): React.ReactElement {
  const at = activeIndex ?? -1;

  return (
    <footer
      data-testid="beat-strip"
      style={{
        borderTop: `1px solid ${T.border}`,
        background: T.bgPrimary,
        padding: '4px 12px 8px',
        fontFamily: T.fontSans,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <TimeTravel
            total={transport.total}
            focusSeq={Math.max(0, transport.focus)}
            onFocusChange={transport.onFocusChange}
            isLive={transport.total > 0 && transport.focus >= transport.total - 1}
            keyboard={transport.keyboard}
            {...(transport.snapSteps !== undefined ? { snapSteps: transport.snapSteps } : {})}
          />
        </div>
        <span style={{ fontSize: 11, color: T.textMuted, whiteSpace: 'nowrap' }}>
          {transport.axisLabel}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
        <span style={{ fontSize: 11, color: T.textMuted, whiteSpace: 'nowrap' }}>
          {beats.length === 0
            ? 'no routing stops in this run'
            : at < 0
              ? `${beats.length} routing stop${beats.length === 1 ? '' : 's'} — the cursor is before the first`
              : `${lens === 'product' ? 'step' : 'stop'} ${at + 1} of ${beats.length}`}
        </span>
      </div>

      <div
        style={{
          marginTop: 6,
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          paddingBottom: 2,
        }}
      >
        {beats.map((b, i) => {
          const active = i === at;
          const reachableStop = b.runtimeStageId !== undefined;
          return (
            <button
              key={`${b.turnIndex}:${b.iteration}`}
              type="button"
              data-testid={`beat-${i}`}
              data-active={active ? 'true' : 'false'}
              disabled={!reachableStop}
              onClick={() => {
                if (b.runtimeStageId !== undefined) onJumpTo?.(b.runtimeStageId);
              }}
              title={b.headline}
              style={{
                flex: '0 0 auto',
                minWidth: 132,
                maxWidth: 210,
                textAlign: 'left',
                padding: '6px 8px',
                borderRadius: 8,
                border: `1px solid ${active ? T.primary : T.border}`,
                background: active ? T.bgTertiary : T.bgSecondary,
                color: T.textPrimary,
                cursor: reachableStop ? 'pointer' : 'default',
                opacity: reachableStop ? 1 : 0.55,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  aria-hidden
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: causeColor(b),
                  }}
                />
                <span style={{ fontSize: 11, fontWeight: 600 }}>{b.label}</span>
              </span>
              <span
                style={{
                  display: 'block',
                  marginTop: 3,
                  fontSize: 10,
                  color: T.textMuted,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {lens === 'developer'
                  ? `${b.cause ?? 'no cause'} · ${b.cursorSkillId ?? '—'}`
                  : (b.cursorSkillId ?? 'nothing open yet')}
              </span>
            </button>
          );
        })}
      </div>
    </footer>
  );
}
