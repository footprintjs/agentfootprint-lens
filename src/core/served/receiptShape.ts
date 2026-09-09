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
 */

import type { Receipt } from 'agentfootprint';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** Does `value` carry every container the lens reads off a receipt? */
export function isReceiptShaped(value: unknown): value is Receipt {
  if (!isRecord(value)) return false;
  const { system, messages, tools, params, cache, basis } = value;
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
