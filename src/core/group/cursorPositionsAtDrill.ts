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
  /**
   * The DOMAIN's classification of this stop, verbatim from the milestone
   * classifier (`'iteration'`, `'llm-turn'`, `'tool-call'`, …; the collapsed
   * slot run carries `'context'`). `undefined` on structural stops and the
   * root bookends. Preserved — rather than flattened into `kind` — because the
   * grouped ruler bands the axis by it (`stepBands`): an `'iteration'` stop is
   * where a new group of steps begins.
   */
  readonly milestone?: string;
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
    // Skip `current`'s OWN boundary commit(s): a subflow's mount commit shares
    // its runtimeGroupId but represents the boundary, NOT an internal milestone.
    // Without this, drilling INTO a classified subflow (e.g. the Injection
    // Engine — classified as `iteration`) surfaces its OWN boundary as bogus
    // "Iteration" stops, masking the subflow's internal stages (the overlay
    // fallback below never runs because this path looks non-empty).
    if (stripExecIndex(c.runtimeStageId) === stripExecIndex(current.runtimeGroupId)) continue;
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
        // Light ONLY the slots whose contribution actually CHANGED this turn.
        // A slot's change surfaces in the parent context-mount commit's overwrite,
        // keyed by its injection key (the slot's own subflow commit is empty — it
        // bubbles via outputMapper). footprintjs commits are change-only, so an
        // unchanged slot's key is simply absent.
        const changedKeys = changedSlotKeys(run, groups, commits);
        const matched = run.filter((r) => {
          const k = slotInjectionKey(r.runtimeGroupId);
          return k !== null && changedKeys.has(k);
        });
        // Safety: if we couldn't attribute ANY change (no commit-key data, or a
        // non-agentfootprint consumer), fall back to lighting ALL slots — never
        // light nothing at a Context stop.
        const changed = matched.length > 0 ? matched : run;
        // Cursor anchors on the first CHANGED slot so the cursor's own group is a
        // lit one (the highlight ORs the cursor group into the active set).
        const anchor = changed[0]!;
        collapsed.push({
          runtimeStageId: anchor.runtimeStageId,
          runtimeGroupId: anchor.runtimeGroupId,
          commitIdx: anchor.commitIdx,
          depth: anchor.depth,
          kind: 'parallel',
          label: 'Context',
          coActiveGroupIds: changed.map((r) => r.runtimeGroupId),
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
      // The domain's own word for the stop, kept for the grouped ruler's
      // banding. The collapsed slot run is 'context' (its label's word).
      milestone: r.kind === 'parallel' ? 'context' : r.kind,
      ...(r.coActiveGroupIds && r.coActiveGroupIds.length > 0
        ? { coActiveGroupIds: r.coActiveGroupIds }
        : {}),
    };
  });
}

/**
 * agentfootprint slot subflow id → its injection scope key. The lens IS the
 * agentfootprint consumer, so this mapping is intentional + local. Returns null
 * for a non-slot group.
 */
function slotInjectionKey(runtimeGroupId: string): string | null {
  if (runtimeGroupId.includes('system-prompt')) return 'systemPromptInjections';
  if (runtimeGroupId.includes('messages')) return 'messagesInjections';
  if (runtimeGroupId.includes('tools')) return 'toolsInjections';
  return null;
}

/**
 * Which slot injection keys CHANGED across a slot run's commit span — i.e. which
 * slots' contributions actually mutated this turn. A slot's change lands in the
 * parent context-mount commit's (change-only) overwrite keys, which fire as the
 * slot subflow exits — so we scan the commits spanning the run's open→close
 * (plus a small margin for the exit/outputMapper commit).
 */
function changedSlotKeys(
  run: readonly { readonly runtimeGroupId: string; readonly commitIdx: number }[],
  groups: readonly Group[],
  commits: readonly CommitSyncEntry[],
): ReadonlySet<string> {
  const SLOT_KEYS = new Set(['systemPromptInjections', 'messagesInjections', 'toolsInjections']);
  let start = Infinity;
  let end = -Infinity;
  for (const r of run) {
    const g = groups.find((gg) => gg.runtimeGroupId === r.runtimeGroupId);
    start = Math.min(start, r.commitIdx, g?.opensAtCommitIdx ?? r.commitIdx);
    end = Math.max(end, g?.closesAtCommitIdx ?? r.commitIdx);
  }
  // The context-mount (outputMapper) commit carrying each slot's injection key
  // fires around the slot boundary — sometimes just BEFORE the slot's open,
  // sometimes among the slots. Widen the window both sides to catch them.
  // Only context-mount commits carry SLOT_KEYS, so a generous window can't
  // pick up unrelated commits; iterations are far enough apart not to bleed.
  const MARGIN = 4;
  start -= MARGIN;
  end += MARGIN;
  const changed = new Set<string>();
  for (const c of commits) {
    if (c.commitIdx < start || c.commitIdx > end) continue;
    for (const k of c.overwriteKeys) if (SLOT_KEYS.has(k)) changed.add(k);
  }
  return changed;
}

/**
 * Minimal shape of a runtime-overlay execution-order entry the drilled-cursor
 * logic needs. Mirrors explain-ui's `TraceRuntimeOverlay.executionOrder[i]`,
 * kept local so this core module doesn't depend on the renderer's types.
 */
export interface ExecOrderEntry {
  /** Full runtimeStageId WITH `#executionIndex` (e.g. `sf-injection-engine/gather#2`). */
  readonly runtimeStageId: string;
  /** Local stage id (e.g. `gather`). */
  readonly stageId?: string;
  /** Human display name (e.g. `Gather`). */
  readonly stageName?: string;
  /** ms since run start (mirrors eui's `RuntimeExecutionStep.timestampMs`) —
   *  used as a timestamp fallback for timeline moments. */
  readonly timestampMs?: number;
}

