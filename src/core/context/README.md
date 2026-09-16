# core/context — the context object at a stop

`contextAt(recording, cursor, { previous?, events? })` is **the join** over the
three records a run leaves, and writes none of its own:

| Record | Where | What it contributes |
|---|---|---|
| the commit log | `snapshot.commitLog` | the **object** at the stop (`stateAt`), **who wrote each key** (the last trace row on that path → its `runtimeStageId`), when it **entered**, and the stop's **delta** (its own rows) |
| the receipt | `servedRowAt` — the Served tab's own core | what was **served** at this epoch and its verdict, handed through untouched |
| the event stream | `EventLogEntry[]` from a replay's `getEntries()` | the **why**: event names raised by the stages that wrote the delta, or by the stop's own stage |

Join keys: `runtimeStageId` (commit log ⟂ events) and `epoch` (commit log ⟂
receipt, through `servedRowAt`).

## The laws this folder keeps

1. **Unattributed, never guessed.** A key the fold holds with no writer row —
   the run's initial state, a row the log lost — has `wroteBy: undefined`. The
   screen prints *unattributed*; nobody fills in "the host".
2. **Owners are stage ids.** `wroteBy` is the `runtimeStageId` on the trace
   row, because that is what the record says. Mapping a stage to a word
   ("adapter", "model") is a reader's act, not this folder's.
3. **The served side is the Served tab's row.** Same epoch, same verdict, same
   gaps — one owner. Nothing here re-derives what was sent.
4. **No direction without a previous stop.** `since` and `left` exist only
   when the caller hands `previous`; alone, a stop claims no movement.
5. **A fold that cannot replay says so.** `foldError` with no keys — not an
   empty object pretending to be one.
6. **No sentence of its own.** Names, ids, indices, verbs, event names. The
   own-claims walker (`test/served/no-own-claims.test.ts`) covers this folder
   and `<ContextView>`.

## Example

```ts
import { contextAt } from 'agentfootprint-lens/core';

const ctx = contextAt(recording, { runtimeStageId: 'call-llm#12', commitIdx: 9 }, {
  previous: { runtimeStageId: 'sf-tools#8', commitIdx: 6 },
  events: replay.getEntries(),
});
ctx.keys[0]; // { path: 'history', value: [...], wroteBy: 'merge-llm#5', wroteAt: 4, enteredAt: 1, verb: 'set', since: 'changed' }
ctx.left;    // keys the previous stop held and this one does not
ctx.served;  // { row, checks, since } — the Served tab's row at this epoch
ctx.why;     // [{ seq, name: 'agentfootprint.agent.iteration_end', runtimeStageId }]
```

`<ContextView>` (`src/react/components/ContextView.tsx`) renders this — standalone
over the library's milestone axis, or handed the ONE cursor.

## 0.54.0 — the served row is rendered, not just badged

`<ContextView>` mounts `<ServedTab runner cursor>` (the Why Lens's own Served
tab) above the key table whenever `contextAt(...).served` is present — the
served document of the stop's epoch, verified against the receipt, with the
delta since the previous model call — and prints `built from · N keys` on the
seam. The core is unchanged: `served` is still `servedRowAt`'s row handed
through; the view only chose to show all of it.
