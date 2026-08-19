/**
 * `selectSkillTopology` — the skill graph as it stands AT one beat: which
 * nodes the run touched, which edges are the author's and which the run was
 * observed to take, and what state each node is in right now.
 *
 * Pattern: pure function over `selectSkillRoute`'s record + one {@link SkillBeat}.
 *          Space, where `selectSkillBeats` is time. No framework, no state.
 * Role:    the headless half of the debugger's topology canvas. The canvas
 *          places these nodes and paints these states; it decides nothing.
 *
 * DECLARED vs OBSERVED — the distinction the whole canvas rests on:
 *
 *   DECLARED  an edge the AUTHOR drew. On the record it comes from
 *             `context.evaluated`'s `routing[]` provenance, which names an
 *             edge only once it FIRES — so the declared set a recording
 *             carries is a LOWER BOUND on the graph that was built. A
 *             consumer holding the built graph can pass the rest in through
 *             {@link SelectSkillTopologyArgs.declaredEdges}; without it, the
 *             view must say the topology is partial rather than imply the
 *             author drew only what fired. {@link SkillTopology.declaredSource}
 *             is that flag, so no caller has to remember the rule.
 *   OBSERVED  a hop the CURSOR was seen to take, with the cause that moved it.
 *             An observed edge with no declared twin is the interesting case:
 *             the model routed somewhere the recording never saw declared.
 *
 * They are one edge row with two booleans rather than two lists, because a
 * view that draws them as two lists draws the common case — an author's edge
 * that fired — twice.
 */

import type { SkillBeat } from './selectSkillBeats.js';
import type { SkillCursorCause, SkillHopRef, SkillRoute } from './selectSkillRoute.js';

/**
 * What a node is, at the beat being shown. One value, in precedence order:
 *
 *   `'current'`    the cursor stands here.
 *   `'refused'`    the model asked to go here on this beat and the gate said no.
 *   `'reachable'`  a TYPED reachable set named it (see `SkillReachableSet`).
 *   `'visited'`    the cursor stood here earlier in the run.
 *   `'idle'`       the catalog listed it; the run has not been there.
 *
 * `'model-picked'` is deliberately NOT in this list: a picked node is also the
 * current one, and a state machine that has to choose between the two loses a
 * fact. It rides {@link SkillTopologyNode.pickedByModel} instead.
 */
export type SkillNodeState = 'current' | 'refused' | 'reachable' | 'visited' | 'idle';

export interface SkillTopologyNode {
  readonly id: string;
  /** The catalog description, verbatim — the text the model read. */
  readonly description?: string;
  readonly state: SkillNodeState;
  /** The cursor moved here on this beat because the MODEL picked it. */
  readonly pickedByModel: boolean;
  /** The gate refused a move here on this beat. */
  readonly refusedHere: boolean;
  /** The cursor stood here at some point in the WHOLE run (not just so far) —
   *  `route.nodes[].visited`, kept so a view can dim never-entered skills. */
  readonly visitedInRun: boolean;
}

export interface SkillTopologyEdge {
  /** `from->to` — stable across beats, so a canvas can key on it. */
  readonly id: string;
  readonly from: string;
  readonly to: string;
  /** The author drew this edge (as far as the record shows — see the header). */
  readonly declared: boolean;
  /** The cursor was observed to take it. */
  readonly observed: boolean;
  readonly label?: string;
  readonly triggerKind?: string;
  /** What moved the cursor along it, when it was observed. */
  readonly by?: SkillCursorCause;
  /** Every (turn, iteration) it was taken on. Empty for a never-taken edge. */
  readonly takenAt: readonly SkillHopRef[];
  /** THIS beat is the hop along this edge. */
  readonly active: boolean;
}

export interface SkillTopology {
  readonly nodes: readonly SkillTopologyNode[];
  readonly edges: readonly SkillTopologyEdge[];
  /**
   * Where the declared edges came from:
   *   `'recording'` the log's `routing[]` only — a LOWER BOUND, and a view
   *                 must say so.
   *   `'graph'`     the caller passed the built graph's edges — complete.
   *   `'none'`      the recording named no declared edge and none was passed.
   */
  readonly declaredSource: 'recording' | 'graph' | 'none';
}

/** A declared edge as a caller supplies it (`graph.edges`, `from !== null`). */
export interface DeclaredEdgeInput {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly triggerKind?: string;
}

export interface SelectSkillTopologyArgs {
  readonly route: SkillRoute;
  /** The beat being shown. `undefined` = before the run's first routing stop:
   *  every node is `'idle'` and no edge is active, which is the truth then. */
  readonly beat?: SkillBeat;
  /**
   * The author's edges, from the BUILT graph — what a recording cannot carry.
   * A consumer holding `skillGraph().build()` passes
   * `graph.edges.filter((e) => e.from !== null)`.
   */
  readonly declaredEdges?: readonly DeclaredEdgeInput[];
}

