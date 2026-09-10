/**
 * served/ — the Served tab's data, framework-free.
 *
 * Four pure queries over a recording, every return frozen:
 *   `servedRowAt(recording, cursor)` — the cursor's epoch (or the nearest
 *     preceding one, flagged `betweenCalls`), its rebuilt view and its receipt;
 *   `verify(view, receipt, runId)`   — per-field 'verified' | 'reconstructed'
 *     | 'damaged' | 'not-on-record', decided by the library's own hashes;
 *   `sincePrevious(row, previous)`   — what entered and left between two epochs;
 *   `foldFactsAt(recording, cursor)` — the agent's own keys at the stop, read
 *     from the fold through footprintjs's `stateAt`;
 *   `servedGraphAt({ row, fold, checks, since })` — the same row as three
 *     bands (held · served · withheld) and the edges between them. A second
 *     VIEW, never a second data path.
 *
 * See README.md in this folder for the laws these keep.
 */

export { servedRowAt, servedRowForEpoch } from './servedRowAt.js';
export {
  verify,
  EXCUSING_GAPS,
  type ReceiptPresence,
  type RowCounts,
  type ServedVerification,
} from './verify.js';
export { sincePrevious, type SincePrevious } from './sincePrevious.js';
export {
  servedGraphAt,
  HELD_HONESTY_KEYS,
  HELD_KEYS,
  SERVED_SLOTS,
  type CallNode,
  type HeldKey,
  type HeldNode,
  type ServedEdge,
  type ServedEdgeKind,
  type ServedEdgeState,
  type ServedGraph,
  type ServedGraphInput,
  type ServedRoleName,
  type ServedSlotName,
  type ServedSourceName,
  type SlotNode,
  type WithheldFrom,
  type WithheldKind,
  type WithheldNode,
} from './servedGraphAt.js';
export {
  foldFactsAt,
  FOLD_FACT_KEYS,
  type FoldFactKey,
  type FoldFacts,
} from './foldFactsAt.js';
export type { FieldCheck, ServedCursor, ServedFieldStatus, ServedRow } from './types.js';
