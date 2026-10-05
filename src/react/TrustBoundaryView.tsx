import React, { useMemo, useState } from 'react';
import {
  readTrustBoundaries,
  type TrustBoundaryFact,
  type TrustBoundaryCapture,
} from '../core/trustBoundaries/index.js';
import type { SharedCursor } from './useSharedCursor.js';
import type { SourcePrefixResolution, SourcePrefixState } from '../core/cursor/sourcePrefix.js';
import { T } from './theme/index.js';

/** Presentation copy belongs here, not in the headless coordinate resolver. */
export function sourcePrefixMessage(
  value: Extract<SourcePrefixResolution | SourcePrefixState, { status: 'unavailable' }>,
): string {
  switch (value.reason) {
    case 'missing-position':
      return 'No source position was recorded.';
    case 'invalid-position':
      return 'The source position is invalid.';
    case 'missing-log':
      return 'The source log is not in this recording.';
    case 'log-mismatch':
      return 'The recorded log does not match this source position.';
    case 'prefix-unavailable':
      return 'The complete requested source prefix is not retained.';
    case 'invalid-log':
      return 'The source log metadata is unreadable.';
    case 'withheld':
      return 'State values were withheld from this recording.';
    case 'missing-base':
      return 'The recorded initial state is unavailable.';
    case 'damaged-values':
      return 'The source prefix contains unreadable state values.';
    case 'fold-failed':
      return 'The source prefix could not be folded.';
  }
}

export const TRUST_BUTTON_STYLE: React.CSSProperties = {
  padding: '6px 10px',
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  background: T.bgSecondary,
  color: T.textPrimary,
  font: 'inherit',
  cursor: 'pointer',
};

export interface TrustBoundaryViewProps {
  /** The retained run snapshot. Only its versioned TrustBoundaries rows are read. */
  readonly snapshot: unknown;
  /** The host's one cursor. Omit for a read-only view. */
  readonly shared?: SharedCursor;
}

function describe(fact: TrustBoundaryFact): { title: string; detail: string } {
  switch (fact.eventType) {
    case 'agentfootprint.middleware.decision':
      return {
        title: `Middleware ${fact.outcome}`,
        detail: `${fact.middleware} · ${fact.moment} · changed: ${String(
          fact.changed,
        )}. A wrapper can report allow without invoking a rule. Changed is not proof of redaction.${
          fact.moment === 'after-tool'
            ? ' An after-tool refusal does not mean the tool was prevented from running.'
            : ''
        }`,
      };
    case 'agentfootprint.permission.check':
      return {
        title: `Permission ${fact.result}`,
        detail: `${fact.capability}${fact.target ? ` · ${fact.target}` : ''}${
          fact.policyRuleId ? ` · rule ${fact.policyRuleId}` : ''
        }. A check result is not proof of tool execution.`,
      };
    case 'agentfootprint.permission.halt':
      return {
        title: 'Permission halt',
        detail: `${fact.target}${
          fact.checkerId ? ` · ${fact.checkerId}` : ''
        }. A halt was reported.`,
      };
    case 'agentfootprint.credential.requested':
      return {
        title: 'Credential requested',
        detail: `${fact.service}${
          fact.mode ? ` · ${fact.mode}` : ''
        }. Requested does not mean acquired.`,
      };
    case 'agentfootprint.credential.acquired':
      return {
        title: 'Credential acquired',
        detail: `${fact.service} · ${fact.kind}. Acquisition is not proof of later use.`,
      };
    case 'agentfootprint.credential.authorization_required':
      return {
        title: 'Credential authorization required',
        detail: `${fact.service}. User authorization was requested, not confirmed.`,
      };
    case 'agentfootprint.credential.failed':
      return {
        title: 'Credential failed',
        detail: `${fact.service}${
          fact.errorClass ? ` · ${fact.errorClass}` : ''
        }. Credential acquisition failed.`,
      };
  }
}

