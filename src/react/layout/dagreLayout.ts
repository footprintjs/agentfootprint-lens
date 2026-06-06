/**
 * dagreLayout — pure fn `(nodes, edges) → positioned nodes`.
 *
 * Pattern: thin wrapper around dagre's `graphlib` layout. Lens hands
 *          over its node-set (User actor + agent containers + LLM /
 *          Tool / ContextBin children) and edge-set (asks / forwards /
 *          answers / loop-back / fork-branch); dagre returns one
 *          coordinate per node, computed top-to-bottom.
 * Role:    Replaces the hand-tuned position constants that previously
 *          lived in `RunTreeFlow.buildFlow`. One layout path now
 *          handles Sequence (vertical chain), Parallel (auto fan-out),
 *          Loop (self-edge + back-edge), Conditional (single chosen
 *          branch), and arbitrary nesting — anything we feed dagre,
 *          dagre lays out.
 *
 * Why dagre and not elk: dagre is ~12kb gzipped, layered-tree is the
 * shape we always want, and xyflow has well-trodden integration docs
 * for it. ELK is more powerful but ~10× the bundle and overkill for
 * the patterns Lens actually renders.
 *
 * The function is pure: same input → same output, no side effects.
 * That keeps it testable in isolation and — crucially — keeps the
 * step-slider sync logic unchanged. Selection / focus ring uses node
 * IDs and ViewModel state; coordinates are purely visual.
 */

import dagre from 'dagre';
import type { Edge, Node } from '@xyflow/react';

/** Per-node size hint. Without these dagre uses 0×0 boxes and arrows
 *  collapse to a point. We supply the same dimensions xyflow uses for
 *  rendering so the layout matches the painted result. */
export interface SizedNode<T extends Node = Node> {
  readonly node: T;
  readonly width: number;
  readonly height: number;
}

export interface DagreLayoutOptions {
  /** Layout direction. `'TB'` (top-to-bottom) is the Lens default —
   *  matches "User asks → pipeline → User answers" reading order.
   *  Use `'LR'` for left-to-right when displaying very long chains
   *  side-by-side. */
  readonly direction?: 'TB' | 'BT' | 'LR' | 'RL';
  /** Vertical spacing between rank layers (px). */
  readonly rankSep?: number;
  /** Horizontal spacing between siblings within a rank (px). */
  readonly nodeSep?: number;
  /** Spacing between edges (px). */
  readonly edgeSep?: number;
}

/**
 * Lay out the given nodes + edges and return new nodes with computed
 * `position` (top-left). Edges pass through unchanged — xyflow handles
 * routing once nodes are placed.
 *
 * @param sized   nodes paired with their rendered width/height
 * @param edges   edges (only `.source` / `.target` are read)
 * @param options layout tuning
 */
export function dagreLayout(
  sized: readonly SizedNode[],
  edges: readonly Edge[],
  options: DagreLayoutOptions = {},
): Node[] {
  const direction = options.direction ?? 'TB';
  const rankSep = options.rankSep ?? 80;
  const nodeSep = options.nodeSep ?? 60;
  const edgeSep = options.edgeSep ?? 20;

  const g = new dagre.graphlib.Graph({ compound: true });
  g.setGraph({ rankdir: direction, ranksep: rankSep, nodesep: nodeSep, edgesep: edgeSep });
  g.setDefaultEdgeLabel(() => ({}));

  // Register nodes WITH dimensions — dagre needs both to compute valid
  // coordinates. xyflow Parent/child wiring (parentId) is preserved as
  // dagre compound parent links so children stay inside their parent's
  // bounding box (single-agent triangle layout uses this).
  for (const { node, width, height } of sized) {
    g.setNode(node.id, { width, height });
    if (node.parentId) {
      g.setParent(node.id, node.parentId);
    }
  }

  // Register edges. dagre ignores edges whose endpoints aren't both
  // present in the graph (defensive — xyflow filters orphans elsewhere).
  for (const e of edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }

  dagre.layout(g);

  // dagre returns center coordinates; xyflow wants top-left. Convert by
  // subtracting half the width/height. Children with `parentId` get
  // coordinates relative to the parent (xyflow convention) — dagre
  // produces absolute coords, so we subtract the parent's top-left.
  const out: Node[] = [];
  for (const { node, width, height } of sized) {
    const laidOut = g.node(node.id);
    if (!laidOut) {
      // Node wasn't laid out (rare edge case — orphaned node). Keep
      // its original position so we don't drop it.
      out.push(node);
      continue;
    }
    let x = laidOut.x - width / 2;
    let y = laidOut.y - height / 2;
    if (node.parentId) {
      const parent = g.node(node.parentId);
      const parentSized = sized.find((s) => s.node.id === node.parentId);
      if (parent && parentSized) {
        x -= parent.x - parentSized.width / 2;
        y -= parent.y - parentSized.height / 2;
      }
    }
    out.push({ ...node, position: { x, y } });
  }
  return out;
}
