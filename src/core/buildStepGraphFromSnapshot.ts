/**
 * @deprecated FOR LIVE USE — use `LensSnapshotRecorder` instead, which
 * builds the StepGraph incrementally as the engine traverses (O(1) per
 * event, NO post-walk). This function walks the snapshot tree once
 * per call, which becomes O(N²) when invoked from a render loop.
 *
 * STILL VALID for offline / replay scenarios where you have a
 * snapshot from a completed run but no live event stream — e.g.,
 * loading a saved RuntimeSnapshot from disk to render.
 *
 * See `docs/design/lens-snapshot-recorder.md` for the full rationale
 * (the "Law 1" section explicitly forbids post-walking on the live path).
 *
 * `buildStepGraphFromSnapshot` — derives a Lens StepGraph from
 * footprintjs's canonical RuntimeSnapshot. Pure function, no state.
 *
 * Inputs:
 *   - footprintjs RuntimeSnapshot (`runner.getLastSnapshot()`)
 *
 * Outputs:
 *   - Lens StepGraph (nodes + edges) — same shape FlowchartRecorder
 *     produces today, but with structural info sourced from the
 *     canonical snapshot, not from typed events.
 *
 * What this function does NOT do:
 *   - Decorate nodes with payload (LLM tokens, tool args, context
 *     injections). That's a separate join step against typed events.
 *
 * Algorithm (one loop over the run's stages, `executionStages` — the
 * tree's list form or its linked `next` chain, read alike):
 *   1. Each StageSnapshot represents one stage. Inspect its
 *      `description` for composition kind:
 *        - "LLMCall: …"          → subflow node, primitiveKind=LLMCall
 *        - "Agent: …"            → subflow node, primitiveKind=Agent
 *        - "Sequence: …"         → subflow node, primitiveKind=Sequence
 *        - "Parallel: N-way fanout" → fork node + N fork-branch nodes
 *        - "Conditional: …"      → decision node + chosen branch
 *        - "Loop: …"             → subflow node + iteration edges
 *   2. Walk `flowMessages` for control-flow transitions (next, fork
 *      with `targetStage[]`, decision with chosen branch, loop).
 *   3. Move on to the next stage in run order.
 */

import type { StepGraph, StepNode, StepEdge } from 'agentfootprint/observe';
import { executionStages } from './utils/executionStages.js';

/** Footprintjs StageSnapshot — the runtime tree node shape. We only
 *  read fields the snapshot reliably populates; `unknown` for the rest.
 *  All fields optional so this matches footprintjs's RuntimeSnapshot
 *  even when fields are partially populated mid-traversal. */
interface StageSnapshot {
  id?: string;
  runtimeStageId?: string;
  name?: string;
  description?: string;
  subflowId?: string;
  flowMessages?: ReadonlyArray<FlowMessage>;
}

interface FlowMessage {
  type: 'next' | 'children' | 'subflow' | 'decision' | 'loop' | string;
  description?: string;
  timestamp?: number;
  targetStage?: string | readonly string[];
  count?: number;
}

interface RuntimeSnapshotLike {
  /** List form (footprintjs 13) or linked form (footprintjs 12, saved runs). */
  executionTree?: unknown;
}

/**
 * Build a StepGraph from a footprintjs snapshot. Returns an empty
 * graph (no nodes, no edges) if the snapshot is undefined or has no
 * executionTree (run hasn't started).
 */
export function buildStepGraphFromSnapshot(
  snapshot: RuntimeSnapshotLike | undefined,
): StepGraph {
  const stages = executionStages<StageSnapshot>(snapshot?.executionTree);
  if (stages.length === 0) {
    return { nodes: [], edges: [] };
  }
  const ctx: BuilderContext = {
    nodes: [],
    edges: [],
    runStartMs: stages[0]!.flowMessages?.[0]?.timestamp ?? 0,
  };
  for (let i = 0; i < stages.length; i++) visitOne(stages, i, [], ctx);
  return { nodes: ctx.nodes, edges: ctx.edges };
}

interface BuilderContext {
  nodes: StepNode[];
  edges: StepEdge[];
  runStartMs: number;
}