/**
 * Fold the record + one beat into the drawable graph.
 *
 * @example
 * ```ts
 * const topo = selectSkillTopology({ route, beat });
 * topo.nodes.find((n) => n.state === 'current')?.id;   // 'billing'
 * topo.edges.filter((e) => e.observed && !e.declared); // the model's own hops
 * topo.declaredSource;                                 // 'recording' → partial
 * ```
 */
export function selectSkillTopology({
  route,
  beat,
  declaredEdges,
}: SelectSkillTopologyArgs): SkillTopology {
  const visitedSoFar = new Set(beat?.visited ?? []);
  const reachable = new Set(beat?.reachable?.ids ?? []);
  const refused = new Set(beat?.refusedIds ?? []);
  const current = beat?.cursorSkillId;

  const edges = new Map<string, {
    from: string;
    to: string;
    declared: boolean;
    observed: boolean;
    label?: string;
    triggerKind?: string;
    by?: SkillCursorCause;
    takenAt: readonly SkillHopRef[];
  }>();

  const put = (from: string, to: string): NonNullable<ReturnType<typeof edges.get>> => {
    const id = `${from}->${to}`;
    let row = edges.get(id);
    if (row === undefined) {
      row = { from, to, declared: false, observed: false, takenAt: [] };
      edges.set(id, row);
    }
    return row;
  };

  // Declared first, so an author's caption survives the observed merge.
  const declaredRows = declaredEdges ?? route.declaredEdges;
  for (const e of declaredRows) {
    const row = put(e.from, e.to);
    row.declared = true;
    if (e.label !== undefined) row.label = e.label;
    if (e.triggerKind !== undefined) row.triggerKind = e.triggerKind;
  }
  // Anything the RECORDING declared is true regardless of what was passed in:
  // a caller's list can be stale, but an edge that fired demonstrably exists.
  if (declaredEdges !== undefined) {
    for (const e of route.declaredEdges) {
      const row = put(e.from, e.to);
      row.declared = true;
      if (row.label === undefined && e.label !== undefined) row.label = e.label;
      if (row.triggerKind === undefined && e.triggerKind !== undefined) {
        row.triggerKind = e.triggerKind;
      }
    }
  }

  for (const e of route.observedEdges) {
    // A cold start has no `from` — it is an entry, not an edge between nodes.
    if (e.from === undefined) continue;
    const row = put(e.from, e.to);
    row.observed = true;
    row.by = e.by;
    row.takenAt = e.takenAt;
    if (row.label === undefined && e.label !== undefined) row.label = e.label;
    if (row.triggerKind === undefined && e.triggerKind !== undefined) {
      row.triggerKind = e.triggerKind;
    }
  }

  const activeId =
    beat !== undefined && beat.moved && beat.hop.from !== undefined && beat.hop.to !== undefined
      ? `${beat.hop.from}->${beat.hop.to}`
      : undefined;

  // Every endpoint is a node, even one the catalog never listed — the run
  // walked it, so hiding it would hide a hop.
  const nodes = new Map<string, SkillTopologyNode>();
  const state = (id: string): SkillNodeState => {
    if (id === current) return 'current';
    if (refused.has(id)) return 'refused';
    if (reachable.has(id)) return 'reachable';
    if (visitedSoFar.has(id)) return 'visited';
    return 'idle';
  };
  const addNode = (id: string, description?: string, visitedInRun?: boolean): void => {
    const existing = nodes.get(id);
    if (existing !== undefined) {
      if (existing.description === undefined && description !== undefined) {
        nodes.set(id, { ...existing, description });
      }
      return;
    }
    nodes.set(id, {
      id,
      ...(description !== undefined ? { description } : {}),
      state: state(id),
      pickedByModel: beat?.modelPickedId === id,
      refusedHere: refused.has(id),
      visitedInRun: visitedInRun ?? visitedSoFar.has(id),
    });
  };

  for (const n of route.nodes) addNode(n.id, n.description, n.visited);
  for (const row of edges.values()) {
    addNode(row.from);
    addNode(row.to);
  }
  for (const id of refused) addNode(id);

  return {
    nodes: [...nodes.values()],
    edges: [...edges.entries()].map(([id, row]) => ({
      id,
      from: row.from,
      to: row.to,
      declared: row.declared,
      observed: row.observed,
      ...(row.label !== undefined ? { label: row.label } : {}),
      ...(row.triggerKind !== undefined ? { triggerKind: row.triggerKind } : {}),
      ...(row.by !== undefined ? { by: row.by } : {}),
      takenAt: row.takenAt,
      active: id === activeId,
    })),
    declaredSource:
      declaredEdges !== undefined && declaredEdges.length > 0
        ? 'graph'
        : route.declaredEdges.length > 0
          ? 'recording'
          : 'none',
  };
}
