import type { RecordedInvocationPayloads } from '../recordingSourceCodec/types.js';
export type { RecordedInvocationPayloads, RecordedPayloadSlot } from '../recordingSourceCodec/types.js';

/** Which side of a sub-flow boundary a payload crossed. */
export type PayloadSide = 'entry' | 'exit';

/**
 * Which payloads left the base row for their invocation, by the invocation's
 * mount runtime id (the step's or slot's `runtimeStageId`).
 */
export type PayloadMarks = ReadonlyMap<string, { readonly entry: boolean; readonly exit: boolean }>;

/** Why a payload that lives with its invocation is not shown. */
export type NotLoadedWhy =
  /** The child has not been asked for yet. */
  | 'not-requested'
  /** The child is being loaded. */
  | 'loading'
  /** The child could not be loaded. */
  | 'load-failed'
  /** The child loaded, but its reply carried no payloads (a host route older than the recording). */
  | 'not-sent'
  /** No recording source can load this invocation in this view. */
  | 'no-source';

/**
 * What a view may say about one boundary payload. `none` is the only state
 * that means "none was recorded"; `not-loaded` and `unavailable` are never
 * shown as empty or as in progress.
 */
export type StepPayload =
  | { readonly state: 'recorded'; readonly value: unknown }
  | { readonly state: 'not-loaded'; readonly invocation: string; readonly why: NotLoadedWhy }
  | { readonly state: 'unavailable'; readonly invocation: string; readonly reason: string }
  | { readonly state: 'none' };

/** Anything that holds boundary payloads: a sub-flow step or a model-call step's slot. */
export interface PayloadHolder {
  readonly runtimeStageId?: string;
  readonly entryPayload?: unknown;
  readonly exitPayload?: unknown;
  /** Set by a step-graph builder that carries the base row's mark (AgentFootprint 19). */
  readonly entryPayloadWith?: unknown;
  readonly exitPayloadWith?: unknown;
}

/** One invocation's load, as the payload reader needs it. */
export interface InvocationPayloadLoad {
  readonly status: 'loading' | 'preparing' | 'ready' | 'error';
  /** For a ready load: the reply's payloads, or `null` when the reply carried none. */
  readonly payloads?: RecordedInvocationPayloads | null;
}

/** One payload a view shows: a holder and the side of it. */
export type PayloadWant = readonly [holder: PayloadHolder | undefined, side: PayloadSide];

/** Reads where each boundary payload is and what may be said about it. */
export interface StepPayloadReader {
  read(holder: PayloadHolder | undefined, side: PayloadSide): StepPayload;
  /**
   * The invocations (mount runtime ids) of these shown payloads that live
   * with their invocation and have not been asked for yet, in order, once
   * each. With `limit`, only the first `limit` distinct such invocations count,
   * loaded or not, so a view asks for the same bounded set however often it
   * renders; the rest stay "not loaded yet".
   */
  needed(shown: readonly PayloadWant[], limit?: number): readonly string[];
}
