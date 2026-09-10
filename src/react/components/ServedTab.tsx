/**
 * <ServedTab> — at every LLM call, exactly what the model was served, provable
 * from the log.
 *
 * agentfootprint 9.88.0 ships the two halves: `servedAt(k)` REBUILDS the
 * request from committed pieces and `receiptAt(k)` reads the hashes-only
 * record the call itself committed. This tab renders both at the Why Lens's
 * one cursor and marks every field with what the check established.
 *
 * THE LAWS THIS FILE KEEPS — each one was learned by breaking it:
 *
 *   1. OMIT, NEVER DENY. A field a gap covers is never rendered as "empty" or
 *      "none": the gap is the empty state, printed beside the field.
 *   2. NO CLAIM SENTENCES OF ITS OWN. Every explanatory sentence on this tab
 *      is `SERVED_GAPS[k].why` / `UNGAPPED_FIELDS[k]` VERBATIM, or is computed
 *      data (a status, a count, a hash, a diff). The strings this file owns are
 *      LABELS — `LABELS` below — and `test/served/no-own-claims.test.ts` walks
 *      every literal to keep it that way.
 *   3. VERIFIED MEANS HASHES AGREE. The badge reads what `core/served/verify`
 *      decided with the library's own `receiptHash` / `messageDigestInput`.
 *   4. AUTHORITY OMISSIONS COME FROM THE FOLD. Hidden skill ids are read at the
 *      stop through footprintjs's `stateAt` (`foldFactsAt`), never from the
 *      receipt, and labelled "hidden from the model".
 *   5. ONE CURSOR. Props in (`cursorRuntimeStageId`, `commitIdx`), a jump
 *      request out (`onJumpTo`). The only local state is a diff toggle and
 *      which schemas are expanded — never a position.
 *
 * A RECORD CAN NEVER TAKE THE LENS DOWN. The tab reads a shape it does not own
 * off a recording that came from disk; the core narrows it (`receiptShape.ts`)
 * and a render throw past that is caught by the boundary at the bottom of this
 * file, which prints the Damaged badge and the thrown message as data — so the
 * one cursor and every other tab survive exactly the record this tab exists
 * to call damaged.
 */

import React, { useMemo, useState } from 'react';
import { SERVED_GAPS, UNGAPPED_FIELDS, type ServedGap } from 'agentfootprint';

import {
  EXCUSING_GAPS,
  foldFactsAt,
  servedRowAt,
  servedRowForEpoch,
  sincePrevious,
  verify,
  type FieldCheck,
  type FoldFacts,
  type ServedFieldStatus,
  type ServedRow,
  type ServedVerification,
  type SincePrevious,
} from '../../core/served/index.js';
import type { DiffSegment } from '../../core/utils/diffPrompts.js';
import { snapshotLogKey, snapshotOfRunner } from '../../core/utils/snapshotOfRunner.js';
import { T } from '../theme/index.js';

/**
 * Every string this tab owns. Labels only: a name for a thing on the screen,
 * never a sentence about the run. The one entry that reads as a sentence —
 * `betweenCalls` — is the note the design decided verbatim, rendered only when
 * `ServedRow.betweenCalls` is true (a computed flag), and named as the single
 * exception in `test/served/no-own-claims.test.ts`.
 */
export const LABELS = Object.freeze({
  tab: 'Served',
  epoch: 'epoch',
  call: 'call',
  commit: 'commit',
  asOfCall: 'as of call',
  betweenCalls: 'this stop is between calls',
  noCallAtOrBefore: 'no call at or before this stop',
  served: 'Served',
  systemPrompt: 'System prompt',
  messagesAsSent: 'Messages as sent',
  toolsAsSent: 'Tools as sent',
  basis: 'Basis',
  fold: 'Fold',
  omissions: 'Omissions',
  gaps: 'Gaps',
  sincePrevious: 'Since previous',
  verified: 'Verified',
  reconstructed: 'Reconstructed',
  damaged: 'Damaged',
  notOnRecord: 'Not on record',
  onReceipt: 'on receipt',
  onReceiptOnly: 'on receipt only',
  receipt: 'receipt',
  rebuilt: 'rebuilt',
  pieces: 'pieces',
  requestOnly: 'request-only',
  forced: 'forced',
  withheld: 'withheld',
  schema: 'schema',
  showDiff: 'Show diff',
  hideDiff: 'Hide diff',
  model: 'model',
  provider: 'provider',
  runId: 'run id',
  params: 'params',
  cache: 'cache',
  transform: 'transform',
  transformHash: 'transform hash',
  markersApplied: 'markers applied',
  foldBase: 'fold base',
  redacted: 'redacted',
  iteration: 'iteration',
  currentSkill: 'current skill',
  stepPointer: 'step pointer',
  engagement: 'engagement',
  activeInjections: 'active injections',
  hiddenFromModel: 'hidden from the model',
  attentionDrops: 'attention drops',
  count: 'count',
  hashes: 'hashes',
  covers: 'covers',
  cause: 'cause',
  from: 'from',
  to: 'to',
  system: 'system',
  messages: 'messages',
  tools: 'tools',
  changed: 'changed',
  unchanged: 'unchanged',
  entered: 'entered',
  left: 'left',
  added: 'added',
  removed: 'removed',
  schemaChanged: 'schema changed',
  schemasNotComparable: 'schemas not comparable',
  diffNotComputed: 'diff not computed',
  rebuiltOnly: 'rebuilt only',
  tokens: 'tokens',
  foldUnavailable: 'fold unavailable',
  skippedRows: 'skipped rows',
} as const);

