/**
 * cursorProvenance — "where did this come from?" for the Lens cursor.
 *
 * Given a finished runner and the ONE cursor (a runtimeStageId — the Lens
 * v0.1 architecture's single time cursor), answer two questions the
 * engineer view's detail panel asks:
 *
 *   1. which state keys did the cursor's stage WRITE? (the clickable chips)
 *   2. for a chosen key: the backward slice that produced its value AS OF
 *      the cursor — who wrote it, what those writers read, transitively.
 *
 * This is a thin, canonical composition over footprintjs' slice layer
 * (`sliceForKey` + `keysReadFromExecutionTree`, fp ≥ 9.10.0) — the SAME
 * queries the trace toolpack's `backtrack` tool and eui's Data Trace run,
 * so the panel, the LLM tool, and the shell can never disagree. Lens adds
 * only the cursor anchoring (slice `before` the commit after the cursor's
 * own write — "the value as this moment saw it") and the frame projection
 * the UI renders.
 *
 * HONESTY (inherited, never dropped): `missing` reasons pass through
 * ('never-written' = initial state / frozen args / a closure);
 * `readsWarning` is true when the snapshot recorded no reads at all
 * (readTracking 'off') — the UI must say "unknowable", not "independent".
 */

import { flattenCausalDAG, formatSlice, keysReadFromExecutionTree, sliceForKey } from 'footprintjs/trace';
import type { MissingSliceReason } from 'footprintjs/trace';

/** One frame of the backward slice, in BFS order (depth 0 = the writer). */
export interface ProvenanceFrame {
  readonly runtimeStageId: string;
  readonly stageName: string;
  readonly stageId: string;
  readonly keysWritten: readonly string[];
  /** The read key whose write linked this frame to its child ('' = anchor). */
  readonly linkedBy: string;
  readonly depth: number;
  /** The frame's last commit index within the anchored range — its position
   *  on the run timeline. Sorting frames by this DESCENDING is the Same-Rail
   *  Rewind walk order (every dependency commits earlier than its dependent,
   *  so reverse time is a valid topological order of the slice DAG). */
  readonly commitIdx: number;
}

export interface KeyProvenance {
  readonly key: string;
  readonly frames: readonly ProvenanceFrame[];
  /** Present when there is no slice — why (honest absence). */
  readonly missing?: MissingSliceReason;
  /** True when the snapshot carries NO read tracking — edges unknowable. */
  readonly readsWarning: boolean;
  /** THE parity artifact: footprintjs' own `formatSlice` string — the SAME
   *  text the trace toolpack's `backtrack` LLM tool returns (honesty
   *  envelope included). [Copy story] emits this verbatim. */
  readonly story: string;
}

export interface CursorProvenance {
  /** Keys the cursor's stage wrote (union across its commits), chip order. */
  readonly writtenKeys: readonly string[];
  /** Backward slice for one of those keys, anchored at the cursor. */
  readonly sliceFor: (key: string) => KeyProvenance;
}

/** Structural view of the snapshot pieces this query needs (duck-typed —
 *  lens consumes runner SHAPES; the runner is any agentfootprint Runner). */
interface SnapshotLike {
  commitLog?: Array<{ runtimeStageId: string; trace: Array<{ path: string }> }>;
  executionTree?: unknown;
}
/** Runtime duck-check: every RunnerBase subclass has getLastSnapshot, but
 *  the minimal `Runner` interface doesn't declare it — accept unknown and
 *  verify at runtime so consumers never need a cast. */
function getSnapshotOf(runner: unknown): SnapshotLike | undefined {
  const fn = (runner as { getLastSnapshot?: unknown })?.getLastSnapshot;
  if (typeof fn !== 'function') return undefined;
  return (fn as () => unknown).call(runner) as SnapshotLike | undefined;
}

/**
 * Build the provenance view for the cursor position. Returns `undefined`
 * when there is no snapshot yet, the cursor's step committed nothing, or
 * the id has no commits (e.g. a synthetic group cursor) — the panel simply
 * doesn't render a section then.
 */
export function cursorProvenance(
  runner: unknown,
  cursorRuntimeStageId: string,
): CursorProvenance | undefined {
  const snapshot = getSnapshotOf(runner);
  const log = snapshot?.commitLog;
  if (!log?.length || !cursorRuntimeStageId) return undefined;

  // The cursor's commits (double-commits possible — union the written paths,
  // remember the LAST commit index for the slice anchor).
  let lastIdx = -1;
  const written = new Set<string>();
  for (let i = 0; i < log.length; i++) {
    if (log[i].runtimeStageId !== cursorRuntimeStageId) continue;
    lastIdx = i;
    for (const t of log[i].trace) written.add(t.path);
  }
  if (lastIdx < 0 || written.size === 0) return undefined;

  const reads = keysReadFromExecutionTree(
    (snapshot?.executionTree ?? { id: '__none__', logs: {}, errors: {}, metrics: {}, evals: {} }) as Parameters<
      typeof keysReadFromExecutionTree
    >[0],
  );

  // rsid → last commit index within the anchored range (for walk ordering).
  const lastCommitIdxOf = new Map<string, number>();
  for (let i = 0; i <= lastIdx; i++) lastCommitIdxOf.set(log[i].runtimeStageId, i);

  const sliceFor = (key: string): KeyProvenance => {
    // Anchor: the value AS OF the cursor — include the cursor's own write
    // (exclusive bound = its last commit index + 1).
    const slice = sliceForKey(log as Parameters<typeof sliceForKey>[0], key, reads, {
      before: lastIdx + 1,
    });
    const readsWarning =
      slice.readsCoverage !== undefined &&
      slice.readsCoverage.steps > 1 &&
      slice.readsCoverage.stepsWithReads === 0;
    const story = formatSlice(slice);
    if (!slice.root) {
      return { key, frames: [], readsWarning, story, ...(slice.missing !== undefined && { missing: slice.missing }) };
    }
    const frames: ProvenanceFrame[] = flattenCausalDAG(slice.root).map((n) => ({
      runtimeStageId: n.runtimeStageId,
      stageName: n.stageName,
      stageId: n.stageId,
      keysWritten: n.keysWritten,
      linkedBy: n.linkedBy,
      depth: n.depth,
      commitIdx: lastCommitIdxOf.get(n.runtimeStageId) ?? -1,
    }));
    return { key, frames, readsWarning, story };
  };

  return { writtenKeys: [...written], sliceFor };
}
