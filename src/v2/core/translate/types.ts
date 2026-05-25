/**
 * LensGroupOutput — the UI-agnostic shape every per-kind Lens translator
 * emits.
 *
 * Layer 0 (pure types) / Lens v0.1 translator pipeline.
 *
 * Why a graph (nodes + edges) and not a tree
 * ──────────────────────────────────────────
 *   The locked Lens v0.1 architecture (`memory/lens_v0_1_one_cursor_architecture.md`)
 *   renders compositions as a flat graph of compound containers, leaves,
 *   and control-flow edges. xyflow / React Flow consume this shape
 *   directly: `nodes` become `Node[]` (with `parentId` for compound
 *   containment), `edges` become `Edge[]` typed by kind. Vue/D3
 *   consumers map the same graph to their own primitives — no Lens
 *   logic needs to change per UI framework.
 *
 * Why this lives ABOVE agentfootprint's `GroupMetadata`
 * ──────────────────────────────────────────────────────
 *   `GroupMetadata` is the agentfootprint primitive — UI-agnostic,
 *   single-composition. The Lens translator FOLDS over it (and its
 *   recursive `member.uiGroup` outputs) to produce a single flat
 *   `LensGroupOutput` for the WHOLE tree. The fold lives in Lens —
 *   agentfootprint stays unaware of graph shape, parent-child
 *   pinning, edge kinds, or any rendering concern.
 *
 * Composition rule
 * ────────────────
 *   Every per-kind translator returns a `LensGroupOutput`. Parents
 *   merge children's outputs via `mergeOutputs` + (optionally)
 *   `pinUnderParent` to set the compound-container relationship.
 *   The same fold pattern composes ANY depth.
 */

import type { GroupKind } from 'agentfootprint';

/**
 * One ReactFlow / xyflow-ready node, in UI-agnostic shape. Consumers
 * map this to their framework's Node primitive without inspecting
 * agentfootprint internals.
 *
 * `kind` discriminates rendering:
 *   - `'group'` — compound container (ReactFlow `type: 'group'`).
 *                 Holds children via the children's `parentId`.
 *   - `'stage'` — leaf node. Renders as a pill / card. Can be drillable
 *                 when the composition kind supports it (Agent / LLMCall).
 *
 * `primitiveKind` carries the agentfootprint kind (`'Parallel'` /
 * `'Agent'` / ...) — Lens uses it to pick icons, theme colors, and
 * drill-in behaviour without re-deriving from labels.
 *
 * `metadata` is the bag of consumer-facing extras a per-kind translator
 * surfaces: slot ids for Agent / LLMCall cards, merge strategy for
 * Parallel, iteration budgets for Loop, etc. Closed enough per
 * `primitiveKind` that consumers can switch on it safely.
 *
 * Renderer escaping note
 * ──────────────────────
 *   `label` and string values inside `metadata` reach the consumer's
 *   renderer VERBATIM. React's default JSX text-node behaviour escapes
 *   them automatically; renderers that bypass that path (raw HTML
 *   insertion, custom non-React frameworks) own their own escaping.
 *   Lens does not sanitise.
 */
