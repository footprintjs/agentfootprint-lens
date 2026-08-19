/**
 * DoorRefusalCard — the doors' honest on-screen refusal.
 *
 * When a door's mount component is handed something it cannot read, the
 * screen must SAY so — a card in the lens's own voice, never a blank panel
 * and never a crash. Three sentences, in a fixed order:
 *
 *   1. what this lens reads          (the door's own sentence)
 *   2. what you passed looks like    (named, not guessed at)
 *   3. where to go                   (the teaching half)
 *
 * Same honesty family as `<SkillGraphDebugger>`'s "No skill graph ran here"
 * card and `<WhereFrom>`'s "never written" line: absence and refusal are
 * rendered facts here, not empty space.
 */

import React from 'react';

import { T } from '../react/theme/index.js';

export interface DoorRefusalCardProps {
  /** The door's name, worn as the card's eyebrow (e.g. "Why Lens"). */
  readonly door: string;
  /** Sentence 1, without its full stop: "This lens reads {reads}." */
  readonly reads: string;
  /** Sentence 2's object: "What you passed looks like {received}." */
  readonly received: string;
  /** Sentence 3, whole: where the reader should go instead. */
  readonly goTo: string;
}

export function DoorRefusalCard({ door, reads, received, goTo }: DoorRefusalCardProps): React.ReactElement {
  return (
    <div
      data-testid="door-refusal"
      role="note"
      style={{
        margin: 12,
        padding: '12px 14px',
        borderRadius: 8,
        border: `1px solid ${T.border}`,
        background: T.bgSecondary,
        color: T.textPrimary,
        fontFamily: T.fontSans,
        fontSize: 12.5,
        lineHeight: 1.6,
        maxWidth: 560,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: T.textMuted,
          marginBottom: 6,
        }}
      >
        {door} · not the input this lens reads
      </div>
      <p style={{ margin: 0 }}>This lens reads {reads}.</p>
      <p style={{ margin: '6px 0 0' }}>
        What you passed looks like <strong data-testid="door-refusal-received">{received}</strong>.
      </p>
      <p style={{ margin: '6px 0 0', color: T.textSecondary }} data-testid="door-refusal-go-to">
        {goTo}
      </p>
    </div>
  );
}
