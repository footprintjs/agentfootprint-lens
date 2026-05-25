/**
 * buildSpecTreeFromBoundary — Phase 5 Layer 4 adapter from
 * BoundaryRecorder's commit-range index to explainable-ui's
 * `SpecNode` tree shape.
 *
 * Why this exists: footprint-explainable-ui's `specToLayout` walks a
 * tree (children-as-array → horizontal fanout; next chain → vertical
 * stack). BoundaryRecorder owns a FLAT range index. This helper
 * bridges the two — building the tree from boundary parent/child
 * relationships derived from `subflowPath`.
 *
 * Pure function. No framework imports. No React. Called from the
 * `<RunTreeFlow>` component (or any non-React adapter) on every
 * change-notify; memoized at the call site.
 *
 * See `docs/design/lens-layout-unification.md` for the full contract.
 */

import type { BoundaryRecorder, BoundaryRangeLabel } from 'agentfootprint';

/**
 * SpecNode — Lens-local subflow tree shape.
 *
 * Historically imported from `footprint-explainable-ui/flowchart`, but
 * v0.20+ no longer exports the type (the legacy spec-walk path was
 * removed — explainable-ui now consumes `TraceGraph` via recorders
 * instead). Lens still uses this shape internally to walk the
 * BoundaryRecorder-derived composition tree (children/next/subflow
 * structure), so we define it locally as the single source of truth.
 *
 * The `icon` field is a Lens addition — `buildSpecTreeFromBoundary`
 * stamps it from the primitive kind ('agent' / 'llm' / 'fork' / etc.)
 * so downstream renderers (`useAgentLegend`, `useCompareBranches`) can
 * dispatch on it without re-parsing the description.
 */
export interface SpecNode {
  name: string;
  id?: string;
  description?: string;
  icon?: string;
  children?: SpecNode[];
  next?: SpecNode;
  isSubflowRoot?: boolean;
  subflowId?: string;
  subflowName?: string;
  subflowStructure?: SpecNode;
}

/**
 * Map a BoundaryRangeLabel's primitiveKind to an explainable-ui
 * icon name. Conservative fallbacks: unknown kinds → no icon.
 * The icons are rendered by explainable-ui's StageNode component.
 */
const PRIMITIVE_ICON: Record<string, string> = {
  Agent: 'agent',
  LLMCall: 'llm',
  Sequence: 'sequence',
  Parallel: 'fork',
  Conditional: 'guard',
  Loop: 'loop',
};

/** Composition primitives whose children render as a horizontal fanout
 *  (siblings under the same parent). When the parent has `kind:Parallel`
 *  or `kind:Conditional`, its descendants go into `children[]`. */
const FANOUT_KINDS = new Set(['Parallel', 'Conditional']);

/**
 * Build a `SpecNode` tree from the BoundaryRecorder's commit-range
 * index. The tree is rooted at a synthetic `__root__` node so
 * `specToLayout` has a single entry point.
 *
 * Algorithm:
 *   1. Get all ranges from the index (open + closed).
 *   2. Sort by depth ascending — parents always processed before children.
 *   3. Build a `byPath` index keyed by the FULL subflowPath (joined) so
 *      parent lookup is O(1) and immune to sibling-name collisions
 *      (two `legal` branches under different parents stay distinct).
 *   4. Attach each label to its parent's `children[]` (parent is a
 *      fanout kind — Parallel / Conditional) OR to its `next` chain
 *      (Sequence-like). Fanout-vs-sequence is read from the parent's
 *      OWN `primitiveKind`, not re-parsed from `description`.
 *   5. Return the root.
 *
 * Returns a tree with `children` only if any ranges exist. Empty index
 * → tree with no children (renders as a single `__root__` node).
 */
