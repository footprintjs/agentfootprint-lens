/**
 * buildGroups — derive the ordered list of `Group`s from a `CommitRangeIndex`
 * of `BoundaryRangeLabel`s.
 *
 * Pure function. Layer 1 / Tier B / Lens v0.1.
 *
 * Maps the agentfootprint wire type (`BoundaryRangeLabel`) into the
 * Lens-facing `Group` developer alias. Adds:
 *
 *   - `runtimeGroupId`     — alias of `label.runtimeStageId` (the subflow's
 *                            execution id; same address space as commit
 *                            runtimeStageIds).
 *   - `parentGroupId`      — derived by walking the enclosing chain at the
 *                            group's open-commit.
 *   - `opensAtCommitIdx`   — the range's `startIdx`.
 *   - `closesAtCommitIdx`  — the range's `endIdx` (undefined while in-flight).
 *
 * Output ordering: groups appear in `opensAtCommitIdx` ascending order
 * (chronological). When two groups open at the same commit (Parallel's
 * fork emits the parent + children at the same idx), the OUTER one
 * appears first (depth ascending tie-break) — matching how `enclosing()`
 * orders outer→inner.
 *
 * Performance
 * ───────────
 *   O(n²) worst case for `parentGroupId` resolution (one `enclosing()`
 *   call per range). Acceptable up to a few hundred groups per run;
 *   beyond that, a single-pass stack walk would be faster but isn't
 *   needed for Lens v0.1's expected scale.
 */

import type { CommitRangeIndex } from 'footprintjs/trace';
import type { BoundaryRangeLabel } from 'agentfootprint';
import type { Group } from './Group.js';

export function buildGroups(
  boundaryIndex: CommitRangeIndex<BoundaryRangeLabel>,
): readonly Group[] {
  // CommitRangeIndex doesn't expose a direct "all ranges" accessor, but
  // `overlapping(0, MAX)` returns every range overlapping that slice —
  // which is all of them. Returns them in outer→inner order already.
  const all = boundaryIndex.overlapping(0, Number.MAX_SAFE_INTEGER);
  if (all.length === 0) return [];

  // Dedupe by runtimeStageId. BoundaryRecorder can register a range
  // twice when it observes events from both the FlowRecorder channel
  // (`runner.attach`) AND the typed-event channel (`runner.on('*')`).
  // Keep the FIRST opened range — it has the correct startIdx + the
  // first-closed endIdx (if both got closed).
  const seen = new Set<string>();

  const result: Group[] = [];
  for (let i = 0; i < all.length; i++) {
    const entry = all[i]!;
    const label = entry.label;
    if (seen.has(label.runtimeStageId)) continue;
    seen.add(label.runtimeStageId);

    // Parent resolution depends on the range type:
    //
    //   subflow.entry → parent has depth = (label.depth - 1). Subflow
    //                   tracking is depth-aligned: the engine assigns
    //                   path-derived depth, so this rule is unambiguous.
    //
    //   composition.start → parent is the innermost enclosing range
    //                       other than self. Compositions at top level
    //                       share depth=0 with root, so depth-1 math
    //                       breaks. We pick the innermost OTHER range
    //                       (root in the top-level case; a parent
    //                       composition or subflow when nested).
    //
    //   run.entry → no parent (synthetic root).
    let parentGroupId: string | undefined;
    if (label.type === 'subflow.entry') {
      const enclosing = boundaryIndex.enclosing(entry.startIdx);
      const parentDepth = label.depth - 1;
      // Walk outer→inner; prefer composition.start at parent depth
      // (semantically tighter than a sibling subflow at same depth).
      let compositionMatch: string | undefined;
      let depthMatch: string | undefined;
      for (let j = enclosing.length - 1; j >= 0; j--) {
        const cand = enclosing[j]!.label;
        if (cand.runtimeStageId === label.runtimeStageId &&
            cand.type === label.type) continue;
        if (cand.type === 'composition.start' && compositionMatch === undefined) {
          compositionMatch = cand.runtimeStageId;
        }
        if (cand.depth === parentDepth && depthMatch === undefined) {
          depthMatch = cand.runtimeStageId;
        }
        if (compositionMatch !== undefined && depthMatch !== undefined) break;
      }
      // Prefer the composition (semantic parent) when it exists AND
      // its depth wraps us; otherwise the depth-matched subflow/run.
      parentGroupId = compositionMatch ?? depthMatch;
    } else if (label.type === 'composition.start') {
      const enclosing = boundaryIndex.enclosing(entry.startIdx);
      for (let j = enclosing.length - 1; j >= 0; j--) {
        const cand = enclosing[j]!.label;
        if (cand.runtimeStageId === label.runtimeStageId &&
            cand.type === label.type) continue;
        parentGroupId = cand.runtimeStageId;
        break;
      }
    }

    const isRoot = label.type === 'run.entry';
    const name = label.subflowName
      ?? (label.type === 'composition.start' ? label.compositionName : undefined)
      ?? (isRoot ? 'Run' : label.runtimeStageId);
    const compositionKind = label.type === 'composition.start'
      ? label.compositionKind
      : undefined;

    result.push({
      runtimeGroupId: label.runtimeStageId,
      name,
      parentGroupId,
      subflowPath: label.subflowPath,
      depth: label.depth,
      opensAtCommitIdx: entry.startIdx,
      closesAtCommitIdx: entry.endIdx,
      isRoot,
      ...(compositionKind !== undefined ? { compositionKind } : {}),
      ...(label.slotKind !== undefined ? { slotKind: label.slotKind } : {}),
      ...(label.primitiveKind !== undefined ? { primitiveKind: label.primitiveKind } : {}),
    });
  }

  return result;
}
