# `core/served/` — what the model was served, at the cursor

The data behind the **Served** tab. Five pure functions — four over a recording
and one over what they returned — plus one pairing rule, no React, every return frozen. agentfootprint 9.89.0 owns the rebuild
(`servedAt`), the record (`receiptAt`), the hashes (`receiptHash`,
`messageDigestInput`, `toolDigestInput`), the gap catalogue (`SERVED_GAPS`, `UNGAPPED_FIELDS`)
and the epoch owner (`epochLocations`); this folder only resolves the lens's
cursor onto those and compares what they hand back.

The tab this feeds is the right rail's, and the rail is the LIBRARY's chrome:
since 0.50.0 a host that fills `slots.detail` gets its own pane as the rail's
first tab and keeps this one beside it (before 0.50.0 a slot replaced the whole
rail, so those consumers never saw Served at all). Nothing here changes with a
slot present — the tab reads the same one cursor either way.

| file | one job |
|---|---|
| `servedRowAt.ts` | cursor → epoch. On an llm-turn stop, that call. Inside a grouped turn's subflow, that turn. Otherwise the nearest PRECEDING call by run-log index, flagged `betweenCalls`. |
| `verify.ts` | per-field status from the law `hash(servedAt(k)) === receiptAt(k).hash`, computed ONLY with the library's `receiptHash` over `messageDigestInput` (a message) / `toolDigestInput` (a tool schema). |
| `sincePrevious.ts` | two epochs of one run → what entered / left, by identity; the system text pair goes to `utils/diffPrompts`. |
| `foldFactsAt.ts` | the agent's own keys at the stop (`iteration`, `currentSkillId`, `stepPointer`, `mapEngagement`, `activeInjections`, `hiddenSkillIds`), read from the FOLD through footprintjs's `stateAt`. A row the fold cannot read is DATA (`skipped` indices under footprintjs 9.18, `foldError` under 9.17), never a throw. No `identity`: the agent commits `runIdentity`, and nothing it commits names a role. |
| `servedGraphAt.ts` | the same row as a PICTURE: three bands (held · served · withheld), one slot node per `ContextSlot`, one edge per piece / message / request-only line / tool carrying its badge and its `entered` / `left` / `unchanged` state. A projection — it reads nothing, folds nothing, and takes no cursor. |
| `receiptShape.ts` | the narrowing the lens applies past the library's own: `receiptAt` refuses a value with no numeric `basis.epoch` and promises nothing more; a receipt missing `system` / `messages` / `tools` / `params` / `cache` is refused HERE with the same `cause: 'receipt-shape-rejected'`, so no half-shape is ever dereferenced. `carriesCacheStrategy` is the receipt's own vintage discriminator (the 9.93.0 key), which decides what two absences mean. |
| `evictedTurns.ts` | the receipt's attention drops (`omittedForAttention`, written since agentfootprint 9.93.0), each paired with the epoch that last served it — `pairEvictedTurns` — and `attentionOmissionStatus`, the one owner of what an ABSENT field means. `servedRowAt` computes the pairs onto `ServedRow.evictedTurns`. |

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
   **Attention omissions are read from the receipt** (0.52.0):
   `Receipt.omittedForAttention` is one hash per turn the agent's window
   evicted for budget at the iteration's head, each "the turn's own
   `messages.entries[].hash`, so it pairs with the receipt that last served
   it". That sentence is the PAIRING RULE, and `evictedTurns.ts` is its one
   owner: a hash on epoch k pairs with the LATEST epoch j < k in this
   recording whose `messages.entries[].hash` equals it; `lastServedOn` is that
   j, or absent when no earlier receipt here served it (a turn served on a leg
   this recording does not hold — the salt is the run's — draws Not on record,
   never a guess). What an absent field means is decided once, by
   `attentionOmissionStatus`: on a receipt that carries `cache.strategy`
   (minted by a library whose window files every drop) it is the receipt's own
   claim that nothing was dropped — `'none-on-receipt'`, count 0, nothing
   withheld; on a receipt without the key, or with no receipt, it is
   `'not-on-record'` (the badge; `no-receipt-on-chart` names the field).

   ```ts
   // window-evicts, epoch 3: the pair the window dropped at this head.
   const row = servedRowAt(snapshot, { runtimeStageId: 'call-llm#65', commitIdx: 56 })!;
   row.receipt!.omittedForAttention;   // { count: 2, hashes: ['899a…', '088c…'] }
   row.evictedTurns;                   // [{ hash: '899a…', lastServedOn: 2 }, { hash: '088c…', lastServedOn: 2 }]
   verify(row.view, row.receipt, row.receipt!.basis.runId).omittedForAttention; // 'on-receipt'
   // epoch 2 of the same run: nothing dropped yet, and the receipt says so.
   verify(prev.view, prev.receipt, prev.receipt!.basis.runId).omittedForAttention; // 'none-on-receipt'
   ```
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

## The Served graph (0.49.0)

`servedGraphAt({ row, fold, checks, since })` arranges what the other four
already decided into **three bands, left to right**. It is a SECOND VIEW of one
row — never a second data path, never a second cursor.