export function buildSpecTreeFromBoundary(boundary: BoundaryRecorder): SpecNode {
  // The boundary index intentionally captures EVERY subflow — domain
  // primitives (Agent / LLMCall / Parallel / Sequence / Conditional /
  // Loop) AND internal plumbing (slot subflows that compose LLM context:
  // sf-system-prompt / sf-messages / sf-tools; routing subflows like
  // sf-injection-engine, sf-tool-calls, sf-cache-decision). The slider's
  // time-travel queries need them all.
  //
  // The user-facing flowchart should show ONLY domain boundaries.
  // Filter rule:
  //   - `primitiveKind` set  → domain boundary  → keep
  //   - `slotKind` set       → slot internal    → drop
  //   - `isAgentInternal`    → routing plumbing → drop
  //   - everything else      → not a domain step → drop
  const all = boundary.boundaryIndex
    .overlapping(0, Number.MAX_SAFE_INTEGER)
    .filter((entry) => {
      const label = entry.label as {
        primitiveKind?: string;
        slotKind?: string;
        isAgentInternal?: boolean;
      };
      if (!label.primitiveKind) return false;
      if (label.slotKind) return false;
      if (label.isAgentInternal) return false;
      return true;
    });

  const root: MutableSpecNode = {
    name: 'Run',
    id: '__root__',
    children: [],
  };
  // Path-keyed index. Keys are the joined subflowPath, e.g.
  // `'__root__'`, `'__root__/committee'`, `'__root__/committee/legal'`.
  // Two siblings with the SAME display name (`'legal'`) sit under
  // different parents → different joined paths → no collision.
  // Lookup is O(1) regardless of tree size or depth.
  const byPath = new Map<string, MutableSpecNode>();
  byPath.set('__root__', root);
  // runtimeStageId dedup — same boundary may appear twice (open + closed
  // snapshots from `overlapping(0, MAX)`). Keep the first one.
  const seenRid = new Set<string>(['__root__#0']);

  // Sort by depth ascending so parents always exist when we attach
  // children. Stable sort preserves insertion order within same depth,
  // which matters for fanout siblings — they render left-to-right in
  // the order they entered the recorder.
  const sorted = [...all].sort((a, b) => labelDepth(a.label) - labelDepth(b.label));

  for (const entry of sorted) {
    const label = entry.label;
    const rid = label.runtimeStageId;
    if (seenRid.has(rid)) continue;
    // Defensive: skip labels with an empty/missing subflowPath — they
    // cannot be placed in the tree and must not corrupt the byPath
    // index. (BoundaryRecorder normalizes to a non-empty array today,
    // but the helper guards against future contract drift.)
    if (!label.subflowPath || label.subflowPath.length === 0) continue;

    seenRid.add(rid);
    const node: MutableSpecNode = toSpecNode(label);

    // The LEAF of the path is THIS node. Its parent's path is the
    // prefix without the last segment.
    const pathKey = label.subflowPath.join('/');
    const parentKey = label.subflowPath.slice(0, -1).join('/');
    byPath.set(pathKey, node);

    // Single-element subflowPath (depth 0, e.g. the root) means no
    // parent; everything else falls back to root if the named parent
    // isn't registered (out-of-order arrival under a non-buggy
    // engine shouldn't happen — sort guarantees parent first).
    const parent = parentKey ? (byPath.get(parentKey) ?? root) : root;

    if (isFanoutKind(parent.__kind)) {
      // Fanout parent → append to children[] for horizontal layout.
      if (!parent.children) parent.children = [];
      parent.children.push(node);
    } else {
      // Sequence-like parent → chain via `next` so layout stacks vertically.
      attachToNextChain(parent, node);
    }
  }

  return root;
}

// ─── Internals ────────────────────────────────────────────────────

/** Internal — mutable shadow of SpecNode for the construction phase.
 *  Carries `__kind` so we can decide fanout-vs-sequence from the
 *  PARENT's own primitiveKind (read directly off its label) instead of
 *  re-parsing `description`. `__kind` is intentionally private to this
 *  module — it does not appear on the wire SpecNode shape. */
interface MutableSpecNode extends SpecNode {
  children?: MutableSpecNode[];
  next?: MutableSpecNode;
  __kind?: string;
}

function labelDepth(label: BoundaryRangeLabel): number {
  return label.depth ?? 0;
}

function isFanoutKind(kind: string | undefined): boolean {
  return kind !== undefined && FANOUT_KINDS.has(kind);
}

function toSpecNode(label: BoundaryRangeLabel): MutableSpecNode {
  const primitiveKind = (label as { primitiveKind?: string }).primitiveKind;
  const subflowName = (label as { subflowName?: string }).subflowName;
  const node: MutableSpecNode = {
    name: subflowName ?? label.runtimeStageId,
    id: label.runtimeStageId,
  };
  if (primitiveKind && PRIMITIVE_ICON[primitiveKind]) {
    node.icon = PRIMITIVE_ICON[primitiveKind];
  }
  if (primitiveKind) {
    // Keep `description` for the visible "Kind: Name" subtitle.
    node.description = `${primitiveKind}: ${node.name}`;
    // Internal field — drives fanout-vs-sequence decisions in
    // `buildSpecTreeFromBoundary`. Reading it from the label directly
    // (vs re-parsing the description string) means the layout decision
    // does not depend on description formatting and survives custom
    // descriptions / localized strings unchanged.
    node.__kind = primitiveKind;
  }
  const subflowId = (label as { subflowId?: string }).subflowId;
  if (subflowId) {
    node.subflowId = subflowId;
  }
  return node;
}

/** Walk to the end of a Sequence-like chain and append `node` via
 *  the `next` pointer. Builds the linear-chain layout. */
function attachToNextChain(parent: MutableSpecNode, node: MutableSpecNode): void {
  // Root uses children[] always (the run is a container, not a step).
  if (parent.id === '__root__') {
    if (!parent.children) parent.children = [];
    parent.children.push(node);
    return;
  }
  let cur: MutableSpecNode = parent;
  while (cur.next) cur = cur.next;
  cur.next = node;
}
