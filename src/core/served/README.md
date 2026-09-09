# `core/served/` — what the model was served, at the cursor

The data behind the **Served** tab. Four pure functions over a recording, no
React, every return frozen. agentfootprint 9.89.0 owns the rebuild
(`servedAt`), the record (`receiptAt`), the hashes (`receiptHash`,
`messageDigestInput`, `toolDigestInput`), the gap catalogue (`SERVED_GAPS`, `UNGAPPED_FIELDS`)
and the epoch owner (`epochLocations`); this folder only resolves the lens's
cursor onto those and compares what they hand back.

| file | one job |
|---|---|
| `servedRowAt.ts` | cursor → epoch. On an llm-turn stop, that call. Inside a grouped turn's subflow, that turn. Otherwise the nearest PRECEDING call by run-log index, flagged `betweenCalls`. |
| `verify.ts` | per-field status from the law `hash(servedAt(k)) === receiptAt(k).hash`, computed ONLY with the library's `receiptHash` over `messageDigestInput` (a message) / `toolDigestInput` (a tool schema). |
| `sincePrevious.ts` | two epochs of one run → what entered / left, by identity; the system text pair goes to `utils/diffPrompts`. |
| `foldFactsAt.ts` | the agent's own keys at the stop (`iteration`, `currentSkillId`, `stepPointer`, `mapEngagement`, `activeInjections`, `hiddenSkillIds`), read from the FOLD through footprintjs's `stateAt`. A row the fold cannot read is DATA (`skipped` indices under footprintjs 9.18, `foldError` under 9.17), never a throw. No `identity`: the agent commits `runIdentity`, and nothing it commits names a role. |
| `receiptShape.ts` | the narrowing the lens applies past the library's own: `receiptAt` refuses a value with no numeric `basis.epoch` and promises nothing more; a receipt missing `system` / `messages` / `tools` / `params` / `cache` is refused HERE with the same `cause: 'receipt-shape-rejected'`, so no half-shape is ever dereferenced. |

## The laws this folder keeps

1. **Omit, never deny.** A field a gap covers is never rendered as "empty" or
   "none" — the gap IS the empty state. The data layer keeps the view's gaps
   beside every row so the tab can do that.
2. **No claim sentences of its own.** Nothing here produces prose. Statuses,
   counts, lists, diffs, and the library's own `why` strings passed through.
3. **Verified means hashes agree — nothing else.** `verify` marks a row
   `'verified'` only when the receipt's hash equals the hash of the rebuild,
   computed with the exported `receiptHash` over the exported
   `messageDigestInput` (a message) or `toolDigestInput` (a tool schema),
   salted with the recording's own `runId`. No receipt, or no hash for this KIND of row →
   `'reconstructed'`. A hash that disagrees, or a value under the receipt key
   the library (or `receiptShape.ts`) refused (`cause:
   'receipt-shape-rejected'`) → `'damaged'`. Tool NAMES carry no hash (never
   verified; the receipt's list is handed back for a diff). Tool SCHEMAS are
   paired by name — the key both sides carry — and decided by their hash;
   `toolDigestInput` arrived in agentfootprint 9.89.0, and under a 9.88 peer
   the rows stay `'reconstructed'` (the export is detected at call time —
   the serializer is never re-implemented here, which would be a second owner
   of the rule).

   **The receipt is the witness in BOTH directions.** A rebuilt row the receipt
   never hashed — an extra piece, message or tool name; a receipt whose rows
   were dropped — is `'damaged'` and counted in `rebuiltOnly`: no gap in the
   library's catalogue says a rebuild may be LONG, only that it may be SHORT.
   A receipt row the rebuild did not produce is counted in `onReceiptOnly`,
   and is damage unless an excusing gap covers the field.

   **`EXCUSING_GAPS` is the lens's own policy** over the library's catalogue:
   under `no-fold-base`, `no-run-log`, `no-conversation-on-record` and
   `forced-tool-schema` a SHORT rebuild is the declared hole (the library's
   sentence for each says so: "may be SHORT"); `cache-transform` and
   `provider-defaults` are caveats, not excuses. An excuse never hides a
   disagreement on a row that HAS its witness: under `no-fold-base` the rebuild
   is a suffix of what went out, so messages are paired by the receipt's own
   join key (`ReceiptMessage.key`) and otherwise by suffix offset with a
   matching role, pieces by `(slot, source)` — a paired row is decided by its
   hash, verified or damaged. Only the joined `system.hash` (an aggregate that
   can be short) and the composed `requestOnly` lines stay `'reconstructed'`
   on a disagreement.

   ```ts
   // paused-resumed-no-base, epoch 2: the log-only rebuild recovers the tool
   // result; the receipt hashed the whole conversation.
   const checks = verify(row.view, row.receipt, row.receipt.basis.runId);
   checks.messages[0].status;      // 'verified' — paired by key 'c1', hashes agree
   checks.onReceiptOnly.messages;  // 2 — the head the log did not carry
   checks.system.status;           // 'reconstructed' — 0 chars recovered vs 27
   ```

   ```ts
   // flat-dynamic-tools, epoch 1: every tool schema, by name, against the receipt.
   checks.toolSchemas.alpha_tool.status;  // 'verified' — receiptHash(runId, toolDigestInput(schema)) equals the receipt's
   checks.onReceiptOnly.schemas;          // [] — on tool-forced this is [forced], excused by 'forced-tool-schema'
   ```
4. **Authority omissions are read from the fold.** `hiddenSkillIds` comes from
   `stateAt(recording, cursor.commitIdx)` — the committed state at the stop —
   never from a receipt, which by the library's first law never carries it.
5. **One cursor.** Every function takes the cursor as an argument
   (`{ runtimeStageId, commitIdx }`) and stores nothing. `previousEpoch` is the
   epoch before this one IN THIS RECORDING: a resumed leg's first call has none
   here although the run had one, so an absent value never means "the run's
   first call" — `epoch` says which call it is, and a renderer prints that
   number rather than a sentence.
6. **A record never takes the tab down.** The data layer refuses shapes it
   does not own (`receiptShape.ts`), reports a fold it cannot run as
   `foldError` / `skipped`, and bounds the system-text diff
   (`diffPromptsBounded` — `since.system.diff` is ABSENT past the cell cap,
   printed as "diff not computed"). `<ServedTab>` adds a boundary that renders
   a render throw as the Damaged badge plus the message.

## Example

```ts
import { servedRowAt, servedRowForEpoch, verify, sincePrevious, foldFactsAt } from 'agentfootprint-lens/core';

const snapshot = runner.getLastSnapshot();
const row = servedRowAt(snapshot, { runtimeStageId: 'call-llm#12', commitIdx: 11 });
if (row) {
  const checks = verify(row.view, row.receipt, row.receipt?.basis.runId ?? '');
  checks.system.status;                        // 'verified'
  checks.toolSchemas.lookup?.status;           // 'verified' — the schema's hash, by the library's own toolDigestInput
  row.view.gaps.map((g) => g.why);             // the library's sentences, verbatim
  const prev = row.previousEpoch !== undefined ? servedRowForEpoch(snapshot, row.previousEpoch) : undefined;
  if (prev) sincePrevious(row, prev).tools.added;   // ['charge']
  foldFactsAt(snapshot, { runtimeStageId: 'call-llm#12', commitIdx: 11 }).hiddenSkillIds;
}
```
