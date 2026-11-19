import { useMemo, useState, useSyncExternalStore } from 'react';
import { projectContext } from '../../core/context/contextAt.js';
import { foldCommitIdxOf } from '../../core/cursor/foldAt.js';
import { lensCursorFrom, type LensCursor } from '../../core/cursor/lensCursor.js';
import { groupedAxisForSnapshot } from '../../core/group/scrubAxisFor.js';
import { createLensRenderStore } from '../../core/stores/lensRenderStore.js';
import type { LensRecorder } from '../../core/LensRecorder.js';
import type { ServedCursor } from '../../core/served/types.js';
import { tagAxisPositions } from '../../core/tags/tagAxis.js';
import type { EventLogEntry } from '../../core/types.js';
import { snapshotLogKey, snapshotOfRunner } from '../../core/utils/snapshotOfRunner.js';
import type { SharedCursor } from '../useSharedCursor.js';

export const MILESTONE_AXIS: readonly string[] = Object.freeze([
  'milestone:iteration', 'milestone:slot', 'milestone:llm-turn', 'milestone:tool-call', 'milestone:decision',
]);

interface Options {
  readonly runner: unknown;
  readonly recorder?: LensRecorder;
  readonly shared?: SharedCursor;
  readonly cursor?: LensCursor;
  readonly previous?: ServedCursor;
  readonly events?: readonly EventLogEntry[];
}

const noRecorder = {
  subscribe: () => () => {},
  getSnapshot: () => undefined,
};

function runIdOf(snapshot: unknown): string | undefined {
  const id = (snapshot as { runId?: unknown } | null)?.runId;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

export function useContextProjection({ runner, recorder, shared, cursor: supplied, previous, events }: Options) {
  const ownAxis = supplied === undefined;
  const readEvents = events === undefined;
  // Independent runners advance on the host's render. A directly observed
  // runner is instead sampled by its store once per publication.
  const observed = recorder?.observedRunner();
  const tracksRunner = observed !== undefined && observed === runner;
  const independent = tracksRunner ? undefined : snapshotOfRunner(runner);
  const independentRunId = runIdOf(independent);
  const store = useMemo(() => recorder ? createLensRenderStore(recorder, current => {
    const source = current.observedRunner();
    if (!source) return undefined;
    const snapshot = snapshotOfRunner(source);
    const observesRunner = source === runner;
    // A host may supply the replay's raw snapshot or an independently read
    // snapshot of the same named run. Stage names alone cannot establish this.
    const sameSnapshot = snapshot != null && snapshot === runner;
    if (!observesRunner && !sameSnapshot &&
        (independentRunId === undefined || independentRunId !== runIdOf(snapshot))) return undefined;
    const singleSource = current.hasSingleObservedSource();
    return {
      observesRunner,
      snapshot,
      positions: ownAxis && singleSource ? groupedAxisForSnapshot(current, snapshot) : undefined,
      events: readEvents && singleSource ? current.getEntries() : undefined,
    };
  }) : noRecorder, [recorder, observed, runner, independentRunId, ownAxis, readEvents]);
  const published = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const sampled = published?.observesRunner ? published.snapshot : independent;
  const logKey = published?.observesRunner ? undefined : snapshotLogKey(sampled);
  // A live getter can return a fresh wrapper even when no commits have landed.
  // Recorder publications also invalidate same-length recording replacements.
  const snapshot = useMemo(() => sampled, [runner, published, logKey]);
  const positions = useMemo(() => {
    if (!ownAxis) return undefined;
    return published?.positions ?? tagAxisPositions(snapshot, MILESTONE_AXIS, []);
  }, [ownAxis, published, snapshot, logKey]);
  const [step, setStep] = useState(0);
  const axis = positions ?? [];
  const cursor = supplied ?? (shared ? shared.over(axis) : lensCursorFrom(axis,
    Math.min(step, Math.max(0, axis.length - 1)), setStep));
  const prior = positions?.[cursor.at.step - 1];
  const previousStage = previous?.runtimeStageId ?? prior?.runtimeStageId;
  const previousCommit = previous?.commitIdx ?? (prior && foldCommitIdxOf(prior));
  const { runtimeStageId, commitIdx, foldCommitIdx } = cursor.at;
  const eventLog = events ?? published?.events;
  const context = useMemo(() => projectContext(snapshot, { runtimeStageId, commitIdx, foldCommitIdx }, {
    previous: previousStage !== undefined && previousCommit !== undefined
      ? { runtimeStageId: previousStage, commitIdx: previousCommit } : undefined,
    events: eventLog,
  }), [snapshot, logKey, published, runtimeStageId, commitIdx, foldCommitIdx, previousStage, previousCommit, eventLog]);
  return { context, snapshot, cursor, mover: ownAxis && cursor.total > 0 && cursor.at.step >= 0 };
}
