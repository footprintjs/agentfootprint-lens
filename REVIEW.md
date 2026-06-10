# agentfootprint-lens — Staff Engineer Review (v0.19.0)

*Deep-dive review (~30K LOC src, 79 test files), June 2026. Part of the three-repo UI-tier review.*

---

## 1. Executive summary

Lens is the most architecturally mature of the three UI libraries — a textbook headless-core/react split (`/core` verified React-free across 65+ modules, push-based reactivity via `useSyncExternalStore`, per-composition-kind pure translators with their own tests), and it's the only UI that consumes the **live** event stream rather than post-run snapshots. The 30K LOC is real structure, not bloat: translate/group/selectors/render pipelines, no large monoliths, no detected duplication.

The risks are the stack's recurring ones, amplified by Lens sitting at the top of a four-package peer matrix (`agentfootprint ^6` + `footprintjs ^7||^8` + `footprint-explainable-ui ^0.22` + `@xyflow/react ^12`): **no event-shape validation or version guard** (unknown events silently attach — LensRecorder.ts: "Every other event is just attached to the current top node's events list", verified), **unbounded in-memory event accumulation**, and **no virtualization** — all fine for sub-10-minute debug runs, all wrong for the long-running agents the core backlog is about to enable.

---

## 2. What's strong

- **Headless core done right.** `/core` is consumable from Vue/Angular/plain DOM (ChangeNotifier adapter docs included); React layer is a thin `useSyncExternalStore` wrapper. This is the correct architecture for a visualization SDK and the hardest thing to retrofit — it's already here.
- **Composition, mirrored.** Each agentfootprint composition kind (Sequence/Parallel/Conditional/Loop/Agent/LLMCall) has its own pure translator with tests — the UI understands the runtime's algebra instead of flattening it.
- **Graceful degradation by policy.** Bracket-mismatch events skip rather than crash (`popIfKind`); partial correctness over dead viewer — right default for an ops tool (needs a counter, see P2).
- **Test depth:** 79 files, including a full v0.1 contract test running a real Agent end-to-end — the only cross-package contract test anywhere in the five-repo stack.
- **Lifecycle hygiene:** `observe()` returns a disposer covering all 7 sources; `detach()` verified clean — no leak found in the recorder wiring itself.

---

## 3. Findings — ranked

### P0 · No event-shape validation or version guard (cross-tier systemic issue)
`LensRecorder.handleEvent()` switches on `event.type`; unknown types silently append to the current node (verified). No schema check on payloads, no event-contract version. A renamed payload field in agentfootprint v7 produces *plausible wrong visuals*, not errors — for a debugging tool, the worst failure mode. Same fix as the other two UIs: shared versioned trace/event schema package + ingestion-time validation + visible version-mismatch banner; dev-mode warn-and-count on unknown event types instead of silent attach.

### P1 · Unbounded memory + no virtualization = short-run-only viewer
Event log (SequenceStore) grows without eviction (~72 MB per 360K events); RunTreeView renders the full tree (degrades >~500 nodes); EventStream renders the full log (>~5K events). The core backlog (#13–#15) exists precisely to enable 200+ iteration agents — Lens must scale with it: optional `maxEvents` FIFO cap, windowed EventStream, virtualized tree.

### P1 · Selector cost under token streaming
Each event bumps the store version → full selector re-execution (O(n) tree walks) on next render; fine at typical rates, sluggish past ~10K events at 100 tokens/sec. Memoize selectors by version key (cache last result per selector per version) — small change, removes the cliff.

### P2 · Notable
- Four-package peer lockstep with no schema versioning makes every upstream minor a potential silent break; until the schema package exists, publish a tested compatibility matrix and pin in CI.
- Bracket-mismatch skips are unlogged — add a dev-mode warning + mismatch counter surfaced in the run summary (turns silent desync into a visible upstream-bug detector).
- `useLensRecorder` — the central hook — has no test file (its siblings do).
- No a11y assertions anywhere in the 79 tests; the views are keyboard-heavy (tree, slider, panels).
- `dagreLayout.ts` parent-coordinate lookup tolerates orphaned parents but fragilely (guard exists; add a test).

---

## 4. Recommendation

1. **Adopt the shared trace/event schema package** (same item as explainable-ui P0; one fix, three consumers) + dev-mode unknown-event warnings with counters.
2. **Scale envelope work paired with core Phase 3:** `maxEvents` cap, virtualized EventStream/RunTreeView, selector memoization — ship in the same release window as footprintjs's agent-scale release so the stack's viewer doesn't lag its runtime.
3. **Close the test gaps that matter:** `useLensRecorder` test, bracket-mismatch counter test, one a11y pass on tree/slider.
4. Keep the headless core pure — it's the asset that lets Lens outlive any single rendering stack (and the natural surface for a future "embed in LangSmith/Grafana panel" play).
