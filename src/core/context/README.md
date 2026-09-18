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

At the answer stop of the `findings-ledger` fixture (agentfootprint 9.103.0,
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

## 0.62.0 — the Reasoning lens, the same fold read by call

**Why.** The Findings band groups the ledger by STANDING. A reader following
the model's reasoning wants it the other way round — BY CALL: what the model
declared before each tool call ran, what came back, what it declared about
the result afterwards. `<ReasoningLens>`
(`src/react/components/ReasoningLens.tsx`) draws one card per tool call in
call order, from the fold at the cursor's stop, and one trailing card for
the answer turn. It stands on `foldFindings` (reused, not re-derived —
0.62.0 adds `standings`, the current row per `toolCallId`, to that fold) and
looks everything else up by the result's id: the result itself from the
state's `history` tool messages (then the batch, `toolResults`), the
collapsed ticket from the served wire at the stop's epoch
(`contextAt(...).served.row.view.messages.asSent`, read by
`ServedTab.tsx · collapsedTicketOf`), the conflict rows from the same fold.

Each card: the tool name, the id (shortened past 12 characters, the full id
on hover), the iteration, the `basis` as a chip (`direct` / `exploratory`)
and `expect` when declared; BEFORE — `proposition` (under the label
`tested`) and `predicts`, quoted, when the record carries them (the fixture's
`c3` declares both; the other calls declare neither and draw no BEFORE); AFTER — the current standing as a chip
(`fact` · `open` · `noise` · `ruled-out`, the record's word, or the label
`undeclared`), `sought`, `unknown id` (the library's flag that the id named
no result in the batch), `collapsed` (with the ticket's own standing as the
hover), `declared on` (the later call's id or `answer`), and ONE quoted line
— the first assertion for a fact, the `settles` for an open result, the
`line` for a ruled-out one. A `details` disclosure (a native `<details>`; its
open bit is the browser's, not a second cursor) opens the full id, the
result's size (`placed` ref and `bytes` from a placement ticket, else its
chars), the ticket on the wire, every assertion, and the `settles` / `line`.
A conflict row puts a `conflict` chip on BOTH witnesses' cards (the key on
hover).

The answer card appears once a standing row was declared on the answer
(`declaredOn: 'answer'`) and counts the fold's buckets under the served
piece's own field names — `facts` (stood-on assertions), `limitations`
(ruled-out rows), `evidenceRefs` (open rows), `nextSteps` (open rows with a
`settles`), `noise`, `undeclared` — the mapping `findings/serve.ts ·
findingsLedgerPiece` uses to compose the piece; the counts are the fold's at
the cursor, never a parse of the piece text, so at the answer stop they
include the answer's own declarations. The run constants ride as chips when
the record carries them: `serve` (`findingsServe`) and `answer ask`
(`findingsAnswerAsk`) — absent otherwise.

ONE cursor: the lens takes `cursor` (a host's per-axis reading) or `shared`
(the host's address, read over the recorder's grouped axis or the milestone
axis) exactly as `<ContextView>` does, and holds no cursor of its own — with
neither it reads the run's end, stateless, and mounts no mover. Calls after
the cursor are not drawn because the fold at the stop does not hold their
basis rows yet.

```tsx
const shared = useSharedCursor(recorder);
<ContextView runner={recording} recorder={recorder} shared={shared} />
<ReasoningLens runner={recording} recorder={recorder} shared={shared} />
```

At the answer stop of the `findings-ledger` fixture:

```
Reasoning · 6 calls
lookup c1 · iteration 1 · [direct] [expect high] [conflict]
  standing [fact] [sought] · declared on c5
  port/fc1/7 · state = up
lookup c2 · iteration 1 · [exploratory] [expect low]
  standing [noise] [collapsed] · declared on c5
lookup c3 · iteration 1 · [exploratory]
  tested "the optic on fc1/7 was swapped this week"
  predicts "a swap event for fc1/7 dated within seven days"
  standing [ruled-out] [collapsed] · declared on c5
  line "the optic was not swapped this week"
lookup c4 · iteration 1 · [direct]
  standing [open] · declared on c5
  settles "a second read of the port counters"
lookup c5 · iteration 2 · [direct] [conflict]
  standing [fact] · declared on answer
  port/fc1/7 · state = down
lookup c6 · iteration 2 · [exploratory]
  standing [undeclared]
answer · [serve ledger-and-facts]
  facts 2 · limitations 1 · evidenceRefs 1 · nextSteps 1 · noise 1 · undeclared 1
```

The laws it keeps are the band's: **omit, never deny** (no ledger at the
stop, nothing drawn — the root is absent on an unarmed run; no field a row
does not carry), **never infer** (`undeclared`, never `open`), **no sentence
of its own** (`LABELS`, walked by `test/served/no-own-claims.test.ts`), and
**one cursor**. Test ids: `reasoning-lens` (`data-step`, `data-commit`,
`data-calls`), `reasoning-card` (`data-tool-call-id`, `data-basis`,
`data-standing`), the chips `reasoning-basis`, `reasoning-expect`,
`reasoning-malformed`, `reasoning-conflict`, `reasoning-standing`,
`reasoning-sought`, `reasoning-unknown-id`, `reasoning-collapsed`, the
blocks `reasoning-before` (`reasoning-proposition`, `reasoning-predicts`),
`reasoning-after`, `reasoning-declared-on`, `reasoning-line`,
`reasoning-details` (`reasoning-result` with `data-chars` or
`data-placed`, `reasoning-ticket`, `reasoning-assertion`), and
`reasoning-answer` (`data-answer-ask`; `reasoning-count` per bucket with
`data-bucket` / `data-count`; `reasoning-serve`, `reasoning-answer-ask`).
`foldReasoning(input)` is the pure fold, exported with the component from
the root barrel and the `/context` door. Pinned by
`test/context/reasoningLens.test.tsx`.

## 0.63.0 — the exchange view, the same beats as a transcript

**Why.** The cards read the ledger's declarations; a reader checking the
model's account against the wire wants to see what actually crossed it, as
the JSON it was — the model's call with its `_findings` declaration, the
tool's result, the ticket the model was served instead of a result it had
ruled out, the findings piece composed for the answer turn, and the answer.
`<ReasoningLens>` now carries a `view` toggle (two real tabs, `cards` —
today's default — and `exchange`; React state, not the cursor; `defaultView`
opens on either) and, under `exchange`, lays the SAME beats out as the
exchange between the two parties: the model's beats on the left, the tools'
on the right, in wire order per call up to the cursor's stop. A reader sees
the loop the record holds: declare → call → result → standing → served →
answer.

What each beat reads, and from where:

- **call** (model, left) — the assistant message in `history` whose
  `toolCalls[]` carries the id: its `name`, the id, and `args._findings`
  pretty-printed as its own block first (basis / expect / proposition /
  predicts / `previous[]`), then the remaining `args`. The emission is
  verbatim there by the record's law and is never rebuilt from the ledger.
  When `history` no longer carries it (an evicted turn), the ledger's basis
  row stands in — `basis`, `expect`, `proposition`, `predicts` as the row
  spells them — under the chip `from ledger`, and no `args` block.
- **result** (tool, right) — the tool message's `content` in `history` (then
  the batch, `toolResults`): pretty-printed when it parses as JSON, else
  verbatim; a placement ticket drawn as the ticket (`placed` ref · `bytes`).
  When the served wire at the stop's epoch (`served.row.view.messages.asSent`)
  carries this id as a collapsed ticket, a chip `collapsed <standing>` and the
  ticket JSON under `ticket` — what came back beside what the model was
  served. Then the standing a later call (or the answer) declared for it —
  the cards' AFTER reused: the `standing` chip (or `undeclared`), `declared
  on`, and the one quoted line.
- **served** (model, left) — the served view's `source: 'findings'` piece at
  the stop's epoch, its `text` verbatim under the piece's own source name;
  absent when no such piece was served (the fixture's epochs 1 and 2).
- **answer** (model, left) — `history`'s closing assistant message (content,
  no tool calls), else `finalContent`, else `llmLatestContent` once
  `llmLatestToolCalls` carries no call; the field it was read from is printed
  beside the label. Absent while the run has not answered at the stop.

Every block longer than 12 lines is clipped, the rest behind a native
`<details>` (`N lines` on the summary — the browser's bit, not a second
cursor). Layout: a column of beats, each half the panel's width on a wide
panel and the whole width on a narrow one (`max(50%,min(100%,320px))`, no
media query — the own-claims walker forbids a multi-word CSS string, and
the inline style cannot carry one), the model's beats aligned left and the
tools' right.

```tsx
<ReasoningLens runner={recording} recorder={recorder} shared={shared} defaultView="exchange" />
```

At the answer stop of the `findings-ledger` fixture (abridged; `c2`, `c4`,
`c6` follow the same shape):

```
Reasoning · 6 calls                                   [cards] [exchange]
┌ model · call · lookup c1 ─────────────┐
│ _findings                              │
│ { "basis": "direct", "expect": "high" }│
│ args                                   │
│ { "q": "fc1/7 state" }                 │
└────────────────────────────────────────┘
                     ┌ tool · result · lookup c1 ──────────────┐
                     │ lookup result                            │
                     │ standing [fact] · declared on c5         │
                     │ port/fc1/7 · state = up                  │
                     └──────────────────────────────────────────┘
