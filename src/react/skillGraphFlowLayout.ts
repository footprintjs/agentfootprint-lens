/**
 * skillGraphFlowLayout — pure layout for the interactive skill-graph view.
 *
 * Takes the STRUCTURE that `agentfootprint`'s `skillGraph().build()` produces
 * (`{ nodes, edges }` — predicate diamonds + skill boxes, branch edges) and lays
 * it out top-to-bottom with dagre into absolute positions xyflow can render.
 *
 * Pure + framework-free: no React, no agentfootprint import. The prop shapes are
 * STRUCTURAL copies of agentfootprint's `SkillNode` / `SkillEdge`, so a consumer
 * passes `graph.nodes` / `graph.edges` straight through (TypeScript structural
 * typing makes them assignable) without the lens taking a hard dependency on the
 * exact agentfootprint types. Keeping the layout here (not in the component) means
 * it unit-tests without rendering — the lens "pure core + thin React" convention.
 */

import dagre from 'dagre';

/** A drawn node — mirrors agentfootprint's `SkillNode`. */
export interface SkillGraphNodeView {
  readonly id: string;
  readonly kind: 'predicate' | 'skill';
  readonly label?: string;
}

/** A drawn edge — mirrors agentfootprint's `SkillEdge`. `from: null` = START. */
export interface SkillGraphEdgeView {
  readonly from: string | null;
  readonly to: string;
  /** `'model'` edges draw dashed (model-reachable via read_skill); others solid. */
  readonly kind?: string;
  readonly label?: string;
}

export interface SkillGraphInput {
  readonly nodes: readonly SkillGraphNodeView[];
  readonly edges: readonly SkillGraphEdgeView[];
}

/** The synthetic START node id (a turn's entry point). */
export const SKILL_GRAPH_START_ID = '__start__';

export type FlowNodeKind = 'start' | 'predicate' | 'skill';

/** A positioned node ready for xyflow (`position` = top-left, not dagre center). */
export interface SkillFlowNode {
  readonly id: string;
  readonly kind: FlowNodeKind;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SkillFlowEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly label?: string;
  readonly dashed: boolean;
}

/** Box sizes per node kind — predicate is taller (a diamond's usable area is its
 *  inscribed rectangle, ~half), skill is a wide pill, start is a small chip. */
const SIZES: Record<FlowNodeKind, { width: number; height: number }> = {
  start: { width: 104, height: 40 },
  predicate: { width: 188, height: 96 },
  skill: { width: 192, height: 56 },
};

export function sizeFor(kind: FlowNodeKind): { width: number; height: number } {
  return SIZES[kind];
}

export interface SkillGraphLayoutOptions {
  /** Render the synthetic START chip + its entry edges. Default `true`. */
  readonly showStart?: boolean;
  /** Vertical gap between ranks. Default `64`. */
  readonly rankSep?: number;
  /** Horizontal gap between siblings. Default `40`. */
  readonly nodeSep?: number;
}

/**
 * Lay the skill graph out top-to-bottom. Dangling edges (endpoint not in
 * `nodes`) are skipped rather than throwing — a renderer should draw what it can.
 */
export function layoutSkillGraph(
  graph: SkillGraphInput,
  opts: SkillGraphLayoutOptions = {},
): { nodes: SkillFlowNode[]; edges: SkillFlowEdge[] } {
  const showStart = opts.showStart ?? true;

  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({
    rankdir: 'TB',
    ranksep: opts.rankSep ?? 64,
    nodesep: opts.nodeSep ?? 40,
    marginx: 8,
    marginy: 8,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // NOTE: dagre writes the computed x/y back ONTO the label object passed to
  // setNode. Pass a FRESH object per node — sharing one `SIZES[kind]` object
  // across nodes makes dagre's positions collide (every node of a kind reads the
  // last write). Spread to clone.
  const usesStart = showStart && graph.edges.some((e) => e.from === null);
  if (usesStart) g.setNode(SKILL_GRAPH_START_ID, { ...SIZES.start });
  for (const n of graph.nodes) g.setNode(n.id, { ...SIZES[n.kind] });

  const flowEdges: SkillFlowEdge[] = [];
  let i = 0;
  for (const e of graph.edges) {
    if (e.from === null && !usesStart) continue; // start hidden → drop entry edges
    const source = e.from === null ? SKILL_GRAPH_START_ID : e.from;
    if (!g.hasNode(source) || !g.hasNode(e.to)) continue; // skip dangling endpoints
    const id = `sge${i++}:${source}->${e.to}`;
    g.setEdge(source, e.to, {}, id);
    flowEdges.push({ id, source, target: e.to, label: e.label, dashed: e.kind === 'model' });
  }

  dagre.layout(g);

  const toFlow = (id: string, kind: FlowNodeKind, label: string): SkillFlowNode => {
    const p = g.node(id) as { x: number; y: number; width: number; height: number };
    return {
      id,
      kind,
      label,
      x: p.x - p.width / 2, // dagre centers; xyflow positions by top-left
      y: p.y - p.height / 2,
      width: p.width,
      height: p.height,
    };
  };

  const nodes: SkillFlowNode[] = [];
  if (usesStart) nodes.push(toFlow(SKILL_GRAPH_START_ID, 'start', '▶ start'));
  for (const n of graph.nodes) nodes.push(toFlow(n.id, n.kind, n.label ?? n.id));

  return { nodes, edges: flowEdges };
}
