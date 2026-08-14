/**
 * activeChartGroup — which chart nodes belong to the group the cursor is in.
 *
 * Pure function. Layer 1 / Tier B / Lens v0.1.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * On the GROUPED ruler (🔍 Why Lens) one slider stop is one boundary, so the
 * cursor's position IS a group — not a stage. The chart has to say that: the
 * group's members light as ONE unit and everything else recedes. To draw that,
 * a renderer needs the members as CHART NODE IDS, and nothing upstream hands it
 * that list.
 *
 * It is derivable from the recording alone — no new fetch, no new recorder:
 *
 *   the boundary index  → the group's commit range  (`buildGroups`)
 *   the commit log      → the runtimeStageId per commit in that range
 *   `chartNodeIdOf`     → the chart id for each (strip `#executionIndex`)
 *
 * The last step is the rule every other id-matching site in the ecosystem uses
 * (Lens's `coActiveStageIds`, the be-server's chart-click jump): a chart node id
 * is a runtimeStageId minus its `#executionIndex`. The subflow path stays — it
 * is part of the id.
 *
 * ── What the group's box contains ───────────────────────────────────────────
 * Every commit inside `[opensAtCommitIdx … closesAtCommitIdx]`, PLUS the group's
 * own node (its mount). Nested child groups fall inside that range, so their
 * commits are members too — a place contains its rooms. At a drill level where
 * a subflow renders as ONE card, the mount is the only member on screen, and the
 * boundary is drawn around that card; that is why the mount is included rather
 * than assumed present.
 *
 * A member id that is not on the chart right now (a subflow's internals while
 * the chart shows the collapsed card) simply has no node to light. The renderer
 * skips it; nothing is invented.
 */

import type { Group } from './Group.js';
import { groupContainsCommit } from './Group.js';

/**
 * The chart id for a runtimeStageId: everything before `#executionIndex`.
 *
 * `sf-committee/legal/call-llm#4` → `sf-committee/legal/call-llm`. The subflow
 * path is part of the chart id (that is how `structureGraphFromRunner` names
 * the nodes it materialises for a subflow's internals), so only the execution
 * index is dropped. Last-`#` based, like every runtimeStageId parser in the
 * engine.
 */
export function chartNodeIdOf(runtimeStageId: string): string {
  const hash = runtimeStageId.lastIndexOf('#');
  return hash < 0 ? runtimeStageId : runtimeStageId.slice(0, hash);
}

/** The group at the cursor, resolved to chart ids — what a grouped-ruler chart
 *  needs to light one group as a unit. */
export interface ChartGroupHighlight {
  /** The group's identity (its subflow root's runtimeStageId). */
  readonly runtimeGroupId: string;
  /** The group's name — `groupDisplayName`, the same spelling the WHAT
   *  HAPPENED boundary rail uses. Goes on the boundary's chip. */
  readonly name: string;
  /** Chart node ids belonging to this group. Never empty: the group's own
   *  mount is always a member. */
  readonly memberNodeIds: ReadonlySet<string>;
  /** The commit range the membership was read from (inclusive). `closesAt` is
   *  undefined while the group is still in flight. */
  readonly opensAtCommitIdx: number;
  readonly closesAtCommitIdx: number | undefined;
  /** Depth in the boundary tree — 0 is the run root. */
  readonly depth: number;
}

/** One commit as this function reads it — the only field it needs. Structural,
 *  so a `CommitBundle`, a `CommitSyncEntry`, or the be-server's `CommitStop`
 *  all fit without a cast. */
export interface CommitWithStage {
  readonly runtimeStageId?: string | undefined;
}

export interface ActiveChartGroupArgs {
  /** Every group in the run (from `buildGroups`). */
  readonly groups: readonly Group[];
  /** The run's commit log, in commit order (index === commitIdx). */
  readonly commits: readonly CommitWithStage[];
  /** THE cursor, as a commit index. */
  readonly commitIdx: number;
  /**
   * Let the synthetic Run root be the active group. Default `false`: a boundary
   * drawn around the WHOLE chart states nothing, so at a commit no subflow
   * encloses, the honest answer is "no group here" and the chart renders
   * unchanged.
   */
  readonly includeRoot?: boolean;
}

/**
 * The innermost group enclosing `commitIdx`, with its members resolved to chart
 * node ids. `undefined` when no group encloses the cursor (or only the run root
 * does and `includeRoot` is off) — the caller renders the chart as it always did.
 */
export function activeChartGroup(args: ActiveChartGroupArgs): ChartGroupHighlight | undefined {
  const { groups, commits, commitIdx, includeRoot = false } = args;
  if (!Number.isFinite(commitIdx) || commitIdx < 0) return undefined;

  // Innermost enclosing = deepest; ties (a composition and its first member
  // opening on the same commit) break to the one that opened LAST, which is the
  // inner one. Same order `CommitRangeIndex.enclosing()` returns outer→inner.
  let best: Group | undefined;
  for (const group of groups) {
    if (group.isRoot && !includeRoot) continue;
    if (!groupContainsCommit(group, commitIdx)) continue;
    if (best === undefined) {
      best = group;
      continue;
    }
    if (group.depth > best.depth) best = group;
    else if (group.depth === best.depth && group.opensAtCommitIdx >= best.opensAtCommitIdx) best = group;
  }
  if (best === undefined) return undefined;

  const memberNodeIds = new Set<string>();
  // The group's own mount is always a member — at a collapsed drill level it is
  // the only node on screen that IS the group.
  memberNodeIds.add(chartNodeIdOf(best.runtimeGroupId));

  const from = Math.max(0, best.opensAtCommitIdx);
  const to = Math.min(commits.length - 1, best.closesAtCommitIdx ?? commits.length - 1);
  for (let i = from; i <= to; i++) {
    const rid = commits[i]?.runtimeStageId;
    if (rid === undefined || rid === '') continue;
    memberNodeIds.add(chartNodeIdOf(rid));
  }

  return {
    runtimeGroupId: best.runtimeGroupId,
    name: best.name,
    memberNodeIds,
    opensAtCommitIdx: best.opensAtCommitIdx,
    closesAtCommitIdx: best.closesAtCommitIdx,
    depth: best.depth,
  };
}
