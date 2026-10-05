import React from 'react';
import type { LensCursor } from '../../core/cursor/lensCursor.js';
import type { CursorPosition } from '../../core/group/cursorPositionsAtDrill.js';
import { T } from '../theme/index.js';

/** A refusal to place an address is not permission to read a stage's state. */
export function UnplacedCursor({ cursor, positions, children }: {
  readonly cursor: LensCursor;
  readonly positions: readonly CursorPosition[];
  readonly children?: React.ReactNode;
}) {
  return <section aria-label="Cursor not on this axis" style={{ padding: 16, color: T.textPrimary, fontSize: 13 }}>
    {children}
    <p role="status">The held address has no position on this axis.</p>
    <p>Return to another view to keep reading the held address, or select a stop below to move it.</p>
    {positions.length === 0
      ? <p>This axis has no recorded stops.</p>
      : <label>Move to a recorded stop{' '}
          <select aria-label="Move to a recorded stop" value="" onChange={(event) => cursor.moveTo(Number(event.target.value))}>
            <option value="" disabled>Select a stop</option>
            {positions.map((position, step) => <option key={step} value={step}>{step + 1}. {position.label}</option>)}
          </select>
        </label>}
  </section>;
}
