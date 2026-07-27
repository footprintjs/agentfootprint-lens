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