1. **HELD** — what the record holds at this stop. The six `FOLD_FACT_KEYS`
   plus the fold's own honesty flags (`basis`, `redacted`, `skipped`,
   `foldError`). A key the fold holds no value for is a node marked
   `'not-on-record'`; a fold that could not read a row is a node marked
   `'damaged'`. Never an empty node.
2. **SERVED** — what crossed into the call. Exactly three slot nodes
   (`SERVED_SLOTS` = the library's `ContextSlot`, in request-assembly order),
   each with the rebuilt count, the receipt's own count, the rows only one side
   has, and the gaps that cover its fields. One EDGE per system piece, message,
   request-only line and tool — each carrying the `FieldCheck` `verify`
   decided for it.
3. **WITHHELD** — held and not sent: `tools.withheld`, ONE node per
   `Receipt.omittedForAttention` row — an edge into the `messages` slot
   carrying the receipt's field name as its reason, the hash, and
   `lastServedOn` (0.52.0; a Not-on-record node instead where no receipt can
   say, and NOTHING where the receipt says none) — the `hiddenSkillIds` the
   caller's role could not see (`from: 'fold'`), a redacted fold, and every gap
   the view declares (`from: 'view'`, with the library's own `why` and the
   fields it covers). Band 3 is the reason to build this: the model never
   learns what it was denied, and the operator should.

**The call node** carries `cacheStrategy` (0.52.0): `Receipt.cache.strategy`
as DATA — the strategy's `providerName` (`'*'` is the built-in pass-through,
printed as itself), or `null`, the receipt's fact that nothing stood between
assembly and the port. Absent where no receipt can say (none, or one minted
before agentfootprint 9.93.0), drawn as Not on record — never as `null`. The
list view's cache section prints the same value from the same node. The
`cache-transform` gap card was always drawn from `view.gaps`; since 9.93.0 the
library raises that gap only where a strategy could have rewritten the request,
so on an `LLMCall` recording (strategy `null`) the card is simply not there.

**What an edge leaves from.** A piece names its own `source`; a message and a
request-only line name their own `role`. Both are the library's vocabularies,
and the graph draws the node the RECORD names — it never maps one onto the
other and never invents a source for a row that carries none. A tool row
carries neither, so its `origin` is absent and it is drawn from its slot.

**Edge state** is `sincePrevious`'s answer, per row rather than as a count:
`system.enteredIndexes` / `system.leftPieces` and `messages.enteredIndexes` /
`messages.leftEntries` name WHICH rows moved (the counts beside them are those
lists' lengths, so the identity rule is spelled once), and tools move by name.
A `left` row is on no current request, so no hash checks it: its badge is
`'not-on-record'`. When the epoch before this one is not in this recording, NO
state is claimed at all — `state` is simply absent.

### The laws the graph keeps

1. **One cursor.** The graph holds no position: it renders the row the cursor
   already resolved, and the same cursor builds the same graph every time.
2. **No sentence of its own.** Every reason on the withheld band is the
   library's own string — a gap's `why`, `UNGAPPED_FIELDS`, a request-only
   line's `reason`, a withheld-list value — printed verbatim.
3. **A badge is never softened.** The badge is `verify`'s verdict, and
   `<ServedBadge>` is one owner across both views: a Damaged row draws Damaged
   in the list and in the picture.
4. **Absent is not none.** A field a gap covers draws the gap; a fold that
   could not read draws "not on record".
5. **Authority omissions come from the FOLD.** Strip `hiddenSkillIds` from a
   recording and they leave the withheld band; they are never on the receipt,
   which by the library's first law carries no authority names.

### Deliberately absent: the piece → writer edge

There is no edge from a served piece back to the STAGE that wrote it (click a
fragment, land on its commit). It needs a commit-log walk keyed by piece text
or slot; that is the part most likely to rot as the assembly changes, and the
question this view answers — *what was this one call made of, and what did we
hold back?* — is answered without it. It is measured separately before it ships.

```ts
import { foldFactsAt, servedGraphAt, servedRowAt, verify } from 'agentfootprint-lens/core';

const cursor = { runtimeStageId: 'call-llm#12', commitIdx: 11 };
const row = servedRowAt(snapshot, cursor)!;
const graph = servedGraphAt({
  row,
  fold: foldFactsAt(snapshot, cursor),
  checks: verify(row.view, row.receipt, row.receipt?.basis.runId ?? '', row.receiptCause),
});
graph.served.map((s) => `${s.slot} ${s.rebuilt}/${s.onReceipt}`);  // ['system-prompt 1/1', …]
graph.edges.filter((e) => e.state === 'entered').map((e) => e.origin);
graph.withheld.filter((w) => w.from === 'fold').map((w) => w.name);  // ['payroll']
graph.call.cacheStrategy;                                            // '*' — or null on an LLMCall, or absent
graph.withheld.filter((w) => w.kind === 'attention-drop').map((w) => [w.hash, w.lastServedOn]);
// window-evicts, epoch 3: [['899a…', 2], ['088c…', 2]]
```

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
