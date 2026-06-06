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

/** Synthetic runtimeStageIds for the lens-only "User · sends" / "User
 *  · receives" slider bookends. These are NOT footprintjs ids — they
 *  exist solely to give lens distinct cursor states for "before the
 *  chart ran" and "after the chart returned". The runtime overlay
 *  branches on these to gate visible state (empty vs full). */
export const LENS_USER_IN_RUNTIME_ID = '__lens_user_in__#0';
export const LENS_USER_OUT_RUNTIME_ID = '__lens_user_out__#0';

/**
 * Domain-declared milestone classifier (e.g. agentfootprint's `milestoneFor`).
 * Given a stage/group id, returns the milestone it anchors — or `null` when the
 * id is NOT a scrub-worthy step (its commits fold into the surrounding
 * milestone's collection). Injected so this module stays domain-agnostic.
 */
export type MilestoneClassifier = (id: string) => { readonly kind: string; readonly label: string } | null;

export interface CursorPosition {
  /** Slider value — a runtimeStageId in footprintjs's address space,
   *  OR one of the lens-synthetic ids above for user-in/user-out. */
  readonly runtimeStageId: string;
  /** Same as runtimeStageId when this position IS a group's start/end. */
  readonly runtimeGroupId: string;
  /** Human-readable label ("Committee · forks", "merged", "Run · start"). */
  readonly label: string;
  /** Discriminates slider tick rendering. `user-in` and `user-out` are
   *  lens-synthesized bookends at top-level drill. `parallel` is a single stop
   *  that represents a parallel fork — see `coActiveGroupIds`. */
  readonly kind: 'group-start' | 'group-end' | 'commit' | 'user-in' | 'user-out' | 'parallel';
  /** Depth in the outline (for indentation / breadcrumb sync). */
  readonly depth: number;
  /** Commit index this position anchors to (for footprintjs jumpTo). */
  readonly commitIdx: number;
  /**
   * When this stop represents a PARALLEL fork (the context slots, or parallel
   * branches), the runtimeGroupIds of ALL concurrent branches that ran — so the
   * chart can highlight them SIMULTANEOUSLY at this one stop. `undefined` for
   * ordinary single-node stops (old behaviour byte-identical). The canonical
   * `runtimeStageId` above is still ONE id (the earliest-opening branch — the
   * fork anchor); this is auxiliary chart-highlight data only, never a second
   * cursor. The one-cursor invariant holds: panels (commentary/details/trace)
   * stay on `runtimeStageId`; only the CHART lights the whole set.
   */
  readonly coActiveGroupIds?: readonly string[];
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

/** The CONCURRENT branches of a `Parallel` composition (its direct member groups
 *  that ran at the same time). Branches are the composition's `directChildren`
 *  (buildGroups parents a composition's members to the composition group); a
 *  trailing merge that opens only after the branches close overlaps no sibling
 *  and is excluded (it gets its own `merged` end stop). These ids (after `#`
 *  strip) match the rendered branch node ids, so the chart lights them together
 *  at the composition's stop. */
function parallelBranchIds(composition: Group, groups: readonly Group[]): string[] {
  const members = directChildren(groups, composition);
  const closeOf = (g: Group): number => g.closesAtCommitIdx ?? Number.MAX_SAFE_INTEGER;
  return members
    .filter((k) =>
      members.some(
        (o) => o !== k && o.opensAtCommitIdx <= closeOf(k) && k.opensAtCommitIdx <= closeOf(o),
      ),
    )
    .map((g) => g.runtimeGroupId);
}

/**
 * Structural cursor stops — the path used when no domain MILESTONES apply (plain
 * control-flow charts: Sequence / Conditional / Loop / Parallel, and non-agent
 * subflow trees). Milestone charts (agents) never reach here.
 *
 * Rule: ONE stop per VISIBLE step at this drill level. COMPOSITIONS are
 * TRANSPARENT — the cursor descends through them so the user scrubs the actual
 * steps, not just the wrapper box (the old behaviour emitted a single stop for
 * the whole composition, so a top-level Sequence/Conditional/Loop got only one
 * scrub stop and its steps never lit). Per composition kind:
 *   - Sequence    → composition-start, then one stop per step (in order).
 *   - Conditional → composition-start, then the chosen branch (only it ran, so
 *                   only it is a member group).
 *   - Loop        → composition-start, one stop per body iteration, then `exit`.
 *   - Parallel    → ONE stop lighting all concurrent branches at once
 *                   (`coActiveGroupIds`) — they ran simultaneously, so NOT
 *                   one-per-branch — plus a `merged` end.
 * Plain (non-composition) subflows are LEAF stops; descent recurses through
 * nested compositions but stops at plain subflows (drill in to see their slots).
 *
 * Members are found by PARENT pointer (`directChildren`), NOT commit containment:
 * buildGroups parents a composition's members to the composition group, so the
 * ROOT (parent: undefined) and same-level SIBLINGS can never be mistaken for
 * members. A commit-range scan WOULD misfire — a top-level composition shares the
 * root's open commit (0) and, while in-flight, its open-ended close — capturing
 * the root (and later siblings) as phantom member stops.
 *
 * Each stop's `runtimeStageId` is a real group id whose `#`-stripped form matches
 * the rendered chart node id, so the runtime overlay lights the right node(s).
 */
function structuralPositions(current: Group, groups: readonly Group[]): CursorPosition[] {
  const out: CursorPosition[] = [];
  emitMembers(directChildren(groups, current), groups, out, new Set());
  return out;
}

/** Emit a sibling cohort of member groups, ordinal-suffixing repeated PRIMARY
 *  (first-stop) labels SCOPED to this cohort — so "body 1 / 2 / 3" counts within
 *  ONE loop and a second loop's bodies restart at "body 1". Each member's own
 *  sub-stops live in their own buffer so the ordinal keys on the member's headline
 *  label, never its internals. Hidden (slot) members are skipped. */
function emitMembers(
  members: readonly Group[],
  groups: readonly Group[],
  out: CursorPosition[],
  visited: ReadonlySet<string>,
): void {
  const buffers: CursorPosition[][] = [];
  for (const m of members) {
    if (isHiddenAtTopLevel(m)) continue;
    const buf: CursorPosition[] = [];
    appendGroupStops(m, groups, buf, visited);
    if (buf.length > 0) buffers.push(buf);
  }
  const totals = new Map<string, number>();
  for (const buf of buffers) totals.set(buf[0]!.label, (totals.get(buf[0]!.label) ?? 0) + 1);
  const seen = new Map<string, number>();
  for (const buf of buffers) {
    const label = buf[0]!.label;
    if ((totals.get(label) ?? 0) > 1) {
      const n = (seen.get(label) ?? 0) + 1;
      seen.set(label, n);
      buf[0] = { ...buf[0]!, label: `${label} ${n}` };
    }
    out.push(...buf);
  }
}

/** Emit the cursor stop(s) for one group, descending through compositions.
 *  `visited` carries the runtimeGroupIds on the current descent path; a group
 *  reached again (only possible via a malformed parentGroupId cycle A↔B) is
 *  emitted as a single leaf stop instead of recursing forever. */
function appendGroupStops(
  g: Group,
  groups: readonly Group[],
  out: CursorPosition[],
  visited: ReadonlySet<string>,
): void {
  const startStop = (label: string): CursorPosition => ({
    runtimeStageId: g.runtimeGroupId,
    runtimeGroupId: g.runtimeGroupId,
    label,
    kind: 'group-start',
    depth: g.depth,
    commitIdx: g.opensAtCommitIdx,
  });
  const endStop = (label: string): CursorPosition => ({
    runtimeStageId: g.runtimeGroupId,
    runtimeGroupId: g.runtimeGroupId,
    label,
    kind: 'group-end',
    depth: g.depth,
    commitIdx: g.closesAtCommitIdx!,
  });

  if (g.compositionKind === 'Parallel') {
    // Concurrent fork: ONE stop lighting every branch at once.
    const branchIds = parallelBranchIds(g, groups);
    out.push({ ...startStop(g.name), ...(branchIds.length >= 2 ? { coActiveGroupIds: branchIds } : {}) });
    if (g.closesAtCommitIdx !== undefined) out.push(endStop(`${g.name} · merged`));
    return;
  }

  if (g.compositionKind === 'Sequence' || g.compositionKind === 'Conditional' || g.compositionKind === 'Loop') {
    out.push(startStop(g.name));
    // Cycle guard: only descend if this composition isn't already on the path.
    if (!visited.has(g.runtimeGroupId)) {
      const nextVisited = new Set(visited);
      nextVisited.add(g.runtimeGroupId);
      emitMembers(directChildren(groups, g), groups, out, nextVisited);
    }
    if (g.compositionKind === 'Loop' && g.closesAtCommitIdx !== undefined) out.push(endStop(`${g.name} · exit`));
    return;
  }

  // Plain (non-composition) subflow — a leaf stop; do NOT descend (drill in for
  // its slots). This is a step/branch/iteration member, or a bare subflow.
  out.push(startStop(g.name));
}

/**
 * Domain-declared MILESTONE stops at the current drill level. A milestone is a
 * stage the domain marks as scrub-worthy (the boundary of a COLLECTION of
 * commits). Two sources, merged in commit order:
 *
 *   - child GROUPS directly under `current` whose id classifies (e.g. the
 *     injection-engine subflow → an `iteration` boundary), and
 *   - direct COMMITS in `current` (not inside a deeper child group) whose stage
 *     classifies (e.g. `call-llm` → llm-turn, `tool-calls` → tool-call).
 *
 * Each stop is a real commit's `runtimeStageId`, so the one-cursor invariant
 * holds. Repeated kinds get an ordinal ("LLM turn 1", "LLM turn 2").
 */
function milestonePositions(
  current: Group,
  groups: readonly Group[],
  commits: readonly CommitSyncEntry[],
  classify: MilestoneClassifier,
): CursorPosition[] {
  interface Raw {
    runtimeStageId: string;
    runtimeGroupId: string;
    commitIdx: number;
    depth: number;
    kind: string;
    label: string;
    /** Set on a collapsed parallel ("Context") stop — the concurrent branches. */
    coActiveGroupIds?: string[];
  }
  const raw: Raw[] = [];

  // Source 1 — child groups that classify (e.g. the per-iteration loop entry).
  for (const child of directChildren(groups, current)) {
    const m = classify(child.runtimeGroupId);
    if (!m) continue;
    raw.push({
      runtimeStageId: child.runtimeGroupId,
      runtimeGroupId: child.runtimeGroupId,
      commitIdx: child.opensAtCommitIdx,
      depth: child.depth,
      kind: m.kind,
      label: m.label,
    });
  }

  // Source 2 — commits directly in `current` (innermost enclosing group IS
  // current, so NOT inside a deeper child subflow) whose stage classifies.
  for (const c of commits) {
    if (c.runtimeGroupId !== current.runtimeGroupId) continue;
    const m = classify(c.runtimeStageId);
    if (!m) continue;
    raw.push({
      runtimeStageId: c.runtimeStageId,
      runtimeGroupId: current.runtimeGroupId,
      commitIdx: c.commitIdx,
      depth: current.depth + 1,
      kind: m.kind,
      label: m.label,
    });
  }

  raw.sort((a, b) => a.commitIdx - b.commitIdx);

  // Collapse a maximal CONSECUTIVE run of 'slot' stops into ONE 'parallel'
  // "Context" stop — the slots run concurrently, so the chart should light them
  // all at once rather than stepping through them one-by-one. A run of ONE slot
  // (classic mode, where only Messages re-ran) stays an individual stop, so
  // "which slot got updated" still reads. The collapsed stop carries
  // `coActiveGroupIds` = every concurrent branch's group id; its canonical
  // cursor is the earliest-opening branch (one-cursor invariant intact).
  const collapsed: Raw[] = [];
  for (let i = 0; i < raw.length; ) {
    if (raw[i]!.kind === 'slot') {
      let j = i;
      while (j < raw.length && raw[j]!.kind === 'slot') j++;
      const run = raw.slice(i, j);
      if (run.length >= 2) {
        const anchor = run[0]!; // earliest-opening (raw is sorted by commitIdx)
        collapsed.push({
          runtimeStageId: anchor.runtimeStageId,
          runtimeGroupId: anchor.runtimeGroupId,
          commitIdx: anchor.commitIdx,
          depth: anchor.depth,
          kind: 'parallel',
          label: 'Context',
          coActiveGroupIds: run.map((r) => r.runtimeGroupId),
        });
      } else {
        collapsed.push(run[0]!); // single slot → keep individual ("Messages")
      }
      i = j;
    } else {
      collapsed.push(raw[i]!);
      i++;
    }
  }

  // Ordinal repeated LABELS so the slider reads "Iteration 1 / 2 / 3",
  // "Context 1 / 2 / 3", "Messages 1 / 2 / 3" independently (per-label).
  const totals = new Map<string, number>();
  for (const r of collapsed) totals.set(r.label, (totals.get(r.label) ?? 0) + 1);
  const seen = new Map<string, number>();
  return collapsed.map((r) => {
    const n = (seen.get(r.label) ?? 0) + 1;
    seen.set(r.label, n);
    const label = (totals.get(r.label) ?? 0) > 1 ? `${r.label} ${n}` : r.label;
    return {
      runtimeStageId: r.runtimeStageId,
      runtimeGroupId: r.runtimeGroupId,
      label,
      kind: (r.kind === 'parallel' ? 'parallel' : 'commit') as CursorPosition['kind'],
      depth: r.depth,
      commitIdx: r.commitIdx,
      ...(r.coActiveGroupIds && r.coActiveGroupIds.length > 0
        ? { coActiveGroupIds: r.coActiveGroupIds }
        : {}),
    };
  });
}

export function cursorPositionsAtDrill(
  groups: readonly Group[],
  commits: readonly CommitSyncEntry[],
  drillPath: readonly string[],
  milestoneFor?: MilestoneClassifier,
): readonly CursorPosition[] {
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

  // 2) Middle positions. PREFER domain-declared MILESTONES (stage-by-stage
  //    scrub stops: iteration → llm-turn → tool-call → decision) when a
  //    classifier is supplied AND it actually classifies something at this
  //    level. Otherwise FALL BACK to the structural walk (one stop per visible
  //    step, descending transparently through compositions) — which keeps
  //    multi-agent supervisor levels + plain control-flow charts scrubbing.
  const middle = milestoneFor
    ? milestonePositions(current, groups, commits, milestoneFor)
    : [];
  if (middle.length > 0) {
    positions.push(...middle);
  } else {
    positions.push(...structuralPositions(current, groups));
  }

  // 3) Emit the outer group's end position ONLY when the group has
  //    actually closed — i.e., the chart has returned and root.exit
  //    has fired. Previously this emitted unconditionally and fell
  //    back to `opensAtCommitIdx` when `closesAtCommitIdx` was undefined,
  //    which meant the slider showed `Run · end` from the moment the
  //    chart started running — before any of the commits between start
  //    and end had actually fired. Confusing UX: the user could scrub
  //    to the "end" position while the LLM was still in flight.
  //
  //    Now we gate on `closesAtCommitIdx !== undefined`. Mid-run the
  //    slider shows positions for commits that have actually happened;
  //    once the run completes the end position appears. The slider grows
  //    progressively, matching the user's mental model of "this is what
  //    has happened so far."
  if ((current.isRoot || emitsEndPosition(current)) && current.closesAtCommitIdx !== undefined) {
    positions.push({
      runtimeStageId: current.runtimeGroupId,
      runtimeGroupId: current.runtimeGroupId,
      label: current.isRoot ? 'Run · end' : `${current.name} · end`,
      kind: 'group-end',
      depth: current.depth,
      commitIdx: current.closesAtCommitIdx,
    });
  }

  // The previous version of this function prepended/appended synthetic
  // `User · sends` / `User · receives` cursor positions to bookend the
  // top-level Run view. They were a workaround for atomic LLMCall having
  // only a single commit (run.entry/run.exit collapsed onto the root
  // group's runtimeGroupId, making the slider's start/end indistinguishable
  // for the runtime overlay).
  //
  // That workaround is no longer needed: LLMCall now wraps its
  // invocation in a real `sf-llm-call` subflow, giving atomic LLMCall
  // three real footprintjs commit positions at top level — root.start,
  // sf-llm-call#1, root.end — which the runtime overlay can discriminate
  // by runtimeStageId without any lens-side synthesis.
  //
  // The constants `LENS_USER_IN_RUNTIME_ID` / `LENS_USER_OUT_RUNTIME_ID`
  // and the `user-in` / `user-out` kind values stay exported on the
  // interface for now; nothing currently produces them, but the kinds
  // remain reserved for future affordances (e.g., chat-mode where
  // pause+resume around a Client stage could legitimately surface
  // user-facing scrub points).

  return positions;
}
