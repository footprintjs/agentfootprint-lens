# doors/ — the subpath doors' shared mount machinery

The package has exactly TWO subpath doors beside the root barrel and `/core`
(added sparingly, on the af 8.0.0 lesson — doors consolidate, they don't
multiply):

| door | mounts | headless half |
|---|---|---|
| `agentfootprint-lens/why` | `<WhyLens recording>` — the `<Lens>` shell on the MILESTONE axis | `observeRecording` + the axis helpers (`scrubAxisFor`, `stepForCommitIdx`, …) |
| `agentfootprint-lens/skillgraph` | `<SkillGraphDebugger recorder>` | `selectSkillRoute` / `selectSkillBeats` / `selectSkillTopology` / `selectSkillFrameContext` / `stepForRuntimeStageId` |

Doors are ADDITIONS: every symbol behind them is also on the root barrel,
nothing moved, nothing renamed. The entry files live in `src/why/` and
`src/skillgraph/`; this folder holds what the doors share:

- **`recordingInput.ts`** — the branded input (`AgentRecordingInput`:
  a recording `{ snapshot, events, structure }` or the `persistRecording`
  envelope), the mount-time gate (`readAgentRecording`), and the
  plain-language naming of anything that is not one (`describeReceived`).
- **`DoorRefusalCard.tsx`** — the teaching refusal both doors render on a
  wrong input: what this lens reads, what you passed looks like, where to go.
  Never a blank panel, never a crash.
- **`WhyLens.tsx`** — the why door's mount component.

TypeScript consumers fail at BUILD time (the branded types are not
satisfiable by a bare commit log); JS consumers get the refusal card at
runtime. The refusal copy is pinned verbatim in `doors.test.tsx`.
