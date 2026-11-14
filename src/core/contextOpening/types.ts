import type { RecordingVerdict } from '../recordingInput.js';
export interface OpeningState { admitted: boolean; hasContext: boolean; disposition: string }
/** Raw record data never enters chart scope or its debug log. */
export interface OpeningCell { verdict?: RecordingVerdict }
export interface ContextOpening {
  readonly verdict: RecordingVerdict;
  readonly trace: { readonly state: Record<string, unknown>; readonly executionTree: unknown; readonly commitLog: readonly unknown[] };
}
