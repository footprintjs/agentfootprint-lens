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
  readonly lens: SkillLens;
}

export function RouteDecisionCard({ beat, lens }: RouteDecisionCardProps): React.ReactElement {
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
