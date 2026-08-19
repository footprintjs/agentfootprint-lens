/**
 * skillTopologyPositions — where each skill sits on the debugger's canvas.
 *
 * Pure + framework-free, and deliberately NOT a second layout engine: it feeds
 * the ids and endpoints to `layoutSkillGraph` (the dagre pass `<SkillGraphFlow>`
 * already ships) and keeps only the node positions. The debugger draws its own
 * edges — declared and observed are different lines with different meanings,
 * and that distinction does not survive a generic edge list.
 *
 * Stability matters more than beauty here: the canvas re-renders on every
 * cursor move, so the layout must depend ONLY on the graph's shape (ids +
 * endpoints), never on which node is current. A layout that shifts when the
 * reader scrubs is a layout that cannot be read.
 */

import { layoutSkillGraph, sizeFor } from '../skillGraphFlowLayout.js';

/** The endpoints a layout needs — a structural subset of `SkillTopologyEdge`. */
export interface TopologyEdgeEndpoints {
  readonly from: string;
  readonly to: string;
}

export interface SkillNodePosition {
  readonly id: string;
  /** Top-left, in xyflow's coordinate space. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Lay the skills out top-to-bottom by routing depth — the same direction
 * `<SkillGraphFlow>` draws a declared graph in, so the two views of one graph
 * do not read as two different graphs.
 *
 * `nodeIds` is the authority on WHICH nodes exist — an edge naming an unknown
 * endpoint is skipped rather than conjuring a node, and a node with no edges
 * still gets a position (an unreached skill is part of the graph).
 *
 * @example
 * ```ts
 * const pos = skillTopologyPositions(['a', 'b'], [{ from: 'a', to: 'b' }]);
 * pos.get('b')!.y > pos.get('a')!.y; // laid out in flow order
 * ```
 */
export function skillTopologyPositions(
  nodeIds: readonly string[],
  edges: readonly TopologyEdgeEndpoints[],
): ReadonlyMap<string, SkillNodePosition> {
  const known = new Set(nodeIds);
  const laid = layoutSkillGraph(
    {
      nodes: nodeIds.map((id) => ({ id, kind: 'skill' as const })),
      edges: edges
        .filter((e) => known.has(e.from) && known.has(e.to) && e.from !== e.to)
        .map((e) => ({ from: e.from, to: e.to })),
    },
    { showStart: false, rankSep: 96, nodeSep: 28 },
  );

  const out = new Map<string, SkillNodePosition>();
  for (const n of laid.nodes) {
    out.set(n.id, { id: n.id, x: n.x, y: n.y, width: n.width, height: n.height });
  }
  // A node dagre never placed (it appeared only after the graph was built)
  // still needs a spot rather than stacking at the origin.
  let spare = 0;
  for (const id of nodeIds) {
    if (out.has(id)) continue;
    const { width, height } = sizeFor('skill');
    out.set(id, { id, x: -(width + 40), y: spare * (height + 24), width, height });
    spare += 1;
  }
  return out;
}
