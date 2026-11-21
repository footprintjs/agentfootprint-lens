import { collapsedTicketOf } from './collapsedTicket.js';
import { cacheStrategyOf } from './receiptShape.js';
import {
  foldFactsAt,
  servedGraphAt,
  servedRowAt,
  servedRowForEpoch,
  sincePrevious,
  verify,
  type ServedCursor,
  type ServedGraph,
  type ServedGraphInput,
} from './index.js';

/** Read the standalone Served tab's evidence at the current replay stop. */
export function servedAtStop(snapshot: unknown, at: ServedCursor): ServedGraphInput | undefined {
  const row = servedRowAt(snapshot, at);
  if (row === undefined) return undefined;

  const checks = verify(row.view, row.receipt, row.receipt?.basis.runId ?? '', row.receiptCause);
  const previous = row.previousEpoch !== undefined ? servedRowForEpoch(snapshot, row.previousEpoch) : undefined;
  const since = previous !== undefined ? sincePrevious(row, previous) : undefined;
  const fold = foldFactsAt(snapshot, at);
  return { row, fold, checks, ...(since !== undefined && { since }) };
}

/** Project evidence already read by either the standalone tab or Context. */
export function projectServedReading(evidence: ServedGraphInput) {
  const { row } = evidence;
  const pieceIndexes = row.view.system.pieces.flatMap((piece, index) => piece.source === 'findings' ? [index] : []);
  const tickets = row.view.messages.asSent.flatMap((message) => {
    const ticket = message.role === 'tool' ? collapsedTicketOf(message.content) : undefined;
    return ticket ? [ticket] : [];
  });
  let graph: ServedGraph | undefined;
  return {
    pieceIndexes,
    tickets,
    cacheStrategy: cacheStrategyOf(row.receipt),
    getGraph: () => graph ??= servedGraphAt(evidence),
  };
}

/** A recorded claim, as agentfootprint's `Claim<T>` spells it: known with a value, or not. */
export type RecordedClaim =
  | { readonly kind: 'known'; readonly value: number; readonly reason?: undefined }
  | { readonly kind: string; readonly value?: undefined; readonly reason?: string };

/** The cache recorder's run totals, read off the snapshot's recorder rows (0.60.0). Absent when no host attached one. */
export function cacheTotalsOf(snapshot: unknown): { readonly read?: RecordedClaim; readonly fresh?: RecordedClaim; readonly hitRate?: RecordedClaim } | undefined {
  const rows = (snapshot as { recorders?: unknown } | null | undefined)?.recorders;
  if (!Array.isArray(rows)) return undefined;
  const row = rows.find((r) => (r as { id?: unknown } | null)?.id === 'cache-recorder') as { data?: unknown } | undefined;
  const data = row?.data as Record<string, unknown> | undefined;
  if (data === undefined || data === null || typeof data !== 'object') return undefined;
  const claim = (v: unknown): RecordedClaim | undefined =>
    v !== null && typeof v === 'object' && typeof (v as { kind?: unknown }).kind === 'string' ? (v as RecordedClaim) : undefined;
  return {
    ...(claim(data.cacheReadTokensTotal) !== undefined && { read: claim(data.cacheReadTokensTotal)! }),
    ...(claim(data.freshInputTokensTotal) !== undefined && { fresh: claim(data.freshInputTokensTotal)! }),
    ...(claim(data.hitRate) !== undefined && { hitRate: claim(data.hitRate)! }),
  };
}
