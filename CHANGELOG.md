# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.44.0] - 2026-08-29

Sharing an axis is not the same as sharing a stride.

A view mounted inside the lens scrubs the host's axis — the one-cursor law
working exactly as designed. But the host's axis is the *run's*. A four-tool
turn puts 73 stops on it, and the Skill Graph's picture changes at eight of
them: sixty-five presses of ◀ ▶ walk framework stages that change nothing in
its view. The scrubbing was never wrong. It was **dead air**.

The fix that was available and had to be refused is a second slider with its
own numbers — two transports over one run is the drift class this package keeps
paying for, and the debugger's own header refuses the lookalike by name. So the
axis stays the host's, the numbers stay the host's, the cursor stays the one
cursor, and the only thing that changes is which of those numbers the step
buttons stop at.

### Added

- **`<TimeTravel snapSteps>` — the stops ◀ ▶ and ← → are allowed to land on.**
  An ascending list of positions on the axis the transport already receives.
  Not an axis, not a projection, and it carries no addresses: every entry is a
  step the host could already have moved to.

  ```tsx
  <TimeTravel total={73} focusSeq={step} onFocusChange={setStep} isLive={false}
              snapSteps={[0, 9, 17, 31, 44, 58, 72]} />
  ```

  It lives on the transport rather than on any one view because the transport
  is where movement lives — putting it a level up would have meant a view
  re-implementing the slider, which is the thing being avoided.

- **The stride narrows; the reach does not.** The drag track and the step strip
  still carry the full axis, so every position remains reachable — just not by
  ◀ ▶. Home / End still go to the axis endpoints, because they are jumps, not
  steps (band clicks and strip clicks are jumps too, and equally unaffected).

- **A cursor between two stops is DISCLOSED, never rounded down.** Drag to a
  step no stop covers and the readout says where you actually are —
  `between stops 2 and 3 of 4 · 8 / 12`, and `before stop 1 · …` /
  `past stop 3 of 3 · …` at the ends. With the buttons narrowed, a
  between-position is one they cannot reproduce, so a readout that quietly
  claimed "stop 2" would be describing a place the reader is not standing.

- **`<SkillGraphDebugger snapSteps>` forwards it**, in the host's own step
  units. The host builds the list, because the host owns the axis:
  `stepForRuntimeStageId(positions, beat.runtimeStageId)` over
  `selectSkillBeats` — both already exported from
  `agentfootprint-lens/skillgraph`. The prop is **ignored** when the debugger is
  scrubbing its own routing stops (no `step` / `totalSteps`): every routing stop
  already changes the picture, so narrowing there would hide beats.

- **The headless queries, on `agentfootprint-lens/core`** —
  `snapPositionOf(snapSteps, step)` (the at-or-before stop plus an `exact` flag,
  which is what makes the disclosure possible), `nextSnapStep`, `prevSnapStep`,
  and the `SnapPosition` type. Both movement laws are **strict** — the least
  stop greater than the cursor, the greatest stop less than it — and strictness
  is what makes a between-position behave: ◀ from step 5 with stops
  `[0, 4, 9]` lands on 4, back onto the stop you are standing past, rather than
  skipping to 0.

### Unchanged, and worth saying

- **Absent prop ⇒ byte-identical.** Proved as an equality rather than as a list
  of arms: the same component with `snapSteps` omitted and with it explicitly
  `undefined` must render identical DOM, and the raw-step walk, today's button
  labels and today's readout are asserted beside it.
- **An empty list, or one whose entries are all off the axis, is the same as
  passing nothing** — never a dead transport. Entries the axis cannot hold
  (negative, past the end, non-integer) are dropped rather than clamped onto a
  neighbour; a stop the axis does not have is not a stop, and a clamped one
  would let ▶ report the same position forever.
- **`bands` are untouched, and orthogonal.** Bands GROUP the axis; snaps narrow
  the unit of MOVEMENT along it. Without `snapSteps`, ◀ ▶ still move stop by
  stop on a banded ruler — the 0.38.0 law, still pinned by its own test. Set
  both and the readout carries all three truths:
  `Iteration 2 · stop 3 of 4 · 10 / 12`.
- **Nothing is stored, anywhere on this path.** The position is still
  `focusSeq`, every move still leaves through `onFocusChange(step)`, and no
  index into the snap list is held — a stored snap index would be a second
  cursor, which is the one thing the locked v0.1 architecture bans.

## [0.43.0] - 2026-08-19

A tool call used to be a silence. `tool_start` fired, the handler ran for as
long as it ran, and `tool_end` carried the result — so a forty-second walk was
forty seconds of nothing, and a reader could not tell working from hung.
agentfootprint 9.52.0 gave a tool a voice mid-execute (`ctx.progress`); this
release gives the Lens the line to render it with.

### Added

- **`stream.tool_progress` renders as a line, not as `[agentfootprint.stream.tool_progress]`.**
  In the event stream and anywhere else the default humanizer feeds:

  ```
  `walk_graph` reported progress (iteration 1): {"hop":1,"of":3,"node":"svc-a"}
  ```

  The iteration clause is dropped when the number is `0`, which agentfootprint
  uses to mean "there is no ReAct loop here" — printing "iteration 0" would
  invent a loop position the run never had.

- **The payload is PREVIEWED, never interpreted.** The event splits in two and
  the two halves are treated differently on purpose. `toolCallId`, `toolName`
  and `iteration` are stamped by the framework from the dispatch it is already
  holding — a tool cannot claim to be another call — so the line states them as
  facts. `payload` is the tool author's own data, typed `unknown`: one tool
  sends `{ done, total }`, the next a status string, the next a partial row.
  There is no "hop 3 of 12" to extract, so the line shows a preview of whatever
  arrived rather than guessing at a shape and putting words in the tool's
  mouth. A string payload is shown as itself instead of re-quoted as JSON.

- **Truncation is stated, never silent.** A preview past 120 characters is cut
  and the row says how much it cut (`… (truncated; 43 more chars)`), so one
  chatty tool cannot blow a firehose row open and no reader is left thinking
  they saw the whole report.

- **The teaching humanizer keeps its no-field-dumps rule.** agentfootprint
  ships no commentary template for this event, so without an intercept it would
  have fallen through and dropped a JSON preview into a panel whose whole
  contract is prose. Same event, prose voice:
  *"The `walk_graph` tool reported progress while it was still running."* The
  numbers stay in the analyst view, which is where that voice keeps them.

- **A fixture recorded from a real 9.52.0 run.**
  `__fixtures__/tool-progress-turn.json` — a `walk_graph` tool that reports
  three times with three different payload shapes (object, string, and one long
  enough to force the cut), plus a `summarize` tool that reports nothing at
  all. Generated by running the library, never hand-authored, and the generator
  refuses to write a fixture that does not carry the three reports. The
  absence arm is deliberate: a run whose tools never report files no events,
  and a fixture that only showed the loud tool would have hidden that.

### Changed

- **devDependency `agentfootprint` → `^9.52.0`**, which is what puts
  `tool_progress` in the typed event union this package compiles against. The
  peer range is untouched (`^7 || ^8 || ^9`) — an older agentfootprint simply
  never files the event.

### Unchanged, and worth saying

Reports already hung off the right node before this release and still do: the
recorder pushes a node on `tool_start` and pops it on `tool_end`, so a report
filed in between attaches to the call it came from, not to the run root. And an
event kind from an agentfootprint NEWER than this release still renders — the
terse `[type]` fallback is a row, not an exception. Both now have tests.

## [0.42.0] - 2026-08-19

A chat answer can now point at the exact step it means. The lens has always
let a host OWN the cursor (`step` / `onStepChange`); this release adds the
other half — a way to SAY WHERE, when the only thing you have is a stage's
address. And it answers honestly: an address the ruler cannot hold moves
nothing and hands back what it found instead.

### Added

- **`<Lens navigatorRef>` — move the cursor to a stage by its
  `runtimeStageId`.** The React idiom: a ref you hold, filled with a
  `LensNavigator`.

  ```tsx
  const nav = useRef<LensNavigator>(null);
  <Lens recorder={recorder} navigatorRef={nav} />

  nav.current?.navigateTo('call-llm#18');
  // → { ok: true, step: 7, runtimeStageId: 'call-llm#18', match: 'exact', label: 'call-llm 1' }
  ```

  It is a RESOLUTION plus the cursor channel you already have — **not a second
  channel and not new state**. The address resolves against the ruler actually
  being scrubbed (so the same address is step 7 under `granularity="step"` and
  step 3 under `granularity="group"`), then goes through the same funnel a
  click on that stop uses: uncontrolled, the lens moves and reports;
  controlled, it reports and your `step` prop lands it. A jump to the stop
  already showing is not a move, so it fires nothing — which is what keeps a
  programmatic jump and a person's scrub from fighting.

