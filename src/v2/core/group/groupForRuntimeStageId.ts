/**
 * groupForRuntimeStageId — find the innermost Group that contains a
 * given runtimeStageId.
 *
 * Pure function. Layer 1 / Tier C / Lens v0.1.
 *
 * Used by Lens whenever a panel has a runtimeStageId cursor and needs
 * to know which subflow box to highlight (the chart) or which
 * breadcrumb segment to bold.
 *
 * Algorithm
 * ─────────
 *   `rid` has the format `[subflowPath/]stageId#executionIndex`. The
 *   stage is `stageId#executionIndex`; the subflow path is everything
 *   BEFORE that, slash-separated. Containment is a `subflowPath` prefix
 *   match — the deepest matching `Group.subflowPath` wins.
 *
 *   Important: we match on the `subflowPath` field (an array of names)
 *   NOT on the `runtimeGroupId` string. That's because:
 *   - `Group.runtimeGroupId`  = `'sf-x#3'` or `'parent/sf-x#3'` (an id, `#`-terminated)
 *   - Commit `runtimeStageId` = `'parent/sf-x/call-llm#5'`        (a path, `/`-segmented)
 *
 *   A naive `startsWith` collapses these mismatched separators. Walking
 *   the structural `subflowPath` array is unambiguous.
 *
 * Edge cases
 * ──────────
 *   - `rid === ''`     → undefined
 *   - groups empty     → undefined
 *   - rid has no path  (`'call#1'`) → returns root group when present, else undefined
 *   - rid IS a group's own id (`'sf-x#3'`) → returns that group (innermost = itself)
 */

import type { Group } from './Group.js';

/** Extract the subflow path of a runtimeStageId. Drops the leaf segment
 *  (the `stageId#executionIndex` after the last `/`). */
function pathOf(rid: string): string[] {
  if (rid.length === 0) return [];
  const lastSlash = rid.lastIndexOf('/');
  if (lastSlash < 0) return [];
  return rid.slice(0, lastSlash).split('/');
}

/** Group's effective subflow path: drop the synthetic '__root__' segment
 *  the engine prepends. Real subflows under root have path
 *  `['__root__', 'sf-x']` → effective `['sf-x']`. */
function effectivePath(group: Group): string[] {
  return group.subflowPath[0] === '__root__'
    ? group.subflowPath.slice(1)
    : [...group.subflowPath];
}

/** True when `prefix` is a prefix (or equal) of `path`. */
function isPathPrefix(prefix: readonly string[], path: readonly string[]): boolean {
  if (prefix.length > path.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] !== path[i]) return false;
  }
  return true;
}

/** Same identity (the rid points AT this group). Used for the
 *  "rid IS the group's own runtimeGroupId" early-return. */
function ridMatchesGroup(rid: string, group: Group): boolean {
  return group.runtimeGroupId === rid;
}

export function groupForRuntimeStageId(
  groups: readonly Group[],
  rid: string,
): Group | undefined {
  if (rid.length === 0 || groups.length === 0) return undefined;

  // Fast path: exact identity. Catches `groupForRuntimeStageId(groups, group.runtimeGroupId)`.
  for (const g of groups) {
    if (ridMatchesGroup(rid, g)) return g;
  }

  const path = pathOf(rid);

  // No path part → it's a top-level stage. Match the root group if present.
  if (path.length === 0) {
    return groups.find((g) => g.isRoot);
  }

  // Pick the deepest group whose effective subflowPath is a prefix of
  // `path`. Walk by depth descending so first match wins.
  const sorted = groups.slice().sort((a, b) => b.depth - a.depth);
  for (const g of sorted) {
    if (g.isRoot) continue; // root matches any path; only return it when nothing else does
    const ep = effectivePath(g);
    if (ep.length === 0) continue;
    if (isPathPrefix(ep, path)) return g;
  }
  // Fall back to the root group.
  return groups.find((g) => g.isRoot);
}
