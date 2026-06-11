/**
 * useToolChoice — async reader for the agentfootprint/observe
 * `toolChoiceRecorder` handle (RFC-002 block C7).
 *
 * The recorder's read API is LAZY: `getCalls()` / `getSummary()` run the
 * injected embedder on first read and memoize per entry (C5 — embedding
 * I/O never rides the agent's hot path). That makes the surface async,
 * so this hook bridges it into React state:
 *
 *   - reads are SERIALIZED (one in flight at a time — concurrent
 *     `ensureScored` passes would double-call the embedder);
 *   - queued stale reads are SKIPPED — only the newest revision does a
 *     real read ("latest wins");
 *   - a read that resolves after unmount / a newer revision never
 *     touches state.
 *
 * `revision` is the re-read signal — pass something that changes when
 * new data may exist (Lens passes the event-log length). Entries score
 * once each (memoized by the recorder), so per-tick re-reads cost one
 * array copy, not repeated embedding.
 *
 * Mid-run reads are SAFE but mean the embedder runs while the agent is
 * still working (closed entries score progressively). Consumers who
 * want strictly post-run scoring simply mount the panel after the run.
 */

import { useEffect, useRef, useState } from 'react';
import type { ToolChoiceCall, ToolChoiceSummary } from 'agentfootprint/observe';

/**
 * Structural subset of `ToolChoiceRecorderHandle` the lens reads —
 * pass the real recorder handle, or any object exposing the two async
 * getters (e.g., pre-extracted data wrapped in resolved promises).
 */
export interface ToolChoiceSource {
  getCalls(): Promise<readonly ToolChoiceCall[]>;
  getSummary(): Promise<ToolChoiceSummary>;
}

export interface UseToolChoiceResult {
  /** All recorded LLM calls that offered tools, recording order. */
  readonly calls: readonly ToolChoiceCall[];
  /** Run-summary counts (flagged / narrow / proxy-disagreement). */
  readonly summary: ToolChoiceSummary | undefined;
  /** True while the first read (or a newer one) is in flight. */
  readonly pending: boolean;
  /** Message of the last failed read — surfaced, never swallowed. */
  readonly error: string | undefined;
}

const EMPTY: UseToolChoiceResult = {
  calls: [],
  summary: undefined,
  pending: false,
  error: undefined,
};

export function useToolChoice(
  source: ToolChoiceSource | undefined,
  revision: number,
): UseToolChoiceResult {
  const [state, setState] = useState<UseToolChoiceResult>(EMPTY);
  // Serialization chain — reads queue behind each other; stale queued
  // reads exit immediately (their effect was cleaned up), so the chain
  // length is bounded by one live + skips.
  const chain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!source) {
      setState((s) => (s === EMPTY ? s : EMPTY));
      return;
    }
    let stale = false;
    setState((s) => (s.pending ? s : { ...s, pending: true }));
    chain.current = chain.current.then(async () => {
      if (stale) return; // a newer revision is queued behind — let it read
      try {
        const calls = await source.getCalls();
        // Sequential, not Promise.all — getCalls() already ran the lazy
        // scoring pass, so getSummary() is a cheap memoized count.
        const summary = await source.getSummary();
        if (!stale) setState({ calls, summary, pending: false, error: undefined });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (!stale) {
          setState((s) => ({
            calls: s.calls,
            summary: s.summary,
            pending: false,
            error: message,
          }));
        }
      }
    });
    return () => {
      stale = true;
    };
  }, [source, revision]);

  return state;
}