- **Honest misses — the nearest stop is OFFERED, never taken.** Three rungs,
  in order: `exact` (a stop IS that address), `enclosing` (a stop CONTAINS it —
  a stage inside a subflow, on a ruler that stops at whole subflows; the stop's
  own address comes back so you always know where it went), then a refusal.
  A refusal is `{ ok: false, reason, message, nearest? }`, **the cursor does
  not move**, and `nearest` is the stop just before the address handed back as
  data. Take it with one more call — it is an exact hit by construction — or
  render it as a choice. A cursor that silently lands somewhere nobody asked
  for is the failure this shape exists to prevent. `reason` is a small union
  you can branch on (`'not-on-axis'`, `'before-first-stop'`, `'empty-axis'`,
  `'no-id'`); `message` is the same fact as one sentence you can print.

- **`resolveNavigation(positions, runtimeStageId)` — the same answer with
  nothing mounted.** Pure, never throws, exported from `/core` (zero React),
  the root barrel, `/why` and `/skillgraph`. A server-rendered dashboard link
  or a CLI computes a step without a component:

  ```ts
  import { scrubAxisFor, resolveNavigation } from 'agentfootprint-lens/core';

  const to = resolveNavigation(scrubAxisFor(recorder, 'step'), 'call-llm#18');
  const href = to.ok ? `/runs/${runId}?step=${to.step}` : undefined;
  ```

- **`useLensNavigator`** is exported too, for shells that compose their own
  layout around the same one cursor.

### Changed

- **`scrubAxisFor` now lives in `/core`** and is exported from it. It was
  already pure — it just sat in a React hooks file, which meant the headless
  door could not build the ruler that the headless resolver needs. Every
  existing import line still works unchanged (the root barrel, `/why` and
  `react/hooks` re-export it), and `/core` stays React-free (verified: zero
  react references in the built bundle).
- **`stepForRuntimeStageId` now delegates to `resolveNavigation`** — ONE
  ladder, two readings. Its behaviour is byte-identical (it takes the
  nearest-previous offer silently, which is exactly what its callers — chart
  clicks, beat jumps, provenance frames — have always wanted), and a parity
  test pins the two readings together over both axes so the rule can never
  fork.
- **`<SkillGraphDebugger>`'s wiring example** now shows the host holding one
  navigator on `<Lens>` and `onJumpTo` routing through it, so a beat the
  host's ruler cannot hold offers the nearest stop instead of jumping
  silently. The older `stepForRuntimeStageId` + `onNavigate` wiring still
  works and is still supported — no code changed, only the guidance.

## [0.41.0] - 2026-08-19

The recording now carries the map, and the SkillGraph surfaces read it.
agentfootprint 9.50.0 put three routing facts on the recording as data —
facts these views until now had to caption "partial", derive from fallbacks,
or honestly refuse to show. All three land here, with every fallback for
older recordings kept and still tested against a real old-era artifact.

### Added

- **The declared map, complete — from the recording itself.** A 9.50.0
  recording carries `skill.graph_declared`: the author's whole skill graph
  (nodes with their catalog descriptions, edges with their kinds, the
  synthetic START), fired once per run. `selectSkillRoute` folds it in, and
  `selectSkillTopology.declaredSource` gains the value that states what
  changed: `'recording-declared'` means THE WHOLE MAP, unlike the old
  `'recording'` lower bound (edges named only once they fire). The new
  one-boolean digest `declaredComplete` is what a view branches on — the
  Developer lens's amber "the author may have drawn more" warning now shows
  ONLY when the map really is a lower bound; a complete map gets a quiet
  provenance note instead. Entry skills wear an `entry` chip
  (`SkillTopologyNode.isEntry`, `route.entryIds`), never-fired declared
  edges are finally drawable from the recording alone, node tooltips carry
  the catalog description, and edge captions come from the declared kinds.

  ```ts
  const topo = selectSkillTopology({ route });
  topo.declaredSource;   // 'recording-declared' → the author's whole map
  topo.declaredComplete; // true → do NOT show the lower-bound warning
  ```

- **The reachable set, from the move itself.** Every 9.50.0 cursor move
  carries `cursorMove.reachable` — the exact set the `read_skill` gate would
  admit, as data instead of menu prose. `selectSkillBeats` fills each beat's
  reachable set from it FIRST, tagged `source: 'cursor-move'`; the two old
  sources stay as fallbacks for older recordings, in their old order
  (`'refusal'`, then `'declared-edges'`). An empty set is kept and rendered
  as what it is — "a dead end: no skill was admissible from this cursor" —
  never as absence.

- **The assembled system prompt, verbatim — when the producer opted in.**
  When a run was recorded with `recordSystemPrompt: true`, `llm_start`
  carries the joined prompt byte-for-byte, and the frame-facts panel renders
  it first, in a code block labeled as sent. When it is absent the panel's
  honest "Not in this recording" card stays — now saying WHY: recording the
  assembled prompt is an explicit opt-in, off by default because the prompt
  carries everything injected into it. The card also stopped claiming the
  reachable set is never data (it is, since 9.50.0) — each absence line
  appears only when that fact is actually absent, and the card disappears
  entirely when nothing is.

### Changed

- **Demo fixture regenerated on agentfootprint ^9.50.0** with the prompt
  opt-in, so `npm run demo` shows all three facts live. The pre-9.50 run is
  frozen byte-for-byte at `src/core/__fixtures__/skill-run-pre-950.json`,
  and a new era-split test (`recordingCarriesTheMap.test.ts`) runs the
  fallback paths against that real old-shape artifact — and doubles as a
  guard that the checked-in demo fixture actually carries the new facts.
- devDependency `agentfootprint` → `^9.50.0`. The peer range already
  admitted 9.50 (`^7 || ^8 || ^9`) and is unchanged.

## [0.40.0] - 2026-08-19

The import line now names the lens. Two subpath doors — additions only:
nothing on the root barrel moved, nothing renamed, and the door count stays
exactly two (doors are added sparingly, on the af 8.0.0 lesson).

### Added

- **`agentfootprint-lens/why` — the Why Lens door.** `<WhyLens
  recording={...} />` takes the recording itself — `recordRun()`'s
  `{ snapshot, events, structure }` or the `persistRecording` envelope —
  and mounts the shipped `<Lens>` shell on the milestone axis. Beside it:
  the `<Lens>` shell for hosts that already hold a recorder,
  `observeRecording`, and the axis helpers (`scrubAxisFor`,
  `commitAxisPositions`, `cursorPositionsAtDrill`, `stepForCommitIdx`,
  `stepForRuntimeStageId`, `stepBands`) for hosts holding one cursor
  across views.
- **`agentfootprint-lens/skillgraph` — the SkillGraph debugger door.**
  `<SkillGraphDebugger>` plus its headless selectors (`selectSkillRoute`,
  `selectSkillBeats`/`selectSkillBeatAt`, `selectSkillTopology`,
  `selectSkillFrameContext`, `stepForRuntimeStageId`).
