# The SkillGraph debugger

`<SkillGraphFlow>` draws the graph an author **built**. This folder draws the
graph a run **walked**: the topology with the run's cursor on it, why the cursor
moved at each stop, what the model was looking at when it decided, and the same
run told as a story that reveals with time.

```tsx
<SkillGraphDebugger
  recorder={recorder}
  cursorRuntimeStageId={cursor}
  onJumpTo={(id) => moveTheLensCursorTo(id)}
/>
```

## The one-cursor law

The lens has **one** time cursor — a `runtimeStageId`. This view scrubs and
filters it and holds no position of its own:

- the beat being shown is resolved from `cursorRuntimeStageId` on every render
  (`selectSkillBeatAt`: exact → within-subflow → nearest-previous, the same rule
  `selectToolChoiceCall` uses);
- every mover — transport, beat, narrative paragraph, a click on a skill node —
  reports a `runtimeStageId` through `onJumpTo` and waits to be told where the
  cursor went.

Give it a cursor that never moves and nothing moves. That is correct: the owner
of the cursor ignored the request.

## Where the data comes from

Components are thin; every derivation is a pure selector in `src/core/selectors`:

| selector | answers |
|---|---|
| `selectSkillRoute` | what happened — the routing record |
| `selectSkillBeats` | what is true AT a stop (cursor carried forward, visited accumulated, the library's sentence) |
| `selectSkillBeatAt` | which stop the ONE cursor is on |
| `selectSkillTopology` | the drawable graph at that stop — declared vs observed, node states |
| `selectSkillFrameContext` | the engineered context of the call that stop prepared |

## The two lenses, one data path

`developer` shows the record (causes, ids, the catalog as sent, the refusal
sentence the model read). `product` shows the **same facts as the library's own
sentences** — `humanizeCursorMove` / `humanizeSkillRejected` /
`humanizeRouteConflict` / `humanizeTurnRouted`, the builders `defaultHumanizer`
composes for the Commentary panel — revealed in cursor order and accumulating.
No prose is written in this folder. Two prose systems drift; only one of them is
tested.

## What it will not do

- **It does not parse prose.** The `read_skill` description carries the reachable
  set in words; it is shown verbatim and never parsed back into ids. A reachable
  set is filled only from a typed field, and it names which one
  (`skill.rejected.allowed`, or the declared edges the log named).
- **It does not imply a complete topology.** A recording names a declared edge
  only once it fires, so the declared set is a lower bound and the canvas says
  so. Pass `declaredEdges` from the built graph to make it complete.
- **It does not reconstruct the system prompt.** The log carries the injections
  it was composed from, not the composed string. The panel's absence card says
  that rather than assembling a plausible one.

## Mounting inside `<Lens>`

```tsx
// The host's axis — the same list `<Lens>` scrubs.
const positions = useCursorPositions(recorder, drillPath);

const detail = (p: LensDetailSlotProps) => (
  <SkillGraphDebugger
    recorder={p.recorder}
    cursorRuntimeStageId={p.cursorRuntimeStageId}
    cursorKind={p.kind}
    // The shipped transport then scrubs the HOST's axis, with the host's
    // numbers — the same `<TimeTravel>` the lens mounts, one cursor between them.
    step={p.step}
    totalSteps={p.totalSteps}
    onStepChange={p.onNavigate}
    onJumpTo={(id) => {
      const step = stepForRuntimeStageId(positions, id);
      if (step >= 0) p.onNavigate(step);
    }}
  />
);

<Lens recorder={recorder} slots={{ detail }} />;
```

`stepForRuntimeStageId` (exported from `/core`) is the mapping from an address
back to a step — the host owns it, because the host owns the axis.
`demo/Demo.tsx` does the whole wiring in a handful of lines.

## The transport is the lens's own

The play / step / scrub control under the beat rail is `<TimeTravel>` — the
component `<Lens>` itself mounts. It is not re-implemented here and must not be:
one cursor also means one transport. Pass `step` / `totalSteps` / `onStepChange`
and it scrubs the host's axis with the host's numbers; omit them and it scrubs
this view's routing stops. The beat rail below it stays SkillGraph-specific (it
projects skill hops onto the same cursor), and clicking a beat drives the same
transport state.
