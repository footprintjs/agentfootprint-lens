/**
 * <FrameFactsPanel> — what the model was looking at on THIS beat.
 *
 * Everything on this panel is verbatim from the recording, and everything the
 * recording does not carry is stated as ABSENT rather than filled in. That
 * split is the panel's whole job, so it is worth naming what falls on each
 * side of it:
 *
 *   ON THE RECORD   `read_skill`'s description as sent (the menu the model was
 *                   reading — the gate rewrites it every iteration), the tool
 *                   catalog as sent, every injection the skills contributed,
 *                   the engineered context the paired LLM call carried, and
 *                   the evidence gate's verdict.
 *   NOT ON IT       the assembled system prompt as one string (the log carries
 *                   the injections that COMPOSE it, not the composed result),
 *                   and the reachable set as data (it exists only as prose
 *                   inside `read_skill`'s description, plus the typed list a
 *                   refusal happens to carry).
 *
 * The absence card names those two rather than leaving a reader to assume the
 * panel is showing everything there was.
 */

import React from 'react';

import type { SkillBeat } from '../../core/selectors/selectSkillBeats.js';
import type { SkillFrameContext } from '../../core/selectors/selectSkillFrameContext.js';
import { T } from '../theme/index.js';

export interface FrameFactsPanelProps {
  readonly beat?: SkillBeat;
  /** The paired LLM call's engineered context. Omitted when the host has no
   *  step graph to pair against — the panel then says the pairing is absent,
   *  which is different from a call that carried nothing. */
  readonly frameContext?: SkillFrameContext;
}

