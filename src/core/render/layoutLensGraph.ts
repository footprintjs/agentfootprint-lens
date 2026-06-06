/**
 * layoutLensGraph — pure orchestrator: LensGroupOutput → laid-out xyflow.
 *
 * Layer 3.2 (pure layout orchestrator) / Lens v0.1 translator pipeline.
 *
 * Pipeline
 * ────────
 *
 *   LensGroupOutput
 *     │
 *     ▼  toReactFlow (L3.1)
 *   Node[] + Edge[]              (xyflow shape, no positions)
 *     │
 *     ▼  defaultSize (L3.1)
 *   SizedNode[]                  (per-node width/height hints)
 *     │
 *     ▼  dagreLayout (existing pure layout)
 *   Positioned Node[] + Edge[]   (ready for <ReactFlow>)
 *
 * Why orchestrate here and not in the hook
 * ────────────────────────────────────────
 *   The hook is a thin React shim that subscribes to the runner and
 *   calls this function. Keeping the data pipeline OUTSIDE the hook
 *   makes it framework-agnostic: a Vue / D3 consumer running on the
 *   same upstream `LensGroupOutput` can call `layoutLensGraph` to
 *   get a positioned graph without dragging in any React deps. The
 *   `@xyflow/react` import is the only React-adjacent piece, and
 *   it's a pure data type (`Node` / `Edge`) — no DOM, no JSX.
 *
 * Pure function — no closures, no module state.
 */

import type { Edge, Node } from '@xyflow/react';
import { dagreLayout, type DagreLayoutOptions } from '../../react/layout/dagreLayout.js';
import type { LensGroupOutput, LensNode } from '../translate/types.js';
import {
  defaultSize,
  toReactFlow,
  type LensReactFlowEdgeData,
  type LensReactFlowNodeData,
} from './toReactFlow.js';

export interface LayoutLensGraphOptions {
  readonly direction?: DagreLayoutOptions['direction'];
  readonly rankSep?: DagreLayoutOptions['rankSep'];
  readonly nodeSep?: DagreLayoutOptions['nodeSep'];
  readonly edgeSep?: DagreLayoutOptions['edgeSep'];
  /**
   * Per-node size override. Receives the source `LensNode` so the
   * consumer can theme by `primitiveKind` or `kind`. Falls back to
   * `defaultSize` when the override returns `undefined` — lets
   * consumers tweak ONE kind without re-implementing all six.
   */
  readonly sizeOverride?: (
    node: LensNode,
  ) => { width: number; height: number } | undefined;
  /**
   * When true, augment the laid-out graph with two synthetic "user"
   * nodes — one above the root, one below the exit — connected to
   * the composition by plain `next` edges. Reflects the Lens v0.1
   * mental model: every run is "user asks → composition runs → user
   * gets answer back".
   *
   * Default is `false` because the orchestrator is a general-purpose
   * layout tool — headless / preview / non-Lens consumers should NOT
   * receive synthetic user actors by surprise. The `<LensFlow>`
   * component flips it on as its UX convention.
   *
   * The synthetic nodes use xyflow `type: 'lensUser'`; consumers
   * registering custom `nodeTypes` should include a renderer for
   * that type (the default `<LensFlow>` ships one).
   */
  readonly withUserFrame?: boolean;
}

/** Sentinel node IDs for the optional user frame. */
export const USER_IN_NODE_ID = '__lens_user_in';
export const USER_OUT_NODE_ID = '__lens_user_out';

export interface LayoutLensGraphResult {
  readonly nodes: Node<LensReactFlowNodeData>[];
  readonly edges: Edge<LensReactFlowEdgeData>[];
}

/** Layout size for synthetic user actor nodes in the user frame. */
const USER_NODE_SIZE = { width: 100, height: 44 } as const;

