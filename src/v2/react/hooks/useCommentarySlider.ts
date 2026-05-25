/**
 * useCommentarySlider — Phase 5 Layer 3 React hook for the commit-axis
 * commentary slider. Subscribes to the LensRecorder's change-notifier
 * for live updates and projects the commentary state for the slider
 * UI to render.
 *
 * See `docs/design/commentary-slider.md` (sections 4 + 7) for the
 * contract.
 *
 * Two modes:
 *   - `commit`     — slider snaps to every commit index
 *   - `commentary` — slider snaps to boundary range entry points
 *
 * Both modes share the same `commitIdx` state. Mode change is purely
 * cosmetic — the underlying time axis is the commit log.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSyncExternalStore } from 'react';
import type { LensRecorder } from '../../core/LensRecorder.js';
import {
  selectCommentaryAt,
  selectCommentaryRanges,
  type CommentaryAtCommit,
  type CommentaryRange,
} from '../../core/selectors/selectCommentary.js';

export type CommentarySliderMode = 'commit' | 'commentary';

export interface UseCommentarySliderResult {
  /** Current slider position on the commit-log axis. */
  readonly commitIdx: number;
  /** Current slider mode. */
  readonly mode: CommentarySliderMode;
  /** Total commit count for slider extent. */
  readonly totalCommits: number;
  /** Commentary snap points (commentary mode). Each is a range entry
   *  index. Empty array if mode is `commit` (every position is a snap). */
  readonly snapPoints: readonly number[];
  /** Commentary state at the current slider position. */
  readonly active: CommentaryAtCommit;
  /** All known ranges — UI may render them as chips on the slider track. */
  readonly ranges: readonly CommentaryRange[];
  /** Move slider to a specific commit index. Clamped to [0, totalCommits-1]. */
  setCommitIdx: (idx: number) => void;
  /** Switch between commit-by-commit and commentary-by-commentary modes. */
  setMode: (mode: CommentarySliderMode) => void;
  /** Drill into a specific commentary range — switches mode to `commit`
   *  and clamps subsequent slider movement to [range.startIdx, range.endIdx]. */
  drillInto: (range: CommentaryRange) => void;
  /** When drilled in, the range we're clamped to. Undefined otherwise. */
  readonly drillRange: CommentaryRange | undefined;
}

/** Internal — snapshot of a CommentaryRange. We capture by VALUE
 *  (not by reference) when drillInto fires so the drillRange state
 *  stays accurate even when the ranges array re-allocates on each
 *  version bump. Open ranges (endIdx undefined) are captured as-is.
 *
 *  `runtimeStageId` is the STABLE IDENTITY key — design pattern panel
 *  caught a collision bug where lookup by `startIdx` returned the
 *  first matching sibling in a Parallel fork (where all branches
 *  open at the same commit). runtimeStageId is unique per execution
 *  per Layer 2 contract. */
interface DrillSnapshot {
  readonly startIdx: number;
  readonly endIdx: number | undefined;
  readonly runtimeStageId: string;
}

