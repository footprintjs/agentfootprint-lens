/**
 * buildCommitSyncMap — the single-source-of-truth denormalization that
 * lets Lens drive ALL panels (slider, chart highlight, commentary,
 * breadcrumb) from one cursor.
 *
 * Pure function. Layer 1 / Tier B / Lens v0.1.
 *
 * For every commit in the run, produces one `CommitSyncEntry`
 * carrying:
 *
 *   - `runtimeStageId`   — THE cursor of record. Same key Trace uses.
 *   - `commitIdx`        — numeric form for HTML slider min/max.
 *   - `runtimeGroupId`   — innermost enclosing subflow's runtimeStageId
 *                          (for chart-box highlight).
 *   - `subflowPath`      — full subflow chain for breadcrumb sync.
 *   - `depth`            — subflow stack depth at this commit.
 *   - `label`            — human-readable hover label.
 *
 * The returned array is in commit order: `entry.commitIdx === i` at
 * index `i`. The slider's value is just an integer in `[0, length)`.
 *
 * One cursor in, all panels out
 * ─────────────────────────────
 *   ```
 *   const syncMap = buildCommitSyncMap(recorder);
 *   const cursor = syncMap[commitIdx];      // one cursor row
 *   cursor.runtimeStageId  → Trace + slider value + commentary cutoff
 *   cursor.runtimeGroupId  → Lens chart box highlight
 *   cursor.subflowPath     → Breadcrumb
 *   cursor.label           → Tooltip
 *   ```
 *
 * No new ID concept. The two key columns (`runtimeStageId` and
 * `runtimeGroupId`) are both runtimeStageIds in form — they just
 * point at different stages in the same subflow stack.
 *
 * Performance
 * ───────────
 *   O(commitCount) for the linear pass + O(commitCount × groupCount) for
 *   the per-commit `groupForRuntimeStageId` lookup. For Lens-scale
 *   runs (<10K commits, <100 groups), this is comfortably under 50ms.
 *   If we ever exceed that scale, we can switch to a single-pass
 *   subflow-stack walk over the commit log (groups in opens-at order
 *   form a stack-pushable sequence).
 */

import type { LensRecorder } from '../LensRecorder.js';
import type { Group } from './Group.js';
import { buildGroups } from './buildGroups.js';
import { groupForRuntimeStageId } from './groupForRuntimeStageId.js';

export interface CommitSyncEntry {
  /** Universal slider cursor — same key Trace uses. */
  readonly runtimeStageId: string;
  /** Numeric index into the commit log; equal to this entry's array index. */
  readonly commitIdx: number;
  /** Innermost enclosing subflow's runtimeStageId. Chart-box highlight key.
   *  When no group encloses (no Run group yet) → empty string. */
  readonly runtimeGroupId: string;
  /** Full subflow chain at this commit (for breadcrumb sync). */
  readonly subflowPath: readonly string[];
  /** Subflow stack depth at this commit (0 = top-level / under Run). */
  readonly depth: number;
  /** Human-readable hover label ("ethics · call-llm"). */
  readonly label: string;
  /** Scope keys this commit CHANGED (footprintjs commits are change-only). Empty
   *  for a no-op commit. Drives the "light only the slots that changed" highlight. */
  readonly overwriteKeys: readonly string[];
}

/** Build the per-commit sync map from a populated `LensRecorder`.
 *  Reads `recorder.snapshot.commitLog` for the commit list and
 *  `recorder.boundary.boundaryIndex` for the group structure. */
export function buildCommitSyncMap(
  recorder: LensRecorder,
): readonly CommitSyncEntry[] {
  // The COMMIT LOG comes from the executor's snapshot (reached through
  // the currently-observed runner), NOT from LensSnapshotRecorder. See
  // `LensRecorder.getCommitLog()`. The boundary index — same boundary
  // recorder — gives us the group-containment info.
  const commitLog = recorder.getCommitLog();
  if (commitLog.length === 0) return [];

  // Build groups once; cheap (O(group_count²) worst case).
  const groups = buildGroups(recorder.boundary.boundaryIndex);

  const result: CommitSyncEntry[] = [];
  for (let i = 0; i < commitLog.length; i++) {
    const c = commitLog[i]!;
    const rid: string = c.runtimeStageId ?? '';
    const group = groupForRuntimeStageId(groups, rid);

    result.push({
      runtimeStageId: rid,
      commitIdx: i,
      runtimeGroupId: group?.runtimeGroupId ?? '',
      subflowPath: group?.subflowPath ?? [],
      depth: group?.depth ?? 0,
      label: labelFor(rid, group, c.stageId),
      overwriteKeys: c.overwriteKeys ?? [],
    });
  }
  return result;
}

function labelFor(
  rid: string,
  group: Group | undefined,
  stageId: string | undefined,
): string {
  // "ethics · call-llm" — group's display name + the bare stageId.
  const leaf = stageId ?? lastSegmentOf(rid);
  if (group && !group.isRoot) return `${group.name} · ${leaf}`;
  return leaf;
}

function lastSegmentOf(rid: string): string {
  if (rid.length === 0) return '';
  const lastSlash = rid.lastIndexOf('/');
  const segment = lastSlash < 0 ? rid : rid.slice(lastSlash + 1);
  const hashIdx = segment.lastIndexOf('#');
  return hashIdx < 0 ? segment : segment.slice(0, hashIdx);
}
