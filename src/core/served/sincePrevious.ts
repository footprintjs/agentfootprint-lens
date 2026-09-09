/**
 * sincePrevious — what changed between two epochs of ONE run, by identity.
 *
 * Messages are compared by the library's own digest input
 * (`messageDigestInput` — role, text, join key, tool calls, signatures), so
 * two messages count as the same message exactly when the receipt would have
 * hashed them the same. System pieces are compared by text; tools by name;
 * a tool's SCHEMA is compared by the receipts' own schema hashes, and only
 * when both epochs have a receipt (there is no other honest witness). The
 * system TEXT pair goes to `diffPromptsBounded` — the lens's word-level LCS
 * diff, which strips the common head and tail first and REFUSES a differing
 * middle past its cell cap: `system.diff` is then absent, and a renderer
 * prints that as data ("diff not computed") rather than the tab stalling on a
 * quadratic table.
 *
 * Pure. Returns a frozen value. Counts and lists only — no sentences.
 */

import { messageDigestInput } from 'agentfootprint';

import { diffPromptsBounded, type DiffSegment } from '../utils/diffPrompts.js';
import type { ServedRow } from './types.js';

export interface SincePrevious {
  readonly fromEpoch: number;
  readonly toEpoch: number;
  readonly system: {
    /** `true` when the joined system text differs. */
    readonly changed: boolean;
    /** Word-level diff, previous → current. Empty when unchanged; ABSENT when
     *  the differing middle exceeded `DIFF_CELL_CAP` and was not computed. */
    readonly diff?: readonly DiffSegment[];
    /** Pieces present now that were not present before (by text). */
    readonly piecesEntered: number;
    /** Pieces present before that are not present now (by text). */
    readonly piecesLeft: number;
  };
  readonly messages: {
    /** Messages in the current window that were not in the previous one. */
    readonly entered: number;
    /** Messages in the previous window that are not in the current one. */
    readonly left: number;
  };
  readonly tools: {
    readonly added: readonly string[];
    readonly removed: readonly string[];
    /** Names present in both whose receipt schema hashes differ. Empty when
     *  either epoch has no receipt — nothing to compare by. */
    readonly schemaChanged: readonly string[];
    /** `true` when both receipts were present and the comparison could run. */
    readonly schemasComparable: boolean;
  };
}

/** Multiset difference: how many of `a`'s items have no partner in `b`. */
function unmatched(a: readonly string[], b: readonly string[]): number {
  const pool = new Map<string, number>();
  for (const item of b) pool.set(item, (pool.get(item) ?? 0) + 1);
  let count = 0;
  for (const item of a) {
    const n = pool.get(item) ?? 0;
    if (n > 0) pool.set(item, n - 1);
    else count += 1;
  }
  return count;
}

/**
 * @param current  the row the cursor shows.
 * @param previous the row for `current.previousEpoch`.
 */
export function sincePrevious(current: ServedRow, previous: ServedRow): SincePrevious {
  const now = current.view;
  const before = previous.view;

  const nowPieces = now.system.pieces.map((p) => p.text);
  const beforePieces = before.system.pieces.map((p) => p.text);
  const nowMessages = now.messages.asSent.map(messageDigestInput);
  const beforeMessages = before.messages.asSent.map(messageDigestInput);

  const nowNames = new Set(now.tools.names);
  const beforeNames = new Set(before.tools.names);
  const added = now.tools.names.filter((n) => !beforeNames.has(n));
  const removed = before.tools.names.filter((n) => !nowNames.has(n));

  const comparable = current.receipt !== undefined && previous.receipt !== undefined;
  const schemaChanged: string[] = [];
  if (current.receipt !== undefined && previous.receipt !== undefined) {
    for (const name of now.tools.names) {
      if (!beforeNames.has(name)) continue;
      // Optional chaining: `servedRowAt` never hands over a half-shaped
      // receipt, but a caller-built row is not that guarantee.
      const a = current.receipt.tools?.schemaHashes?.[name];
      const b = previous.receipt.tools?.schemaHashes?.[name];
      if (a !== undefined && b !== undefined && a !== b) schemaChanged.push(name);
    }
  }

  const changed = now.system.text !== before.system.text;
  const diff = changed ? diffPromptsBounded(before.system.text, now.system.text) : Object.freeze([]);
  return Object.freeze({
    fromEpoch: previous.epoch,
    toEpoch: current.epoch,
    system: Object.freeze({
      changed,
      ...(diff !== undefined ? { diff: Object.freeze([...diff]) } : {}),
      piecesEntered: unmatched(nowPieces, beforePieces),
      piecesLeft: unmatched(beforePieces, nowPieces),
    }),
    messages: Object.freeze({
      entered: unmatched(nowMessages, beforeMessages),
      left: unmatched(beforeMessages, nowMessages),
    }),
    tools: Object.freeze({
      added: Object.freeze(added),
      removed: Object.freeze(removed),
      schemaChanged: Object.freeze(schemaChanged),
      schemasComparable: comparable,
    }),
  });
}