export function useCommentarySlider(
  recorder: LensRecorder,
  initialMode: CommentarySliderMode = 'commentary',
): UseCommentarySliderResult {
  // Subscribe via the recorder's ChangeNotifier — re-renders on every
  // observed event so the slider tracks the live run. The returned
  // `version` IS the captured snapshot — use it as the memo dep
  // (panel review RED: don't call getVersion() inline in dep arrays).
  const version = useSyncExternalStore(
    (listener) => recorder.subscribe(listener),
    () => recorder.getVersion(),
    () => recorder.getVersion(),
  );

  const [commitIdx, setCommitIdxRaw] = useState(0);
  const [mode, setMode] = useState<CommentarySliderMode>(initialMode);
  const [drill, setDrill] = useState<DrillSnapshot | undefined>(undefined);

  const ranges = useMemo(
    () => selectCommentaryRanges(recorder.boundary),
    // version captured at render time — re-derives on every notify.
    [recorder, version],
  );
  // Design doc Law 1: slider total = commitLog.length, NOT the max
  // boundary endIdx. During a live run with open boundaries, the
  // commit log keeps growing past any `startIdx` we've seen, so
  // ranges-derived bounds undercount. Use LensRecorder's live
  // accessor (Layer 3 added this) and fall back to ranges only if
  // the runner isn't wired (legacy mode).
  const totalCommits = useMemo(() => {
    const live = recorder.getCommitCount();
    if (live > 0) return live;
    if (ranges.length === 0) return 0;
    let max = 0;
    for (const r of ranges) {
      if (r.endIdx !== undefined && r.endIdx > max) max = r.endIdx;
      else if (r.startIdx > max) max = r.startIdx;
    }
    return max + 1;
  }, [recorder, ranges, version]);

  const snapPoints = useMemo(() => {
    if (mode === 'commit') return [];
    return ranges.map((r) => r.startIdx);
  }, [mode, ranges]);

  const setCommitIdx = useCallback(
    (idx: number) => {
      // Reject non-finite inputs (security panel: NaN/Infinity must
      // not propagate into the index query).
      if (!Number.isFinite(idx)) return;
      const max = Math.max(0, totalCommits - 1);
      const low = drill ? Math.max(0, drill.startIdx) : 0;
      const high = drill ? Math.min(max, drill.endIdx ?? max) : max;
      const clamped = Math.min(Math.max(idx, low), high);
      setCommitIdxRaw(clamped);
    },
    [totalCommits, drill],
  );

  const drillInto = useCallback(
    (range: CommentaryRange) => {
      // Validate input — reject fake ranges with non-finite bounds
      // (security panel YELLOW: Infinity could freeze the slider).
      if (!Number.isFinite(range.startIdx) || range.startIdx < 0) return;
      if (range.endIdx !== undefined && !Number.isFinite(range.endIdx)) return;
      // Require a stable identity key (design pattern panel RED) —
      // labels without runtimeStageId would collide on startIdx.
      const rid = (range.label as { runtimeStageId?: string }).runtimeStageId;
      if (!rid) return;

      const snapshot: DrillSnapshot = {
        startIdx: range.startIdx,
        endIdx: range.endIdx,
        runtimeStageId: rid,
      };
      setDrill(snapshot);
      setMode('commit');
      // Inline clamp — don't reach into setCommitIdx (its closure on
      // `drill` hasn't yet observed the setDrill() above this tick).
      const max = Math.max(0, totalCommits - 1);
      const high = Math.min(max, snapshot.endIdx ?? max);
      const clamped = Math.min(Math.max(snapshot.startIdx, 0), high);
      setCommitIdxRaw(clamped);
    },
    [totalCommits],
  );

  // When the slider moves out of the drill range, exit drill mode.
  useEffect(() => {
    if (!drill) return;
    const inRange =
      commitIdx >= drill.startIdx &&
      (drill.endIdx === undefined || commitIdx <= drill.endIdx);
    if (!inRange) setDrill(undefined);
  }, [commitIdx, drill]);

  const active = useMemo(
    () => selectCommentaryAt(recorder.boundary, commitIdx),
    [recorder, commitIdx, version],
  );

  // Reconstruct the full CommentaryRange (with label) from `ranges`
  // by matching the stable runtimeStageId. startIdx alone is not
  // unique — Parallel branches share startIdx; matching by it would
  // return the wrong sibling (design pattern panel RED). We don't
  // store the label directly in state because labels are new object
  // references on each version bump from selectCommentaryRanges.
  const drillRange = useMemo<CommentaryRange | undefined>(() => {
    if (!drill) return undefined;
    return ranges.find(
      (r) =>
        (r.label as { runtimeStageId?: string }).runtimeStageId ===
        drill.runtimeStageId,
    );
  }, [drill, ranges]);

  return {
    commitIdx,
    mode,
    totalCommits,
    snapPoints,
    active,
    ranges,
    setCommitIdx,
    setMode,
    drillInto,
    drillRange,
  };
}