/** Receipt-field paths each section renders — what a gap's `fields` are
 *  matched against to highlight the section. */
const SECTION_FIELDS = Object.freeze({
  system: ['system.hash', 'system.chars', 'system.pieces'],
  messages: ['messages.count', 'messages.entries', 'messages.requestOnly'],
  tools: ['tools.names', 'tools.schemaHashes', 'tools.forced', 'tools.withheld'],
  basis: ['basis.model', 'basis.provider', 'basis.runId', 'basis.epoch', 'epoch'],
  params: ['params'],
  cache: ['cache.transform', 'cache.transformHash', 'cache.markersApplied'],
} as const);

export interface ServedTabProps {
  /** The runner whose last snapshot holds the log (`getLastSnapshot` is
   *  duck-checked), or the snapshot itself. */
  readonly runner: unknown;
  /** THE cursor's address — the Why Lens's single position. */
  readonly cursorRuntimeStageId: string;
  /** THE cursor's commit anchor; `-1` when unknown. */
  readonly commitIdx: number;
  /** Move the ONE cursor to an address (the call's own stop). */
  readonly onJumpTo?: (runtimeStageId: string) => void;
}

// `snapshotOfRunner` / `snapshotLogKey` (0.48.0): the runner's last snapshot
// and the "did its log move" key are one owner now, shared with the tag
// legend and the bookmark key — see `core/utils/snapshotOfRunner.ts`.
const snapshotOf = snapshotOfRunner;
const logKeyOf = snapshotLogKey;

/** The tab, inside the boundary that keeps a bad record from unmounting the
 *  Lens. `ServedTabBody` is the tab itself. */
export function ServedTab(props: ServedTabProps): React.ReactElement {
  return (
    <ServedTabBoundary resetKey={`${props.cursorRuntimeStageId}#${props.commitIdx}`}>
      <ServedTabBody {...props} />
    </ServedTabBoundary>
  );
}

