/**
 * receiptShape — the narrowing the lens applies to what `receiptAt` hands back.
 *
 * agentfootprint 9.88.0's `receiptAt` refuses a value with no numeric
 * `basis.epoch` and promises nothing past that: a record that carries a basis
 * but no `system`, `messages`, `tools`, `params` or `cache` comes back typed as
 * a `Receipt` and is not one. The lens reads every one of those containers, so
 * it checks for them ONCE, here, and a value that fails is treated exactly as
 * the library treats its own refusal — `cause: 'receipt-shape-rejected'`,
 * every row `'damaged'` — rather than dereferenced.
 *
 * This is a structural check, not a semantic one: it asks whether the
 * containers verify/sincePrevious/the tab read are present with the right
 * type (down to `cache.markersApplied`, which the tab maps over). It does not
 * validate hashes (that is `verify`'s job) or values.
 *
 * `cache.strategy` (agentfootprint 9.93.0) is OPTIONAL here: a receipt minted
 * before that release has no key, and the library says a reader treats that
 * as "cannot say". When the key is present it must be a string or `null` —
 * both are printed as data, and anything else would be a shape the lens does
 * not own.
 */

import type { Receipt, StoredReceipt } from 'agentfootprint';

/**
 * The receipt as the lens READS it — what `isReceiptShaped` admits. The
 * library's `StoredReceipt` (agentfootprint 9.94.1) promises nothing past
 * `basis`; the lens's own narrowing puts every container it dereferences on
 * the record (`cache` included), and this type says so. What stays the
 * vintage's to say is `cache.strategy`, the 9.93.0 key — read it through
 * `carriesCacheStrategy`, never bare. `ServedRow.receipt` is one of these.
 */
export type ShapedReceipt = StoredReceipt & { readonly cache: NonNullable<StoredReceipt['cache']> };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** Does `value` carry every container the lens reads off a receipt? */
export function isReceiptShaped(value: unknown): value is ShapedReceipt {
  if (!isRecord(value)) return false;
  const { system, messages, tools, params, cache, basis } = value;
  if (isRecord(cache) && 'strategy' in cache && cache.strategy !== null && typeof cache.strategy !== 'string') {
    return false;
  }
  return (
    isRecord(basis) &&
    typeof basis.epoch === 'number' &&
    typeof basis.runId === 'string' &&
    isRecord(system) &&
    typeof system.hash === 'string' &&
    Array.isArray(system.pieces) &&
    isRecord(messages) &&
    Array.isArray(messages.entries) &&
    Array.isArray(messages.requestOnly) &&
    isRecord(tools) &&
    Array.isArray(tools.names) &&
    isRecord(tools.schemaHashes) &&
    isRecord(params) &&
    isRecord(cache) &&
    Array.isArray(cache.markersApplied)
  );
}

/**
 * Was this receipt minted by a library that WRITES `cache.strategy`
 * (agentfootprint 9.93.0)? The key is the one discriminator a receipt carries
 * for its own vintage, and it decides what two absences mean:
 *
 *   · `cache.strategy` absent → "cannot say" whether a strategy ran (the
 *     library's own reading — never `null`);
 *   · `omittedForAttention` absent on a receipt WITH the key → the library's
 *     claim that nothing was dropped before this call (the same release made
 *     the agent chart's window file every eviction there); absent on a receipt
 *     WITHOUT the key → nobody recorded a drop, so the field is not on record.
 *
 * Takes the receipt AS STORED (`receiptAt`'s `StoredReceipt`): a receipt with
 * no `cache` container at all is a vintage older than the container, and
 * carries no key — `false`, never a throw. Narrows: past a `true`,
 * `cache.strategy` is the string or `null` the receipt wrote.
 *
 * @example
 * ```ts
 * carriesCacheStrategy(receiptAt(snapshot, 1)!); // true on a 9.93+ mint, '*' or null alike
 * ```
 */
export function carriesCacheStrategy(
  receipt: StoredReceipt,
): receipt is StoredReceipt & { readonly cache: Receipt['cache'] } {
  return receipt.cache !== undefined && 'strategy' in receipt.cache;
}