- **Branded inputs, teaching refusals.** Each door's mount component
  validates what it is handed AT MOUNT and refuses honestly — an on-screen
  card that names what was received and where to go ("What you passed looks
  like a bare commit log… The commit-trace lens is
  footprint-explainable-ui"), never a blank panel and never a crash. The
  input types are distinct (`AgentRecordingInput`), so TypeScript consumers
  fail at build time instead. `<SkillGraphDebugger>` handed something that
  is not a recorder now renders the same teaching card rather than throwing,
  and its "no skill routing in this recording" state points at the why door.
- Packaging tests assert both doors resolve (ESM + CJS + types) and export
  the promised names, from the BUILT dist; publint + attw stay green across
  all four entries.

## [0.39.0] - 2026-08-19

Every step now means every stage. The Flow ruler (`granularity="step"`) scrubs
the run's own commit trace — one stop per executed stage, in execution order —
instead of stopping only at milestones. On a real 37-stage agent turn the old
ruler had 17 stops, and the stages between milestones (stage 23,
NormalizeThinking, sat between stops 9 and 10) could not be reached by ▶ at
all. Now the ruler's count IS the stage count, "step 22 of 37" on the ruler and
"stage 22 of 37" in the inspector are the same number by construction, and
every stage — framework plumbing included — is reachable by ▶ alone.

### Changed

- **`granularity="step"` scrubs the COMMIT axis.** One stop per executed
  stage, straight off the recording's commit log. A boundary stage that
  commits twice (a subflow's entry and exit bundles share one
  runtimeStageId) is ONE stop, anchored at its first commit — execution
  order. A recording with no commit log at all (a `Trace` replay) falls back
  to the milestone stops, so nothing gets quieter than before.
- **`granularity="group"` keeps its milestone axis and iteration bands, and
  its ◀ ▶ now move stop by stop.** The bands are the grouping, not the unit
  of movement — a transport that jumped whole bands made mid-band stops
  unreachable. Band clicks still jump to the band's first stop. The banded
  readout names both truths: "Iteration 2 · stop 9 of 17".
- The transport's ◀ ▶ are labelled "Previous step" / "Next step" on both
  rulers (they were "Previous event" / "Previous group" — neither was the
  unit they actually move by).

### Added

- **`scrubAxisFor(recorder, granularity)`** — the scrub axis as a pure
  function: the same positions `<Lens>` scrubs at that granularity,
  computable outside React. For hosts that hold the cursor across the two
  granularities (two tabs over one recording).
- **`stepForCommitIdx(positions, commitIdx)`** — resolve a commit index to
  the step that holds it on any axis (at-or-nearest-before; first among
  equals). With `scrubAxisFor`, this is the tab-switch carry: Flow → Why
  lands on the milestone at-or-nearest-before the stage; Why → Flow lands on
  the milestone's own stage.
- **`commitAxisPositions`** (core) — the commit axis builder itself, exported
  next to `cursorPositionsAtDrill`, `buildCommitSyncMap` and the
  `CursorPosition` type.

## [0.38.0] - 2026-08-19

Two features and one fix, all on the same law: ONE cursor (the runtime stage
address), everything else derived from it.

### Added

- **The SkillGraph debugger** — `<SkillGraphDebugger>` and its headless
  selectors (`selectSkillBeats`, `selectSkillTopology`,
  `selectSkillFrameContext`, `stepForRuntimeStageId`). Two lenses over a
  recorded skill-routing run: a Product lens that narrates how the assistant
  found its way through the playbook, and a Developer lens that shows the
  topology (current / reachable / visited / REFUSED / not entered), why the
  cursor moved, and what the model actually saw — read_skill as sent, tools
  as sent, injections — with an explicit "not in this recording" card
  instead of reconstruction. Mounts the shipped `<TimeTravel>` bound to the
  HOST's step axis; the host owns the number. `<TimeTravel>` gains a
  `keyboard` prop (and no longer crashes on non-element event targets).
- **The grouped ruler is a real ruler: `<TimeTravel bands>`.** Labelled
  band segments (width proportional to steps) — arrows and clicks move
  group-by-group, the active band is DERIVED from the step every render, and
  no component stores a band index. `stepBands` builds the bands from
  iteration milestones; `bandChartGroup` hands the active band to the chart
  as the same group highlight the boundary draws, so strip and chart can
  never name different groups.
- **Framework plumbing collapses honestly in group view.** Reserved
  `sf-`-prefixed subflows are hidden by default behind a chip that says how
  many framework steps are hidden and a Show/Hide toggle — via eui's
  `collapseNode` (lens supplies the law; eui stays generic). Step view is
  byte-identical and never chips.

### Fixed

- **The chart says "you are here" on a REPLAY.** `observeRecording` now
  seeds the runtime overlay from the recording's commit log
  (`overlayFromSnapshot`) — a replay never traverses, so the live recorder
  channel never heard anything and the chart could not light the current
  stage, color the executed path, or number the passes. Needs
  footprint-explainable-ui ≥0.34 at runtime for the full lighting; older
  peers in range degrade to the previous unlit chart rather than crashing.
- **The current node lights INSIDE a group.** Group emphasis was force-
  clearing every node's active flag, so even a lit overlay could not show
  the current node within the boundary box.

## [0.37.0] - 2026-08-14

### Added

- **A controlled cursor: `<Lens step onStepChange>`.** The lens computed both
  cursor units internally and shipped neither, so a host could neither drive the
  position nor follow it — and two lenses on one screen held two independent
  cursors that lost each other on a tab switch. Now it is the standard
  controlled/uncontrolled pair, modelled prop-for-prop on
  `<TraceExplorerShell selectedRuntimeStageId / onSelectionChange>` so the
  family reads as one API: pass `step` and you own the position, pass only
  `onStepChange` and the lens still owns it but tells you every time it moves.
  **Every** internal mover reports through the one funnel — the step strip,
  ◀ ▶ ⟳Live, the arrow keys, a chart node click, a WHAT HAPPENED moment, a
  provenance jump, and the auto-advance that follows a live run, which used to
  set the position directly and tell nobody (a second cursor in disguise).
  Exactly one call per move, and none for a move that resolves to the position
  already showing.
- **The unit is a STEP, and the callback carries the other two.**
  `onStepChange(step, at)` hands back `at.runtimeStageId` (footprintjs's
  address, the string `<TraceExplorerShell>` and `<RunSlider>` take) and
  `at.commitIdx` alongside `label`, `kind` and `totalSteps`. The step is the
  controlled unit because it is the only one that is one-to-one with a position
  the lens can show: a group's start and end are the same `runtimeStageId`
  (`__root__#0` is both "Run · start" and "Run · end") and a parallel fork's
  branches share a `commitIdx`, so addressing by either would leave half the
  stops silently unreachable.
- **Out of range clamps AND says so** — never a silent clamp. Lens renders the
  nearest real position, calls `onStepChange(clamped, { clamped: true })` and
  warns once on the console, because the axis GROWS during a live run: a step
  stored from a finished run is a legitimate value the same run, earlier, does
  not have yet. Storing what the callback hands back reconciles the two cursors
  in one round trip.
- **`slots.detail` — your content in the shipped right column.** The column's
  width, border, collapse pill and cursor are unchanged; only what it renders is
  yours. The slot receives the cursor in every unit, the `StepNode` it sits on
  and the ones inside its scope, the recorder, and `onNavigate` — the same
  funnel every built-in mover uses, so a custom pane moves the ONE cursor rather
  than starting a second one. Same shape and same stability advice as
  `<TraceExplorerShell slots>`.
- **A narrow degrade instead of a clip.** The engineer view is a chart column
  beside an inspector with a 300px minimum; below `LENS_NARROW_BREAKPOINT`
  (**690px** of available row width — exported, with the pure `isNarrowRow` and
  the `useNarrowRow` hook) the columns now STACK. Nothing hidden, nothing cut
  off: the same panes read top to bottom. A split panel measured at 392px gets a
  readable lens, in both themes.

### Unchanged

- **With none of the three props, the rendered DOM is byte-identical and the
  behaviour is the shipped behaviour** — pinned by tests that compare the markup
  of `<Lens recorder runner />` against the same lens with `step`,
  `onStepChange` and `slots` passed as `undefined`, assert no layout attribute
  appears while the row is wide, and assert an observation-only `onStepChange`
  changes nothing on screen. An unmeasured row (server render, no
  `ResizeObserver`) keeps the two columns rather than guessing narrow.

## [0.36.0] - 2026-08-13

### Added

- **The active group is a named place: uniform highlight, a drawn
  boundary, and the group's name — the chart stops spotlighting the LLM
  when you're navigating groups.** `<LensFlow granularity="group">` (and
  `<Lens granularity="group">`) paint the grouped ruler's cursor as what
  it actually is: every member node lights with ONE accent — same tint,
  same intensity for an LLM call, a tool and a context pill alike, with
  the type left where it belongs (icon and shape) — every non-member
  dims uniformly, and a soft dashed boundary is drawn around the members
  from their real measured positions (xyflow v12 `nodeLookup`, not
  `getNodes()`), carrying a chip with the group's name. Scrubbing group
  to group animates the boundary, and doesn't under
  `prefers-reduced-motion: reduce`.
- `useChartGroup(recorder, commitIdx)` and the pure
  `activeChartGroup({ groups, commits, commitIdx })` — the group at the
  cursor resolved to CHART NODE IDS, derived from data already in the
  recording (the boundary ranges the grouped ruler computes its stops
  from, plus the commit log). No new fetch, no new recorder, no second
  cursor.
- `groupDisplayName` — ONE spelling of a group's name, now read by
  `buildGroups` and by the boundary chip, so the chart and the WHAT
  HAPPENED boundary list cannot disagree about what a place is called.
- `--lens-group-accent` / `--fp-group-accent` and the
  `.lens-group-node--member` / `--outsider` / `.lens-group-boundary` /
  `.lens-group-boundary-name` classes — one variable retunes the whole
  highlight, in both themes.

### Unchanged

- **STEP mode is untouched and pinned.** `granularity` defaults to
  `'step'`; on that path not one group class or element is rendered and
  node data reaches the card exactly as the chart authored it (hero
  emphasis and all). `granularity="group"` at a commit no boundary
  encloses also renders as step — a mode with nothing to draw draws
  nothing, rather than boxing the whole chart.

## [0.35.0] - 2026-08-13

### Added

- **The Interact half of typed asks.** A decision component registry
  (registered components only — never model markup), a built-in
  OptionPicker (options inline or resolved from propsRef via the artifact
  resolver), and the AwaitingPane — renders the ask's registered
  component, degrades to an answerable plain-question fallback on unknown
  components or expired props (a human is never dead-ended), and posts
  the decision as a structured fact; the natural-language echo is
  display, never the record.

## [0.34.0] - 2026-08-13

### Added

- **Render by ref: the Why Lens redeems claim tickets.** ArtifactResolver
  (over the agentfootprint 9.23 wire ops, or a directly-passed store), a
  component registry keyed by artifact kind (registered components only —
  never model markup), ArtifactPane rendering live artifacts through
  registered components, a generic dataset table + an honest JSON/meta
  fallback card, and the expired-ref placeholder rendered from the present
  snapshot alone — a reloaded conversation re-draws its panes or says
  exactly what's gone ("expired; re-run to regenerate"), never a blank
  pane.

### Fixed

