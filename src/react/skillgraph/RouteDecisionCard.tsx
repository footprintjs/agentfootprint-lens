/**
 * <RouteDecisionCard> — why the cursor is where it is, on the beat being shown.
 *
 * The card is the answer to one question ("what moved it, and on what
 * evidence") and it is built only from the hop's own fields: the cause, the
 * library's sentence for it, the witness the rule matched on, and every
 * refusal / conflict / superseded pick stamped on the same iteration. Nothing
 * here is inferred from neighbouring beats — the one exception is a refusal's
 * `cursorAfter`, which the FOLD correlated (the refusal and its consequence
 * are stamped an iteration apart) and which is rendered as what it is: the
 * next iteration's cursor row.
 */

import React from 'react';

import type { SkillBeat } from '../../core/selectors/selectSkillBeats.js';
import type { SkillTurnStart } from '../../core/selectors/selectSkillRoute.js';
import { T } from '../theme/index.js';
import type { SkillLens } from './lens.js';

/** What each cause is called for a reader who does not know the vocabulary. */
const CAUSE_LABEL: Record<string, string> = {
  entry: 'a start rule matched',
  route: "the author's edge fired",
  'model-pick': 'the model picked it',
  'tool-proposal': 'a tool proposed it',
  intent: 'the message was scored',
  continuity: 'the conversation carried on',
  decider: 'a separate chooser settled it',
  stay: 'nothing moved it',
  none: 'no skill was in play',
};

export interface RouteDecisionCardProps {
  readonly beat?: SkillBeat;
  /**
   * The routing verdict for THIS beat's turn, joined by `turnIndex` — the one
   * field both types carry, so the correlation is a real key rather than a
   * guess about adjacency.
   *
   * Present only to show the SCORES. Tier 1 renders its witness (the substring
   * a rule matched); tier 2 had no equivalent, so a scored route announced that
   * it happened and never said with what numbers — the one kind of routing a
   * reader cannot work out for themselves.
   */
  readonly turnStart?: SkillTurnStart;
  readonly lens: SkillLens;
}

export function RouteDecisionCard({ beat, turnStart, lens }: RouteDecisionCardProps): React.ReactElement {
  return (
    <aside
      data-testid="route-decision-card"
      aria-live="polite"
      style={{
        padding: '10px 12px',
        borderTop: `1px solid ${T.border}`,
        background: T.bgPrimary,
        fontFamily: T.fontSans,
        color: T.textPrimary,
        maxHeight: 210,
        overflow: 'auto',
      }}
    >
      {beat === undefined ? (
        <p style={{ margin: 0, fontSize: 12, color: T.textMuted }}>
          The cursor is before this run&apos;s first routing stop — nothing has been decided yet.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 10,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: T.textMuted,
              }}
            >
              {beat.moved ? 'Why it moved' : 'Why it stayed'}
            </span>
            <strong style={{ fontSize: 13 }}>
              {beat.hop.from !== undefined ? `${beat.hop.from} → ` : ''}
              {beat.hop.to ?? '—'}
            </strong>
            {beat.cause !== undefined && (
              <span
                data-testid="route-cause"
                style={{
                  padding: '2px 6px',
                  borderRadius: 6,
                  border: `1px solid ${T.border}`,
                  background: T.bgSecondary,
                  fontFamily: lens === 'developer' ? T.fontMono : T.fontSans,
                  fontSize: 10,
                  color: T.textSecondary,
                }}
              >
                {lens === 'developer' ? beat.cause : (CAUSE_LABEL[beat.cause] ?? beat.cause)}
              </span>
            )}
          </div>

          <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.45, color: T.textSecondary }}>
            {beat.headline}
          </p>

          {beat.hop.witness !== undefined && (
            <Evidence label="the message said">
              &ldquo;{beat.hop.witness.text}&rdquo;
              {beat.hop.witness.keyword !== undefined && (
                <span style={{ color: T.textMuted }}> — matched on “{beat.hop.witness.keyword}”</span>
              )}
            </Evidence>
          )}

          {beat.reachable !== undefined && (
            <Evidence label={`reachable (${beat.reachable.source})`}>
              {beat.reachable.ids.length > 0
                ? beat.reachable.ids.join(', ')
                : 'none — a dead end: no skill was admissible from this cursor'}
            </Evidence>
          )}

          {beat.hop.offered !== undefined && (
            <Evidence label="menu offered">{beat.hop.offered.join(', ')}</Evidence>
          )}

          {beat.hop.refusals.map((r, i) => (
            <div
              key={`${r.requestedId}-${i}`}
              data-testid="route-refusal"
              style={{
                marginTop: 8,
                padding: '8px 10px',
                borderRadius: 8,
                border: `1px solid ${T.error}`,
                background: T.bgSecondary,
              }}
            >
              <div style={{ fontSize: 11.5, color: T.error, fontWeight: 600 }}>
                refused: read_skill(&ldquo;{r.requestedId}&rdquo;)
                {r.posture !== undefined && (
                  <span style={{ color: T.textMuted, fontWeight: 400 }}> · posture {r.posture}</span>
                )}
              </div>
              {r.allowed.length > 0 && (
                <Evidence label="reachable instead">{r.allowed.join(', ')}</Evidence>
              )}
              {r.refusalText !== undefined ? (
                <pre
                  style={{
                    margin: '6px 0 0',
                    padding: 8,
                    borderRadius: 6,
                    background: T.bgPrimary,
                    color: T.textSecondary,
                    fontFamily: T.fontMono,
                    fontSize: 11,
                    lineHeight: 1.4,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {r.refusalText}
                </pre>
              ) : (
                <p style={{ margin: '6px 0 0', fontSize: 11, color: T.textMuted }}>
                  The sentence the model read back is not in this recording (no tool result was
                  paired with the refused call).
                </p>
              )}
              {r.cursorAfter !== undefined ? (
                <p style={{ margin: '6px 0 0', fontSize: 11, color: T.textSecondary }}>
                  Next iteration ({r.cursorAfter.iteration}):{' '}
                  {r.cursorAfter.moved
                    ? `the cursor moved to "${r.cursorAfter.to ?? '—'}" (${r.cursorAfter.by ?? '—'}).`
                    : `the cursor did not move (${r.cursorAfter.by ?? '—'}).`}
                </p>
              ) : (
                <p style={{ margin: '6px 0 0', fontSize: 11, color: T.textMuted }}>
                  The run ended on this iteration — no later cursor row exists to say what the
                  refusal led to.
                </p>
              )}
            </div>
          ))}

          {beat.notes.length > 0 && (
            <ul
              data-testid="route-notes"
              style={{
                margin: '8px 0 0',
                paddingLeft: 16,
                fontSize: 11.5,
                lineHeight: 1.45,
                color: T.textSecondary,
              }}
            >
              {beat.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}

          {/* Scores, for the tiers that HAVE numbers. `intent` is a scorer win;
              `continuity` carries the losing numbers when it stayed on a
              near-tie. Every other verdict has nothing to show, and shows
              nothing — the house law: render only what the event carries. */}
          {turnStart !== undefined &&
            (turnStart.by === 'intent' || turnStart.by === 'continuity') && (
              <ScoreTable start={turnStart} />
            )}

          {lens === 'developer' && beat.runtimeStageId !== undefined && (
            <div style={{ marginTop: 8, fontFamily: T.fontMono, fontSize: 10, color: T.textMuted }}>
              {beat.runtimeStageId}
            </div>
          )}
        </>
      )}
    </aside>
  );
}

