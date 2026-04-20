/**
 * agentfootprint-lens/core — framework-agnostic.
 *
 * Everything exported from here is plain TypeScript (no React, no Vue,
 * no DOM assumptions). Future framework implementations (Vue, Angular,
 * Solid, Svelte) consume the same `core/` pieces — they only re-skin
 * the rendering layer.
 *
 * Main exports:
 *   • AgentTimeline + related types — the shape Lens renders against
 *   • LiveTimelineBuilder — ingests agentfootprint stream events during
 *     a run and produces an AgentTimeline incrementally
 *   • fromAgentSnapshot — parses a completed runtimeSnapshot into a
 *     timeline (post-hoc path)
 *   • deriveStages — pure timeline → ordered Stage[] derivation for
 *     flowchart/time-travel surfaces
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

export { LiveTimelineBuilder } from "./LiveTimelineBuilder";

export { fromAgentSnapshot } from "./fromAgentSnapshot";

export { deriveStages } from "./deriveStages";
export type {
  Stage,
  StageNodeId,
  StagePrimitive,
  StageMutations,
} from "./deriveStages";