export function FrameFactsPanel({
  beat,
  frameContext,
}: FrameFactsPanelProps): React.ReactElement {
  if (beat === undefined) {
    return (
      <div style={panelStyle} data-testid="frame-facts">
        <p style={{ margin: 0, fontSize: 12, color: T.textMuted }}>
          Nothing has been sent to the model yet at this cursor position.
        </p>
      </div>
    );
  }

  const hop = beat.hop;
  return (
    <div style={panelStyle} data-testid="frame-facts">
      <Header
        title="What the model saw"
        subtitle={`${beat.label} · the call this stop prepared`}
      />

      <Section title="read_skill, as sent" count={hop.readSkillDescription !== undefined ? 1 : 0}>
        {hop.readSkillDescription !== undefined ? (
          <Mono testId="read-skill-description">{hop.readSkillDescription}</Mono>
        ) : (
          <Absent>
            This iteration&apos;s recording carries no <code>read_skill</code> description — either
            the run had no gate tool on this call, or the tool catalog was not captured.
          </Absent>
        )}
      </Section>

      <Section title="tools, as sent" count={hop.toolsAsSent.length}>
        {hop.toolsAsSent.length === 0 ? (
          <Absent>No tool catalog was recorded for this call.</Absent>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {hop.toolsAsSent.map((t) => (
              <div key={t.name} style={{ fontSize: 11.5 }}>
                <span style={{ fontFamily: T.fontMono, color: T.textPrimary }}>{t.name}</span>
                {t.description !== undefined && (
                  <span style={{ color: T.textMuted }}> — {t.description}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="what the skills injected" count={hop.skillInjections.length}>
        {hop.skillInjections.length === 0 ? (
          <Absent>No skill contributed to this call&apos;s prompt.</Absent>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {hop.skillInjections.map((inj, i) => (
              <div key={`${inj.slot}-${inj.skillId ?? i}`}>
                <div style={{ fontSize: 10, color: T.textMuted, fontFamily: T.fontMono }}>
                  {inj.slot}
                  {inj.skillId !== undefined ? ` · ${inj.skillId}` : ''}
                </div>
                <div style={{ fontSize: 11.5, color: T.textSecondary }}>
                  {inj.text ?? inj.summary}
                </div>
                {inj.text === undefined && inj.summary !== '' && (
                  <div style={{ fontSize: 10, color: T.textMuted }}>
                    (summary only — this recording did not capture the full text)
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="engineered context on the call"
        count={frameContext?.injections.length ?? 0}
      >
        {frameContext === undefined ? (
          <Absent>
            No step graph was supplied, so this beat could not be paired with the call it
            prepared. The skill-sourced injections above come from the routing events themselves.
          </Absent>
        ) : !frameContext.paired ? (
          <Absent>
            No LLM call was recorded after this stop — the run ended here, or the call was not
            captured.
          </Absent>
        ) : frameContext.injections.length === 0 ? (
          <Absent>
            The call carried {frameContext.totalInjections} injection
            {frameContext.totalInjections === 1 ? '' : 's'}, all of them baseline (the user
            message, tool results, the static prompt and tool registry) — none engineered.
          </Absent>
        ) : (
          <>
            <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4 }}>
              {frameContext.injections.length} of {frameContext.totalInjections} injections were
              engineered
              {frameContext.stepRuntimeStageId !== undefined
                ? ` · ${frameContext.stepRuntimeStageId}`
                : ''}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {frameContext.injections.map((inj, i) => (
                <span
                  key={`${inj.source}-${inj.slot}-${i}`}
                  title={inj.contentSummary}
                  style={{
                    padding: '2px 6px',
                    borderRadius: 6,
                    border: `1px solid ${T.border}`,
                    background: T.bgSecondary,
                    fontFamily: T.fontMono,
                    fontSize: 10,
                    color: T.textSecondary,
                  }}
                >
                  {inj.source} · {inj.slot}
                </span>
              ))}
            </div>
          </>
        )}
      </Section>

      {hop.evidence !== undefined && (
        <Section title="evidence gate" count={hop.evidence.unsupported.length}>
          <div style={{ fontSize: 11.5, color: T.textSecondary }}>
            verdict {hop.evidence.action ?? '—'}
            {hop.evidence.posture !== undefined ? ` · posture ${hop.evidence.posture}` : ''}
            {hop.evidence.evidenceTruncated === true
              ? ' · the evidence index hit its ceiling, so this verdict judged a partial corpus'
              : ''}
          </div>
          {hop.evidence.unsupported.map((u, i) => (
            <div key={i} style={{ fontSize: 11, color: T.warning }}>
              unsupported: {u.value}
              {u.shape !== undefined ? ` (${u.shape})` : ''}
            </div>
          ))}
        </Section>
      )}

      <div
        data-testid="frame-absence"
        style={{
          marginTop: 12,
          padding: '8px 10px',
          borderRadius: 8,
          border: `1px dashed ${T.border}`,
          background: T.bgSecondary,
          fontSize: 11,
          lineHeight: 1.45,
          color: T.textMuted,
        }}
      >
        <strong style={{ color: T.textSecondary }}>Not in this recording.</strong> The system
        prompt as one assembled string is not recorded — the injections above are the pieces it
        was composed from. The reachable set is not recorded as data either: it appears as prose
        inside <code>read_skill</code>&apos;s description, and as a typed list only when the gate
        refused a pick. Neither is reconstructed here.
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  height: '100%',
  overflow: 'auto',
  padding: 12,
  boxSizing: 'border-box',
  background: T.bgPrimary,
  color: T.textPrimary,
  fontFamily: T.fontSans,
};

function Header({ title, subtitle }: { title: string; subtitle: string }): React.ReactElement {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 650 }}>{title}</div>
      <div style={{ fontSize: 11, color: T.textMuted }}>{subtitle}</div>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section style={{ marginTop: 10, borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 5,
        }}
      >
        <span
          style={{
            fontSize: 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: T.textMuted,
          }}
        >
          {title}
        </span>
        <span style={{ fontSize: 10, color: T.textMuted, fontFamily: T.fontMono }}>{count}</span>
      </div>
      {children}
    </section>
  );
}

function Mono({ children, testId }: { children: string; testId?: string }): React.ReactElement {
  return (
    <pre
      data-testid={testId}
      style={{
        margin: 0,
        padding: 8,
        borderRadius: 6,
        background: T.bgSecondary,
        color: T.textSecondary,
        fontFamily: T.fontMono,
        fontSize: 11,
        lineHeight: 1.45,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        maxHeight: 220,
        overflow: 'auto',
      }}
    >
      {children}
    </pre>
  );
}

function Absent({ children }: { children: React.ReactNode }): React.ReactElement {
  return <p style={{ margin: 0, fontSize: 11.5, color: T.textMuted }}>{children}</p>;
}