┌ model · call · lookup c3 ─────────────┐
│ _findings                              │
│ { "basis": "exploratory",              │
│   "proposition": "the optic on fc1/7   │
│      was swapped this week",           │
│   "predicts": "a swap event for fc1/7  │
│      dated within seven days" }        │
│ args                                   │
│ { "q": "optic swaps" }                 │
└────────────────────────────────────────┘
                     ┌ tool · result · lookup c3 [collapsed ruled-out] ┐
                     │ lookup result                                    │
                     │ ticket                                           │
                     │ { "collapsed": true, "standing": "ruled-out",    │
                     │   "toolCallId": "c3" }                           │
                     │ standing [ruled-out] · declared on c5            │
                     │ line "the optic was not swapped this week"       │
                     └──────────────────────────────────────────────────┘
┌ model · call · lookup c5 ─────────────┐
│ _findings                              │
│ { "basis": "direct",                   │
│   "previous": [ { "toolCallId": "c1",  │
│     "standing": "fact", "sought": true,│
│     "assertions": [ … ] }, … ] }       │
│ ▸ 32 lines                             │
│ args                                   │
│ { "q": "fc1/7 state again" }           │
└────────────────────────────────────────┘
                     ┌ tool · result · lookup c5 ──────────────┐
                     │ lookup result                            │
                     │ standing [fact] · declared on answer     │
                     │ port/fc1/7 · state = down                │
                     └──────────────────────────────────────────┘
┌ model · served · findings ─────────────┐
│ [AgentFootprint findings ledger — a     │
│ system instruction composed from the   │
│ record, not a user message. …]         │
│ facts (declared by the model):         │
│ port/fc1/7 · state = up ← tool:c1      │
│ ▸ 16 lines                             │
└────────────────────────────────────────┘
┌ model · answer · llmLatestContent ─────┐
│ {"answer":"fc1/7"}                     │
└────────────────────────────────────────┘
```

The laws are the cards': **omit, never deny** (no ledger at the stop, no
lens; no served beat without the piece, no answer beat without the answer,
no `args` block when the emission is off the record), **never infer**
(`undeclared`, never `open`; `from ledger` says when a call is not the
emission), **no sentence of its own** (the new labels — `view`, `cards`,
`exchange`, `model`, `tool`, `call`, `served`, `args`, `_findings`, `from
ledger`, `lines` — live in the same `LABELS`, walked by
`test/served/no-own-claims.test.ts`; everything else printed is a value off
the record), and **one cursor** (the view toggle is the only state, and it
is not a position). Test ids: `reasoning-view-toggle` (`role="tablist"`),
`reasoning-view-cards` / `reasoning-view-exchange` (`role="tab"`,
`aria-selected`), `reasoning-lens` gains `data-view`; `reasoning-cards`
wraps the cards; `reasoning-exchange` (`data-beats`) holds one
`reasoning-beat` per beat (`data-side` `model` | `tool`, `data-kind` `call`
| `result` | `served` | `answer`, `data-tool-call-id` on the first two);
inside: `reasoning-from-ledger`, `reasoning-beat-findings`,
`reasoning-beat-args`, `reasoning-beat-content`, `reasoning-beat-ticket`,
`reasoning-answer-from`, each clipped block `reasoning-clipped`
(`data-lines`) with its `reasoning-pre` blocks and `reasoning-more`
disclosure; the result beat reuses `reasoning-collapsed`, `reasoning-after`,
`reasoning-standing`, `reasoning-declared-on`, `reasoning-line`.
`foldExchange(input)` is the pure fold (`ExchangeFold.beats`, standing on
`foldReasoning`), exported with the beat shapes from the root barrel and the
`/context` door; `ReasoningInput` gains `pieces`, `finalContent`,
`llmLatestContent`, `llmLatestToolCalls`. Pinned by
`test/context/reasoningLens.test.tsx`.

## 0.64.0 — the Ontology view, the declared map drawn from the record

**Why.** An agent built with `.ontology(defineOntology({...}))`
(agentfootprint 9.106.0, the `agentfootprint/ontology` door) seeds its whole
map ONCE as the run constant `AgentState.ontology` — `{ id, version, hash,
spec }` — and every call of the run is served one system piece composed from
it (`source: 'ontology'` on the served view's `system.pieces`). The owner's
sentence: *an ontology is a map — it does not provide a way to get data; it
tells and reasons about each node and how to reach a node, so a model that
finds no data can say which node or source would help further.* A reader
checking what the model was told the world looks like wants that map drawn,
not read line by line off the piece. `<OntologyView>`
(`src/react/components/OntologyView.tsx`) draws it from the record: a small
SVG chart (no library) with the SOURCES in one column (a square-cornered box
with a thick border: id, meaning and the coverage sentence clipped, a
`configured` chip only when the author wrote it), the TERMS they hold in the
next (rounded boxes: id, meaning clipped, the unit as a chip), the terms no
source holds in a third column under the declaration's own heading — `known,
not held here`, the served piece's line, never a verdict — `held by` as
source→term edges labelled with the `via` tool names when declared, and
relations as term→term elbows labelled with the author's own relation word.
Beside the chart, the SAME data as a list — terms (meaning, unit, aliases),
sources (meaning, `configured`, coverage quoted), `held by` (term ← source,
`via`, coverage quoted), relations (from · word · to, meaning quoted), the
unheld — for a screen reader, and for a test. A header line prints the map's
id, version, hash (short, whole on hover) and the counts (nodes, sources,
edges) — numbers are data.

Layout is a function of the spec alone: nodes sorted by id (the served
piece's own order), rows by index, a straight line per holding and one lane
per relation in declaration order — no force layout, no measurement, no
randomness. A run's map draws the same bytes twice. Colours are the theme
tokens the Skill Graph uses (`T.srcTool` for a source and its holdings,
`T.primary` for a held term and a relation, `T.textMuted` dashed for an
unheld term).

ONE cursor: the view takes `cursor` or `shared` (with `recorder`) exactly as
`<ReasoningLens>` does, reads the fold at that stop through `contextAt`, and
mounts the shared transport when it holds the address — the key is a run
constant, so the map is the same at every stop after the seed, and a stop
before the seed draws nothing. With neither prop it reads the run's end,
stateless, and mounts no mover.

```tsx
import { OntologyView } from 'agentfootprint-lens/context';

const shared = useSharedCursor(recorder);
<ContextView runner={recording} recorder={recorder} shared={shared} />
<OntologyView runner={recording} recorder={recorder} shared={shared} />
```

At any stop of the `ontology` fixture (two sources, four terms, two
relations, one `via` tool):

```
Ontology fleet · version 1 · hash 9919b454a3bd… · 4 nodes · 2 sources · 6 edges

 sources                 nodes                      known, not held here
┏━━━━━━━━━━━━━━━━━━┓    ╭──────────────────────╮    ╭ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ╮
┃ inventory        ┃───▶│ optic                │    ╎ maintenance_window  ╎
┃ the switch inv…  ┃─┐  │ the transceiver se…  │    ╎ a scheduled chang…  ╎
┗━━━━━━━━━━━━━━━━━━┛ │  ╰──────────────────────╯◀┐  ╰ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ╯
┏━━━━━━━━━━━━━━━━━━┓ │ lookup                    │ seated-in
┃ telemetry        ┃─┼─▶╭──────────────────────╮ │
┃ the streaming c… ┃ └─▶│ port                 │◀┘ measured-on
┗━━━━━━━━━━━━━━━━━━┛    ╰──────────────────────╯
                        ╭──────────────────────╮
                     ──▶│ port_error_rate  errors/min
                        ╰──────────────────────╯

nodes · 4          maintenance_window  a scheduled change on a switch
                   optic  the transceiver seated in a port · aliases sfp, transceiver
                   port  a physical switch port
                   port_error_rate  CRC errors per minute on a port [unit errors/min]
sources · 2        inventory  the switch inventory export [configured true] coverage "every port on every switch in the fleet"
                   telemetry  the streaming counters feed
held by · 4        optic ← inventory
                   optic ← telemetry
                   port ← inventory via lookup coverage "each port by its switch and name"
                   port_error_rate ← telemetry
relations · 2      port_error_rate measured-on port
                   optic seated-in port "one optic per port"
known, not held here · 1   maintenance_window
```

The laws it keeps: **omit, never deny** (no `ontology` key at the stop, no
view; no `configured` chip on a source that said nothing; no `via` label on
a holding that named no tool), **no sentence of its own** (every printed
string is the author's — an id, a meaning, a unit, an alias, a coverage
sentence, a relation word, a tool name — or a `LABELS` entry; a long value
is clipped with the whole on hover, never paraphrased; the own-claims walker
`test/served/no-own-claims.test.ts` covers the file), **the same bytes
twice**, and **one cursor**. Test ids: `ontology-view` (`data-id`,
`data-version`, `data-hash`, `data-step`, `data-commit`), `ontology-header`
(`ontology-id`, `ontology-hash`, `ontology-counts`), `ontology-transport`,
`ontology-chart` with `ontology-chart-node` (`data-kind` `source` | `term`,
`data-node`, `data-held` on a term) and `ontology-chart-edge` (`data-kind`
`held` | `relation`, `data-from`, `data-to`, `data-relation`) and the
heading `ontology-chart-unheld`; `ontology-list` with the groups
`ontology-nodes`, `ontology-sources`, `ontology-held-by`,
`ontology-relations`, `ontology-unheld-group` (each `data-count`) and their
rows `ontology-node` (`data-node`, `data-held`; `ontology-unit`,
`ontology-aliases`), `ontology-source` (`data-source`, `data-configured`
when declared; `ontology-configured`, `ontology-source-coverage`),
`ontology-held` (`data-node`, `data-source`; `ontology-via`,
`ontology-held-coverage`), `ontology-edge` (`data-from`, `data-to`,
`data-relation`; `ontology-edge-meaning`), `ontology-unheld` (`data-node`).
`foldOntology(record)` is the pure fold and `layoutOntology(fold)` the pure
layout (`GEOMETRY`, exported as `ONTOLOGY_GEOMETRY`, the constants they share), `ontologyRecordOf(value)` the
shape guard — exported with the component from the root barrel and the
`/context` door. Pinned by `test/context/ontologyView.test.tsx`.

## 0.65.0 — the Coverage band, the answer's boundary read in the lens

**Why.** A tool that returns `coverage(result, {...})` or `absent({...})`
(agentfootprint 9.109) hands the run three lists only the tool knows —
`checked`, `notChecked`, `cannotCover` — and the dispatch loop appends one
`DeclaredCoverage` row per declaration to the TRACKED key
`AgentState.coverageDeclared`, in the order the results landed. Under
`.limitsTravelWithTheAnswer()` the library folds every row into one block and
appends it to the answer (`Coverage of this answer — declared by the tools
that produced it, not by the model`): the three sections in that order, each
deduped by the library's own `sameItem` (the same `what` AND the same `why`)
and folded at twelve entries. The owner's ruling (2026-09-18): that boundary
is the READER'S, not the customer's — it belongs in the lens, not on the
answer the end user reads — and the app will stop appending it once the lens
draws it. So the Coverage band (`src/react/components/CoverageBand.tsx`) shows
everything the append showed, and more: the merged boundary WITH the tool
names that declared each item (the append never said which), and under it
every declaration by call as the record holds it — tool, id, iteration, the
record's own word for `kind` (`absence` / `ledger`), `lookedFor` on an
absence, and that call's three lists with no dedupe. The key is tracked, so
the fold at a stop already answers "what had landed by then": a stop before
the first declaration draws nothing, a later stop draws what the tools had
declared by that stop.

`<ReasoningLens>` mounts the band under the cards (and under the exchange)
from the rows it already read at the stop — the stop is folded once — so the
neo Reasoning tab gets it with no host change; and a run whose tools declared
coverage but whose model kept no ledger now draws the band ALONE (the
transport too, when the lens holds the shared address) where it used to draw
nothing — no cards, no count, no view toggle. Standalone,
`<CoverageBand runner recorder? shared? cursor? events?>` takes the ONE
cursor exactly as `<ReasoningLens>` does and mounts no mover: a band sits
under a view, and the view holds the transport.

```tsx
import { CoverageBand, ReasoningLens } from 'agentfootprint-lens/context';

const shared = useSharedCursor(recorder);
<ReasoningLens runner={recording} recorder={recorder} shared={shared} />   // the band rides under the cards
<CoverageBand runner={recording} recorder={recorder} shared={shared} />    // or alone, following the same cursor
```

At the end of the `coverage` fixture (three tools, three calls; the ledger
tool `zone_membership` and the absence tool `flogi_for_port` declared, the
third declared nothing):

```
coverage · 2 declarations
the answer’s boundary
  [checked] 3
    shq-fab-a: the live fcns database ← zone_membership, flogi_for_port
    window: the last 24h — the active zoneset is read live ← zone_membership
    window: the last 24h — FLOGI history retention on this fabric ← flogi_for_port
  [notChecked] 1
    the archived zoneset history — older than the 24h window ← zone_membership
  [cannotCover] 2
    ports on the peer fabric — this collector is scoped to one fabric ← zone_membership, flogi_for_port
    host-side multipathing — no collector runs on the ESX hosts ← zone_membership
by call
  zone_membership c1 · iteration 1 · [ledger]
    [checked] 2 · [notChecked] 1 · [cannotCover] 2   (that call's lists, as declared)
  flogi_for_port c2 · iteration 2 · [absence]
    looked for "FLOGI entries on fc1/3"
    [checked] 2 · [cannotCover] 1
```

The two `window: the last 24h` entries are two entries here because they are
two in the library's block — different `why`s are different ground under
`sameItem` — and the shared fcns and peer-fabric entries are one each,
declared by both tools. The section headings are the record's own field
names, printed as chips in a colour (`checked` the success colour,
`notChecked` muted, `cannotCover` the warning colour) — a chip colour, never
a sentence.

The laws it keeps: **omit, never deny** (no `coverageDeclared` at the stop,
or an empty one, and nothing is drawn; an empty section is not rendered; a
row prints no field it does not carry), **the library's own equality**
(`sameItem` copied byte for byte from `agentfootprint · coverage/items.ts`;
pinned in the test against the block the library composed onto the fixture's
answer, on the `agentfootprint.agent.turn_end` event's `payload.finalContent`),
**no sentence of its own** (every printed string is the tool author's — a
`what`, a `why`, a `lookedFor`, a tool name — an id, the record's word for
`kind`, or a `LABELS` entry; the own-claims walker
`test/served/no-own-claims.test.ts` covers the file), **one cursor**,
**a shape the lens does not own** (`coverageRecordOf` narrows every row;
a row that does not fit is dropped one by one, a malformed item inside a row
likewise), and **stateless** (the fold past twelve entries opens in a native
`<details>` under `+K more`). Test ids: `coverage-band` (`data-declarations`,
`data-step`, `data-commit`), `coverage-boundary`, `coverage-calls`,
`coverage-section` (`data-section` = `checked` | `notChecked` |
`cannotCover`, `data-count`; `coverage-section-chip`), `coverage-item`
(`data-declared-by` = the tool names comma-joined, on the boundary only;
`coverage-what`, `coverage-why`, `coverage-declared-by`), `coverage-more`
(`data-count`), `coverage-call` (`data-tool-call-id`, `data-tool`,
`data-kind`, `data-iteration`; `coverage-call-id`, `coverage-kind`),
`coverage-looked-for`; inside the lens the band sits in `reasoning-coverage`.
`foldCoverage(rows)` is the pure fold (`{ boundary: { checked, notChecked,
cannotCover } — each item { what, why?, declaredBy } · calls }`),
`coverageRecordOf(value)` the shape guard, `COVERAGE_LABELS` every string it
owns — exported with the component from the root barrel and the `/context`
door; `<CoverageRows rows>` (the band over rows already in hand) and
`sameItem` are exported from the component file for a view that folded the
stop once. Pinned by `test/context/coverageBand.test.tsx`.
