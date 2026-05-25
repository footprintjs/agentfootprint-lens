/**
 * streamingCoalesce — pack N stream-chunk events for one LLM call into
 * a single coalesced step descriptor.
 *
 * Pure function. Layer 1 / Tier B / Lens v0.1.
 *
 * Used by DrillableFlowchart so a streaming call renders as ONE node
 * (with derived metadata: first/last token wall-clock, tokens/sec,
 * total tokens, final assembled text) instead of N flickering nodes.
 *
 * Channel
 * ───────
 *   Stream chunks flow through the agentfootprint EMIT CHANNEL — typically
 *   under names like `agentfootprint.llm.stream.chunk`. NOT through
 *   commit state (telemetry never lives in shared state — see the
 *   feedback_telemetry_through_emit_channel.md rule).
 *
 *   A Lens-owned `StreamEventRecorder` (sibling of TimingRecorder,
 *   built in the next iteration) subscribes to that emit name and
 *   accumulates a flat `StreamChunkEvent[]`, grouped by `runtimeStageId`.
 *   This pure function consumes the per-call array (caller pre-filters
 *   to one runtimeStageId) and produces the coalesced descriptor.
 *
 * Semantics
 * ─────────
 *   - Empty input → `undefined`.
 *   - Chunks are processed in their given order (caller is responsible
 *     for emit-order; the function does NOT sort by timestamp).
 *   - `firstTokenAtMs` = first chunk timestamp (when generation began).
 *   - `lastTokenAtMs`  = last chunk timestamp.
 *   - `totalTokens`    = sum of `chunk.tokens` when defined; otherwise
 *                        sum of words (whitespace-split) as a fallback.
 *   - `tokensPerSec`   = totalTokens / elapsedSec; 0 when elapsed === 0.
 *   - `final`          = concatenation of `chunk.text` in order.
 *   - `runtimeStageId` = first chunk's runtimeStageId.
 *
 * Performance
 * ───────────
 *   Single linear pass. Pre-allocates the joined string via Array.join
 *   so we don't pay quadratic string-concat cost.
 */

export interface StreamChunkEvent {
  /** Per-LLM-call runtimeStageId. All chunks of one call share this. */
  readonly runtimeStageId: string;
  /** The chunk's textual delta. May be empty for keep-alive frames. */
  readonly text: string;
  /** Tokens in this chunk, if known (provider-reported). Optional. */
  readonly tokens?: number;
  /** Wall-clock ms when this chunk arrived (from emit event metadata). */
  readonly timestamp: number;
}

export interface CoalescedStream {
  readonly runtimeStageId: string;
  readonly firstTokenAtMs: number;
  readonly lastTokenAtMs: number;
  readonly tokensPerSec: number;
  readonly totalTokens: number;
  readonly final: string;
}

export function streamingCoalesce(
  chunks: readonly StreamChunkEvent[],
): CoalescedStream | undefined {
  if (chunks.length === 0) return undefined;

  const firstChunk = chunks[0]!;
  const lastChunk = chunks[chunks.length - 1]!;

  const parts: string[] = new Array(chunks.length);
  let totalTokens = 0;
  let anyTokenCount = false;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!;
    parts[i] = c.text;
    if (typeof c.tokens === 'number' && Number.isFinite(c.tokens) && c.tokens >= 0) {
      totalTokens += c.tokens;
      anyTokenCount = true;
    }
  }
  const final = parts.join('');

  if (!anyTokenCount) {
    // Provider didn't report tokens — fall back to word count.
    totalTokens = final.length === 0 ? 0 : final.trim().split(/\s+/).filter((w) => w.length > 0).length;
  }

  const firstTokenAtMs = firstChunk.timestamp;
  const lastTokenAtMs = lastChunk.timestamp;
  const elapsedMs = Math.max(0, lastTokenAtMs - firstTokenAtMs);
  const tokensPerSec = elapsedMs === 0 ? 0 : (totalTokens / elapsedMs) * 1000;

  return {
    runtimeStageId: firstChunk.runtimeStageId,
    firstTokenAtMs,
    lastTokenAtMs,
    tokensPerSec,
    totalTokens,
    final,
  };
}
