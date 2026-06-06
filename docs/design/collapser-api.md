# Lens Collapser — design (simplified, post "subflow IS the collapse")

Last revised: post-realization that footprintjs's TopologyRecorder
already encodes the subflow-level collapse concept — the lens-side
work reduces to a tiny mapping table.

Read first:
- `footprintjs/CLAUDE.md` — "TopologyRecorder" section: live composition
  graph derived from FlowRecorder events, nodes only at composition-
  significant moments (subflow / fork-branch / decision-branch)
- `footprintjs/docs/design/scope-vs-emit.md` — "collect during traversal,
  never post-process"
- explainable-ui's `createTraceStructureRecorder` JSDoc — same idea
  applied to StructureRecorder events (build-time)

---

## 1. Purpose

Convert agentfootprint composition build events into a `TraceGraph`
where each node carries the right xyflow registry `type` field so
`<TraceFlow nodeTypes={LENS_NODE_TYPES}>` renders the lens visuals
(LLMNode / AgentGroupNode / ContextBinNode / ToolNode / UserNode /
AgentCardNode).

---

## 2. Key insight — subflow IS the collapse boundary

footprintjs's `TopologyRecorder` already encodes the right granularity:
**at composition-significant moments only** (subflow entry / fork
branch / decision branch). Internal stages are invisible.

`TopologyRecorder` is RUNTIME (built from FlowRecorder events as
execution traverses). For lens's "render the full chart from t=0" goal
we need the same concept at BUILD time — i.e., from `StructureRecorder`
events fired during `flowChart(...)` construction.

This collapser is exactly that: **a build-time TopologyRecorder.** Same
mental model — only `onSubflowMounted` events produce nodes; only
edges crossing subflow boundaries produce edges; stages inside
subflows are ignored.

The 6-rule pattern matching from an earlier design draft is not
needed. Subflows ARE the collapse; everything else is suppressed by
construction.

---

## 3. The whole API surface

```ts
// agentfootprint-lens/src/core/collapser/lensCollapser.ts

import type { StructureRecorder } from 'footprintjs';
import type { TraceGraph } from 'footprint-explainable-ui/flowchart';

export interface LensCollapserHandle {
  /** Pass via `structureRecorders: [handle.recorder]` to any
   *  agentfootprint composition factory. */
  readonly recorder: StructureRecorder;

  /** Build-time graph, ready for <TraceFlow nodeTypes={LENS_NODE_TYPES}>. */
  getGraph(): TraceGraph;
}

export function lensCollapser(): LensCollapserHandle;
```

That's the entire public surface. No options, no rule overrides, no
configurable behavior. The mapping table is internal and small.

---

## 4. The mapping table (5 rules)

The collapser keeps ONE table — subflow-id-prefix → xyflow registry key:

```ts
function nodeTypeForSubflowId(id: string): keyof typeof LENS_NODE_TYPES | null {
  // Returning null hides the subflow entirely (e.g., Agent internals).
  if (id.startsWith('sf-injection-engine')) return null;  // hide
  if (id.startsWith('sf-cache-decision'))   return null;  // hide
  if (id.startsWith('sf-thinking'))         return null;  // hide

  if (id.startsWith('sf-llm-call') || id === 'llm-call') return 'lensLLM';
  if (id.startsWith('sf-agent')    || id === 'agent')    return 'lensAgentGroup';
  if (id.startsWith('sf-tool'))                          return 'lensTool';

  // Generic — Sequence step, Loop body, Parallel branch, Conditional
  // branch, merge stage. Renders as a neutral AgentCard.
  return 'lensAgentCard';
}
```

That's the entire semantic layer. Adding a new agent-domain primitive
later = add one line.

---

## 5. The one special case — LLMCall slot folding

LLMCall's three slot subflows (`sf-system-prompt`, `sf-messages`,
`sf-tools`) should not render as separate nodes. They fold into the
parent LLMCall's `data.slots: string[]` so the LLM card renders three
slot pills inside one card.

```ts
function isSlotSubflow(id: string): boolean {
  return id.startsWith('sf-system-prompt')
      || id.startsWith('sf-messages')
      || id.startsWith('sf-tools');
}
```

When the collapser sees a slot subflow mount and there's an LLMCall
on the parent-subflow stack, it appends the slot name to that LLM's
`data.slots[]` instead of emitting a node. ~5 LOC.

---

## 6. Synthetic User pills

