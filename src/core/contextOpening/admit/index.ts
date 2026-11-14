import type { TypedScope } from 'footprintjs';
import { readAgentRecording } from '../../recordingInput.js';
import type { OpeningCell, OpeningState } from '../types.js';
/** Stage adapter over the one pure admission/projection/evidence query. */
export function admitContext(input: unknown, result: OpeningCell) {
  return (scope: TypedScope<OpeningState>): void => {
    const verdict = readAgentRecording(input);
    result.verdict = verdict;
    scope.admitted = verdict.ok;
    scope.hasContext = verdict.ok && verdict.context !== undefined;
  };
}
