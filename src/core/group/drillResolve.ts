/**
 * drillResolve — pure helpers bridging the CHART's build-time node ids
 * to the runtime Group hierarchy the drill slider keys on.
 *
 * Layer 1 / Lens v0.1 — drill wiring.
 *
 * Two impedance gaps make drill non-trivial, both handled here:
 *
 *  1. **build-time vs runtime ids.** Chart nodes carry build-time
 *     subflow ids (`sf-llm-call`, `step-classify`, possibly path-
 *     prefixed `sf-outer/sf-inner`) plus lens-synthesized ids
 *     (`__lens_user__`, `__lens_llm_call_synth__`). Groups carry
 *     runtime `runtimeGroupId`s (`sf-llm-call#1`). `resolveDrillChain`
 *     maps a clicked node → the runtimeGroupId CHAIN drillInto expects.
 *
 *  2. **two drillPath consumers, two formats.** `cursorPositionsAtDrill`
 *     keys on runtimeGroupId (the canonical drill state); `selectHops`
 *     keys on subflowPath segments. `innerGroupSubflowPath` adapts the
 *     canonical chain into the subflowPath `selectHops` wants, so one
 *     drill state feeds both without conflict.
 */

import type { Group } from './Group.js';

/** Lens-invented chart node ids (not real footprintjs stages). Kept as
 *  literals to avoid a React-layer import; mirror the collapser. */
const USER_NODE_ID = '__lens_user__';
const SYNTH_LLM_ID = '__lens_llm_call_synth__';

/**
 * Map a clicked CHART node id to the `runtimeGroupId` CHAIN
 * (outermost→innermost, ROOT EXCLUDED) that `useDrillPath.drillInto` +
 * `cursorPositionsAtDrill` expect — e.g. `['sf-Committee#1', 'legal#1']`.
 *
 * Returns `null` when the node isn't drillable: the lens-invented User
 * node, an id matching no group, or the root. Conservative by design —
 * a null result means "do nothing" rather than risk drilling to the
 * wrong scope.
 */
export function resolveDrillChain(
  groups: readonly Group[],
  nodeId: string,
): string[] | null {
  if (!nodeId || nodeId === USER_NODE_ID) return null;

  // Build-time node ids may be path-prefixed (`sf-outer/sf-inner`);
  // match on the LAST segment against each group's last subflowPath
  // segment.
  const localId = nodeId.includes('/')
    ? nodeId.slice(nodeId.lastIndexOf('/') + 1)
    : nodeId;

  const matches = groups.filter((g) => {
    if (g.isRoot) return false;
    // The synth LLM card stands in for the atomic LLMCall's sf-llm-call
    // subflow, which has no build-time node of its own. Map it to the
    // (single, for atomic LLMCall) LLMCall group.
    if (nodeId === SYNTH_LLM_ID) return g.primitiveKind === 'LLMCall';
    const seg = g.subflowPath[g.subflowPath.length - 1];
    return seg === localId || seg === nodeId;
  });
  if (matches.length === 0) return null;

  // Disambiguate: a segment can repeat (every LLMCall has an inner
  // `sf-llm-call`; loop bodies recur). A clicked CHART node represents
  // the OUTERMOST subflow with that segment, so prefer the SHALLOWEST
  // match, tie-broken by earliest open — deterministic + correct for the
  // "click the box you see" intent. A path-prefixed nodeId still narrows
  // first via the full-path equality in the filter above.
  const target = matches.reduce((best, g) =>
    g.depth < best.depth ||
    (g.depth === best.depth && g.opensAtCommitIdx < best.opensAtCommitIdx)
      ? g
      : best,
  );

  const byId = new Map(groups.map((g) => [g.runtimeGroupId, g] as const));
  const chain: string[] = [];
  const seen = new Set<string>(); // cycle guard (defensive)
  let cur: Group | undefined = target;
  while (cur && !cur.isRoot && !seen.has(cur.runtimeGroupId)) {
    seen.add(cur.runtimeGroupId);
    chain.unshift(cur.runtimeGroupId);
    cur = cur.parentGroupId ? byId.get(cur.parentGroupId) : undefined;
  }
  return chain.length > 0 ? chain : null;
}

/**
 * Adapt a drillPath (canonical `runtimeGroupId` chain) into the
 * innermost group's `subflowPath` — the format `selectHops` consumes.
 * Empty array for top-level (drillPath empty) or an unknown id.
 */
export function innerGroupSubflowPath(
  groups: readonly Group[],
  drillPath: readonly string[],
): readonly string[] {
  if (drillPath.length === 0) return [];
  const inner = drillPath[drillPath.length - 1];
  const g = groups.find((gg) => gg.runtimeGroupId === inner);
  return g ? g.subflowPath : [];
}

/**
 * Human-readable breadcrumb labels for a drillPath. Maps each
 * `runtimeGroupId` to its group's display `name`, falling back to the
 * raw id if the group isn't found.
 */
export function drillPathLabels(
  groups: readonly Group[],
  drillPath: readonly string[],
): readonly string[] {
  const byId = new Map(groups.map((g) => [g.runtimeGroupId, g] as const));
  return drillPath.map((id) => byId.get(id)?.name ?? id);
}
