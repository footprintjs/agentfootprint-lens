import type { Recording } from '../observeRecording.js';

export interface RecordedInvocation {
  readonly invocationPath: readonly string[];
  readonly mountRuntimeStageId: string;
  readonly subflowId: string;
  readonly runId?: string;
}

export interface RecordingSourceRoot {
  readonly schema: 'agentfootprint-lens.recording-source/v1';
  readonly recording: Recording;
  readonly invocations: readonly RecordedInvocation[];
}

export type RecordingSourceRead<T> =
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'unavailable'; readonly reason:
      | 'invalid-recording' | 'invalid-request' | 'invocation-not-recorded'
      | 'ambiguous-invocation' | 'recording-limit' | 'unsupported-recording' };

/** One boundary payload a child reply carries. */
export type RecordedPayloadSlot =
  | { readonly status: 'ready'; readonly value: unknown }
  | { readonly status: 'unavailable'; readonly reason: string };

/** A child reply's payloads for its invocation; a side is present only when it moved out of the base row. */
export interface RecordedInvocationPayloads {
  readonly entry?: RecordedPayloadSlot;
  readonly exit?: RecordedPayloadSlot;
}

/**
 * A child reply. `payloads` is absent for a recording whose payloads stay in
 * the base row, and from a host route that does not pass it through.
 */
export interface RecordedSubflowReply {
  readonly result: unknown;
  readonly payloads?: RecordedInvocationPayloads;
}
