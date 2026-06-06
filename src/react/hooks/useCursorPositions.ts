/**
 * useCursorPositions — React hook exposing the slider's valid positions
 * at the current drill level.
 *
 * Layer 2 / Tier B / Lens v0.1.
 *
 * Compound time-axis (locked architecture): the slider's position SET
 * depends on drill depth. At drill depth 0, positions = top-level
 * groups (the Parallel is ONE beat). Drill into the Parallel → positions
 * re-key to its children (legal + ethics + merge). Drill into legal →
 * positions become legal's commits. ONE cursor concept; the SUBSET
 * scales with drill.
 *
 * Lifecycle
 * ─────────
 *   Reactive to BOTH the recorder (events advance the commit log /
 *   open new groups) and to `drillPath` changes (user drill-in /
 *   drill-out). Memoized so a stable drillPath + recorder = stable
 *   array identity.
 */

import { useMemo } from 'react';
import { milestoneFor } from 'agentfootprint';
import { LensRecorder } from '../../core/LensRecorder.js';
import { useCommitSync } from './useCommitSync.js';
import { buildGroups } from '../../core/group/buildGroups.js';
import {
  cursorPositionsAtDrill,
  type CursorPosition,
} from '../../core/group/cursorPositionsAtDrill.js';
import type { SplitLensStoresOptions } from '../../core/stores/splitLensStores.js';

export function useCursorPositions(
  recorder: LensRecorder,
  drillPath: readonly string[],
  options?: SplitLensStoresOptions,
): readonly CursorPosition[] {
  const syncMap = useCommitSync(recorder, options);

  return useMemo(() => {
    try {
      const groups = buildGroups(recorder.boundary.boundaryIndex);
      // Pass the domain's milestone classifier so the slider stops stage-by-stage
      // (iteration → llm-turn → tool-call → decision). Falls back to structural
      // child-group stops where the domain classifies nothing (multi-agent levels).
      return cursorPositionsAtDrill(groups, syncMap, drillPath, milestoneFor);
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder, syncMap, drillPath]);
}