export function layoutLensGraph(
  output: LensGroupOutput,
  options: LayoutLensGraphOptions = {},
): LayoutLensGraphResult {
  const { nodes: unpositionedNodes, edges } = toReactFlow(output);
  const withUserFrame = options.withUserFrame ?? false;

  const sized = unpositionedNodes.map((node, i) => {
    const sourceLensNode = output.nodes[i]!;
    const size =
      options.sizeOverride?.(sourceLensNode) ?? defaultSize(sourceLensNode);
    return { node, width: size.width, height: size.height };
  });

  // The user-frame nodes are added AFTER layout — dagre cannot rank
  // an edge whose endpoint is a compound parent (the Parallel
  // container), so handing it `user-in → container` crashes the
  // ranker. Position user-in above the laid-out bounding box and
  // user-out below; xyflow handles edges to/from compound parents
  // at render time without complaint.

  // dagre cannot rank edges whose endpoints are in a compound parent/
  // child relationship — it throws "Cannot set properties of undefined
  // (setting 'rank')" because the compound parent is not a leaf in the
  // ranking graph. The data layer keeps these edges (consumers may
  // theme them as decorative fork/decision arrows); the layout step
  // routes them around dagre. The compound containment itself supplies
  // the visual "parent contains child" cue, so dagre layout for the
  // remaining edges is sufficient to position the children.
  const parentIdByNodeId = new Map<string, string>();
  for (const n of unpositionedNodes) {
    if (n.parentId !== undefined) parentIdByNodeId.set(n.id, n.parentId);
  }
  const layoutEdges = edges.filter(
    (e) =>
      parentIdByNodeId.get(e.target) !== e.source &&
      parentIdByNodeId.get(e.source) !== e.target,
  );

  const positionedNodes = dagreLayout(sized, layoutEdges, {
    ...(options.direction !== undefined && { direction: options.direction }),
    ...(options.rankSep !== undefined && { rankSep: options.rankSep }),
    ...(options.nodeSep !== undefined && { nodeSep: options.nodeSep }),
    ...(options.edgeSep !== undefined && { edgeSep: options.edgeSep }),
  }) as Node<LensReactFlowNodeData>[];

  // dagre lays out children at positions RELATIVE to their parent group,
  // but the parent's `style.width/height` defaults from `defaultSize`
  // don't account for the actual child bounding box — so xyflow may
  // render the compound container too small to hold its children. Walk
  // each group, compute the bounding box of its (now-positioned)
  // children, and resize the container's style to fit. Padding gives
  // breathing room for borders and label chrome.
  const PADDING = { top: 36, right: 24, bottom: 24, left: 24 };
  const sizedById = new Map(sized.map((s) => [s.node.id, s]));
  const resizedNodes = positionedNodes.map((node) => {
    if (node.type !== 'group') return node;
    const children = positionedNodes.filter((c) => c.parentId === node.id);
    if (children.length === 0) return node;
    let maxRight = 0;
    let maxBottom = 0;
    for (const child of children) {
      const childSized = sizedById.get(child.id);
      if (!childSized) continue;
      const right = child.position.x + childSized.width;
      const bottom = child.position.y + childSized.height;
      if (right > maxRight) maxRight = right;
      if (bottom > maxBottom) maxBottom = bottom;
    }
    return {
      ...node,
      style: {
        ...(node.style ?? {}),
        width: maxRight + PADDING.right + PADDING.left,
        height: maxBottom + PADDING.bottom + PADDING.top,
      },
    };
  });

  if (!withUserFrame) {
    return { nodes: resizedNodes, edges };
  }

  // Post-layout user-frame positioning. Compute the bounding box of
  // top-level (no parentId) nodes, then place user-in centered above
  // and user-out centered below, with vertical gap = USER_GAP.
  const USER_GAP = 60;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const n of resizedNodes) {
    if (n.parentId !== undefined) continue;
    const sizedEntry = sizedById.get(n.id);
    const w = (n.style as { width?: number } | undefined)?.width
      ?? sizedEntry?.width
      ?? 180;
    const h = (n.style as { height?: number } | undefined)?.height
      ?? sizedEntry?.height
      ?? 56;
    if (n.position.x < minX) minX = n.position.x;
    if (n.position.y < minY) minY = n.position.y;
    if (n.position.x + w > maxX) maxX = n.position.x + w;
    if (n.position.y + h > maxY) maxY = n.position.y + h;
  }
  const centerX = (minX + maxX) / 2 - USER_NODE_SIZE.width / 2;
  const userIn: Node<LensReactFlowNodeData> = {
    id: USER_IN_NODE_ID,
    type: 'lensUser',
    position: { x: centerX, y: minY - USER_GAP - USER_NODE_SIZE.height },
    data: { label: 'user', primitiveKind: 'Agent', userActor: 'in' },
  };
  const userOut: Node<LensReactFlowNodeData> = {
    id: USER_OUT_NODE_ID,
    type: 'lensUser',
    position: { x: centerX, y: maxY + USER_GAP },
    data: { label: 'user', primitiveKind: 'Agent', userActor: 'out' },
  };
  // user-out attaches to the composition's EXIT node (Parallel's
  // Merge, Conditional's Converge, or the inner exit for chains) so
  // the "user back" arrow originates from the right place visually.
  // Falls back to rootNodeId for leaves where entry == exit.
  const exitNodeId = output.exitNodeId ?? output.rootNodeId;
  const userEdges = [
    {
      id: '__lens_edge_user_in',
      source: USER_IN_NODE_ID,
      target: output.rootNodeId,
      type: 'default' as const,
      data: { kind: 'next' as const },
    },
    {
      id: '__lens_edge_user_out',
      source: exitNodeId,
      target: USER_OUT_NODE_ID,
      type: 'default' as const,
      data: { kind: 'next' as const },
    },
  ];
  return {
    nodes: [userIn, ...resizedNodes, userOut],
    edges: [...edges, ...userEdges],
  };
}
