/**
 * The doors' branded input — what an agentfootprint RECORDING is, and a
 * plain-language name for anything that is not one.
 *
 * The two subpath doors (`agentfootprint-lens/why`,
 * `agentfootprint-lens/skillgraph`) each mount ONE thing, and each validates
 * what it is handed AT MOUNT: a wrong shape renders a teaching refusal card
 * (see `DoorRefusalCard`) instead of a blank panel or a crash. This module is
 * the shared half of that promise — the duck checks and the sentences.
 *
 * Two accepted spellings of "a recording":
 *
 *   { snapshot, events, structure }   what `recordRun(agent)` freezes
 *   the envelope                      what `persistRecording(...)` writes —
 *                                     format-marked `agentfootprint.recording.*`,
 *                                     with the same recording inside it
 *
 * Everything else gets NAMED, not guessed at: a bare commit log is told where
 * the commit-trace lens lives (footprint-explainable-ui); a JSON string is
 * told to parse it; anything unrecognizable is told how to record a run.
 */

import type { Recording } from '../core/observeRecording.js';

/**
 * The archivable envelope `persistRecording` writes
 * (`agentfootprint/observe`'s `RecordingEnvelope`), duck-shaped: the format
 * marker plus the recording inside it. Extra fields (producer, run, privacy)
 * ride along untouched.
 */
export interface RecordingEnvelopeLike {
  /** `'agentfootprint.recording.v1'` (any `agentfootprint.recording.*`). */
  readonly format: string;
  /** The recording itself — `{ snapshot, events, structure }`. */
  readonly recording: Recording;
}

/**
 * What a door's mount component accepts — the branded input. TypeScript
 * consumers fail at BUILD time on anything else (a bare `CommitBundle[]` has
 * none of a recording's parts, so it is not assignable to either arm); JS
 * consumers get the runtime refusal card instead.
 */
export type AgentRecordingInput = Recording | RecordingEnvelopeLike;

/** Where a refused input's reader should go next. */
export type RefusalDestination = 'commit-trace-lens' | 'record-the-run';

/** The mount-time verdict: the recording (unwrapped from its envelope when it
 *  arrived in one), or the refusal's two facts — what was received, where to go. */
export type RecordingVerdict =
  | { readonly ok: true; readonly recording: Recording }
  | { readonly ok: false; readonly received: string; readonly goTo: RefusalDestination };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Does this array look like a footprintjs COMMIT LOG (one bundle per stage)? */
function looksLikeCommitLog(value: readonly unknown[]): boolean {
  if (value.length === 0) return false;
  const first = value[0];
  return (
    isPlainObject(first) &&
    (typeof first['runtimeStageId'] === 'string' ||
      (first['patch'] !== undefined && first['idx'] !== undefined) ||
      Array.isArray(first['trace']))
  );
}

/** Does this object carry at least one of a recording's parts? */
function looksLikeRecording(value: Record<string, unknown>): boolean {
  const events = value['events'];
  const snapshot = value['snapshot'];
  return Array.isArray(events) || isPlainObject(snapshot);
}

/**
 * Is `value` something the doors can read — a recording, or the envelope
 * around one? The runtime twin of the `AgentRecordingInput` type.
 */
export function isAgentRecording(value: unknown): value is AgentRecordingInput {
  return readAgentRecording(value).ok;
}

/**
 * The mount-time gate both doors call: unwrap the envelope when there is one,
 * accept a recording, and NAME anything else in plain language.
 */
export function readAgentRecording(value: unknown): RecordingVerdict {
  // The envelope: format-marked, recording inside. Unwrap and re-check.
  if (
    isPlainObject(value) &&
    typeof value['format'] === 'string' &&
    value['format'].startsWith('agentfootprint.recording.')
  ) {
    const inner = value['recording'];
    if (isPlainObject(inner) && looksLikeRecording(inner)) {
      return { ok: true, recording: inner as Recording };
    }
    return {
      ok: false,
      received: 'a recording envelope with nothing readable inside it (no events, no snapshot)',
      goTo: 'record-the-run',
    };
  }

  if (isPlainObject(value) && looksLikeRecording(value)) {
    return { ok: true, recording: value as Recording };
  }

  return { ok: false, received: describeReceived(value), goTo: refusalDestinationFor(value) };
}

/** Plain-language name for a value that is NOT a recording. Exported so a
 *  host (or a test) can say the same sentence the refusal card says. */
export function describeReceived(value: unknown): string {
  if (value === undefined) return 'nothing (undefined)';
  if (value === null) return 'nothing (null)';
  if (typeof value === 'string') {
    return 'a string — if it is the recording’s JSON text, parse it first (JSON.parse) and pass the object';
  }
  if (Array.isArray(value)) {
    if (looksLikeCommitLog(value)) return 'a bare commit log (an array of commit bundles)';
    return value.length === 0 ? 'an empty array' : 'an array, but not of commit bundles';
  }
  if (isPlainObject(value)) {
    if (isPlainObject(value['snapshot']) || Array.isArray(value['events'])) {
      // looksLikeRecording would have accepted it; kept for completeness.
      return 'a recording';
    }
    if (Array.isArray(value['commitLog'])) {
      return 'a footprintjs run snapshot (a commit log, with no agent events around it)';
    }
    return 'an object with none of a recording’s parts (no events, no snapshot)';
  }
  return `a ${typeof value}`;
}

/** Which teaching sentence the refusal ends on. Exported for the skillgraph
 *  door, whose mount validates a RECORDER prop against the same shapes. */
export function refusalDestinationFor(value: unknown): RefusalDestination {
  if (Array.isArray(value) && looksLikeCommitLog(value)) return 'commit-trace-lens';
  if (isPlainObject(value) && Array.isArray(value['commitLog'])) return 'commit-trace-lens';
  return 'record-the-run';
}

/** The two "where to go" sentences, spelled once. */
export const REFUSAL_GO_TO: Record<RefusalDestination, string> = {
  'commit-trace-lens':
    'The commit-trace lens is footprint-explainable-ui — mount its ExplainableShell over the run’s snapshot for that reading.',
  'record-the-run':
    'To get a recording, record the run: recordRun(agent) from agentfootprint/observe captures exactly what this lens replays.',
};
