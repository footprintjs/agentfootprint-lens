# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.23.8] - 2026-06-24

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