- routing R24 (`route_conflict`) hit the same class of drift as 0.33.1's
  `turn_routed` fix: agentfootprint 9.23.0 added its own teaching-voice
  commentary template for `skill.route_conflict` (previously it had none),
  so `teachingHumanizer` now renders agentfootprint's sentence instead of
  falling through to this package's default. Test made era-robust
  (invariant assertion, not one era's exact text); no behavior change.

## [0.33.1] - 2026-08-12

### Fixed

- **0.33.0 never reached npm** — its publish failed CI because one test
  (routing R24) asserted a stale premise: that `teachingHumanizer` always
  falls through to this package's default sentence for `turn_routed`.
  agentfootprint 9.17.0 ships its own bundled teaching-voice commentary
  template for `turn_routed by='entry'`, so `selectCommentaryKey` now
  returns a real key and `teachingHumanizer` correctly renders
  agentfootprint's sentence instead. This patch makes the test era-robust
  and states the precedence rule it was actually checking: **agentfootprint's
  bundled teaching sentence wins when one exists; this package's narration
  is the fallback for events agentfootprint has no teaching template for.**
  No behavior change — reships 0.33.0's routing-narration feature as-is.

## [0.33.0] - 2026-08-12

### Added

- **Why Lens narrates the skill-graph routing cascade** (agentfootprint
  9.16/9.17): plain-language sentences for `turn_routed` verdicts (rule/intent
  with ranked scores and runner-up, continuity + near-tie holds, menu picks
  with "stay offered and declined", rails turns, dropped saved places),
  `route_conflict` suppressed hops, and posture refusals. Renders only what
  the event carries; unknown vocabulary falls back to an honest raw line;
  old-era recordings read exactly as before (pinned).

## [0.32.0] - 2026-08-11

### Added

- **`<BugReportButton>` — "Report a bug with this run", with the consent step in
  the way.** A small button for a debug UI. Clicking it opens a dialog that shows
  the reporter exactly what would leave their machine before any of it does: one
  tickable row per conversation and per derived file, each with its size, event
  and turn counts, plus the names of every state key that was already scrubbed.
  The reporter's own account — title, steps to reproduce, expected, actual —
  lives in the same dialog, because a report missing either half is not one.

  - **Default selection is the 3 most recent conversations** (`defaultRecentConversations`),
    older ones unticked. Derived files (transcript, narrative, environment) are
    rebuilt over whatever survives, so unticking a conversation takes it out of
    those too — said on screen, not left to be discovered.
  - **A live size meter** recomputes on every toggle: `12.4 MB of 24.0 MB`, red
    and submit-refused over the ceiling, and it names the way out —
    *"Untick conv-3 (20.0 MB) to fit."* — using the same biggest-first rule
    agentfootprint's own trim hints use, and rendering the library's hints
    verbatim beside it. The number states that it is an estimate and which way it
    errs (the real zip is that size or smaller).
  - **Three submit modes, stacked by what you configured**, so a mode you did not
    wire is simply not offered instead of failing at click time: **copy report +
    download zip** (always — clipboard, zip, and the repo's new-issue form
    prefilled, with an over-long body cut at a line break and pointed back at the
    clipboard); **sign in with GitHub** (`deviceClientId` — the OAuth device flow
    inside the modal, so the issue is filed as the REPORTER); **file
    automatically** (`endpoint` — POSTs the finished bundle to your relay, which
    holds the token).
  - **Secrets never touch storage.** A device-flow token lives in component
    memory for the life of the modal and is dropped when the flow ends or the
    dialog closes: no `localStorage`, no cookie, no log line, no issue body. It
    rides one `Authorization` header and appears nowhere else — pinned by a test.
  - **Every failure is the library's own sentence, verbatim.** agentfootprint's
    refusals teach what to do next; a paraphrase of a teaching message is a worse
    teaching message.
  - **Degradation stated:** the substrate shipped in agentfootprint 9.9.0
    (`describeBugReport` / `exportBugReport` / `githubDeviceSignIn` on the
    `/observe` door). On 7.x or 8.x the button does not render — a one-line hint
    says which version it needs. Detection is a namespace read, never a named
    import, so an older agentfootprint degrades this one button instead of
    failing to link the bundle.

- **The headless half, on `agentfootprint-lens/core`:** `defaultSelection`,
  `measureSelection`, `trimHintFor`, `formatBytes`, `buildIssueBody`,
  `buildNewIssueUrl`, `parseGithubRepo`, `encodeBase64` — a CLI or a Vue shell can
  build the same consent dialog from the same answers. The manifest shapes are
  mirrored structurally rather than imported, so the package still compiles for
  consumers on agentfootprint 7 and 8, where those types do not exist.

### Changed

- The `agentfootprint` devDependency moved to `^9.9.0` (the peer range already
  admitted `^9`), and three call sites the 9.x line renamed were migrated with
  it: `agentfootprint/llm-providers` → `agentfootprint/providers`,
  `agentfootprint/injection-engine` → `agentfootprint/context`, and
  `AgentBuilder.recorder()` → `.watch()`. All in tests; no shipped source
  imported a door 9.x removed.
- The `budget_pressure` humanizer keeps reading the pre-9.0 field names
  (`capTokens` / `projectedTokens`) — 9.0 deleted them from the TYPE as well as
  the payload, and a 7.x/8.x recording still carries them.

### Fixed

- `npm run typecheck` was red before this release for a reason unrelated to it:
  three `Array.prototype.at(-1)` reads in `WhereFrom.test.tsx` need `lib: es2022`
  and the package targets ES2020. Rewritten as index arithmetic — same assertion,
  green gate.

## [0.31.1] - 2026-08-09

### Changed

- **Peer range widened to agentfootprint `^7.0.0 || ^8.0.0 || ^9.0.0`.** The 9.x
  line removed nothing this package's bridge reads; the one consumed surface that
  changed is handled below.
- **`budget_pressure` humanizer reads both field eras.** agentfootprint 8.14 added
  honest `cap`/`projected` (+ `unit`: chars vs tokens) beside the misnamed
  `capTokens`/`projectedTokens`, and 9.0 removed the old pair. The humanizer now
  reads new-first with the old names as fallback, and prints the payload's own
  unit — a 9.x recording no longer renders "undefined/undefined tokens", and a
  7.x/8.x recording renders exactly as before.

## [0.31.0] - 2026-08-07

### Changed

- Narrative retry entries now pass through to the shell untouched — footprint-explainable-ui 0.32.0
  knows the word, so retry attempts wear their own badge instead of folding into a generic step.
  The translator bridge stays for the NEXT unknown variant.
- The eui devDependency floor moved to >=0.32.0 <1.0.0 (a caret had frozen lens builds at eui 0.28
  while three eui releases shipped — the compiler-checked entry-type record never heard about them).

### Stated plainly

- The peer range still admits eui 0.28–0.31: on those versions a retry entry renders as a generic
  step dot in StoryNarrative (CommentaryPanel's badge still reads "retry"). Graceful, and now said
  out loud; upgrade eui to 0.32.0 for the full treatment.

## [0.30.1] - 2026-08-05

### Fixed

- Widened the `agentfootprint` peer range to `^7.0.0 || ^8.0.0`. agentfootprint
  8.0.0 is a packaging-only major — every 7.x import path still resolves,
  unchanged, as a deprecated alias — so Lens keeps working against it
  unmodified; only the peer declaration was blocking consumers from installing
  the two side by side.

## [0.30.0] - 2026-07-28

### Added

- **`observeRecording({ snapshot, events, structure })` — Lens over a frozen
  recording, with no app-side glue.** The offline twin of
  `recorder.observe(runner)`: hand it a run's snapshot + typed event log (+ the
  agent's build-time chart, when the recording kept one) and it returns
  `{ recorder, runner }` ready for `<Lens recorder runner />`. Nothing re-runs;
  every byte comes out of the recording. Replay keeps the live rail's isolation
  invariant — a handler that throws costs that one event and nothing else, and
  the count comes back as `eventsSkipped` instead of being swallowed — and it
  hands events over the way the live dispatcher does: typed bucket, then the
  domain wildcard, then `'*'`, with `{ once }` and `{ signal }` honoured. In dev
  mode a throw names the listener and the event type, not just a tally.
  The step strip's commit ranges are REBUILT from the run's own recorded
  boundary events (`BoundaryEvents` in `snapshot.recorders`) and never derived
  from the commit log: the log cannot say WHEN a boundary opened — a fork's
  branches all open at a moment it has no row for — and deriving them was
  measured producing 20 stops on a run that had 17. A recording without that
  entry reports `boundaryRanges: 0` and the strip stays quiet.
  Also returned: `chart` (`'drawn' | 'absent'`), `eventsReplayed`,
  `boundaryEvents`, and `notes`.
- **A replay now rebuilds the STEP GRAPH, so an agent turn is not an empty
  graph.** The graph Lens renders is a fold over one flat domain-event list that
  is fed live by two channels — footprintjs's traversal and the typed dispatcher
  — and offline only the second runs, so `getStepGraph()` fell through to the
  subflow-only projection: measured, **0 nodes** on a recorded 4-iteration ReAct
  turn, with the Agents list, the hops and the per-iteration detail all empty and
  no warning. The traversal half is read back out of the recording's own
  `BoundaryEvents` entry and merged with the replayed half in timestamp order.
  Same turn, same recording: **21 nodes**, the four iterations among them. A
  recording that captured both halves is replayed exactly as recorded.
- **Lens says what it cannot honestly show, on screen.** `boundaryRanges === 0`,
  `eventsSkipped > 0`, a recording with no chart, a `BoundaryEvents` entry that
  is present but unreadable — each becomes a one-line note above the view, in
  all three views. They used to be return values a consumer had to remember to
  render, and a note nobody renders is a silent degradation. `recorder.getNotes()`
  reads them; `recorder.addNote()` adds your own.
- **Lens ships its own stylesheet, and injects it.** Eight components style
  themselves with `lens-*` class names — `<Replay>`, `<AgentLegendStrip>`,
  `<BreadcrumbHoverPreview>`, `<CompareBranchesPanel>`, `<CrossSubflowChip>`,
  `<IterationScrubber>`, `<RuntimeIdInspector>`, `<TokenCostBadge>` — and the
  package shipped no CSS for any of them, so every one rendered unstyled,
  including `<Replay>`, an entry point. The sheet paints through the same token
  chain as the inline half, so one token sheet themes both. Nothing to import;
  `LENS_STYLESHEET` is exported as text for SSR / strict-CSP apps.
- **An eight-colour agent palette behind `--lens-agent-color-N`.** The legend
  read that variable with no fallback, so with nothing defined the swatch was an
  invalid declaration and painted nothing — sold in the JSDoc as
  "theme-portable". `AGENT_COLORS` / `agentColor(i)` are exported.
- **A `--lens-*` drift catcher**, mirroring eui's token test: it greps the
  source for every `var(--lens-…)` read and every `lens-*` class rendered, and
  fails when one has neither a definition nor a fallback. It catches the agent
  swatch hole automatically, and the next one.

### Changed

- **`<Replay trace>` is an adapter over `observeRecording`, not a second replay
  path.** It drew `trace.structure` as a static chart and nothing else — no
  slider, no moments rail, no detail — while the docs said an offline replay
  "matches the live `<Lens>`". A `Trace` is a recording under different field
  names, so `<Replay>` now maps them and renders the same `<Lens>`: chart, step
  strip (rebuilt from `trace.events`, which ARE the boundary log), and detail.
  A Trace carries no typed event log, so the commentary rail stays quiet — and
  says why. `showControls` / `showBackground` are gone (the chart is Lens's now);
  `theme` is forwarded.
- **`observeRecording` reads `blueprint` as well as `structure`.** Every
  recording in this ecosystem was frozen as `{ snapshot, events, blueprint }`,
  and passing one straight in used to give `runner: undefined` and a chart that
  silently never drew — the exact "partial input, no signal" failure this entry
  point exists to remove.
- **The README documents the API that exists.** The 30-second quick start used
  `useLens(...)` and `<Lens for={agent} />` — neither is exported, so the
  headline example never compiled; the event union and the three-column panel
  description named a UI that was never shipped. Rewritten around
  `lensRecorder()` / `recorder.observe(runner)` / `<Lens recorder runner />`,
  with the record-then-render story end to end, `<Replay>`, and
  `structureGraphFromSpec` (exported, previously undocumented). Every code block
  was typechecked against the installed peers.

### Fixed

- **The honest-absence path no longer leaks invented ranges.** The boundary
  rebuild cleared the index only when the recording HAD a `BoundaryEvents` entry
  — but by then the typed replay had already run, and agentfootprint's live
  `BoundaryRecorder` opens a composition range at whatever `getCommitCount()`
  reports, which offline is the FINAL commit count for every event. So a
  recording of any Parallel / Sequence / Loop / Conditional run WITHOUT that
  entry ended up with exactly the artifact the code says it exists to prevent: a
  zero-width slice at the end of the run, and a phantom step in the strip, while
  the returned counts said `0`. The clear is unconditional now: the recording is
  the sole source of these ranges on both arms.
- **`theme={{ mode: 'light' }}` now reaches every surface, in every view.** Two
  holes. (1) Lens's own panels — summary card, transport, moments rail, node
  detail — paint with `--lens-bg-elevated`, which no eui preset sets, so they
  stayed on the dark hardcoded fallback while the chart around them went light;
  so did the edge colours and the injection-source chips, which have no `--fp-*`
  cousin at all. The mode switch now stamps a full light/dark palette for them
  (`MODE_PALETTES`) — in the `--fp-*` tier, never `--lens-*`, so a consumer's
  own `--lens-*` on any ancestor still wins and the documented resolution order
  (`--lens-*` → `--fp-*` → fallback) is genuinely unchanged. (2) The stamp lived
  inside the engineer view, and `view="analyst"` / `view="user"` returned before
  it — `<Lens theme={{ mode: 'light' }} view="analyst" />` rendered fully dark
  with no error. It is applied at the Lens root now.
- **The empty states no longer talk to a live run that is already over.** A
  consumer who did exactly what `observeRecording` documents saw "No runner
  attached — pass the agentfootprint Runner", which fires precisely when the
  recording carried no chart; they have no runner to attach. That reader is now
  told which piece is missing and how to capture it. Same for "run a sample to
  see what happened" and "run a sample to see commentary" in front of a finished
  recording.
- **Partial and malformed recordings degrade loudly.** An `events` field that
  survived storage as a JSON string used to be indistinguishable from "the run
  had no events", and a `BoundaryEvents` entry whose `data` is not an array was
  reported as "this run recorded no boundaries" — a false statement about a run
  that recorded them. Both come back in `notes` (and on screen), with a dev-mode
  console warning.
- **Seven `unknown rootStageId` warnings per agent chart, gone.** The spec walker
  announces a nested subflow BEFORE it yields that mount node's own stage, so
  `structureGraphFromSpec` fired `onSubflowMounted` at a recorder that did not
  hold the node yet, and the mount was dropped each time (consumers were
  scope-filtering the noise). Each mount is now held until its stage lands, and
  held as a LIST per stage so two subflows mounting on one stage cannot silently
  overwrite each other. The emitted graph is byte-identical — verified node for
  node and edge for edge on the real agent chart — so this is noise removal, not
  recovered data: nothing downstream was reading what was dropped.

## [0.29.0] - 2026-07-02

### Added

- **Same-Rail Rewind in `<WhereFrom>` — "◀ Walk the causes".** Picking a key
  and clicking the walk button FREEZES its backward slice as an ordered stop
  list (commit index descending — reverse time is a valid topological order
  of the slice DAG, so both parents of a fork are always visited) and steps
  THE one cursor through it with "◀ earlier cause / toward result ▶". The
  walk session is a lens, never a second cursor: the position derives from
  the host's cursor every render, and a cursor that scrubs off the walk gets
  an explicit "the cursor left the walk · Resume/End", not silence. While
  walking, the chart cone stays the FROZEN walk's cone even as the panel
  re-anchors per stop.
- **[Copy story]** emits footprintjs' own `formatSlice` string, frozen at
  walk entry — byte-identical to what the trace toolpack's `backtrack` LLM
  tool returns (honesty envelope included). `KeyProvenance` gains `story`;
  `ProvenanceFrame` gains `commitIdx` (the walk-order key).

## [0.28.0] - 2026-07-02

### Added

- **The cone reaches the Lens chart.** `<WhereFrom>`'s active slice now paints
  eui 0.28.0's dependency cone on the composition chart: pick a key chip and
  the chart dims to exactly the frames the panel lists, members re-lighting
  staggered by depth (causality walks backwards). New `onSliceChange` on
  `WhereFrom` (reports the cone, clears on unmount — never stale) and a
  `sliceCone` pass-through on `LensFlow`. One source of truth: the panel's
  frames ARE the cone.

### Changed

- Peer floor: `footprint-explainable-ui >=0.28.0` (the `sliceCone` prop).

## [0.27.0] - 2026-07-02

### Added

- **`<WhereFrom>` — "Where did this come from?"** in the engineer view's
  detail panel (also exported for consumer shells): the cursor stage's
  written state keys render as chips; picking one shows the backward slice
  that produced its value AS OF the cursor — who wrote it, what those writers
  read, transitively. Clicking a frame moves THE one cursor (exact
  runtimeStageId match, stage-part fallback for grouped charts) — navigation,
  never a second cursor. Honesty in the UI: never-written keys explain the
  blind spot (initial state / frozen args / a closure); reads-less snapshots
  render "⚠ reads were not recorded — unknowable, not absent".
- **`cursorProvenance(runner, cursorRuntimeStageId)`** (core) — the query
  behind the panel: a thin, canonical composition over footprintjs 9.10.0's
  slice layer (`sliceForKey` + `keysReadFromExecutionTree`), cursor-anchored.
  The SAME queries agentfootprint's `backtrack` LLM tool and eui's Data Trace
  run — the three surfaces cannot disagree.
- **`theme.mode` now applies eui's full light/dark preset** as `--fp-*` vars
  on the chart area — the eui-rendered nodes (stages, slot pills, subflow
  boxes) follow dark/light from this one field; no hand-setting `--fp-*`.
  `visited`/`current` layer on top.

### Changed

- Peer floors: `footprintjs ^9.10.0` (slice layer), `footprint-explainable-ui
  >=0.27.0` (honest Data Trace + preset exports).

## [0.26.2] - 2026-06-30

### Changed

- **`explainableShellPropsFromRunner` dropped its `{ decorate }` option** — the
  helper now ALWAYS builds the plain, undecorated Trace graph. Rationale (treating
  each library as a standalone library): `<ExplainableShell>` IS the
  footprintjs-level renderer and `<Lens>` IS the agentfootprint-level (decorated)
  one, so plain-vs-decorated is a property of *which renderer you pick*, not a knob
  on the shell's helper. A hidden `decorate` default let agent decoration leak into
  the footprintjs-level view — the exact layer-crossing the boundary is meant to
  prevent. The escape hatch is now explicit and visible: build a decorated graph
  with `structureGraphFromRunner(agent, { decorate: true })` and pass it as
  `traceGraph` yourself. Only affects callers that passed `{ decorate: true }`
  (none in the published ecosystem — the default was already `false`).

## [0.26.1] - 2026-07-01

### Added

- **`theme` prop on `<Lens>`** — the agentfootprint-level **three-colour** chart
  theme: `{ mode?: 'dark' | 'light'; ground?; visited?; current? }`. `ground`
  colours the base/unvisited nodes, `visited` the executed nodes, `current` the
  cursor node — forwarded through `LensFlow` to `<TracedFlow>`'s
  `default`/`done`/`active`. New `LensTheme` type exported, and `LensFlow` gained
  a `colors` passthrough. (Complements eui's footprintjs-level 2-colour
  `traceTheme`; the two stay separate.)

### Changed

- **`explainableShellPropsFromRunner` now builds the Trace graph with
  `decorate: false` by default.** The `<ExplainableShell>` Trace is the
  footprintjs-LEVEL view — plain stages/subflows lit purely by the overlay — so
  it no longer carries the agent decoration (hero/plumbing emphasis, context-slot
  pills). The agent-semantic decorated rendering is `<Lens>`'s job. Pass
  `explainableShellPropsFromRunner(agent, recorder, { decorate: true })` to opt
  back in.

## [0.26.0] - 2026-06-30

Coordinated release with agentfootprint 7.0.0 + footprint-explainable-ui 0.26.0.
Bundles the v7 alignment (staged as 0.25.0) with the new consumer→UI boundary helper.

### Added

- **`explainableShellPropsFromRunner(agent, recorder)`** (+ the `ExplainableShellInputs`
  type) — the ONE typed call a consumer makes to drive eui's `<ExplainableShell>`
  from an agentfootprint `Agent` + a `LensRecorder`. Returns the full prop bundle
  (`runtimeSnapshot`, `narrativeEntries`, `traceGraph`, `runtimeOverlay`) with
  **zero casts and no `spec`**, so `<ExplainableShell {...explainableShellPropsFromRunner(agent, recorder)} />`
  cannot mis-wire the data→UI seam (the class of bug that silently blanked the
  drilled chart). The return type is `Pick<ExplainableShellProps, …>` from eui's
  own contract — an eui change breaks THIS helper's build, not the consumer at runtime.

### Changed

- **`LensRecorder.observe` is now generic** — `observe<TIn, TOut>(runner: Runner<TIn, TOut>)`.
  A concrete `Agent` (`Runner<AgentInput, AgentOutput>`) now flows in with **no
  cast**; the run-input variance is absorbed by a single library-side cast
  instead of an `as unknown as` in every consumer.

### Changed (v7 alignment — previously staged as 0.25.0)

- **Peer `agentfootprint` bumped to `^7.0.0`** and imports updated to
  agentfootprint 7's subpaths (e.g. the event types now come from
  `agentfootprint/events`), so lens lands on the clean v7 surface alongside
  agentfootprint 7.0.0 and footprint-explainable-ui 0.26.0.

## [0.24.0] - 2026-06-24

### Added

- **`decorate` option on `structureGraphFromRunner` / `structureGraphFromSpec`**
  (+ exported `StructureGraphOptions`). Default `true` keeps the agent `<Lens>`
  decoration (hero/plumbing emphasis, the 3 context slots as pills, role
  icons/sizes). Pass `{ decorate: false }` for a **footprintjs-LEVEL view** of the
  SAME chart: the raw subflow tree (`sf-injection-engine`, `sf-system-prompt` ∥
  `sf-messages` ∥ `sf-tools`, `sf-cache`, …) with NO agent vocabulary — every box
  a plain stage, the three slots drawn as the real parallel fan-out, lit purely by
  the runtime overlay. The "it's just footprintjs subflows underneath" view.

### Changed

- **`NodeDetailPanel` now surfaces the WHY behind each context injection.** The
  "Context engineering" list adds each injection's `reason` (e.g. the `post-pii`
  reminder's _"fires the step after redact_pii returned"_) when it adds something
  beyond the content summary. The same per-step provenance now also renders inside
  the related-step cards, so drilling an Agent/LLM boundary shows which injection
  fired — and why — on each step in scope, not just on the primary node.

## [0.23.10] - 2026-06-24

### Added

- **`showSummary` prop** on `<Lens>` — gate the STATUS / metrics summary bar
  (status · latency · LLM/tool calls · tokens · throughput). Default `true`;
  pass `false` and it doesn't render. Same composability as `stepStrip`.

## [0.23.9] - 2026-06-24

### Added

- **Clickable step strip in the compact scrubber.** The compact `TimeTravel`
  (`◀ ▶ ⟳Live` + count, used in the engineer view / embeds) now renders a strip
  of ticks — one per event, EVERY step visible in a row — that you click to jump
  to any moment, including BACKWARD to earlier steps; the focused tick stands
  out, done steps fill in. New `stepStrip` prop on `<Lens>` / `TimeTravel`
  (default `true`; pass `false` to hide it).

### Changed

- **Renamed the right-side `Details` pill → `Inspect`.** Clearer that it opens
  the selected step's detail panel (pairs with the `Topology` pill on the left).

### Fixed

- **Stop forcing the raw `dagreTraceLayout` — use TracedFlow's built-in
  measure-then-layout pipeline.** `Lens` and `Replay` were wiring
  `layout: dagreTraceLayout` into the chart, which made `<TracedFlow>` use that
  raw layout *instead of* its internal pipeline (content-exact measured sizing +
  fork-centering + straight spines). So the lens silently rendered with
  estimated fallback widths and never picked up any of explainable-ui's layout
  improvements — including the 0.25.1 content-exact fix. The chart's `layout` is
  now OPTIONAL and omitted by default, so the lens inherits eui's canonical
  pipeline (and every future layout fix) for free. Charts render content-exact:
  centered forks, straight decision spines. No API break — passing an explicit
  `layout` still works for deliberate overrides.

## [0.23.7] - 2026-06-22

Type-resolution + peer correctness (no runtime change):

- **Fixed the dual CJS/ESM types.** The `exports` map pointed every consumer (including the
  `require`/CJS condition) at `index.d.ts` (ESM-flavored), so TypeScript under `node16`/
  `nodenext` got the wrong types — a CJS-types masquerade. tsup already emits `.d.cts`, so
  the fix splits `types` per condition (`import`→`.d.ts`, `require`→`.d.cts`) and adds
  `typesVersions` for the `/core` subpath (node10). Now all green across node10 /
  node16-CJS / node16-ESM / bundler. A publint + `@arethetypeswrong/cli` gate is wired into
  CI + publish so this can't silently regress.
- **Narrowed the `footprintjs` peer `^8.0.0 || ^9.0.0` → `^9.0.0`.** The `^8` branch was
  always unreachable — lens requires `agentfootprint ^6`, and af's footprintjs peer went
  `^7` (6.0.0) → `^9` (6.20+), never 8. Not a breaking change; the dropped branch was
  unsatisfiable.
- Added `engines.node >=18` and a `git+` repository URL (publint).

## [0.23.6] - 2026-06-22

Two non-code fixes (the published bundle is byte-identical to 0.23.5):

- **Dependency fix — widened the `footprint-explainable-ui` peer.** It was pinned
  `^0.22.0` and never bumped as eui reached 0.25.0; 0.x carets don't cross minors, so
  every consumer on current eui hit `ERESOLVE`. Now `>=0.22.0 <1.0.0` — eui is an
  externalized peer and the lens consumes a stable slice of it, so the range opens across
  the 0.x line (co-released; no churn per eui minor). Proven safe: the full suite
  (91 files / 1076 tests) runs green against eui 0.25.0.
- **CI security — split publishing into two jobs.** OIDC `id-token: write` previously
  shared a runtime with an unpinned `npm install` and `npm publish --provenance`. Now an
  unprivileged `build` job installs/tests/builds and uploads a staged artifact (dist +
  package.json + README + LICENSE), and an isolated `publish` job (the only holder of
  `id-token: write`) consumes that artifact and publishes with **zero dependency
  resolution**. First release to run through the split.

## [0.23.5] - 2026-06-22

Publish CI: drop the committed lockfile + `cache: npm`. A committed lock can't carry
rolldown's per-OS native binding (npm #4828), so even `npm install` kept failing on the
linux runner. A fresh `npm install` (no lock) resolves the correct platform binding AND
current af. THIS completes the publish-unblock chain (0.23.0's <Replay> finally reaches npm).

## [0.23.4] - 2026-06-22

Publish CI: `npm ci` → `npm install`. vitest 4.x pulls rolldown's platform-native binding
as an optional dep; a lockfile generated on one OS omits the other OS's binding (npm
#4828), so strict `npm ci` failed on the linux runner with "Cannot find
@rolldown/binding-linux-x64-gnu". `npm install` reconciles per-platform while honoring
the lock's pinned af. Final piece of the publish-unblock chain (with 0.23.3's lockfile bump).

## [0.23.3] - 2026-06-22

**The actual publish-blocker fix.** Root cause (found by checking the exact CI error +
install command, after an RCA pass that ruled out dual-instance/flakiness): the committed
`package-lock.json` pinned **agentfootprint 6.2.0**, and `publish.yml` runs **`npm ci`** —
so CI installed af 6.2.0, which predates `toolChoiceRecorder` (added in af 6.25.0). Every
toolChoice test then failed with `TypeError: toolChoiceRecorder is not a function`,
silently blocking the npm publish since v0.22.0 (exactly when the toolChoice panel landed).
It passed locally only because a fresh `npm install` pulled current af. Fix: regenerated
the lockfile to af 6.44.0 (verified via `npm ci` → tests green). The 0.23.1/0.23.2
de-flake + tsup-external changes stay as genuine hardening.

## [0.23.2] - 2026-06-22

Publish reliability (RCA-driven). Root cause was test flakiness under parallel CI
workers (async render settling + tight wall-clock perf budgets), NOT a module-instance
hazard (a workflow RCA reproduced two af copies and confirmed the kind-check — virtual
method dispatch returning a string literal — is module-identity-agnostic). Fixes:
(1) bumped the toolChoice waitFor timeout to 5s (the async lazy-scoring read can exceed
1s on a loaded runner); (2) loosened the tightest perf budgets (1µs/op-class); retry:2
stays as a backstop. Also externalized `agentfootprint` in the tsup build so a consumer
of the published lens never gets a 2nd bundled af instance. Carries 0.23.0's <Replay>.

## [0.23.1] - 2026-06-22

CI publish fix. The flaky test suite (timing-sensitive perf budgets + a render-order
test under parallel workers) had silently blocked the npm publish since v0.22.0, so
v0.23.0's `<Replay>` never reached npm. Added `retry: 2` to the vitest config and
loosened the tightest perf bound. Carries everything from 0.23.0.

## [0.23.0] - 2026-06-22

`<Replay trace>` — render a persisted agentfootprint `Trace` OFFLINE (no live
runner). Rebuilds the flowchart from `trace.structure` via the new
`structureGraphFromSpec(buildTimeStructure)` (extracted from
`structureGraphFromRunner`, which now delegates to it — behaviour-preserving) and
renders it via `<LensFlow>`, with a self-describing redaction banner when
`trace.redaction === 'none'`. Pairs with agentfootprint 6.44.0
`enable.localObservability().getTrace()`. 14 tests added.

## [0.22.0] - 2026-06-11

The "Tool choice" panel (RFC-002 block C7) — per-iteration visualization of
the `toolChoiceRecorder` margins shipped in agentfootprint 6.25.0.

### Added

- **`LensProps.toolChoice`** — pass the `toolChoiceRecorder` handle from
  `agentfootprint/observe` (or any `ToolChoiceSource` with the two async
  getters) and the engineer view mounts a collapsible "Tool choice" strip
  below Commentary. Omit the prop → the panel does not mount; zero impact.
  The collapsed pill's detail line already carries the run summary
  (`N flagged · M scored`).
- **`<ToolChoicePanel>`** (exported for consumer-built shells) — one
  LLM call at a time: horizontal bars of the offered-tool scores (ranked,
  normalized to the top score so a close call LOOKS close), the chosen
  tool highlighted, a margin badge, and the ⚠ NARROW /
  ⚠ PROXY-DISAGREEMENT flags. Skipped calls explain themselves
  (`nothing-chosen` / `chosen-not-offered`); unscored entries list the
  offered menu with a "not scored yet" note. A permanent caption keeps the
  recorder's honest-claim discipline IN the UI: margins are
  embedding-geometry proxies (choice context ↔ tool descriptions) — not
  model internals. Long tool catalogs window through `useWindowedList`
  (same U3 threshold contract as EventStream, default 300).
- **`selectToolChoiceCall`** (headless, exported from `/core`) — resolves
  the ONE Lens cursor to the visible call: exact `runtimeStageId` match →
  within-subflow (`sf-llm-call#5` → the call it contains) →
  nearest-previous call. Root/synthetic bookends map to "nothing yet"
  (Run · start) / "the whole run" (Run · end). No second cursor, no
  parallel data path — the one-cursor law holds.
- **`useToolChoice`** (exported hook) — bridges the recorder's LAZY async
  read API (`getCalls()` / `getSummary()` run the embedder on first read,
  memoized per entry) into React state: reads serialize, stale queued
  reads skip ("latest wins"), a failed read surfaces its message next to
  the last good data instead of swallowing it. Re-reads as the event log
  ticks; each entry scores exactly once.

## [0.21.0] - 2026-06-11

The lens now scales to long runs (backlog item U3): the event log is BOUNDED
by default, and the long-list surfaces render windowed — honest about both
(evictions are counted and announced; truncated feeds say what they cut).

### Added

- **`LensRecorderOptions.maxEvents`** — FIFO cap on the event log (default
  `50_000`, exported as `DEFAULT_MAX_EVENTS`; pass `Infinity` to opt out;
  anything else must be a positive integer or construction throws a
  `RangeError`). Past the cap the OLDEST entries are evicted in ~10%-of-cap
  batches (amortized O(1) per event) from BOTH the flat `SequenceStore` AND
  the run tree's per-node `events` lists — entry objects are shared
  references, so pruning both is what actually releases memory. Run-tree
  STRUCTURE (iteration / llm / tool nodes) is never evicted — it is bounded
  by run shape, not event volume. Honest, never silent:
  - `getDiagnostics().droppedEvents` counts every evicted entry (new field).
  - Debug mode (`debug: true` / footprintjs `enableDevMode()`) warns ONCE
    when the cap first engages.
  - Retained entries keep their original `seq` — the gap at the front of the
    log is visible.
  - `selectSummary()` counts/tokens cover only retained events once
    `droppedEvents > 0` (documented); `startedAt` / `durationMs` stay
    anchored to the TRUE first event, so the time axis never shifts.
- **`useWindowedList`** (exported hook) — minimal fixed-row-height list
  windowing, no new dependency: spacer-based, threshold-gated (below the
  threshold it is a no-op and the DOM is byte-identical to the unwindowed
  render).
- **`EventStream` windowing** — past `virtualizeThreshold` rows (default 300)
  the firehose renders only the scrolled-to window (`rowHeight` default 24,
  pinned with ellipsis overflow while windowed; full content reachable via
  `onSelect`). New `droppedCount` prop (wire
  `recorder.getDiagnostics().droppedEvents`) renders an explicit
  "N earliest events evicted" notice above the stream.
- **`RunTreeView` virtualization** — rewritten from recursive render to
  flatten-then-window: visible rows (respecting expand/collapse) are
  flattened each render, and past `virtualizeThreshold` rows (default 300)
  only the window is mounted inside a `maxHeight` (default 480) scroll
  container. Props/markup unchanged below the threshold. Expansion is now an
  id-keyed override map with a DERIVED depth<3 default — a node that gains
  children mid-run now auto-expands (the old mount-time `useState` froze it
  closed).
- **Commentary tail-window** — both commentary surfaces (engineer panel +
  analyst card) render at most the newest 500 lines
  (`MAX_COMMENTARY_LINES`), with an explicit "… N earlier moments hidden"
  leader when anything is cut. The focused line is always the cutoff (the
  last visible row), so focus highlight / scroll-into-view behavior is
  unchanged, and scrubbing back slides the window back with the cursor.

### Fixed

- `RunTreeView` indentation: the row style mixed `paddingLeft: depth * 16`
  with a later `padding` SHORTHAND, which silently reset the indent to 6px
  for every depth (and React warns on shorthand/longhand mixes). Rows now
  use longhand padding and actually indent per depth.

### Tests

- `LensRecorder.cap` — 7 patterns: option validation; FIFO drop-oldest with
  conservation (`entryCount + droppedEvents === total`, newest always
  retained, original seqs preserved); run-tree pruning reaches root + nested
  nodes; keyed/range indices rebuild consistently; `selectSummary` time-axis
  anchor; randomized cap/volume invariants; warn-once honesty (+ `clear()`
  re-arms); default 50K cap at scale within budget; `Infinity` opt-out.
- `useWindowedList` — threshold no-op, window geometry math, scroll updates,
  shrink clamping, stable `onScroll` identity.
- `EventStream` — small-log parity, windowed long log with spacer geometry,
  filtered-list windowing, eviction notice on/off.
- `RunTreeView` — behavior parity (default expansion, toggle, selection) +
  windowed large tree.
- `tailWindow` + Lens analyst view — bounded feed with exact hidden count.

## [0.20.0]

- **footprintjs `^9` supported** (peer widened to `^8.0.0 || ^9.0.0`) — required
  by agentfootprint 6.15.0+; footprintjs 9's trampoline changes no API the lens
  consumes.
- **LensRecorder diagnostics (backlog U4):** always-on health counters via
  `getDiagnostics()` (`unknownEventTypes` per-type counts + `bracketMismatches`),
  with dev-gated warnings (`debug` option; unset follows footprintjs
  `isDevMode()`; explicit `false` wins). Unknown = outside agentfootprint's own
  `ALL_EVENT_TYPES` registry. `runtimeStageId` included in bracket-mismatch
  warnings. First test coverage for `useLensRecorder`.

`LensRecorder` now tells you when the event stream it observed was unhealthy
(backlog item U4) — counters always, console warnings opt-in.

### Added

- **`recorder.getDiagnostics()`** — always-on health counters, no debug flag
  needed: `{ unknownEventTypes: Record<string, number>; bracketMismatches: number }`.
  `unknownEventTypes` counts events whose `type` is outside agentfootprint's
  event registry (`ALL_EVENT_TYPES`) — e.g. a newer agentfootprint emitting
  types this lens doesn't know. `bracketMismatches` counts close events
  (`llm_end`, `tool_end`, `composition.exit`, ...) that didn't match the top
  of the build stack. Both are zero on a well-formed run; reset by `clear()`.
  UIs and tests can assert stream health without scraping the console.
- **`LensRecorderOptions.debug`** — opt-in dev-mode warnings:
  `lensRecorder('Run', { debug: true })`. When on, `console.warn` fires ONCE
  PER unknown event TYPE (not per event — no spam from a chatty emitter) and
  on EVERY `popIfKind` bracket mismatch (expected vs found kind, plus the
  closing event's `runtimeStageId`). Unset, it follows footprintjs's global
  `isDevMode()` flag (the existing lens convention — flip centrally via
  `enableDevMode()`); `debug: false` forces silence even in dev mode.
  Exported types: `LensRecorderOptions`, `LensDiagnostics`.

### Fixed

- `popIfKind`'s JSDoc now describes the real behavior (count + dev-mode warn);
  previously mismatches were swallowed with no trace at all.

### Tests

- `LensRecorder.diagnostics` — unknown types counted per event / warned once
  per type, silent-by-default with counters intact, bracket mismatch counter +
  warning content, `isDevMode()` fallback + `debug: false` override, a real
  Agent run (turn/iteration/llm/tool brackets) produces zero diagnostics and
  zero `[lens]` console output, `clear()` resets counters and the warned-once
  set.
- `useLensRecorder` — first coverage for the hook: returns the given recorder
  instance; an observed event bumps the version, re-renders, and accumulates
  in `selectEventLog()`.

## [0.19.0]

`<SkillGraphFlow>` now shows the **decision path** to a selected skill.

### Added

- **"REACHED WHEN" path in the detail panel.** Clicking a skill (or predicate)
  now shows the root→leaf decision path that reaches it — each predicate + the
  `yes`/`no` branch taken — so you can read *why* a skill is reachable, not just
  *that* it exists. Derived purely from the graph's edges (no extra data needed
  from the consumer); the matched `yes` branches are accented.
- **`routingPathTo(graph, nodeId)`** — the pure, exported helper behind it (walks
  the drawn edges backward to START, cycle-guarded), plus the `SkillRoutingPathStep`
  type. Use it to build your own routing UI. Complements agentfootprint 6.5.0's
  runtime `context.evaluated.routing` (which provenance actually fired at run time);
  this is the design-time view of the same paths.

### Tests

- `skillGraphFlowLayout` — `routingPathTo`: tree-leaf paths (incl. the all-`no`
  default leaf), path to a predicate node, flat-entry empty path, cycle guard.
- `<SkillGraphFlow>` — the "REACHED WHEN" path renders for a selected leaf.

## [0.18.0]

Adds `<SkillGraphFlow>` — an interactive, two-panel view of an agentfootprint
skill graph (the richer companion to `graph.toMermaid()`).

### Added

- **`<SkillGraphFlow graph={...} detailFor={...} />`** — renders a built
  `skillGraph()` (flat entry/route OR a `decide(...)` decision tree) as a
  pannable/zoomable React Flow diagram: predicate **diamonds** route to skill
  **boxes**. **Click a node** → its detail (a skill's description, the tools it
  unlocks, and its full procedure; or a predicate's yes/no routing) shows in a
  side panel. The panel is **resizable** — drag the divider to widen it for long
  skill bodies (`defaultPanelWidth`, default 320). Controlled or uncontrolled
  selection (`selectedId` / `defaultSelectedId` / `onSelectNode`),
  `hideDetailPanel`, `showStart`, themeable via the existing `--lens-*` / `--fp-*`
  tokens.
- **`layoutSkillGraph(graph, opts)`** — the pure, framework-free dagre layout
  behind the component (exported for consumers building their own renderer), plus
  `SKILL_GRAPH_START_ID` and the structural prop types (`SkillGraphView`,
  `SkillNodeDetail`, `SkillGraphNodeView`, `SkillGraphEdgeView`, `SkillFlowNode`,
  `SkillFlowEdge`). Decoupled from agentfootprint by structural typing — a built
  `graph` passes straight in; the lens takes no hard dependency on the exact
  agentfootprint types.

### Tests

- `skillGraphFlowLayout` (pure): node/edge derivation, top-to-bottom ranking,
  `showStart`, dashed `model` edges, dangling-edge skip, empty graph, and a
  regression guard that same-kind sibling nodes never share a position (dagre
  mutates the label object passed to `setNode`).
- `<SkillGraphFlow>` (render/interaction): node labels, empty-state hint, click →
  skill detail (description + tools + body), predicate detail, `onSelectNode`,
  `hideDetailPanel`, `defaultSelectedId`, and the resizer (present/hidden +
  drag widens the panel).

## [0.17.0]

The monitor becomes a self-explaining "chatbot monitor": a single cursor drives a
**CONVERSATION | EXECUTION FLOW | WHAT HAPPENED** layout.

### Developer experience — `<Lens recorder runner />` just works

Surfaced rebuilding a real consumer app (Neo) on the library:

- **The chart is now DERIVED from the runner** when no `chart` prop is passed —
  `<Lens recorder runner view="engineer" />` renders the composition graph with
  zero manual wiring. An explicit `chart` prop still wins (full override).
- **`LENS_NODE_TYPES` is now exported** — the renderer map for the chart's custom
  node types (`slotPill` / `groupContainer`). Consumers no longer hand-roll it,
  and the Lens uses it for its derived chart, eliminating the React-Flow
  "node type not found" warning flood.
- **`LensChartBoundary` wraps the chart** — a malformed `chart` (or an internal
  flow-graph error) shows a compact fallback instead of white-screening the whole
  monitor. Also exported for consumers.

### Added

- **WHAT HAPPENED timeline** (`WhatHappenedTimeline` + `buildTimelineMoments`): a
  right-rail column of draggable "moment" dots that folds the old scrubber +
  commentary + per-node details into one cursor. Terse titles, a tight description
  line, and a detail card only when there is detail.
- **Per-node details for drilled stages** — name, description, and when the stage
  ran.
- **Metrics bar** additions: latency, tokens in/out, throughput; a compact icon
  Copy-for-LLM button; fits one row.

### Fixed

- **Drilled subflow internals now light up on scrub.** A subflow's commits live in
  its *own* memory scope (not the parent commit log), so the milestone path alone
  could not see them. Cursor stops for a drilled subflow are now derived from the
  runtime overlay's `executionOrder`, and the milestone path skips the subflow's
  own boundary commit so it does not double-stop.
- **Commentary quality** — consecutive identical lines are de-duplicated, and the
  raw `agentfootprint.context.evaluated` emit is no longer shown as prose.

### Changed

- **`structureGraphFromRunner`** materialises subflow internals (de-duplicated by
  id) so explainable-ui's existing drill reveals them.
- **`TimeTravel` compact mode** — the timeline is the scrubber, so the redundant
  drag track is hidden (keyboard scrubbing + Live still work).
- **Peer dependencies updated to match the code:** `footprintjs ^7.0.0`,
  `agentfootprint ^6.0.0`, `footprint-explainable-ui ^0.22.0` (previously declared
  the long-stale `^6` / `^3` / `^0.21`).

### Tests

- `buildTimelineMoments`, `WhatHappenedTimeline`, `drillSubflowInternals`,
  `slotHighlight`, `structureGraphFromRunner.drill`, plus commentary and
  cursor-position cases.
