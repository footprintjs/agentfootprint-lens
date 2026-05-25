/**
 * Group — a subflow execution. The conceptual container the Lens chart
 * highlights at any cursor position.
 *
 * Layer 1 / Lens v0.1.
 *
 * Naming convention (locked — see
 * `memory/lens_v0_1_one_cursor_architecture.md`):
 *
 *   - `runtimeStageId` = the leaf (one stage execution that wrote one
 *                       commit). THE cursor of the slider.
 *   - `runtimeGroupId` = the group (a subflow execution). Sibling key
 *                       used for chart-box highlight and breadcrumb.
 *
 * Both are runtimeStageIds in form (string `[subflowPath/]stageId#executionIndex`).
 * `runtimeGroupId` is derived from `runtimeStageId` via the boundary index
 * — same address space, two views of the same subflow stack.
 *
 * A Group is a developer-friendly alias for what footprintjs internally
 * exposes as a `BoundaryRangeLabel`. Same data, easier to talk about.
 *
 * Why the alias
 * ─────────────
 *   `BoundaryRangeLabel` is the wire type from agentfootprint. `Group` is
 *   the Lens-facing API name developers see — short, domain-neutral.
 *   Reducing the surface to the fields Lens actually needs makes
 *   testing trivial (we don't need to invent `ts` / `slotKind` etc.
 *   in synthetic test inputs).
 */

export interface Group {
  /** Identity = the subflow root's runtimeStageId. Same format and
   *  address space as a commit's runtimeStageId — both are
   *  `[subflowPath/]stageId#executionIndex`. */
  readonly runtimeGroupId: string;

  /** Display name (the subflow's `subflowName` or the synthetic run-root label). */
  readonly name: string;

  /** Parent group's runtimeGroupId, if nested. `undefined` for the
   *  top-level Run group (no parent). */
  readonly parentGroupId: string | undefined;

  /** Subflow path the engine assigned (e.g. `['__root__', 'sf-Committee', 'sf-ethics']`). */
  readonly subflowPath: readonly string[];

  /** 0 = top-level run, 1 = first subflow level, etc. */
  readonly depth: number;

  /** Commit index at which this group opened. Use with the `commitLog`
   *  array to find the first commit in the group. */
  readonly opensAtCommitIdx: number;

  /** Commit index at which this group closed. `undefined` while the
   *  group is still in-flight (subflow hasn't exited yet — useful for
   *  live-mode rendering). */
  readonly closesAtCommitIdx: number | undefined;

  /** True when the group represents the synthetic Run root (`run.entry`),
   *  false for real subflow boundaries. Lens uses this to skip the root
   *  in breadcrumbs (since the root is implicit). */
  readonly isRoot: boolean;

  /** Composition primitive — set when the boundary range came from a
   *  `composition.start` event (Parallel / Sequence / Loop / Conditional).
   *  Undefined for plain subflows. v0.1 special-cases `'Parallel'` for
   *  inline-pills rendering + start/end-as-positions. */
  readonly compositionKind?: 'Parallel' | 'Sequence' | 'Loop' | 'Conditional';

  /** Slot kind — set on Agent/LLMCall internal context-engineering
   *  subflows (sf-system-prompt / sf-messages / sf-tools). Slider
   *  filters these out at top level; they become visible when the
   *  containing Agent or LLMCall is drilled into. */
  readonly slotKind?: string;

  /** Primitive kind from the subflow root description ('Agent' / 'LLMCall'
   *  / 'Sequence' / etc.). Used to identify drillable leaves (Agent,
   *  LLMCall) vs. compositions. */
  readonly primitiveKind?: string;
}

/** Check whether `commitIdx` falls inside this group's open/close range. */
export function groupContainsCommit(group: Group, commitIdx: number): boolean {
  if (commitIdx < group.opensAtCommitIdx) return false;
  if (group.closesAtCommitIdx === undefined) return true; // open-ended
  return commitIdx <= group.closesAtCommitIdx;
}