function ServedTabBody({
  runner,
  cursorRuntimeStageId,
  commitIdx,
  onJumpTo,
}: ServedTabProps): React.ReactElement {
  // The snapshot is re-read every render (cheap) but only ADOPTED when its log
  // key moves, so the derivation below — and the library's own per-snapshot
  // memos — hold across renders the cursor did not cause.
  const fresh = snapshotOf(runner);
  const logKey = logKeyOf(fresh);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `fresh` is keyed by `logKey` on purpose
  const snapshot = useMemo(() => fresh, [runner, logKey]);
  // Derived from the cursor — nothing here remembers a position.
  const derived = useMemo(() => {
    const cursor = { runtimeStageId: cursorRuntimeStageId, commitIdx };
    const row = servedRowAt(snapshot, cursor);
    if (row === undefined) return undefined;
    const checks = verify(row.view, row.receipt, row.receipt?.basis.runId ?? '', row.receiptCause);
    const previous =
      row.previousEpoch !== undefined ? servedRowForEpoch(snapshot, row.previousEpoch) : undefined;
    const since = previous !== undefined ? sincePrevious(row, previous) : undefined;
    const fold = foldFactsAt(snapshot, cursor);
    return { row, checks, since, fold };
  }, [snapshot, cursorRuntimeStageId, commitIdx]);

  // UI state only: a toggle and a set of expanded schema names. No position.
  const [showDiff, setShowDiff] = useState(false);
  const [openSchemas, setOpenSchemas] = useState<ReadonlySet<string>>(() => new Set());

  if (derived === undefined) {
    return (
      <div style={panelStyle} data-testid="served-tab" data-served="none">
        <Header row={undefined} onJumpTo={onJumpTo} />
        <div style={mutedStyle} data-testid="served-no-call">
          {LABELS.noCallAtOrBefore}
        </div>
      </div>
    );
  }

  const { row, checks, since, fold } = derived;
  const view = row.view;
  const gapsCovering = (fields: readonly string[]): readonly ServedGap[] =>
    view.gaps.filter((g) => g.fields.some((f) => fields.includes(f)));
  const excusing = (fields: readonly string[]): boolean =>
    gapsCovering(fields).some((g) => EXCUSING_GAPS.includes(g.gap));
  // A section's header count: the rebuilt count alone when nothing excuses a
  // short rebuild; under an excuse, BOTH counts labelled, so a bare number
  // never reads as "0 tools" beside a receipt that names one.
  const counts = (rebuilt: number, onReceipt: number | undefined, fields: readonly string[]) =>
    onReceipt !== undefined && excusing(fields) ? (
      <Count n={rebuilt} label={LABELS.rebuilt} also={onReceipt} alsoLabel={LABELS.receipt} />
    ) : (
      <Count n={rebuilt} />
    );

  return (
    <div style={panelStyle} data-testid="served-tab" data-epoch={row.epoch}>
      <Header row={row} onJumpTo={onJumpTo} />

      {/* ── SERVED ─────────────────────────────────────────────────────── */}
      <SectionTitle>{LABELS.served}</SectionTitle>

      <Section
        testId="served-system"
        title={LABELS.systemPrompt}
        badge={<Badge check={checks.system} />}
        gaps={gapsCovering(SECTION_FIELDS.system)}
        extra={
          since !== undefined && since.system.changed ? (
            <button
              type="button"
              style={buttonStyle}
              aria-pressed={showDiff}
              data-testid="served-toggle-diff"
              onClick={() => setShowDiff((v) => !v)}
            >
              {showDiff ? LABELS.hideDiff : LABELS.showDiff}
            </button>
          ) : undefined
        }
      >
        {showDiff && since !== undefined && since.system.changed ? (
          <Diff since={since} />
        ) : (
          <>
            {view.system.pieces.map((piece, i) => (
              <div key={i} style={pieceStyle} data-testid="served-piece">
                <div style={pieceHeadStyle}>
                  <span style={monoMutedStyle}>
                    {piece.slot} · {piece.source}
                  </span>
                  <Badge check={checks.pieces[i] ?? { status: 'reconstructed' }} />
                </div>
                <Mono>{piece.text}</Mono>
              </div>
            ))}
            {checks.onReceiptOnly.pieces > 0 && (
              <DataLine label={`${LABELS.pieces} · ${LABELS.onReceiptOnly}`}>
                {checks.onReceiptOnly.pieces}
              </DataLine>
            )}
            {checks.rebuiltOnly.pieces > 0 && (
              <DataLine label={`${LABELS.pieces} · ${LABELS.rebuiltOnly}`}>
                {checks.rebuiltOnly.pieces}
              </DataLine>
            )}
            {view.system.pieces.length === 0 &&
              gapsCovering(SECTION_FIELDS.system).length === 0 && (
                <DataLine label={LABELS.pieces}>0</DataLine>
              )}
          </>
        )}
      </Section>

      <Section
        testId="served-messages"
        title={LABELS.messagesAsSent}
        badge={counts(
          view.messages.asSent.length + view.messages.requestOnly.length,
          row.receipt !== undefined
            ? row.receipt.messages.entries.length + row.receipt.messages.requestOnly.length
            : undefined,
          SECTION_FIELDS.messages,
        )}
        gaps={gapsCovering(SECTION_FIELDS.messages)}
      >
        {view.messages.asSent.map((m, i) => (
          <div key={i} style={messageStyle} data-testid="served-message" data-role={m.role}>
            <div style={pieceHeadStyle}>
              <span style={monoMutedStyle}>
                {m.role}
                {m.toolCallId !== undefined ? ` · ${m.toolCallId}` : ''}
                {m.toolName !== undefined ? ` · ${m.toolName}` : ''}
              </span>
              <Badge check={checks.messages[i] ?? { status: 'reconstructed' }} />
            </div>
            {m.content !== '' && <Mono>{m.content}</Mono>}
            {(m.toolCalls ?? []).map((c) => (
              <div key={c.id} style={toolCallStyle} data-testid="served-tool-call">
                <span style={monoMutedStyle}>{c.id}</span> <span style={monoStyle}>{c.name}</span>{' '}
                <span style={monoMutedStyle}>{safeJson(c.args)}</span>
              </div>
            ))}
          </div>
        ))}
        {view.messages.requestOnly.map((line, i) => (
          <div key={`ro-${i}`} style={messageStyle} data-testid="served-request-only">
            <div style={pieceHeadStyle}>
              <span style={monoMutedStyle}>
                {line.role} · {LABELS.requestOnly} · {line.reason}
              </span>
              <Badge check={checks.requestOnly[i] ?? { status: 'reconstructed' }} />
            </div>
            <Mono>{line.text}</Mono>
          </div>
        ))}
        {(checks.onReceiptOnly.messages > 0 || checks.onReceiptOnly.requestOnly > 0) && (
          <DataLine label={`${LABELS.messages} · ${LABELS.onReceiptOnly}`}>
            {checks.onReceiptOnly.messages + checks.onReceiptOnly.requestOnly}
          </DataLine>
        )}
        {(checks.rebuiltOnly.messages > 0 || checks.rebuiltOnly.requestOnly > 0) && (
          <DataLine label={`${LABELS.messages} · ${LABELS.rebuiltOnly}`}>
            {checks.rebuiltOnly.messages + checks.rebuiltOnly.requestOnly}
          </DataLine>
        )}
      </Section>

      <Section
        testId="served-tools"
        title={LABELS.toolsAsSent}
        badge={
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {counts(
              view.tools.names.length,
              checks.namesOnReceipt?.length,
              SECTION_FIELDS.tools,
            )}
            <Badge check={checks.toolNames} />
          </span>
        }
        gaps={gapsCovering(SECTION_FIELDS.tools)}
      >
        {view.tools.withheld !== undefined && (
          <DataLine label={LABELS.withheld} testId="served-withheld">
            {view.tools.withheld}
          </DataLine>
        )}
        {view.tools.names.map((name) => {
          const schema = view.tools.schemas.find((s) => s.name === name);
          const isForced = view.tools.forced === name;
          const open = openSchemas.has(name);
          return (
            <div key={name} style={toolStyle} data-testid="served-tool" data-tool={name}>
              <div style={pieceHeadStyle}>
                <span>
                  <span style={monoStyle}>{name}</span>
                  {isForced && (
                    <span style={chipStyle(T.warning)} data-testid="served-forced">
                      {LABELS.forced}
                    </span>
                  )}
                </span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {schema !== undefined && (
                    <Badge check={checks.toolSchemas[name] ?? { status: 'reconstructed' }} />
                  )}
                  {schema !== undefined && (
                    <button
                      type="button"
                      style={buttonStyle}
                      aria-expanded={open}
                      onClick={() =>
                        setOpenSchemas((prev) => {
                          const next = new Set(prev);
                          if (next.has(name)) next.delete(name);
                          else next.add(name);
                          return next;
                        })
                      }
                    >
                      {LABELS.schema}
                    </button>
                  )}
                </span>
              </div>
              {open && schema !== undefined && <Mono>{safeJson(schema)}</Mono>}
            </div>
          );
        })}
        {checks.onReceiptOnly.toolNames.length > 0 && (
          <DataLine label={`${LABELS.tools} · ${LABELS.onReceiptOnly}`}>
            {checks.onReceiptOnly.toolNames.join(', ')}
          </DataLine>
        )}
        {checks.rebuiltOnly.toolNames.length > 0 && (
          <DataLine label={`${LABELS.tools} · ${LABELS.rebuiltOnly}`}>
            {checks.rebuiltOnly.toolNames.join(', ')}
          </DataLine>
        )}
      </Section>

      {/* ── BASIS ──────────────────────────────────────────────────────── */}
      <SectionTitle>{LABELS.basis}</SectionTitle>
      <Section testId="served-basis" title={LABELS.basis} gaps={gapsCovering(SECTION_FIELDS.basis)}>
        <DataLine label={LABELS.epoch}>{view.epoch}</DataLine>
        <DataLine label={LABELS.call}>
          <span style={monoStyle}>{row.callRuntimeStageId}</span>
        </DataLine>
        <DataLine label={LABELS.commit}>{row.commitIdx}</DataLine>
        {view.basis !== undefined ? (
          <>
            <DataLine label={LABELS.model} testId="served-model">
              {view.basis.model}
            </DataLine>
            <DataLine label={LABELS.provider}>{view.basis.provider}</DataLine>
            <DataLine label={LABELS.runId}>
              <span style={monoMutedStyle}>{view.basis.runId}</span>
            </DataLine>
          </>
        ) : (
          <Presence label={`${LABELS.model} · ${LABELS.provider}`} />
        )}
      </Section>
      <Section testId="served-params" title={LABELS.params} gaps={gapsCovering(SECTION_FIELDS.params)}>
        {row.receipt !== undefined ? (
          <>
            {Object.entries(row.receipt.params).map(([k, v]) => (
              <DataLine key={k} label={k} testId={`served-param-${k}`}>
                <span style={monoStyle}>{safeJson(v)}</span>
              </DataLine>
            ))}
            {/* No dial on the receipt: the gap beside the section is the
                empty state (`provider-defaults` names `params`); a bare 0
                here would read as "no dials", which the record cannot say. */}
          </>
        ) : (
          <Presence label={LABELS.params} />
        )}
      </Section>
      <Section testId="served-cache" title={LABELS.cache} gaps={gapsCovering(SECTION_FIELDS.cache)}>
        {row.receipt !== undefined ? (
          <>
            <DataLine label={LABELS.transform}>{row.receipt.cache.transform}</DataLine>
            {row.receipt.cache.transformHash !== null && (
              <DataLine label={LABELS.transformHash}>
                <span style={monoMutedStyle}>{row.receipt.cache.transformHash}</span>
              </DataLine>
            )}
            <DataLine label={LABELS.markersApplied}>
              {row.receipt.cache.markersApplied.length}
              {row.receipt.cache.markersApplied.length > 0 && (
                <span style={monoMutedStyle}>
                  {' '}
                  {row.receipt.cache.markersApplied
                    .map((m) => `${m.field}[${m.boundaryIndex}] ${m.ttl}`)
                    .join(' · ')}
                </span>
              )}
            </DataLine>
          </>
        ) : (
          <Presence label={LABELS.cache} />
        )}
      </Section>

      {/* ── FOLD ───────────────────────────────────────────────────────── */}
      <SectionTitle>{LABELS.fold}</SectionTitle>
      <FoldSection fold={fold} />

      {/* ── OMISSIONS ──────────────────────────────────────────────────── */}
      <SectionTitle>{LABELS.omissions}</SectionTitle>
      <Section testId="served-omissions" title={LABELS.attentionDrops}>
        {row.receipt?.omittedForAttention !== undefined ? (
          <>
            <DataLine label={LABELS.count}>{row.receipt.omittedForAttention.count}</DataLine>
            <DataLine label={LABELS.hashes}>
              <span style={monoMutedStyle}>{row.receipt.omittedForAttention.hashes.join(' ')}</span>
            </DataLine>
          </>
        ) : (
          <Library data-testid="served-omissions-why">{UNGAPPED_FIELDS.omittedForAttention}</Library>
        )}
      </Section>

      {/* ── GAPS ───────────────────────────────────────────────────────── */}
      <SectionTitle>{LABELS.gaps}</SectionTitle>
      <div data-testid="served-gaps">
        {view.gaps.map((gap) => (
          <GapCard key={gap.gap} gap={gap} />
        ))}
      </div>

      {/* ── SINCE PREVIOUS ─────────────────────────────────────────────── */}
      <SectionTitle>{LABELS.sincePrevious}</SectionTitle>
      <Section testId="served-since" title={LABELS.sincePrevious}>
        {since === undefined ? (
          // The epoch before this one is not in this recording. That is all the
          // data says: a resumed leg's first call has a previous epoch the
          // paused leg carries, so its number is printed and its row is
          // "not on record" — never "no previous epoch".
          <DataLine label={LABELS.from}>
            {row.epoch > 1 && (
              <span style={monoMutedStyle}>
                {LABELS.epoch} {row.epoch - 1}{' '}
              </span>
            )}
            <Badge check={{ status: 'not-on-record' }} />
          </DataLine>
        ) : (
          <SinceBlock since={since} showDiff={showDiff} />
        )}
      </Section>
    </div>
  );
}

