/**
 * structureGraphFromRunner — convert an already-built agentfootprint Runner
 * into the FINE-GRAINED (uncollapsed) TraceGraph: every real stage of the
 * runner appears as its own node, keyed by its real footprintjs id
 * (`[subflowPath/]stageId`).
 *
 * This is the sibling of `collapserFromRunner`: same spec walk
 * (`walkSubflowSpec` over `runner.getSpec().buildTimeStructure`), but it feeds
 * explain-ui's plain `createTraceStructureRecorder` instead of `lensCollapser`,
 * so NOTHING is collapsed into domain cards.
 *
 * WHY this exists: the runtime time-travel monitor wants to render the run's
 * REAL structure (so each node id equals the run's `runtimeStageId` minus its
 * `#executionIndex`). explain-ui's overlay strips only the `#index` and matches
 * the remainder against `node.id` — so a fine-grained, real-id graph lights its
 * execution path automatically, with zero mapping table. (A separate, idealized
 * flat blueprint can't: its ids don't match what actually ran.) The merge-tree
 * LOOK then comes purely from the layout + node renderers the consumer passes —
 * the structure here stays faithful to the run.
 */

import { walkSubflowSpec, splitStageId } from 'footprintjs/trace';
import { createTraceStructureRecorder } from 'footprint-explainable-ui/flowchart';
import type { TraceGraph } from 'footprint-explainable-ui/flowchart';
import type { StructureRecorder } from 'footprintjs';
import { stageRole, type StageRole } from 'agentfootprint';

interface RunnerLike {
  readonly getSpec: () => { readonly buildTimeStructure: unknown };
}

/** Map a semantic role to the renderer's generic emphasis hint. */
function emphasisForRole(role: StageRole): 'hero' | 'muted' | undefined {
  if (role === 'hero-slot' || role === 'hero-llm' || role === 'hero-action') return 'hero';
  if (role === 'plumbing') return 'muted';
  return undefined; // boundary → normal
}

/**
 * Pick a renderer icon for the hero stages. Icon keys are explainable-ui
 * (StageNode) vocabulary, so this mapping lives here in the bridge — not in
 * agentfootprint (which must not know renderer icon names) nor in the generic
 * renderer (which must not know agent ids).
 */
function iconForRole(localId: string, role: StageRole): string | undefined {
  if (role === 'hero-llm') return 'llm';
  if (role === 'hero-action') return 'tool';
  if (role === 'hero-slot') {
    if (localId === 'sf-system-prompt') return 'system-prompt';
    if (localId === 'sf-messages') return 'messages';
    if (localId === 'sf-tools') return 'tool';
  }
  return undefined;
}

/**
 * Size hint for the renderer's node-size resolver: the LLM call is the star
 * (lg), plumbing recedes (sm), everything else is normal (md, returned as
 * undefined). Slots are rendered as pills (own size) so they're not scaled here.
 */
function sizeForRole(role: StageRole): 'sm' | 'lg' | undefined {
  if (role === 'hero-llm') return 'lg';
  if (role === 'plumbing') return 'sm';
  return undefined;
}

/** Slot subflow local id → ContextSlot kind (for the SlotPillNode). */
function slotKindForLocalId(localId: string): string | undefined {
  if (localId === 'sf-system-prompt') return 'system-prompt';
  if (localId === 'sf-messages') return 'messages';
  if (localId === 'sf-tools') return 'tools';
  return undefined;
}

/** Build the fine-grained (uncollapsed) real-id TraceGraph from a Runner. */
export function structureGraphFromRunner(runner: RunnerLike): TraceGraph {
  const trace = createTraceStructureRecorder();
  // Cast to the loose footprintjs StructureRecorder (same as viaStructureRecorder
  // + collapserFromRunner) so the walker's payloads — typed against the
  // serialized spec — feed the recorder without per-field re-typing.
  const recorder = trace.recorder as unknown as StructureRecorder;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const spec = runner.getSpec().buildTimeStructure as any;

  // `{ recurse: false }` — emit ONLY top-level stages + subflow-MOUNT events
  // (each carrying its full `subflowSpec`). `createTraceStructureRecorder`
  // expands those via `walkSubflowSpecInto`, which PATH-QUALIFIES every inner
  // node id (`compose` → `sf-system-prompt/compose`). That qualification is
  // what makes node ids match the runtime overlay's path-qualified stage ids
  // (so time-travel lights the path). Walking with full recursion instead would
  // emit inner stages as bare top-level ids (local) — which never match.
  // walkSubflowSpec now renders fan-outs (the agent's Context selector over its
  // 3 slots) as a merge-tree by default — each slot → the join stage, the
  // selector's direct "skip" edge suppressed. This is the true topology, so no
  // flag is needed; the runtime overlay still matches node ids exactly.
  for (const item of walkSubflowSpec(spec, '', { recurse: false })) {
    switch (item.kind) {
      case 'stage':
        recorder.onStageAdded?.({
          stageId: item.stageId,
          name: item.name,
          type: item.type,
          ...(item.isPausable !== undefined && { isPausable: item.isPausable }),
          spec: item.spec,
        });
        break;
      case 'edge':
        recorder.onEdgeAdded?.({
          from: item.from,
          to: item.to,
          kind: item.edgeKind,
          ...(item.label !== undefined && { label: item.label }),
        });
        break;
      case 'loop':
        recorder.onLoopEdgeAdded?.({ from: item.from, to: item.to });
        break;
      case 'subflow':
        recorder.onSubflowMounted?.({
          subflowId: item.subflowId,
          subflowName: item.subflowName,
          rootStageId: item.mountStageId,
          subflowSpec: item.subflowSpec,
          subflowPath: item.subflowPath,
        });
        break;
      case 'subflow-start':
        break;
    }
  }

  // Enrich each node with a VISUAL emphasis hint (+ a hero icon) derived from
  // its semantic role. agentfootprint owns "which id is a hero" (stageRole);
  // this bridge translates that into the renderer's generic `data.emphasis` /
  // `data.icon` channel, so explainable-ui stays domain-agnostic.
  const graph = trace.getGraph();
  for (const node of graph.nodes) {
    const role = stageRole(node.id);
    const data = node.data as Record<string, unknown>;
    const { localStageId } = splitStageId(node.id);

    const emphasis = emphasisForRole(role);
    if (emphasis !== undefined) data.emphasis = emphasis;

    // Only supply an icon when the stage didn't already declare one.
    if (data.icon === undefined) {
      const icon = iconForRole(localStageId, role);
      if (icon !== undefined) data.icon = icon;
    }

    // Size hierarchy (LLM biggest, plumbing smallest) — the renderer's
    // node-size resolver reads data.size and the StageNode scales its card.
    const size = sizeForRole(role);
    if (size !== undefined) data.size = size;

    // Render the 3 context slots as PILLS (distinct shape) — flip the node
    // type to the slot-pill renderer (MAIN_CHART_NODE_TYPES maps it). Scoped
    // to hero-slot ONLY (keying on isSubflow would catch every subflow). Do
    // NOT set data.selected — let the runtime overlay light pills per turn.
    if (role === 'hero-slot') {
      (node as { type?: string }).type = 'slotPill';
      const slotKind = slotKindForLocalId(localStageId);
      if (slotKind !== undefined) data.slotKind = slotKind;
    }
  }
  return graph;
}
