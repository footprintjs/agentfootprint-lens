/**
 * cursorPositionsAtDrill — compute the slider's valid cursor positions
 * for the current drill level.
 *
 * Pure function. Layer 1 / Tier B / Lens v0.1.
 *
 * The COMPOUND time axis rule (locked architecture):
 *
 *   The slider does NOT iterate every commit. Its positions equal the
 *   chart's visible nodes at the current drill level. One slider stop
 *   per chart box.
 *
 *     drill depth 0       → top-level groups (each composition = ONE stop)
 *     drill depth N       → direct sub-groups of the drilled group
 *     leaf (no sub-groups) → commits enclosed by the drilled group
 *
 *   Cursor type is still `runtimeStageId`. Only the SUBSET of valid
 *   positions changes with drill depth. ONE cursor concept; the
 *   position set scales by drill.
 *
 * Inputs
 * ──────
 *   `groups`     — all groups in the run (from `buildGroups`)
 *   `commits`    — the full commit log (for leaf-group commit detail)
 *   `drillPath`  — the chain of `runtimeGroupId`s the user has drilled
 *                  into. Empty means "top-level Run." The LAST element
 *                  is the currently-drilled group; everything BEFORE it
 *                  is the path used by the breadcrumb.
 */

import type { Group } from './Group.js';
import type { CommitSyncEntry } from './buildCommitSyncMap.js';

export interface CursorPosition {
  /** Slider value — a runtimeStageId in footprintjs's address space. */
  readonly runtimeStageId: string;
  /** Same as runtimeStageId when this position IS a group's start/end. */
  readonly runtimeGroupId: string;
  /** Human-readable label ("Committee · forks", "merged", "Run · start"). */
  readonly label: string;
  /** Discriminates slider tick rendering. */
  readonly kind: 'group-start' | 'group-end' | 'commit';
  /** Depth in the outline (for indentation / breadcrumb sync). */
  readonly depth: number;
  /** Commit index this position anchors to (for footprintjs jumpTo). */
  readonly commitIdx: number;
}

function rootGroup(groups: readonly Group[]): Group | undefined {
  return groups.find((g) => g.isRoot);
}

/** Resolve "the currently-drilled-into group" from a drillPath. Empty
 *  drillPath means "Run is the current group" — we return the root. */
function currentGroup(groups: readonly Group[], drillPath: readonly string[]): Group | undefined {
  if (drillPath.length === 0) return rootGroup(groups);
  const innermost = drillPath[drillPath.length - 1]!;
  return groups.find((g) => g.runtimeGroupId === innermost);
}

function directChildren(
  groups: readonly Group[],
  parent: Group,
): readonly Group[] {
  return groups
    .filter((g) => g.parentGroupId === parent.runtimeGroupId)
    .sort((a, b) => a.opensAtCommitIdx - b.opensAtCommitIdx);
}

function commitsInsideGroup(
  commits: readonly CommitSyncEntry[],
  group: Group,
): readonly CommitSyncEntry[] {
  const start = group.opensAtCommitIdx;
  const end = group.closesAtCommitIdx ?? Number.MAX_SAFE_INTEGER;
  return commits.filter((c) => c.commitIdx >= start && c.commitIdx <= end
    && c.runtimeGroupId === group.runtimeGroupId);
}

/** Should this group earn a separate `composition.end` slider position?
 *  v0.1 product rule (see locked memory):
 *    - Parallel → YES (the "merge" is a distinct moment)
 *    - Loop     → YES (the "exit" is a distinct moment)
 *    - Sequence / Conditional → NO (next step IS the natural next position)
 *    - Plain subflows / Agents / LLMCalls → NO (single-position) */
function emitsEndPosition(group: Group): boolean {
  return group.compositionKind === 'Parallel' || group.compositionKind === 'Loop';
}

/** Slot subflows (sf-system-prompt / sf-messages / sf-tools) are hidden
 *  at top level — they become visible only when the user drills into
 *  the containing Agent or LLMCall. */
function isHiddenAtTopLevel(group: Group): boolean {
  return group.slotKind !== undefined;
}

export function cursorPositionsAtDrill(
  groups: readonly Group[],
  commits: readonly CommitSyncEntry[],
  drillPath: readonly string[],
): readonly CursorPosition[] {
  // commits arg retained for cross-tab sync semantics + jumpTo; we don't
  // expose commit-level positions in v0.1's outline (locked product rule).
  void commits;

  if (groups.length === 0) return [];
  const current = currentGroup(groups, drillPath);
  if (!current) return [];

  const positions: CursorPosition[] = [];

  // 1) Always emit the outer group's start (Run / Agent / LLMCall) so
  //    the user has an anchor for "I'm at the beginning of this view."
  positions.push({
    runtimeStageId: current.runtimeGroupId,
    runtimeGroupId: current.runtimeGroupId,
    label: current.isRoot ? 'Run · start' : `${current.name} · start`,
    kind: 'group-start',
    depth: current.depth,
    commitIdx: current.opensAtCommitIdx,
  });

  // 2) Walk direct children in commit-opening order. Each child contributes
  //    one (or two — for Parallel/Loop) slider positions.
  const children = directChildren(groups, current)
    .filter((g) => !isHiddenAtTopLevel(g));

  for (const child of children) {
    positions.push({
      runtimeStageId: child.runtimeGroupId,
      runtimeGroupId: child.runtimeGroupId,
      label: child.name,
      kind: 'group-start',
      depth: child.depth,
      commitIdx: child.opensAtCommitIdx,
    });
    if (emitsEndPosition(child) && child.closesAtCommitIdx !== undefined) {
      positions.push({
        runtimeStageId: child.runtimeGroupId,
        runtimeGroupId: child.runtimeGroupId,
        label: child.compositionKind === 'Parallel'
          ? `${child.name} · merged`
          : `${child.name} · exit`,
        kind: 'group-end',
        depth: child.depth,
        commitIdx: child.closesAtCommitIdx,
      });
    }
  }

  // 3) Emit the outer group's end if it's a composition that "merges" or
  //    "exits" — or unconditionally for the run-root.
  if (current.isRoot || emitsEndPosition(current)) {
    const endIdx = current.closesAtCommitIdx ?? current.opensAtCommitIdx;
    positions.push({
      runtimeStageId: current.runtimeGroupId,
      runtimeGroupId: current.runtimeGroupId,
      label: current.isRoot ? 'Run · end' : `${current.name} · end`,
      kind: 'group-end',
      depth: current.depth,
      commitIdx: endIdx,
    });
  }

  return positions;
}