// ─── pieces ────────────────────────────────────────────────────────────

function Header({
  row,
  onJumpTo,
}: {
  row: ServedRow | undefined;
  onJumpTo?: ((runtimeStageId: string) => void) | undefined;
}): React.ReactElement {
  return (
    <div style={headerStyle}>
      <span style={headerTitleStyle}>{LABELS.tab}</span>
      {row !== undefined && (
        <>
          <span style={chipStyle(T.primary)} data-testid="served-epoch">
            {LABELS.epoch} {row.epoch}
          </span>
          <button
            type="button"
            style={{ ...buttonStyle, fontFamily: T.fontMono }}
            data-testid="served-call-id"
            onClick={() => onJumpTo?.(row.callRuntimeStageId)}
          >
            {row.callRuntimeStageId}
          </button>
          {row.betweenCalls && (
            <span style={noteStyle} data-testid="served-between-calls">
              {LABELS.asOfCall} {row.epoch} — {LABELS.betweenCalls}
            </span>
          )}
        </>
      )}
    </div>
  );
}

function statusLabel(status: ServedFieldStatus): string {
  switch (status) {
    case 'verified':
      return LABELS.verified;
    case 'reconstructed':
      return LABELS.reconstructed;
    case 'damaged':
      return LABELS.damaged;
    default:
      return LABELS.notOnRecord;
  }
}

