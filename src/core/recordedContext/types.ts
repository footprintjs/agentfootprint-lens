/** Structural port implemented by agentfootprint's readContextRecording result. */
export interface DecodedContextInput {
  readonly recording: unknown;
  readonly calls: readonly RecordedContextCall[];
  /** Values have already passed the producer's decoding and redaction policy. */
  readonly values?: { resolve(reference: unknown): unknown };
  readonly droppedEvents?: number;
  readonly firstRetainedEventIndex?: number;
}

export interface RecordedContextCall {
  readonly meta: {
    readonly runId: string;
    readonly compositionPath?: readonly string[];
    readonly subflowPath?: readonly string[];
    readonly runtimeStageId?: string;
    readonly sourcePosition?: unknown;
  };
  readonly iteration: number;
  /** Producer index BEFORE context-frame removal; never index decoded events with it. */
  readonly eventIndex: number;
  readonly call: number;
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly unchanged: number;
  readonly order?: readonly number[];
  readonly counts: Readonly<Record<string, number>>;
}

export interface ContextPiece {
  readonly id: string;
  /** Detached, bounded JSON; strings retain every whitespace character. */
  readonly value: unknown;
}

export interface RecordedContextView {
  readonly dictionary: readonly ContextPiece[];
  readonly calls: readonly RecordedContextCall[];
  readonly droppedEvents?: number;
  readonly firstRetainedEventIndex?: number;
  readonly toolInputs?: readonly RecordedToolInput[];
}

export type RecordedToolInput =
  | { readonly status: 'unavailable'; readonly reason: string }
  | { readonly status: 'available'; readonly epoch: number; readonly gaps: readonly string[]; readonly messages: readonly {
      readonly toolCallId: string; readonly content: unknown; readonly ticket: boolean;
      readonly status: 'verified' | 'reconstructed' | 'damaged' | 'not-on-record';
    }[] };

export class ContextPresentationError extends Error {
  constructor(readonly reason: 'invalid-context' | 'presentation-limit' | 'unreadable-value') {
    super(`Context presentation refused: ${reason}`);
    this.name = 'ContextPresentationError';
  }
}
