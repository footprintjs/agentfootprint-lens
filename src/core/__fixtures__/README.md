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

