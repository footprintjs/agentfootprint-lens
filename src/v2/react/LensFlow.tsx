/**
 * LensFlow — the canonical Lens v0.1 flowchart renderer.
 *
 * Layer 3.4 (React component) / Lens v0.1 translator pipeline.
 *
 *   <LensFlow runner={runner} selectedRuntimeStageId={cursorStageId} />
 *
 * Renders an agentfootprint Runner's build-time composition graph as
 * a React Flow (xyflow) graph, wrapped in a `user → composition →
 * user` frame and (optionally) decorated with a slider-driven node
 * highlight.
 *
 * Data path
 * ─────────
 *   `runner.getUIGroupWith(lensGroupTranslator)` returns a UI-agnostic
 *   `LensGroupOutput`. `useLensRenderGraph` lays it out (toReactFlow
 *   + dagre + user-frame augmentation). This component mounts
 *   `<ReactFlow>` over the result and applies a `selected` overlay
 *   class to the node whose composition stageId matches the slider
 *   cursor.
 *
 * What this component IS
 * ──────────────────────
 *   - The single canonical xyflow consumer of the L2 translator
 *     pipeline. Older paths (RunTreeFlow, DrillableFlowchart) were
 *     deleted in L4.
 *   - The runtime overlay sits HERE, not in the data layer: the
 *     composition graph is static (no growth as events fire), and
 *     the slider cursor merely paints one node "active". Keeping
 *     overlay decoration local to the renderer means Vue / D3
 *     consumers building on top of `layoutLensGraph` get the same
 *     data without paying for a React-only feature.
 *
 * Consumer extension
 * ──────────────────
 *   `nodeTypes` is forwarded to ReactFlow so consumers can swap the
 *   default `lensStage` / `lensUser` renderers. The defaults are
 *   intentionally plain — pill-shaped cards with kind chip + label —
 *   so out-of-the-box Lens looks reasonable without consumer wiring.
 */

import React, { memo, useMemo } from 'react';
import {
  Background,
  Controls,
  type NodeProps,
  type Node,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { TraceFlow, type TraceGraph } from 'footprint-explainable-ui/flowchart';
import type { Runner } from 'agentfootprint';
import {
  useLensRenderGraph,
  type LayoutLensGraphOptions,
} from './hooks/useLensRenderGraph.js';
import type { LensReactFlowNodeData } from '../core/render/toReactFlow.js';

export interface LensFlowProps {
  /** Agentfootprint runner whose build-time composition graph Lens draws. */
  readonly runner: Runner;
  /** Layout / sizing overrides forwarded to dagre + user-frame toggle. */
  readonly layoutOptions?: LayoutLensGraphOptions;
  /**
   * Consumer-supplied node renderer map. Merged on top of the default
   * `lensStage` + `lensUser` renderers — pass
   * `{ lensStage: MyCard }` to override stage rendering wholesale.
   */
  readonly nodeTypes?: NodeTypes;
  /**
   * Slider cursor's `runtimeStageId` (format
   * `[subflowPath/]stageId#executionIndex`). LensFlow strips the
   * `#N` suffix + subflow prefix to recover the local stageId, then
   * highlights the chart node whose composition id matches. When
   * unset, no node is highlighted. The cursor is a runtime concept;
   * the chart shape itself stays static.
   */
  readonly selectedRuntimeStageId?: string;
  /**
   * Whether to render `<Controls>` (zoom / fit-view). Default `true`.
   */
  readonly showControls?: boolean;
  /**
   * Whether to render `<Background>` (dot pattern). Default `true`.
   */
  readonly showBackground?: boolean;
}

/**
 * Map a slider cursor `runtimeStageId` to a chart node id.
 *
 * Two cases:
 *
 *   1. Cursor has a subflow path (e.g. `legal/call-llm#19`) — the
 *      cursor is INSIDE a composition member. The first subflow
 *      segment is the engine's subflowId, which matches a child
 *      LensNode's id suffix (the per-kind translators stamp
 *      children with `kind:id` where `id` comes from the member's
 *      composition id == engine subflowId).
 *
 *   2. Cursor has NO subflow path (e.g. `seed#0`, `merge#21`,
 *      `__root__#0`) — the cursor is on a top-level engine stage
 *      (seed/fork/merge for a Parallel root, the root itself, etc.).
 *      In that case the chart's `rootNodeId` is the right highlight
 *      target — the visible top-level box owns the slider position.
 */
function matchCursorToNodeId(
  runtimeStageId: string | undefined,
  nodes: readonly { id: string }[],
  rootNodeId: string,
): string | undefined {
  if (!runtimeStageId) return undefined;
  const noSuffix = runtimeStageId.split('#')[0] ?? runtimeStageId;
  const segments = noSuffix.split('/');
  if (segments.length >= 2) {
    const subflowId = segments[0]!;
    const match = nodes.find((n) => n.id.endsWith(`:${subflowId}`));
    if (match) return match.id;
  }
  // Top-level engine stage → highlight the root.
  return rootNodeId;
}

const DefaultStageNode = memo<NodeProps<Node<LensReactFlowNodeData & { selected?: boolean }>>>(
  function DefaultStageNode({ data }) {
    const selected = data.selected === true;
    return (
      <div
        style={{
          padding: '8px 12px',
          background: selected ? '#fffbeb' : '#ffffff',
          border: `2px solid ${selected ? '#f59e0b' : '#d1d5db'}`,
          borderRadius: 8,
          minWidth: 140,
          boxShadow: selected
            ? '0 0 0 3px rgba(245, 158, 11, 0.25)'
            : '0 1px 2px rgba(0,0,0,0.05)',
          fontFamily: 'system-ui, sans-serif',
          transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
        }}
      >
        <div
          style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: selected ? '#b45309' : '#6b7280',
            marginBottom: 2,
          }}
        >
          {data.primitiveKind}
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>
          {data.label}
        </div>
      </div>
    );
  },
);