function statusColor(status: ServedFieldStatus): string {
  switch (status) {
    case 'verified':
      return T.success;
    case 'damaged':
      return T.error;
    default:
      return T.textMuted;
  }
}

/**
 * The status badge. Title carries the two hashes it was decided by — data.
 * When the two DISAGREE they are also printed inline, whatever the status: a
 * disagreement an excusing gap turned into "reconstructed" is still a fact the
 * reader wants on screen, not only in a tooltip.
 */
export function Badge({ check }: { check: FieldCheck }): React.ReactElement {
  const title = [
    check.onReceipt !== undefined ? `${LABELS.receipt} ${check.onReceipt}` : undefined,
    check.rebuilt !== undefined ? `${LABELS.rebuilt} ${check.rebuilt}` : undefined,
  ]
    .filter((s) => s !== undefined)
    .join(' · ');
  const disagree =
    check.onReceipt !== undefined && check.rebuilt !== undefined && check.onReceipt !== check.rebuilt;
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      {disagree && (
        <span style={monoMutedStyle} data-testid="served-hashes">
          {LABELS.receipt} {check.onReceipt} · {LABELS.rebuilt} {check.rebuilt}
        </span>
      )}
      <span
        style={badgeStyle(statusColor(check.status), check.status === 'not-on-record')}
        data-testid="served-badge"
        data-status={check.status}
        {...(title !== '' ? { title } : {})}
      >
        {statusLabel(check.status)}
      </span>
    </span>
  );
}

