/**
 * The SkillGraph debugger — the graph a run WALKED, scrubbed by the ONE cursor.
 *
 * `<SkillGraphDebugger>` is the composed view; the four panes are exported
 * beside it for a shell that arranges them differently. Every pane is a pure
 * function of `{ beats, activeIndex }` — the cursor's projection — so any
 * arrangement stays in sync by construction. See `./README.md`.
 */

export {
  SkillGraphDebugger,
  type SkillGraphDebuggerProps,
} from './SkillGraphDebugger.js';
export { SkillTopologyCanvas, type SkillTopologyCanvasProps } from './SkillTopologyCanvas.js';
export { RouteDecisionCard, type RouteDecisionCardProps } from './RouteDecisionCard.js';
export { FrameFactsPanel, type FrameFactsPanelProps } from './FrameFactsPanel.js';
export { NarrativeRail, type NarrativeRailProps } from './NarrativeRail.js';
export { BeatStrip, type BeatStripProps } from './BeatStrip.js';
export {
  skillTopologyPositions,
  type SkillNodePosition,
  type TopologyEdgeEndpoints,
} from './skillTopologyPositions.js';
export type { SkillLens } from './lens.js';
