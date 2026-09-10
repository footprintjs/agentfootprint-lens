/**
 * <Badge> — what the hash check established for one row, on screen.
 *
 * ONE OWNER, TWO VIEWS. The Served tab's list and the Served graph draw the
 * same four verdicts, so the badge, its four words and its colours live here
 * and nowhere else: a badge softened in one view and not the other would be
 * two different accounts of one record. `ServedTab` re-exports it, and its
 * `LABELS` take the four words from {@link BADGE_LABELS} rather than repeating
 * them.
 *
 * A badge is NEVER softened for a prettier picture. `'damaged'` draws Damaged,
 * whatever it sits beside.
 */

import React from 'react';

import type { FieldCheck, ServedFieldStatus } from '../../core/served/index.js';
import { T } from '../theme/index.js';

/** The four verdicts, and the two words for the hashes they were decided by. */
export const BADGE_LABELS = Object.freeze({
  verified: 'Verified',
  reconstructed: 'Reconstructed',
  damaged: 'Damaged',
  notOnRecord: 'Not on record',
  onReceipt: 'on receipt',
  receipt: 'receipt',
  rebuilt: 'rebuilt',
} as const);

export function statusLabel(status: ServedFieldStatus): string {
  switch (status) {
    case 'verified':
      return BADGE_LABELS.verified;
    case 'reconstructed':
      return BADGE_LABELS.reconstructed;
    case 'damaged':
      return BADGE_LABELS.damaged;
    default:
      return BADGE_LABELS.notOnRecord;
  }
}

export function statusColor(status: ServedFieldStatus): string {
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
    check.onReceipt !== undefined ? `${BADGE_LABELS.receipt} ${check.onReceipt}` : undefined,
    check.rebuilt !== undefined ? `${BADGE_LABELS.rebuilt} ${check.rebuilt}` : undefined,
  ]
    .filter((s) => s !== undefined)
    .join(' · ');
  const disagree =
    check.onReceipt !== undefined &&
    check.rebuilt !== undefined &&
    check.onReceipt !== check.rebuilt;
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      {disagree && (
        <span style={hashesStyle} data-testid="served-hashes">
          {BADGE_LABELS.receipt} {check.onReceipt} · {BADGE_LABELS.rebuilt} {check.rebuilt}
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

export function badgeStyle(color: string, dashed: boolean): React.CSSProperties {
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

const hashesStyle: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 10.5,
  color: T.textMuted,
};
