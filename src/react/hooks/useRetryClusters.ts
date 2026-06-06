/**
 * useRetryClusters — memoized per-stage retry-cluster derivation.
 *
 * Layer 2 / Tier B / Lens v0.1.
 *
 * Thin React wrapper over `groupRetryAttempts()` (Layer 1). Consumes
 * a typed `RetryEvent[]` array — the canonical agentfootprint
 * Reliability emit-channel signal — NOT commit state. The events list
 * is supplied by the caller; in production this comes from a Lens
 * RetryEventRecorder subscribed to `agentfootprint.reliability.*` (the
 * recorder ships in v0.2 alongside the Reliability subsystem). Until
 * then callers pass `[]` and get an empty Map.
 *
 * Memoization
 * ───────────
 *   Re-runs only when `events` identity changes. Callers should pass
 *   a stable reference (e.g., the array exposed by a SequenceStore) so
 *   the hook doesn't recompute on every render. The output Map is
 *   stable across renders of unchanged input.
 *
 * Return shape
 * ────────────
 *   `ReadonlyMap<stageId, RetryCluster>` — empty when no events
 *   matched. Stages with only successful single attempts STILL appear
 *   (with `attempts.length === 1`, `finalStatus === 'ok'`); callers
 *   decide whether to render those as a 1-node "non-cluster".
 */

import { useMemo } from 'react';
import {
  groupRetryAttempts,
  type RetryEvent,
  type RetryCluster,
} from '../../core/utils/groupRetryAttempts.js';

export function useRetryClusters(
  events: readonly RetryEvent[],
): ReadonlyMap<string, RetryCluster> {
  return useMemo(() => {
    const map = new Map<string, RetryCluster>();
    if (events.length === 0) return map;
    const stageIds = new Set<string>();
    for (const e of events) stageIds.add(e.stageId);
    for (const stageId of stageIds) {
      const cluster = groupRetryAttempts(events, stageId);
      if (cluster) map.set(stageId, cluster);
    }
    return map;
  }, [events]);
}