function Capture({
  capture,
  shared,
}: {
  readonly capture: TrustBoundaryCapture;
  readonly shared?: SharedCursor;
}): React.ReactElement {
  const [page, setPage] = useState(0);
  const [notice, setNotice] = useState<{ seq: number; text: string }>();
  const count = capture.counters;
  const lastPage = Math.max(0, Math.ceil(capture.facts.length / 20) - 1);
  const shownPage = Math.min(page, lastPage);
  const facts = capture.facts.slice(shownPage * 20, (shownPage + 1) * 20);
  const canNavigate = typeof shared?.selectSourcePrefix === 'function';
  return (
    <section aria-label={`Capture ${capture.id}`}>
      <h3 style={{ fontSize: 13 }}>{capture.id}</h3>
      <p style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px' }}>
        {(['observed', 'retained', 'evicted', 'invalid', 'oversized', 'pending'] as const).map(
          (key, index) => (
            <span
              key={key}
              style={{ padding: '3px 6px', border: `1px solid ${T.border}`, borderRadius: 4 }}
            >
              {index === 0 ? 'Observed' : key} {count[key]}
              {index < 5 ? ' · ' : ''}
            </span>
          ),
        )}
      </p>
      <p>
        Observation sequence {capture.firstObservedSeq ?? 'none'}–
        {capture.lastObservedSeq ?? 'none'}; retained {capture.firstRetainedSeq ?? 'none'}–
        {capture.lastRetainedSeq ?? 'none'}. Sequence is capture order, not a global execution
        clock.
      </p>
      {count.evicted + count.invalid + count.oversized + count.pending > 0 && (
        <p role="status">
          This capture has omitted or pending observations. It is not a complete list of decisions.
        </p>
      )}
      {facts.length === 0 && (
        <p>
          No selected facts were retained. This does not mean checks passed or that no crossings
          occurred.
        </p>
      )}
      <ol style={{ paddingLeft: 24 }}>
        {facts.map((fact) => {
          const label = describe(fact);
          return (
            <li
              key={fact.seq}
              value={fact.seq}
              style={{
                padding: '12px 0',
                borderBottom: `1px solid ${T.border}`,
                overflowWrap: 'anywhere',
              }}
            >
              <strong>{label.title}</strong>
              <p>{label.detail}</p>
              <details>
                <summary style={{ cursor: 'pointer', color: T.textSecondary }}>
                  Recorded metadata
                </summary>
                <p>
                  Run {fact.runId} · stage {fact.runtimeStageId}
                  {fact.toolCallId ? ` · call ${fact.toolCallId}` : ''}
                  {fact.iteration !== undefined ? ` · iteration ${fact.iteration}` : ''}
                </p>
                {fact.sourcePosition && (
                  <p>
                    Source log {fact.sourcePosition.logRunId} ·{' '}
                    {fact.sourcePosition.drillPath.join(' / ') || 'root'} · committed through{' '}
                    {fact.sourcePosition.committedThroughIdx}. This is not the emitting stage's
                    eventual commit or read view.
                  </p>
                )}
              </details>
              {!fact.sourcePosition && (
                <p>Unplaced: no authoritative source position was recorded.</p>
              )}
              <button
                style={{
                  ...TRUST_BUTTON_STYLE,
                  marginTop: 8,
                  opacity: !canNavigate || !fact.sourcePosition ? 0.55 : 1,
                }}
                type="button"
                disabled={!canNavigate || !fact.sourcePosition}
                onClick={() => {
                  if (typeof shared?.selectSourcePrefix !== 'function' || !fact.sourcePosition)
                    return;
                  const result = shared.selectSourcePrefix(fact.sourcePosition);
                  setNotice({
                    seq: fact.seq,
                    text:
                      result.status === 'unavailable'
                        ? `Unplaced: ${sourcePrefixMessage(result)}`
                        : result.state.status === 'unavailable'
                        ? `Source location selected. ${sourcePrefixMessage(result.state)}`
                        : 'Source location selected. Its retained prefix is available.',
                  });
                }}
              >
                Inspect source prefix
              </button>
              {!canNavigate && fact.sourcePosition && (
                <span> Source-prefix navigation is unavailable for this cursor.</span>
              )}
              {notice?.seq === fact.seq && <p role="status">{notice.text}</p>}
            </li>
          );
        })}
      </ol>
      {lastPage > 0 && (
        <nav aria-label={`Facts in ${capture.id}`}>
          <button
            style={TRUST_BUTTON_STYLE}
            type="button"
            disabled={shownPage === 0}
            onClick={() => setPage(shownPage - 1)}
          >
            Previous facts
          </button>
          <span>
            {' '}
            Page {shownPage + 1} of {lastPage + 1}{' '}
          </span>
          <button
            style={TRUST_BUTTON_STYLE}
            type="button"
            disabled={shownPage === lastPage}
            onClick={() => setPage(shownPage + 1)}
          >
            Next facts
          </button>
        </nav>
      )}
    </section>
  );
}

/** Runtime evidence only; this view does not reconstruct decisions or certify policy coverage. */
export function TrustBoundaryView({
  snapshot,
  shared,
}: TrustBoundaryViewProps): React.ReactElement {
  const read = useMemo(() => readTrustBoundaries(snapshot), [snapshot]);
  return (
    <section
      aria-label="Trust boundaries"
      style={{
        color: T.textPrimary,
        background: T.bgElevated,
        padding: 16,
        overflow: 'auto',
        fontSize: 12,
        lineHeight: 1.55,
      }}
    >
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <h2 style={{ fontSize: 16 }}>Trust boundaries</h2>
        <p>
          Selected runtime middleware, permission and credential facts. Coverage is unknown: absent
          hooks, late capture and silent paths cannot be inferred from this record. These facts do
          not establish that a run is safe, redacted or compliant.
        </p>
        <p>
          Only metadata is shown here. Other parts of the recording may still contain raw content.
        </p>
        {read.status === 'available' ? (
          read.captures.map((capture) => (
            <Capture key={`${capture.id}:${capture.captureId}`} capture={capture} shared={shared} />
          ))
        ) : (
          <p role="status">{read.message}</p>
        )}
      </div>
    </section>
  );
}