const DefaultUserNode = memo<NodeProps<Node<LensReactFlowNodeData>>>(
  function DefaultUserNode({ data }) {
    return (
      <div
        style={{
          padding: '6px 14px',
          background: '#eef2ff',
          border: '1px solid #6366f1',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          color: '#3730a3',
          fontFamily: 'system-ui, sans-serif',
          letterSpacing: '0.04em',
          textTransform: 'lowercase',
        }}
      >
        {data.label}
        {data.userActor === 'out' ? ' ←' : ' →'}
      </div>
    );
  },
);

const DEFAULT_NODE_TYPES: NodeTypes = {
  lensStage: DefaultStageNode,
  lensUser: DefaultUserNode,
};

export const LensFlow: React.FC<LensFlowProps> = ({
  runner,
  layoutOptions,
  nodeTypes,
  selectedRuntimeStageId,
  showControls = true,
  showBackground = true,
}) => {
  // LensFlow defaults the user-frame ON — it's the Lens UX
  // convention. Consumers can override via `layoutOptions`.
  const effectiveLayoutOptions = useMemo(
    () => ({ withUserFrame: true, ...(layoutOptions ?? {}) }),
    [layoutOptions],
  );
  const { nodes, edges, rootNodeId } = useLensRenderGraph(runner, effectiveLayoutOptions);

  // Decorate the laid-out nodes with a `selected` flag derived from
  // the slider cursor. xyflow re-renders only the nodes whose data
  // identity changed, so the highlight transition is cheap. We
  // compare the cursor's local stageId against each node id's suffix
  // (after the kind prefix) — matches composition ids produced by
  // `makeRootNodeId(kind, id)` without re-bundling the kind here.
  const selectedNodeId = matchCursorToNodeId(
    selectedRuntimeStageId,
    nodes,
    rootNodeId,
  );
  const decoratedNodes = useMemo(() => {
    if (!selectedNodeId) return nodes;
    return nodes.map((n) => {
      if (n.id !== selectedNodeId) return n;
      // Group nodes use xyflow's built-in renderer which doesn't read
      // `data.selected` — apply the highlight via inline style on the
      // node itself. Stage / user nodes read `data.selected` in their
      // custom renderer.
      if (n.type === 'group') {
        return {
          ...n,
          style: {
            ...(n.style ?? {}),
            border: '2px solid #f59e0b',
            boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.25)',
            background: 'rgba(245, 158, 11, 0.08)',
          },
          data: { ...n.data, selected: true },
        };
      }
      return { ...n, data: { ...n.data, selected: true } };
    });
  }, [nodes, selectedNodeId]);

  // xyflow treats `nodeTypes` as identity-keyed: a new object on
  // every render forces ReactFlow to remount every custom node
  // component. Memoise so consumer-supplied overrides combine
  // stably with the defaults.
  const mergedNodeTypes: NodeTypes = useMemo(
    () => (nodeTypes ? { ...DEFAULT_NODE_TYPES, ...nodeTypes } : DEFAULT_NODE_TYPES),
    [nodeTypes],
  );

  // The lens nodes carry agent-domain data (LensReactFlowNodeData) and
  // are pre-laid-out by dagre. Pass them through explainable-ui's
  // <TraceFlow> using `layout="passthrough"` (no re-layout) and our
  // own `nodeTypes`. The new TraceFlow contract (since v0.20) passes
  // any node with a non-default `type` through unchanged — so our
  // 'lensStage' / 'lensUser' / 'group' nodes reach xyflow's nodeTypes
  // registry intact, and the consumer's `<FootprintTheme>` cascade
  // (if any) automatically applies to the chart.
  //
  // We cast through `unknown` because LensReactFlowNodeData and
  // TraceNodeData are structurally compatible (both extend
  // `Record<string, unknown>`) but not name-compatible. The runtime
  // shape passes; TS only complains about field names that don't
  // exist on the lens side.
  const graph = useMemo(
    () => ({ nodes: decoratedNodes, edges }) as unknown as TraceGraph,
    [decoratedNodes, edges],
  );

  return (
    <TraceFlow
      graph={graph}
      layout="passthrough"
      nodeTypes={mergedNodeTypes}
    >
      {showBackground && <Background />}
      {showControls && <Controls />}
    </TraceFlow>
  );
};
