import type { TraceGraph, RuntimeOverlay } from 'footprint-explainable-ui/flowchart';
import type { ObservedRecording, Recording } from '../../core/observeRecording.js';
import type { RecordedInvocation, RecordedInvocationPayloads } from '../../core/recordingSourceCodec/index.js';
import type { CursorPosition } from '../../core/group/cursorPositionsAtDrill.js';
import type { CursorAddress } from '../../core/cursor/sharedCursor.js';

/** Metadata for a native source request; retained child values stay in its snapshot. */
export interface LensRecordingLoad {
  readonly request: RecordedInvocation;
  readonly status: 'loading' | 'preparing' | 'ready' | 'error';
  readonly message?: string;
}

export interface LensRecordingSourceSnapshot {
  readonly revision: number;
  readonly recording: Recording;
  readonly invocations: readonly RecordedInvocation[];
  readonly loads: readonly LensRecordingLoad[];
  /**
   * By mount runtime id, for each child whose load is ready: the boundary
   * payloads its reply carried (`{ result, payloads }`), or `null` when the
   * reply carried none (payloads in the base row, or an older host route).
   */
  readonly subflowPayloads: ReadonlyMap<string, RecordedInvocationPayloads | null>;
}

/** Data ownership only. The host's existing SharedCursor remains the position owner. */
export interface LensRecordingSource {
  readonly observed: ObservedRecording;
  getSnapshot(): LensRecordingSourceSnapshot;
  subscribe(listener: () => void): () => void;
  load(request: RecordedInvocation, options?: { readonly signal?: AbortSignal }): Promise<void>;
  /** Input index is local to the recorded scope (native TraceWalk coordinates).
   * The result is an exact address on Lens's existing step axis, never nearest. */
  resolveAddress(address: CursorAddress, options?: { readonly signal?: AbortSignal }): Promise<CursorAddress | undefined>;
  /** Native local commit positions for this exact admitted scope; cached until data changes. */
  getAxis(invocationPath: readonly string[]): readonly CursorPosition[];
  /** Runtime decoration projected from this same exact local log. */
  getOverlay(invocationPath: readonly string[]): RuntimeOverlay;
  getGraph(invocationPath: readonly string[]): TraceGraph;
  /** Creator-owned: a view unmount only releases its own subscription/request. */
  dispose(): void;
}
