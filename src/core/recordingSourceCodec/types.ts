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
