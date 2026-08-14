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
import type { BoundaryRangeLabel } from 'agentfootprint/observe';
import type { Group } from './Group.js';
import { groupDisplayNameForLabel } from './groupDisplayName.js';

/** Exact equality of two subflow-path arrays (the chart-nesting chain). */
function samePath(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

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

    // Parent resolution.
    //
    // subflow.entry: the AUTHORITATIVE parent is the enclosing EXECUTION whose
    //   `subflowPath` equals this node's parent path (its own subflowPath minus
    //   the last segment). `subflowPath` encodes the true chart nesting, so this:
    //     • disambiguates parallel SIBLINGS — their overlapping commit ranges
    //       would otherwise let "innermost enclosing" pick a sibling as parent
    //       (e.g. legal → ethics); a sibling has a DIFFERENT path so it's never
    //       chosen; and
    //     • fixes the old composition-preference FLATTENING (deep nesting
    //       branch → llm-call → slots no longer collapses its parent onto the
    //       outermost composition — each node parents onto its immediate
    //       enclosing subflow).
    //   The enclosing scan picks the right EXECUTION instance (loops run a
    //   subflow N times; commit containment selects the wrapping instance).
    //
    // composition.start: parent = innermost enclosing range other than self
    //   (compositions don't carry a self-segment in subflowPath the same way).
    //
    // run.entry: synthetic root, no parent.
    let parentGroupId: string | undefined;
    if (label.type === 'subflow.entry') {
      const enclosing = boundaryIndex.enclosing(entry.startIdx); // outer→inner
      const parentPath = label.subflowPath.slice(0, -1);
      for (let j = enclosing.length - 1; j >= 0; j--) {
        const cand = enclosing[j]!.label;
        if (cand.runtimeStageId === label.runtimeStageId) continue; // skip self
        if (samePath(cand.subflowPath, parentPath)) {
          parentGroupId = cand.runtimeStageId;
          break;
        }
      }
      // Fallback (malformed/missing path): innermost enclosing non-self.
      if (parentGroupId === undefined) {
        for (let j = enclosing.length - 1; j >= 0; j--) {
          const cand = enclosing[j]!.label;
          if (cand.runtimeStageId === label.runtimeStageId) continue;
          parentGroupId = cand.runtimeStageId;
          break;
        }
      }
    } else if (label.type === 'composition.start') {
      const enclosing = boundaryIndex.enclosing(entry.startIdx);
      for (let j = enclosing.length - 1; j >= 0; j--) {
        const cand = enclosing[j]!.label;
        if (cand.runtimeStageId === label.runtimeStageId) continue;
        parentGroupId = cand.runtimeStageId;
        break;
      }
    }

    const isRoot = label.type === 'run.entry';
    // ONE naming source. `groupDisplayName` is the same chain the WHAT HAPPENED
    // boundary rail and the chart's group-boundary chip read, so a group cannot
    // be called two things in one view. See groupDisplayName.ts.
    const name = groupDisplayNameForLabel(label);
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
