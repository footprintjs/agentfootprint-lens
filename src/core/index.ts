/**
 * agentfootprint-lens/core — framework-agnostic.
 *
 * Everything exported from here is plain TypeScript (no React, no Vue,
 * no DOM assumptions). Future framework implementations (Vue, Angular,
 * Solid, Svelte) consume the same `core/` pieces — they only re-skin
 * the rendering layer.
 *
 * Main exports:
 *   • AgentTimeline + related types — re-exported from agentfootprint
 *     (canonical source of truth across UI libraries)
 *   • fromAgentSnapshot — parses a completed runtimeSnapshot into a
 *     timeline (post-hoc path for replay scenarios)
 *   • deriveStages — pure timeline → ordered Stage[] derivation for
 *     flowchart/time-travel surfaces
 *
 * For LIVE event ingestion during a run, use the recorder pattern:
 *
 *     import { agentTimeline } from 'agentfootprint';
 *     import { timelineFromRecorder } from 'agentfootprint-lens';
 *     const t = agentTimeline();
 *     agent.recorder(t).build();
 *     // ... after agent.run():
 *     <Lens timeline={timelineFromRecorder(t)} />
 *
 * Or use `<Lens for={runner} />` — Lens auto-creates the recorder
 * internally (see useLiveTimeline). The previous Lens-local
 * `LiveTimelineBuilder` was removed in 0.8.0; the canonical
 * `agentTimeline()` recorder in agentfootprint replaces it.
 */

export type {
  AgentTimeline,
  AgentTurn,
  AgentIteration,
  AgentMessage,
  AgentToolInvocation,
  AgentToolCallStub,
  LensSkill,
} from "./types";

export { fromAgentSnapshot } from "./fromAgentSnapshot";
export { timelineFromRecorder } from "./timelineFromRecorder";

export { deriveStages } from "./deriveStages";
export type {
  Stage,
  StageNodeId,
  StagePrimitive,
  StageMutations,
} from "./deriveStages";