/** A receipt-only field that is not here: the "Not on record" badge, no value. */
function Presence({ label }: { label: string }): React.ReactElement {
  return (
    <DataLine label={label}>
      <Badge check={{ status: 'not-on-record' }} />
    </DataLine>
  );
}

/** A count. With `label`/`also`, two labelled counts — the rebuilt one and
 *  the receipt's — so neither reads as the whole truth under an excuse. */
function Count({
  n,
  label,
  also,
  alsoLabel,
}: {
  n: number;
  label?: string;
  also?: number;
  alsoLabel?: string;
}): React.ReactElement {
  return (
    <span style={countStyle} data-testid="served-count" data-rebuilt={n} data-receipt={also}>
      {label !== undefined ? `${label} ${n}` : n}
      {also !== undefined && ` · ${alsoLabel ?? ''} ${also}`}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div style={sectionTitleStyle}>{children}</div>;
}

function Section({
  testId,
  title,
  badge,
  gaps = [],
  extra,
  children,
}: {
  testId: string;
  title: string;
  badge?: React.ReactNode;
  gaps?: readonly ServedGap[];
  extra?: React.ReactNode;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section
      style={sectionStyle}
      data-testid={testId}
      data-gapped={gaps.length > 0 ? gaps.map((g) => g.gap).join(' ') : undefined}
    >
      <div style={sectionHeadStyle}>
        <span style={sectionHeadTitleStyle}>{title}</span>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {extra}
          {badge}
        </span>
      </div>
      {gaps.length > 0 && (
        <div style={gapChipsStyle}>
          {gaps.map((g) => (
            <span
              key={g.gap}
              style={chipStyle(g.cause === 'receipt-shape-rejected' ? T.error : T.warning)}
              data-testid="served-gap-chip"
              data-gap={g.gap}
            >
              {g.gap}
            </span>
          ))}
        </div>
      )}
      {children}
    </section>
  );
}

function DataLine({
  label,
  testId,
  children,
}: {
  label: string;
  testId?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div style={dataLineStyle} {...(testId !== undefined ? { 'data-testid': testId } : {})}>
      <span style={dataLabelStyle}>{label}</span>
      <span style={dataValueStyle}>{children}</span>
    </div>
  );
}

/** A sentence that came from the library. Rendered verbatim, styled as quoted. */
function Library({
  children,
  ...rest
}: {
  children: string;
  'data-testid'?: string;
}): React.ReactElement {
  return (
    <p style={libraryStyle} {...rest}>
      {children}
    </p>
  );
}

function GapCard({ gap }: { gap: ServedGap }): React.ReactElement {
  const damaged = gap.cause === 'receipt-shape-rejected';
  return (
    <div
      style={gapCardStyle(damaged)}
      data-testid="served-gap"
      data-gap={gap.gap}
      {...(gap.cause !== undefined ? { 'data-cause': gap.cause } : {})}
    >
      <div style={pieceHeadStyle}>
        <span style={monoStyle}>{gap.gap}</span>
        {gap.cause !== undefined && (
          <span style={chipStyle(damaged ? T.error : T.textMuted)} data-testid="served-gap-cause">
            {LABELS.cause} · {gap.cause}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '4px 0' }}>
        <span style={dataLabelStyle}>{LABELS.covers}</span>
        {gap.fields.map((f) => (
          <span key={f} style={fieldChipStyle}>
            {f}
          </span>
        ))}
      </div>
      <Library data-testid="served-gap-why">{SERVED_GAPS[gap.gap].why}</Library>
    </div>
  );
}

function FoldSection({ fold }: { fold: FoldFacts }): React.ReactElement {
  return (
    <Section testId="served-fold" title={LABELS.fold}>
      {/* A fold that could not run, or rows it could not read: printed as
          data beside the Damaged badge. The receipt, the view and the one
          cursor are unaffected — only the fold's own facts are absent. */}
      {fold.foldError !== undefined && (
        <DataLine label={LABELS.foldUnavailable} testId="served-fold-error">
          <Badge check={{ status: 'damaged' }} />
          <span style={monoMutedStyle}>{fold.foldError}</span>
        </DataLine>
      )}
      {fold.skipped !== undefined && (
        <DataLine label={LABELS.skippedRows} testId="served-fold-skipped">
          <Badge check={{ status: 'damaged' }} />
          {fold.skipped.length}
          <span style={monoMutedStyle}>{fold.skipped.join(' ')}</span>
        </DataLine>
      )}
      {fold.basis !== undefined && <DataLine label={LABELS.foldBase}>{fold.basis}</DataLine>}
      {fold.redacted && <DataLine label={LABELS.redacted}>{String(fold.redacted)}</DataLine>}
      {fold.iteration !== undefined && (
        <DataLine label={LABELS.iteration}>{fold.iteration}</DataLine>
      )}
      {fold.currentSkillId !== undefined && (
        <DataLine label={LABELS.currentSkill} testId="served-current-skill">
          <span style={monoStyle}>{fold.currentSkillId}</span>
        </DataLine>
      )}
      {fold.stepPointer !== undefined && (
        <DataLine label={LABELS.stepPointer}>
          <span style={monoMutedStyle}>{safeJson(fold.stepPointer)}</span>
        </DataLine>
      )}
      {fold.mapEngagement !== undefined && (
        <DataLine label={LABELS.engagement}>
          <span style={monoMutedStyle}>{safeJson(fold.mapEngagement)}</span>
        </DataLine>
      )}
      {fold.activeInjections !== undefined && (
        <DataLine label={LABELS.activeInjections}>
          {fold.activeInjections.length}
          <span style={monoMutedStyle}>
            {' '}
            {fold.activeInjections
              .map((inj) => {
                const i = inj as { slot?: unknown; source?: unknown };
                return [i.slot, i.source].filter((x) => typeof x === 'string').join('·');
              })
              .filter((s) => s !== '')
              .join(' ')}
          </span>
        </DataLine>
      )}
      {fold.hiddenSkillIds !== undefined && (
        <DataLine label={LABELS.hiddenFromModel} testId="served-hidden-skills">
          {fold.hiddenSkillIds.map((id) => (
            <span key={id} style={chipStyle(T.warning)} data-testid="served-hidden-skill">
              {id}
            </span>
          ))}
          {fold.hiddenSkillIds.length === 0 && <Count n={0} />}
        </DataLine>
      )}
    </Section>
  );
}

function SinceBlock({
  since,
  showDiff,
}: {
  since: SincePrevious;
  showDiff: boolean;
}): React.ReactElement {
  return (
    <>
      <DataLine label={`${LABELS.from} · ${LABELS.to}`}>
        {since.fromEpoch} → {since.toEpoch}
      </DataLine>
      <DataLine label={LABELS.system} testId="served-since-system">
        {since.system.changed ? LABELS.changed : LABELS.unchanged}
        {since.system.changed && (
          <span style={monoMutedStyle}>
            {' '}
            {LABELS.pieces} {LABELS.entered} {since.system.piecesEntered} · {LABELS.left}{' '}
            {since.system.piecesLeft}
          </span>
        )}
      </DataLine>
      <DataLine label={LABELS.messages} testId="served-since-messages">
        {LABELS.entered} {since.messages.entered} · {LABELS.left} {since.messages.left}
      </DataLine>
      <DataLine label={LABELS.tools} testId="served-since-tools">
        {LABELS.added}{' '}
        <span style={monoStyle} data-testid="served-since-tools-added">
          {since.tools.added.join(', ') || '0'}
        </span>{' '}
        · {LABELS.removed}{' '}
        <span style={monoStyle} data-testid="served-since-tools-removed">
          {since.tools.removed.join(', ') || '0'}
        </span>
        {since.tools.schemasComparable ? (
          <>
            {' '}
            · {LABELS.schemaChanged}{' '}
            <span style={monoStyle}>{since.tools.schemaChanged.join(', ') || '0'}</span>
          </>
        ) : (
          <> · {LABELS.schemasNotComparable}</>
        )}
      </DataLine>
      {!showDiff && since.system.changed && <Diff since={since} />}
    </>
  );
}

/** The system-text diff, or the fact that it was not computed (past the
 *  lens's cell cap) — printed as a label, never as an empty diff. */
function Diff({ since }: { since: SincePrevious }): React.ReactElement {
  if (since.system.diff === undefined) {
    return (
      <span style={mutedStyle} data-testid="served-diff-not-computed">
        {LABELS.diffNotComputed}
      </span>
    );
  }
  return <WordDiff segments={since.system.diff} />;
}

function WordDiff({ segments }: { segments: readonly DiffSegment[] }): React.ReactElement {
  return (
    <pre style={preStyle} data-testid="served-word-diff">
      {segments.map((s, i) => (
        <span
          key={i}
          data-diff={s.kind}
          style={
            s.kind === 'added'
              ? { background: `${T.success}33`, color: T.textPrimary }
              : s.kind === 'removed'
              ? { background: `${T.error}33`, color: T.textSecondary, textDecoration: 'line-through' }
              : undefined
          }
        >
          {s.text}
        </span>
      ))}
    </pre>
  );
}

function Mono({ children }: { children: React.ReactNode }): React.ReactElement {
  return <pre style={preStyle}>{children}</pre>;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

// ─── boundary ──────────────────────────────────────────────────────────

/**
 * Catches a render throw inside the tab and prints it as data: the Damaged
 * badge and the thrown message. The rest of the Lens — its one cursor, its
 * other tab — is untouched. Resets when the cursor moves, so a record that is
 * damaged at one stop does not blank the tab at every other.
 */
class ServedTabBoundary extends React.Component<
  { readonly children: React.ReactNode; readonly resetKey: string },
  { readonly error: Error | null }
> {
  state: { readonly error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  componentDidUpdate(prev: { readonly resetKey: string }): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error !== null) {
      this.setState({ error: null });
    }
  }

  render(): React.ReactNode {
    if (this.state.error !== null) {
      return (
        <div style={panelStyle} data-testid="served-tab" data-served="error">
          <div style={headerStyle}>
            <span style={headerTitleStyle}>{LABELS.tab}</span>
            <Badge check={{ status: 'damaged' }} />
          </div>
          <pre style={preStyle} data-testid="served-tab-error">
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── styles ────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  padding: 12,
  boxSizing: 'border-box',
  background: T.bgPrimary,
  color: T.textPrimary,
  fontFamily: T.fontSans,
  fontSize: 12,
};
const headerStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
  marginBottom: 10,
};
const headerTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '0.04em',
};
const noteStyle: React.CSSProperties = {
  fontSize: 11,
  color: T.warning,
  fontStyle: 'italic',
};
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: T.textMuted,
  margin: '12px 0 6px',
};
const sectionStyle: React.CSSProperties = {
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  padding: '8px 10px',
  marginBottom: 8,
  background: T.bgSecondary,
};
const sectionHeadStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
  marginBottom: 6,
};
const sectionHeadTitleStyle: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: T.textSecondary,
};
const gapChipsStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  marginBottom: 6,
};
const pieceStyle: React.CSSProperties = {
  borderLeft: `2px solid ${T.border}`,
  paddingLeft: 8,
  marginBottom: 6,
};
const pieceHeadStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
  marginBottom: 2,
};
const messageStyle: React.CSSProperties = {
  borderTop: `1px dashed ${T.border}`,
  paddingTop: 4,
  marginTop: 4,
};
const toolCallStyle: React.CSSProperties = { fontSize: 11, marginLeft: 8 };
const toolStyle: React.CSSProperties = { marginBottom: 4 };
const monoStyle: React.CSSProperties = { fontFamily: T.fontMono, fontSize: 11, color: T.textPrimary };
const monoMutedStyle: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 10.5,
  color: T.textMuted,
};
const mutedStyle: React.CSSProperties = { fontSize: 11.5, color: T.textMuted };
const preStyle: React.CSSProperties = {
  margin: '2px 0 4px',
  padding: '6px 8px',
  borderRadius: 6,
  background: T.bgTertiary,
  color: T.textPrimary,
  fontFamily: T.fontMono,
  fontSize: 11,
  lineHeight: 1.45,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 240,
  overflow: 'auto',
};
const buttonStyle: React.CSSProperties = {
  fontSize: 10.5,
  padding: '1px 6px',
  borderRadius: 6,
  border: `1px solid ${T.border}`,
  background: T.bgElevated,
  color: T.textSecondary,
  cursor: 'pointer',
};
const countStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontFamily: T.fontMono,
  color: T.textMuted,
};
const dataLineStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'baseline',
  fontSize: 11.5,
  margin: '2px 0',
};
const dataLabelStyle: React.CSSProperties = {
  color: T.textMuted,
  minWidth: 88,
  flex: 'none',
};
const dataValueStyle: React.CSSProperties = {
  color: T.textPrimary,
  display: 'inline-flex',
  flexWrap: 'wrap',
  gap: 4,
  alignItems: 'baseline',
};
const libraryStyle: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: 11.5,
  lineHeight: 1.45,
  color: T.textSecondary,
  borderLeft: `2px solid ${T.primary}`,
  paddingLeft: 8,
};
const fieldChipStyle: React.CSSProperties = {
  padding: '0 5px',
  borderRadius: 4,
  border: `1px solid ${T.border}`,
  fontFamily: T.fontMono,
  fontSize: 10,
  color: T.textSecondary,
};
function chipStyle(color: string): React.CSSProperties {
  return {
    padding: '0 6px',
    marginLeft: 4,
    borderRadius: 999,
    border: `1px solid ${color}`,
    color,
    fontSize: 10,
    fontFamily: T.fontMono,
  };
}
function badgeStyle(color: string, dashed: boolean): React.CSSProperties {
  return {
    padding: '0 6px',
    borderRadius: 999,
    border: `1px ${dashed ? 'dashed' : 'solid'} ${color}`,
    color,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.02em',
    whiteSpace: 'nowrap',
  };
}
function gapCardStyle(damaged: boolean): React.CSSProperties {
  return {
    border: `1px ${damaged ? 'solid' : 'dashed'} ${damaged ? T.error : T.border}`,
    borderRadius: 8,
    padding: '8px 10px',
    marginBottom: 8,
    background: T.bgSecondary,
  };
}
