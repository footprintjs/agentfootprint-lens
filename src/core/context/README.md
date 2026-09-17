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

## 0.58.0 — the shared cursor, the one transport

`<ContextView shared recorder>` reads the host's shared address over the
recorder's grouped axis (`scrubAxisFor(recorder, 'group')` — the Why Lens's
own stops) and mounts `<TimeTravel>` as its mover; `previous` is the stop
before on that axis, derived here. The core is untouched: `contextAt` still
takes a `ServedCursor` and an optional `previous`.

## 0.61.0 — the Findings band, under the record

**Why.** An armed agent (`.findings()`, agentfootprint 9.101) commits its own
findings ledger, `findingsLedger`: a `basis` row before each tool call, a
`standing` row on each result the model later named (`fact` · `open` ·
`noise` · `ruled-out`), a `conflict` row where two stood-on readings
disagreed. It is append-only, so the key table above shows every row that
ever landed and the current picture at a stop is spread across them. The
Findings band (`src/react/components/FindingsBand.tsx`) takes the standings
the way the library's own reader does — the LAST standing row per
`toolCallId` is the current one — and groups them, so a reader sees at the
stop what the model stands on, what it keeps open, what it ruled out, what it
called noise, and which results it never named. Conflicts are the one group
that is NOT a current set: the library writes a `conflict` row once per key,
when two stood-on readings first disagreed, and a later `ruled-out` retires a
witness in ITS fold (`foldLedger(...).conflicts` is recomputed from the
current fact values — contextfootprint's algebra, which the lens does not
re-derive) without touching the row. The band therefore prints the conflict
rows as the history of when each was **first seen**, and beside every witness
the standing the same fold holds for it now — so a retired witness reads
`ruled-out` on the row and sits in the ruled-out group, and nothing on the
band says whether the conflict still holds.

`<ContextView>` mounts the band (`FindingsLayer`) under the key table ONLY
when the fold at the cursor holds `findingsLedger`; the rows and the batch
(`toolResults`) are read off the one `contextAt(...).keys`, so the band stands
on the same fold as the table and moves with the ONE cursor. `data-since` on
the band is the key's own since-mark (`entered` at the stop that first wrote
it, `changed` at each later write).

The laws it keeps: **never infer** — a result in the batch with no standing
row is listed as `undeclared`, never as `open`; **no verdict** — a conflict is
its `ConflictRow`'s key and every witness's identity, each with the standing
the fold holds for it now, and nothing says which reading holds nor whether
the conflict is still current; **omit, never deny** — an empty group is not rendered, an
unarmed run has no band; **no sentence of its own** — every printed string is
a value off the record (an id, a subject, a predicate, a value, a `settles`,
a `line`) or a `LABELS` entry, and the own-claims walker
(`test/served/no-own-claims.test.ts`) covers the file.

```tsx
<ContextView runner={recording} recorder={recorder} shared={shared} />
```

At the answer stop of the `findings-ledger` fixture (agentfootprint 9.101.1,
one tool `lookup`, six calls `c1`…`c6`), under the key table:

```
findings · 12 rows
facts · 2        port/fc1/7 · state = up ← tool:c1
                 port/fc1/7 · state = down ← tool:c5
conflicts first seen · 1
                 port/fc1/7 · state ← c1 · fact
                 port/fc1/7 · state ← c5 · fact
open · 1         c4 · lookup
                 port/fc1/7 · flapping = true
                 settles · a second read of the port counters
ruled out · 1    c3 · lookup
                 line · the optic was not swapped this week
noise · 1        c2
undeclared · 1   c6
```

Test ids: `context-findings` (`data-rows`, `data-since`), one
`context-findings-<group>` per non-empty group (`facts`, `conflicts`, `open`,
`ruled-out`, `noise`, `undeclared`; `data-count`), and the rows inside —
`context-findings-fact`, `context-findings-conflict` (`data-key`) holding one
`context-findings-witness` per witness (`data-standing` = that witness's
current standing, empty when no standing row names it),
`context-findings-open-row`,
`context-findings-ruled-out-row`, `context-findings-noise-id`,
`context-findings-undeclared-id` — each with `data-tool-call-id` where a row
is about one result. `foldFindings(rows, toolResults)` is the pure fold the
band renders, exported from the component file for a consumer with its own
UI (not on a barrel in this release). Pinned by
`test/context/findingsBand.test.tsx`.
