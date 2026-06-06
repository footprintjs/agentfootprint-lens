/**
 * groupRetryAttempts — group retry events for one stage into a cluster.
 *
 * Pure function. Layer 1 / Tier B / Lens v0.1.
 *
 * Drives the retry-cluster rendering in DrillableFlowchart (multiple
 * sibling nodes for the same stageId, each tagged failed/ok, with a
 * collapsing chevron).
 *
 * Channel
 * ───────
 *   Retries flow through the **emit channel**, NOT through commit state.
 *   The agentfootprint Reliability subsystem (v2.6+) emits events with
 *   names like:
 *
 *     'agentfootprint.reliability.attempt.failed'
 *     'agentfootprint.reliability.attempt.succeeded'
 *
 *   A Lens-owned `EmitRecorder` (Layer 1 sibling of TimingRecorder,
 *   built in the next iteration) subscribes to those names and
 *   accumulates a flat `RetryEvent[]`. This pure function consumes
 *   that array — it does NOT touch the commit log, because writing
 *   telemetry into shared state is the wrong pipe.
 *
 * Semantics
 * ─────────
 *   - Filter events to those whose `stageId` matches the argument.
 *   - Preserve event order (timestamp ascending is assumed).
 *   - One attempt per event. finalStatus = last attempt's status.
 *   - Zero matching events → `undefined` (no cluster; this stage was
 *     either never retried, or never reached).
 *
 * Performance
 * ───────────
 *   Linear in `events.length`. No allocation beyond the result.
 */

export interface RetryEvent {
  /** Per-attempt unique runtimeStageId from the engine. */
  readonly runtimeStageId: string;
  /** Stable stageId (matches spec node id). */
  readonly stageId: string;
  /** 1-based attempt number this event represents. */
  readonly attempt: number;
  /** Outcome of this attempt. */
  readonly status: 'failed' | 'ok';
  /** Error string when status === 'failed'. */
  readonly errorMessage?: string;
  /** Optional duration (ms) of the attempt; from the emit event's payload. */
  readonly durationMs?: number;
  /** Wall-clock at attempt end (sort key). */
  readonly timestamp: number;
}

export interface RetryAttempt {
  readonly runtimeStageId: string;
  readonly status: 'failed' | 'ok';
  readonly errorMessage?: string;
  readonly attempt: number;
  readonly durationMs?: number;
  readonly timestamp: number;
}

export interface RetryCluster {
  readonly stageId: string;
  readonly attempts: readonly RetryAttempt[];
  readonly finalStatus: 'failed' | 'ok';
}

export function groupRetryAttempts(
  events: readonly RetryEvent[],
  stageId: string,
): RetryCluster | undefined {
  if (stageId.length === 0) return undefined;

  const attempts: RetryAttempt[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.stageId !== stageId) continue;
    const a: RetryAttempt = {
      runtimeStageId: e.runtimeStageId,
      status: e.status,
      ...(e.errorMessage !== undefined ? { errorMessage: e.errorMessage } : {}),
      attempt: e.attempt,
      ...(e.durationMs !== undefined ? { durationMs: e.durationMs } : {}),
      timestamp: e.timestamp,
    };
    attempts.push(a);
  }

  if (attempts.length === 0) return undefined;

  const finalStatus = attempts[attempts.length - 1]!.status;
  return { stageId, attempts, finalStatus };
}
