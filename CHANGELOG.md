# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
