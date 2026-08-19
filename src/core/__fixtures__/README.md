# Recorded turns

Two frozen agentfootprint runs, used by `observeRecording.test.ts`. Both are the
**same turn** of the same demo agent — a ReAct loop over three mock tools,
answering _“Should I watch "Heat" tonight?”_ — so the pair differs in exactly one
thing: whether the run was recorded with a `BoundaryRecorder` attached.

| file | `snapshot.recorders` | what it proves |
|---|---|---|
| `recorded-turn.json` | `Metrics`, `BoundaryEvents` (75 events) | the step strip rebuilds — 22 cursor positions |
| `recorded-turn-no-boundaries.json` | *(absent)* | the honest-absence arm — 0 positions, strip stays quiet |

`recorded-turn-no-boundaries.json` is the older of the two: it was captured
before the app learned to attach a boundary recorder, which is why the key is
missing rather than empty. That is the shape every recording made by an app that
never asked for boundaries has, and it is the reason `observeRecording` refuses
to invent the ranges instead of deriving them from the commit log.

Both carry the same 84 typed events and the same 78-bundle commit log, in the
same order — asserted in the test, so a fixture swapped for a different turn
fails loudly instead of quietly re-baselining the counts.

Neither is hand-authored: both are the wire payload a real run produced
(`{ snapshot, events, blueprint }`), re-serialized without whitespace and
otherwise untouched. The agent ran on a mock provider, so there is no real model
output and nothing here left a network.

`blueprint` — not `structure` — is the name that payload uses, which is why
`observeRecording` reads both. The tests hand these files straight to it with no
remapping: if the alias ever went away, that is where it would show.

---

# A refused skill-graph hop

`skill-route-refusal.json` — one frozen turn of a **skill-graph** agent, used by
`selectors/selectSkillRoute.test.ts`. Same rules as the pair above: not
hand-authored, produced by running the real library.

The graph is three skills, one of them deliberately out of reach:

```
triage ──(model edge)──▶ volume-lookup ──on get_volume_by_wwn──▶ audit-log
```

`audit-log` is reachable ONLY from `volume-lookup`, and the scripted model
reaches for it first — from `triage`. What the 102 events carry:

| iteration | what happened | on the wire |
|---|---|---|
| 1 | the model calls `read_skill('audit-log')` | `skill.rejected { requestedId, currentSkillId: 'triage', allowed: ['volume-lookup'] }` + the refusal sentence as the call's `tool_end.result` |
| 2 | the cursor is resolved again and nothing moved it | `cursorMove { from: 'triage', to: 'triage', by: 'stay' }` |
| 3 | the model picks a reachable skill | `cursorMove { by: 'model-pick' }` |
| 4 | the tool return fires the author's declared edge | `cursorMove { by: 'route' }` |

Four of the nine cursor causes on one real turn, and the one-iteration LAG
between a refusal (iteration 1) and the cursor row that answers it (iteration 2)
— which is the correlation `selectSkillRoute` exists to make, and the thing a
hand-written fixture would have quietly got wrong.

Frozen as `{ events, structure }`: no `snapshot`, because nothing that reads this
file uses the commit axis and the snapshot is 6× the size of the events. Every
byte that IS here is the run's own.

Recorded against the `agentfootprint` version in this package's
devDependencies, on the mock provider — no network, no real model output.


---

# The demo run, before the recording carried the map

`skill-run-pre-950.json` — a byte copy of `demo/skill-run.json` exactly as the
agentfootprint **9.49-era** generator wrote it, frozen the day the demo fixture
was regenerated on 9.50.0. Same support-triage agent, same scripted mock — the
pair differs in exactly one thing: whether the recording carries the three
9.50.0 routing facts (`skill.graph_declared`, `cursorMove.reachable`,
`llm_start.systemPromptText`).

Used by `selectors/recordingCarriesTheMap.test.ts` as the OLD arm of the era
split: the fallback paths (declared edges as the fired lower bound, reachable
sets from refusals and declared-edge folds, the prompt honestly absent) run
against a real old-shape artifact, not a synthetic imitation of one. The NEW
arm reads `demo/skill-run.json` itself, which doubles as a guard that the
checked-in demo fixture actually carries the facts the demo shows off.

Same rules as everything above: produced by running the real library, never
hand-edited.


---

# A tool that spoke while it worked

`tool-progress-turn.json` — one frozen turn of a ReAct agent whose
`walk_graph` tool calls `ctx.progress()` three times mid-execute
(agentfootprint 9.52.0). Used by `humanizeToolProgress.test.ts`. Same rules as
everything above: produced by running the real library, never hand-edited.

Before 9.52.0 a tool call was ATOMIC on the record — `tool_start`, a silence of
however long the handler took, then `tool_end`. `ctx.progress(payload)` files
one `agentfootprint.stream.tool_progress` event, in call order, always between
that call's start and its end.

The turn is shaped so the fixture carries every arm the Lens has to render:

| iteration | what happened | on the wire |
|---|---|---|
| 1 | `walk_graph` reports three times, then returns | 3 × `stream.tool_progress`, all with `toolCallId: 'c1'`, between `c1`'s start and end |
| 2 | `summarize` runs and reports nothing | no `tool_progress` at all — the honest-absence arm |
| 3 | the model answers; the turn ends | — |

The three reports carry three different payload SHAPES on purpose, because
`payload` is the tool author's own data (typed `unknown`, forwarded verbatim,
never read or normalized by the library):

1. an object — `{ hop: 1, of: 3, node: 'svc-a' }`
2. a string — `'still walking — 2 of 3'`
3. a LONG string, past the Lens's preview limit, so the truncation path runs
   against a real event instead of a synthetic one

That third one is why the fixture exists rather than a hand-built event: the
cut, and the "N more chars" that states it, are asserted against bytes a real
run actually produced.

The three identity fields (`toolCallId`, `toolName`, `iteration`) are stamped
by the framework, not by the tool — which is what lets the Lens print them as
facts while previewing the payload as a claim.

Frozen as `{ events, structure }`, like `skill-route-refusal.json`: nothing
that reads this file uses the commit axis. Regenerate with
`npm run fixtures:tool-progress`; the generator refuses to write a fixture that
does not carry exactly three reports.
