/**
 * selectCommentary — Phase 5 Layer 3 selectors over BoundaryRecorder's
 * commit-range index. Pure functions; no framework imports.
 *
 * `selectCommentaryAt(boundary, commitIdx)` returns the active chip +
 * breadcrumb + sibling list at one commit position.
 *
 * `selectCommentaryRanges(boundary)` returns all known ranges as a
 * flat list for snap-point rendering in the slider.
 *
 * See `docs/design/commentary-slider.md` for the contract.
 */

import type { BoundaryRecorder, BoundaryRangeLabel } from 'agentfootprint';

// Re-export the label type so consumers of this selector get the
// same shape without reaching into agentfootprint directly.
export type { BoundaryRangeLabel };

export interface CommentaryAtCommit {
  /** Leaf-most enclosing boundary at this commit — the ACTIVE chip.
   *  Undefined if no boundary encloses the position (e.g., commit at
   *  index 0 before any subflow opened). */
  readonly active: BoundaryRangeLabel | undefined;
  /** All enclosing boundaries, ordered outer→inner. Renders as the
   *  breadcrumb path. Parallel-sibling boundaries (e.g., legal +
   *  ethics in a Committee) both appear here when commitIdx lies in
   *  the overlap — consumers that need a strict tree path should
   *  filter by `depth` or `subflowPath` prefix. */
  readonly breadcrumb: readonly BoundaryRangeLabel[];
}

export interface CommentaryRange {
  readonly label: BoundaryRangeLabel;
  readonly startIdx: number;
  /** Undefined while the range is still open (mid-run boundary). */
  readonly endIdx: number | undefined;
}

/**
 * Snap a commit position to its commentary state — active chip +
 * breadcrumb path.
 *
 * Both results derive from BoundaryRecorder's CommitRangeIndex —
 * Layer 2 owns the data, this selector projects it for UI.
 *
 * Note on siblings: an earlier draft computed parallel-sibling
 * boundaries via `overlapping(commitIdx, commitIdx) - enclosing(commitIdx)`,
 * but at a single-point query those sets are identical — the subtraction
 * is always empty. Proper sibling computation needs a tree-walk over
 * the breadcrumb (group ranges by depth and detect parents). Deferred
 * to a future layer; for now consumers can compute siblings themselves
 * by filtering `breadcrumb` by depth.
 */
export function selectCommentaryAt(
  boundary: BoundaryRecorder,
  commitIdx: number,
): CommentaryAtCommit {
  if (!Number.isFinite(commitIdx) || commitIdx < 0) {
    return { active: undefined, breadcrumb: [] };
  }
  const enclosing = boundary.boundaryIndex.enclosing(commitIdx);
  const breadcrumb = enclosing.map((e) => e.label as BoundaryRangeLabel);
  const active = breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1] : undefined;
  return { active, breadcrumb };
}

/**
 * Get all commit-range entries (open + closed) for snap-point
 * rendering. Returns a stable order: by `startIdx` ascending. Used by
 * the slider in commentary mode to mark each range's entry position
 * as a snap target.
 *
 * We query `overlapping(0, +Infinity)` (effectively all ranges) — the
 * underlying CommitRangeIndex doesn't expose a "list all" method, but
 * a wide-overlap query returns every range. O(N) on the index.
 */
export function selectCommentaryRanges(
  boundary: BoundaryRecorder,
): readonly CommentaryRange[] {
  const all = boundary.boundaryIndex.overlapping(0, Number.MAX_SAFE_INTEGER);
  return all.map((e) => ({
    label: e.label as BoundaryRangeLabel,
    startIdx: e.startIdx,
    endIdx: e.endIdx,
  }));
}

