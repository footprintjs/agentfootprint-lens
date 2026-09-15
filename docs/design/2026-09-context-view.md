# The Context view — one operation, three records, one join (design, 2026-09-15)

**Status:** IMPLEMENTED in 0.53.0. Owner-approved 2026-09-15 after two rounds:
first as a tab of the Why Lens, then — the owner's call — as a **standalone
component like the Skill Graph**, so a debug tool composes what it needs.
Re-evaluated against the code before building; one proposal was withdrawn
(below).

## What it is

The docs page "Context engineering, step by step" shows a context object
growing one step at a time, with a Visual ⇄ JSON toggle. That page is a
hand-drawn Served view. `<ContextView>` is the same thing read off the
record: the context object at the cursor, **key by key**, with **who wrote
each** (the stage on its trace row), **what moved** since the previous stop,
**what was served** beside it (the receipt's row), and the **event names**
raised by the stages that wrote the delta.

## What was withdrawn, and why

The first proposal declared seven new tags (`context:question` … `answer`)
in agentfootprint. Read against the code, six of the seven steps were already
milestones (`iteration`, `slot`, `llm-turn`, `tool-call`, `decision`), so a
second vocabulary would have been a second owner for the same facts. Instead
agentfootprint 9.98.1 added **one row**: the answer stage and its mount as a
`decision` milestone, so the parent axis stops on the answer without
drilling. The seven headings stay docs prose over milestone stops.

## The join (the whole design)

| Layer | Source | Gives |
|---|---|---|
| commit log | `snapshot.commitLog` | the fold at the stop; per key the last writer's `runtimeStageId`, the first commit that wrote it; the stop's own rows |
| receipt | `servedRowAt` (Served core) | served / withheld at this epoch, verdicts — handed through |
| events | replay `getEntries()` | names raised by the writing stages — the *why* |

Join keys: `runtimeStageId` (log ⟂ events), `epoch` (log ⟂ receipt).
Nothing new is written; a key without a writer row is **unattributed**.

## The contract

- `contextAt(recording, cursor, { previous?, events? })` — pure, frozen
  (`src/core/context/contextAt.ts`, README beside it).
- `<ContextView runner cursor? events? initialMode?>` — standalone it walks
  the library's milestone tags (`MILESTONE_AXIS`) with its own
  `lensCursorFrom`; handed `cursor` it moves nothing and offers no mover
  (one cursor, one address — 0.51.0's law).
- `LABELS` is every string it owns; the own-claims walker covers
  `core/context/` and the component.

## What it does not do (named)

- No owner words. Stage ids are printed; "host" / "model" is the reader's map.
- No per-field provenance below the top-level key (the trace rows carry deeper
  paths; a later cut can open a key).
- The docs page still carries hand-written JSON until it mounts this view on a
  recorded run — the next packet.