/** One stage, `stages[at]`; the stages after it are the ones that ran next. */
function visitOne(
  stages: readonly StageSnapshot[],
  at: number,
  parentPath: readonly string[],
  ctx: BuilderContext,
): void {
  const stage = stages[at]!;
  const primitiveKind = parsePrimitiveKind(stage.description);
  const isPrimitive = primitiveKind !== undefined;
  const subflowPath = stage.subflowId ? [...parentPath, stage.subflowId] : parentPath;
  const startOffsetMs = relTime(stage.flowMessages?.[0]?.timestamp, ctx.runStartMs);
  const stageRid = stage.runtimeStageId ?? stage.id ?? '';

  // Emit one subflow node per primitive-bearing stage. Plain
  // routing/wrapper stages (no description) don't get nodes — they're
  // structural plumbing.
  if (isPrimitive) {
    const node: StepNode = {
      id: stageRid,
      kind: 'subflow',
      label: stage.name ?? stage.id ?? 'unnamed',
      startOffsetMs,
      subflowPath: subflowPath.length > 0 ? subflowPath : ['__root__'],
      primitiveKind,
      isPrimitiveBoundary: true,
      ...(primitiveKind === 'Agent' ? { isAgentBoundary: true } : {}),
      runtimeStageId: stageRid,
    };
    ctx.nodes.push(node);
  }

  // Walk flowMessages for control-flow transitions originating at this
  // stage. The MOST IMPORTANT one for Parallel/fork detection: the
  // `children` message carries `targetStage: [branch1, branch2, ...]`.
  if (stage.flowMessages) {
    for (const msg of stage.flowMessages) {
      if (msg.type === 'children' && Array.isArray(msg.targetStage)) {
        // Parallel fork — synthesize one fork-branch node per child.
        for (const childId of msg.targetStage) {
          const childRid = `${childId}#${stageRid}`;
          ctx.nodes.push({
            id: childRid,
            kind: 'fork-branch',
            label: childId,
            startOffsetMs: relTime(msg.timestamp, ctx.runStartMs),
            subflowPath: [...subflowPath, childId],
            runtimeStageId: childRid,
          });
          ctx.edges.push({
            id: `${stageRid}->${childRid}`,
            from: stageRid,
            to: childRid,
            kind: 'fork-branch',
          });
        }
      } else if (msg.type === 'decision' && typeof msg.targetStage === 'string') {
        // Conditional — emit a decision-branch edge to the chosen target.
        ctx.edges.push({
          id: `${stageRid}->${msg.targetStage}`,
          from: stageRid,
          to: msg.targetStage,
          kind: 'decision-branch',
        });
      } else if (msg.type === 'loop' && typeof msg.targetStage === 'string') {
        ctx.edges.push({
          id: `${stageRid}->${msg.targetStage}#loop`,
          from: stageRid,
          to: msg.targetStage,
          kind: 'loop-iteration',
        });
      }
    }
  }

  // The run goes on to the next stage in order. The run ends at the
  // last stage.
  if (at + 1 < stages.length) {
    if (isPrimitive) {
      // Emit a `next` edge from THIS stage to the NEXT primitive node
      // we'll see (emitted when the loop reaches it).
      const nextPrimitive = findFirstPrimitive(stages, at + 1);
      if (nextPrimitive) {
        const nextRid = nextPrimitive.runtimeStageId ?? nextPrimitive.id ?? '';
        ctx.edges.push({
          id: `${stageRid}->${nextRid}`,
          from: stageRid,
          to: nextRid,
          kind: 'next',
        });
      }
    }
  }
}

/** The first stage from `from` on with a primitive description —
 *  i.e., the next StepNode that will be emitted. */
function findFirstPrimitive(stages: readonly StageSnapshot[], from: number): StageSnapshot | undefined {
  for (let i = from; i < stages.length; i++) {
    if (parsePrimitiveKind(stages[i]!.description) !== undefined) return stages[i];
  }
  return undefined;
}

const KNOWN_PRIMITIVES = new Set([
  'Agent',
  'LLMCall',
  'Sequence',
  'Parallel',
  'Conditional',
  'Loop',
]);

function parsePrimitiveKind(description: string | undefined): string | undefined {
  if (!description) return undefined;
  const colon = description.indexOf(':');
  if (colon < 0) return undefined;
  const prefix = description.slice(0, colon).trim();
  return KNOWN_PRIMITIVES.has(prefix) ? prefix : undefined;
}

function relTime(absMs: number | undefined, runStartMs: number): number {
  if (absMs === undefined) return 0;
  return Math.max(0, absMs - runStartMs);
}