/** Strip the trailing `#executionIndex`, mirroring eui's overlay id match. */
function stripExecIndex(id: string): string {
  const i = id.lastIndexOf('#');
  return i >= 0 ? id.slice(0, i) : id;
}

/**
 * Cursor stops for a drilled subflow whose internal stages are NEITHER child
 * groups NOR parent-log commits — e.g. the agent's Injection Engine, whose
 * Gather/Evaluate/Route/Delta run in the subflow's OWN memory scope, so their
 * commits never reach the parent commit log (verified: footprintjs records a
 * subflow as ONE mount-boundary commit). They DO appear in the runtime overlay's
 * `executionOrder` (the engine fires stage events globally, path-prefixed), so we
 * derive the drill's scrub stops from there — the one source that actually has
 * them. This is why a drilled subflow's internals now light as you scrub, where
 * the commit-log-only path could never reach them.
 *
 * Scope = THIS drilled iteration only. From the drilled subflow's boundary entry,
 * walk `executionOrder` FORWARD collecting the subflow's DIRECT internal stages
 * (prefix-match, no deeper `/`), stopping at the first entry that LEAVES the
 * subflow. A looping subflow's later iterations are separated by the parent's own
 * stages, so the walk naturally ends at this iteration's boundary. Nested
 * subflows surface as a single (drillable) boundary stop — their own internals
 * are walked over here, revealed by drilling again.
 *
 * Each stop's `runtimeStageId` is the EXACT overlay id (WITH `#index`) so
 * `LensFlow`'s `executionOrder.findIndex` resolves a scrubIndex and `TracedFlow`
 * lights the matching node as the cursor reaches it.
 */
function subflowInternalPositions(
  current: Group,
  executionOrder: readonly ExecOrderEntry[],
): CursorPosition[] {
  const prefix = `${stripExecIndex(current.runtimeGroupId)}/`;
  const boundaryIdx = executionOrder.findIndex(
    (e) => e.runtimeStageId === current.runtimeGroupId,
  );
  if (boundaryIdx < 0) return [];

  const raw: { runtimeStageId: string; label: string }[] = [];
  for (let i = boundaryIdx + 1; i < executionOrder.length; i++) {
    const e = executionOrder[i]!;
    const stripped = stripExecIndex(e.runtimeStageId);
    if (!stripped.startsWith(prefix)) break; // left the subflow → iteration done
    const rest = stripped.slice(prefix.length);
    if (rest.includes('/')) continue; // grandchild (inside a nested subflow) — skip
    // Label from the stage's display name. The engine prefixes a subflow stage's
    // name with its path (`sf-injection-engine/Gather`); strip ONLY that KNOWN
    // prefix — not any `/`, which would mangle a legit name like `Read/Write` or
    // `I/O` — and fall back to the already-prefix-free local id.
    const name = e.stageName ?? e.stageId ?? rest;
    const label = name.startsWith(prefix) ? name.slice(prefix.length) : name;
    raw.push({ runtimeStageId: e.runtimeStageId, label });
  }

  // Ordinal repeated labels (a nested loop could re-run an internal stage).
  const totals = new Map<string, number>();
  for (const r of raw) totals.set(r.label, (totals.get(r.label) ?? 0) + 1);
  const seen = new Map<string, number>();
  return raw.map((r) => {
    const n = (seen.get(r.label) ?? 0) + 1;
    seen.set(r.label, n);
    const label = (totals.get(r.label) ?? 0) > 1 ? `${r.label} ${n}` : r.label;
    return {
      runtimeStageId: r.runtimeStageId,
      runtimeGroupId: r.runtimeStageId,
      label,
      kind: 'commit' as const,
      depth: current.depth + 1,
      // No per-internal commit exists (subflow-scoped); anchor the data view to
      // the subflow's open commit so the details panel shows the subflow's state.
      commitIdx: current.opensAtCommitIdx,
    };
  });
}

export function cursorPositionsAtDrill(
  groups: readonly Group[],
  commits: readonly CommitSyncEntry[],
  drillPath: readonly string[],
  milestoneFor?: MilestoneClassifier,
  executionOrder?: readonly ExecOrderEntry[],
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
    const structural = structuralPositions(current, groups);
    if (structural.length > 0) {
      positions.push(...structural);
      // NOTE (exclusive-source assumption): structural and overlay-internal stops
      // are mutually exclusive here. A MIXED subflow — plain stages PLUS a nested
      // sub-subflow — would take this branch (the nested child group is structural)
      // and its plain stages would get no scrub stops. No shipping subflow has that
      // shape today (the Injection Engine is 4 plain stages → structural empty →
      // overlay branch below). When a mixed shape ships, make these additive:
      // merge structural child-group stops with overlay stops for plain stages not
      // covered by a child group, sorted by executionOrder position.
    } else if (drillPath.length > 0 && executionOrder && executionOrder.length > 0) {
      // Drilled into a subflow whose internals are NEITHER child groups NOR
      // parent-log commits (their commits live in the subflow's own memory
      // scope) — e.g. the Injection Engine's Gather/Evaluate/Route/Delta. The
      // milestone + structural paths above find nothing for it. Derive the
      // scrub stops from the runtime overlay's executionOrder, which is the one
      // place those stage executions DO appear, so the internals light on scrub.
      positions.push(...subflowInternalPositions(current, executionOrder));
    }
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