function Evidence({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div style={{ marginTop: 6, fontSize: 11.5, color: T.textSecondary }}>
      <span
        style={{
          marginRight: 6,
          fontFamily: T.fontMono,
          fontSize: 10,
          color: T.textMuted,
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * The scores a tier-2 route was decided by — every candidate, losers included.
 *
 * Why the losers are the point: a floor is a number you set by looking at what
 * real messages score, and a near-tie is only visible next to what it nearly
 * tied with. A winner alone tells a reader nothing they can act on.
 *
 * ONE LIMIT, and it is not recoverable from this data: a candidate scored 0
 * because a scorer gated it out (wrong product, say) and one scored 0 because
 * its overlap was genuinely low are the same number here. If a scorer ever
 * carries its own reason on `witness`, that is where the distinction would come
 * from — until then this renders the number and declines to interpret it.
 */
function ScoreTable({ start }: { readonly start: SkillTurnStart }): React.ReactElement | null {
  if (start.scores.length === 0) return null;
  const floor = start.policy?.floor;
  const margin = start.policy?.nearTieMargin;

  return (
    <div style={{ marginTop: 8 }}>
      <div
        style={{
          fontSize: 10,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: T.textMuted,
          marginBottom: 4,
        }}
      >
        Scored{start.scorer ? ` by ${start.scorer}` : ''}
        {floor !== undefined ? ` · floor ${floor}` : ''}
        {start.runnerUp !== undefined && margin !== undefined
          ? ` · gap ${fmt(start.runnerUp.gap)} of ${margin} needed`
          : ''}
      </div>
      <table
        style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}
      >
        <caption
          style={{
            captionSide: 'top',
            textAlign: 'left',
            fontSize: 11,
            color: T.textMuted,
            paddingBottom: 3,
          }}
        >
          Every candidate this turn was scored against, best first.
        </caption>
        <tbody>
          {start.scores.map((row) => {
            const belowFloor = floor !== undefined && row.score <= floor;
            const won = row.id === start.to;
            return (
              <tr key={row.id}>
                <td
                  style={{
                    padding: '2px 6px 2px 0',
                    color: belowFloor ? T.textMuted : T.textPrimary,
                    fontWeight: won ? 700 : 400,
                    fontFamily: T.fontMono,
                  }}
                >
                  {won ? '→ ' : '   '}
                  {row.id}
                </td>
                <td
                  style={{
                    padding: '2px 6px',
                    textAlign: 'right',
                    fontFamily: T.fontMono,
                    color: belowFloor ? T.textMuted : T.textPrimary,
                  }}
                >
                  {fmt(row.score)}
                </td>
                <td
                  style={{
                    padding: '2px 6px',
                    textAlign: 'right',
                    fontFamily: T.fontMono,
                    color: T.textMuted,
                  }}
                >
                  {Math.round(row.relevance * 100)}%
                </td>
                <td style={{ padding: '2px 0 2px 6px', color: T.textMuted, fontSize: 11 }}>
                  {/* "did not match at all" and "was beaten" are different facts.
                      Stated in words, not by colour alone. */}
                  {belowFloor ? 'below floor' : won ? '' : 'beaten'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Three decimals, trailing zeros trimmed — a raw score, not a percentage. */
function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}
