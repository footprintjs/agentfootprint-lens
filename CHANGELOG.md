# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.17.0]

The monitor becomes a self-explaining "chatbot monitor": a single cursor drives a
**CONVERSATION | EXECUTION FLOW | WHAT HAPPENED** layout.

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
