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
export { scrubAxisFor, type ScrubAxis } from '../core/group/scrubAxisFor.js';
export {
  commitAxisPositions,
  cursorPositionsAtDrill,
  type CursorPosition,
  type MilestoneClassifier,
} from '../core/group/cursorPositionsAtDrill.js';
export { stepForCommitIdx } from '../core/group/stepForCommitIdx.js';
export { stepForRuntimeStageId } from '../core/group/stepForRuntimeStageId.js';
// "Take me to this stage" with an honest answer — the resolver behind
// `<Lens navigatorRef>`, usable with nothing mounted.
export {
  resolveNavigation,
  type NavigationResult,
  type NavigationHit,
  type NavigationRefusal,
  type NavigationMatch,
  type NavigationMiss,
} from '../core/group/resolveNavigation.js';
// ONE ADDRESS, ONE CURSOR (0.51.0) — the shape every lens view is handed: a
// reading, the honest `resolve` above, and the one funnel. `lensCursorFrom`
// builds it over any axis, with nothing mounted.
export {
  lensCursorFrom,
  type LensCursor,
  type LensCursorReading,
} from '../core/cursor/lensCursor.js';
export { stepBands, bandIndexOf, type StepBand } from '../core/group/stepBands.js';
// MOVEMENT along that axis — footprintjs 9.17's reader cursor over the Why
// Lens's own stops (lens 0.46.0). The same interface `<Lens>` moves through, so
// a host driving the cursor from outside lands exactly where a click lands.
export {
  openLensCursor,
  type LensCursorPort,
  type LensStopMove,
  type LensAddressMove,
  type OpenLensCursorOptions,
} from '../core/timeTravel/lensCursorPort.js';
export { lensStopsStrategy } from '../core/timeTravel/lensStops.js';
// BOOKMARKS (0.48.0) — the reader's mark beside the recording, and the store
// that keeps it; the Why Lens's Bookmarks tab is `<Lens bookmarkStore>` away.
export {
  bookmarkKey,
  toSidecar,
  fromSidecar,
  bookmarksToMarks,
  localStorageBookmarkStore,
  memoryBookmarkStore,
  noBookmarkStore,
  type Bookmark,
  type BookmarkSidecar,
  type BookmarkStore,
  type SidecarReading,
} from '../core/bookmarks/index.js';
// DECLARED TAGS (0.48.0) — the legend and the tag axis the picker scrubs.
export {
  tagLegend,
  tagAxisPositions,
  type TagLegend,
  type TagLegendEntry,
} from '../core/tags/index.js';