The chart's User entry/exit pills are added by the collapser as a
final synthesis step in `getGraph()` — not driven by StructureRecorder
events (no "user subflow" exists in agentfootprint). Two `lensUser`
nodes, one connected to the root subflow's entry, one to its exit.
~10 LOC.

This is the same user-frame augmentation the existing `layoutLensGraph`
performs, lifted into the collapser so it's part of the canonical
build-time graph (not a per-renderer afterthought).

---

## 7. Usage end-to-end

```ts
import { lensCollapser, LENS_NODE_TYPES } from 'agentfootprint-lens';
import { TraceFlow } from 'footprint-explainable-ui/flowchart';
import { LLMCall, MockProvider } from 'agentfootprint';

const collapser = lensCollapser();
const llm = LLMCall.create({
  provider: new MockProvider({ reply: 'hi' }),
  model: 'mock',
  structureRecorders: [collapser.recorder],
}).system('').build();

const graph = collapser.getGraph();
// → ready to render — node.type set per the mapping table.

<TraceFlow graph={graph} layout="passthrough" nodeTypes={LENS_NODE_TYPES} />
```

---

## 8. Why parallel / multi-agent works for free

`StructureRecorder.onSubflowMounted` fires for EVERY subflow including
those mounted by Parallel branches, Sequence steps, Loop body, and
nested Agent subflows in a multi-agent setup. The collapser emits one
node per subflow. The connecting edges come from `onEdgeAdded`. No
new code is needed when the chart topology grows — the per-subflow
rule applies uniformly.

This was the original premise: **the chart shape carries composition
meaning**. The collapser just renders the shape that `StructureRecorder`
already produces.

---

## 9. What this replaces

| Removed | LOC | Reason |
|---|---|---|
| `agentfootprint-lens/src/core/translate/lensGroupTranslator.ts` | ~80 | Dispatcher no longer needed |
| `agentfootprint-lens/src/core/translate/perKind/*` (6 files) | ~700 | Per-kind translators replaced by uniform subflow rule |
| `agentfootprint-lens/src/core/translate/MemberResolver.ts` | ~50 | Recursion no longer needed |
| `agentfootprint-lens/src/core/translate/helpers/*` | ~30 | Old-pipeline helpers |
| `Runner.getUIGroupWith` consumers in lens | ~20 | No longer called |
| Eventually `composition.buildUIGroupMetadata()` (7 files) | ~150 | After grace period |

**Total removable: ~1030 LOC**

| Added | LOC |
|---|---|
| `lensCollapser.ts` (filter + mapping + slot fold + user pills) | ~80 |
| `LENS_NODE_TYPES` static export | ~10 |
| `LensFlow.tsx` rewire | ~30 net change |

**Total added: ~120 LOC**

**Net: -910 LOC, simpler model.**

---

## 10. What's deliberately out of scope (runtime concerns)

The collapser handles BUILD-TIME structure only. Three runtime concerns
are SEPARATE recorders, layered on top:

1. **Context Engineering chips** (`lensContextBin.data.chips`) — populated
   from `context.injected` emit events at runtime. Empty at build time.
2. **Tool lit state** (`lensTool.data.lit`) — flipped to true when
   `agentfootprint.stream.tool_start` fires for that tool.
3. **Edge labels** (token counts) — derived from `agentfootprint.stream.llm_end`
   emit event payloads (`usage.input`/`usage.output`) at runtime.

These are part of the "runtime overlay" recorder built after the
collapser lands. The collapser just provides the skeleton.

---

## 11. Build sequence

1. **Already done** — `NodesDemoPage` proves the rendering layer works
   with hand-crafted typed data.
2. **Now** — build `lensCollapser` per §3-§6. ~80 LOC + tests.
3. **Validate** — write a comparison test: same `LLMCall` chart, run
   through `lensCollapser`, assert the resulting `TraceGraph` matches
   the demo's hand-crafted skeleton (same node count, same types,
   same edge structure).
4. **Runtime overlay** — separate recorder that produces `SceneState`
   from cursor position (token labels, lit states, slot updates).
5. **Rewire `LensFlow`** — replace `useLensRenderGraph` path with
   `lensCollapser` + runtime overlay + the static `LENS_NODE_TYPES`.
6. **A/B verify in playground** — toggle old vs new, confirm visual
   parity on LLMCall + Agent samples.
7. **Delete the old per-kind translator files**.
8. **Test parallel / multi-agent** — verify the per-subflow rule
   produces correct rendering with no new code.