export interface LensNode {
  readonly id: string;
  readonly kind: 'group' | 'stage';
  /**
   * Display label. Reaches the renderer verbatim — renderer owns
   * escaping if it bypasses React's default JSX text-node behaviour.
   */
  readonly label: string;
  readonly primitiveKind: GroupKind;
  /**
   * Parent compound container's `id` when this node renders INSIDE a
   * group. xyflow uses this for `parentId` + `extent: 'parent'`
   * pinning so the child can't be dragged outside the container.
   * `undefined` for top-level nodes.
   */
  readonly parentId?: string;
  /**
   * Per-kind metadata bag. Closed enough that consumers can switch on
   * `primitiveKind` and read the expected fields safely. Concrete
   * shapes per kind:
   *
   *   Parallel:     { mergeStrategy: 'fn' | 'llm' | 'outcomes-fn' }
   *   Agent:        { slots: readonly string[], toolNames: readonly string[],
   *                   maxIterations: number }
   *   LLMCall:      { slots: readonly string[] }
   *   Sequence:     {} (empty — pure linear)
   *   Loop:         { maxIterations, maxWallclockMs?, hasUntilGuard }
   *   Conditional:  { fallbackId: string }
   *
   * Agent / LLMCall note
   * ────────────────────
   *   Their `GroupMetadata.members` array is EMPTY by design — slots,
   *   tool names, iteration budgets arrive via `GroupMetadata.extra`
   *   and surface here in `metadata`. Per-kind translators must NOT
   *   try to map slots to child members; the slot-rendering belongs
   *   inside the Agent/LLMCall stage node itself.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * One control-flow edge. `kind` mirrors the footprintjs control-flow
 * vocabulary so consumers can theme each kind (solid arrow for `next`,
 * fanned-out for `fork-branch`, dashed back-arrow for `loop-iteration`,
 * decision arrow for `decision-branch`).
 *
 * `label` is optional and used for the user-facing edge annotation
 * (the predicate name on a Conditional decision branch, the branch id
 * on a Parallel fork, the iteration counter on a Loop back-edge).
 */
export interface LensEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly kind: 'next' | 'fork-branch' | 'loop-iteration' | 'decision-branch';
  /**
   * Optional edge annotation. Reaches the renderer verbatim — renderer
   * owns escaping if it bypasses React's default JSX text-node
   * behaviour. Lens does not sanitise.
   */
  readonly label?: string;
}

/**
 * One per-kind translator's complete output: a flat graph (nodes +
 * edges) ready for a UI framework to render. Frozen at construction
 * time — translator outputs are immutable so reference identity holds
 * (matching the `getUIGroup()` contract on the runner side).
 *
 * `rootNodeId` names the SEMANTIC root of this output — the node a
 * parent composition would pin children under via `pinUnderParent`,
 * and the target of any incoming control-flow edge from upstream.
 * For Parallel it's the compound container; for Sequence / Loop /
 * Conditional / Agent / LLMCall it's the lead node of the linear
 * walk.
 *
 * `exitNodeId` names the SEMANTIC exit of this output — the source
 * of any outgoing control-flow edge to a downstream composition.
 * For most leaves and chains it equals `rootNodeId` (entry == exit).
 * For compositions that emit a SYNTHETIC tail node:
 *
 *   - Parallel emits a `Merge` synthetic stage that collects all
 *     branches; `exitNodeId` = merge node id.
 *   - Conditional emits a `Converge` synthetic stage that collects
 *     all branches; `exitNodeId` = converge node id.
 *   - Sequence's `exitNodeId` = the LAST member's `exitNodeId`.
 *   - Loop's `exitNodeId` = the body's `exitNodeId` (loop bounds
 *     are decorative, not part of the linear walk).
 *
 * Outer compositions chain by drawing `next` edges from the inner
 * `exitNodeId` to the next member's `rootNodeId`. Without this
 * distinction, chains-of-chains would emit edges from the Sequence's
 * first step instead of its last, breaking the visual flow.
 *
 * Empty-fold sentinel
 * ───────────────────
 *   `mergeOutputs([], rootNodeId)` returns an output with
 *   `nodes: []`, `edges: []`, and the caller-supplied `rootNodeId`.
 *   A caller producing a 0-member parent is probably mis-modeling its
 *   composition — Lens does not throw, but the empty output should be
 *   treated as an observability signal upstream.
 */
export interface LensGroupOutput {
  readonly nodes: readonly LensNode[];
  readonly edges: readonly LensEdge[];
  readonly rootNodeId: string;
  /**
   * Exit node id. Defaults to `rootNodeId` when omitted (leaves and
   * single-entry compositions). Per-kind translators that emit a
   * synthetic tail node (Parallel → Merge, Conditional → Converge)
   * set this to the synthetic node's id so outer compositions chain
   * from the right place.
   */
  readonly exitNodeId?: string;
}
