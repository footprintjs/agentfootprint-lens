/**
 * `agentfootprint-lens/skillgraph` — the SkillGraph debugger door.
 *
 * One import line that names the view you are mounting:
 *
 *   import { SkillGraphDebugger } from 'agentfootprint-lens/skillgraph';
 *
 *   <SkillGraphDebugger
 *     recorder={observeRecording(recording).recorder}
 *     cursorRuntimeStageId={cursor}
 *     onJumpTo={(id) => moveTheOneCursorTo(id)}
 *   />
 *
 * What this door needs is a run whose events include SKILL ROUTING. It
 * validates at mount, honestly: a recording without routing renders the "No
 * skill graph ran here" card (never a blank panel), and a `recorder` prop
 * that is not a recorder at all renders a teaching refusal naming what was
 * received and where to go.
 *
 * Beside the mount component: its HEADLESS selectors, for hosts that fold the
 * routing record themselves — `selectSkillRoute` (events → the routing
 * record), `selectSkillBeats` / `selectSkillBeatAt` (the record on the TIME
 * axis, resolved by the one cursor), `selectSkillTopology` (the SPACE axis at
 * one beat), `selectSkillFrameContext` (what reached the model on one beat),
 * and `stepForRuntimeStageId` (a routing stop's address back onto the host's
 * step axis). Everything here is ALSO on the root barrel — a door is an
 * addition, never a move.
 */

// The mount component — validates its input at mount (see module header).
export {
  SkillGraphDebugger,
  SKILL_GRAPH_READS,
  type SkillGraphDebuggerProps,
} from '../react/skillgraph/SkillGraphDebugger.js';
export type { SkillLens } from '../react/skillgraph/lens.js';

// The headless selectors behind it.
export {
  selectSkillRoute,
  type SelectSkillRouteArgs,
  type SkillRoute,
  type SkillRouteNode,
  type SkillHop,
  type SkillRefusal,
  type SkillDeclaredEdge,
  type SkillObservedEdge,
} from '../core/selectors/selectSkillRoute.js';
export {
  selectSkillBeats,
  selectSkillBeatAt,
  type SelectSkillBeatsArgs,
  type SkillBeat,
  type SkillReachableSet,
} from '../core/selectors/selectSkillBeats.js';
export {
  selectSkillTopology,
  type DeclaredEdgeInput,
  type SelectSkillTopologyArgs,
  type SkillNodeState,
  type SkillTopology,
  type SkillTopologyEdge,
  type SkillTopologyNode,
} from '../core/selectors/selectSkillTopology.js';
export {
  selectSkillFrameContext,
  type SelectSkillFrameContextArgs,
  type SkillFrameContext,
} from '../core/selectors/selectSkillFrameContext.js';
export { stepForRuntimeStageId } from '../core/group/stepForRuntimeStageId.js';
