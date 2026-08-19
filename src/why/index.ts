/**
 * `agentfootprint-lens/why` — the Why Lens door.
 *
 * One import line that names the lens you are mounting:
 *
 *   import { WhyLens } from 'agentfootprint-lens/why';
 *
 *   <WhyLens recording={JSON.parse(json)} />
 *
 * THE AXIS MODEL, in three sentences. One run leaves one causal trace, and
 * every lens replays ONE AXIS of it: the Why Lens scrubs the MILESTONE axis
 * (the agent's own moments, banded by iteration), the Flow reading scrubs the
 * COMMIT axis (every executed stage a stop), and the skill door scrubs the
 * ROUTING stops. The cursor and the commentary are shared — a position is
 * carried between axes by its commit index (`scrubAxisFor` +
 * `stepForCommitIdx`), never by copying a step number from one ruler to
 * another.
 *
 * What this door holds is exactly what a consumer needs to MOUNT the agent
 * lens, and no more: the branded mount (`<WhyLens>` — takes the recording,
 * refuses anything else with a teaching card), the `<Lens>` shell itself for
 * hosts that already hold a recorder, `observeRecording` to replay a frozen
 * run, and the milestone-axis helpers for hosts that hold the one cursor
 * across views. Everything here is ALSO on the root barrel — a door is an
 * addition, never a move.
 */

// The branded mount: recording in, refusal card on anything else.
export { WhyLens, WHY_LENS_READS, type WhyLensProps } from '../doors/WhyLens.js';
export {
  isAgentRecording,
  readAgentRecording,
  describeReceived,
  type AgentRecordingInput,
  type RecordingEnvelopeLike,
  type RecordingVerdict,
} from '../doors/recordingInput.js';

// The shell, for hosts that already hold a recorder.
export {
  Lens,
  type LensProps,
  type LensTheme,
  type LensView,
  type LensSlots,
  type LensDetailSlotProps,
} from '../react/Lens.js';
export type { LensCursorAt } from '../react/useLensCursor.js';

// Replay a frozen run — the recording in the runner's place.
export {
  observeRecording,
  type Recording,
  type RecordedSnapshot,
  type ObservedRecording,
} from '../core/observeRecording.js';

// The milestone axis, and the carry between axes (lens 0.39.0): the same
// positions <Lens> scrubs, computable outside React, plus the resolvers a
// host uses to land one cursor on another view's ruler.
export { scrubAxisFor, type ScrubAxis } from '../react/hooks/useCursorPositions.js';
export {
  commitAxisPositions,
  cursorPositionsAtDrill,
  type CursorPosition,
  type MilestoneClassifier,
} from '../core/group/cursorPositionsAtDrill.js';
export { stepForCommitIdx } from '../core/group/stepForCommitIdx.js';
export { stepForRuntimeStageId } from '../core/group/stepForRuntimeStageId.js';
export { stepBands, bandIndexOf, type StepBand } from '../core/group/stepBands.js';
