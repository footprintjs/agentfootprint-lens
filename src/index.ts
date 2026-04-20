/**
 * agentfootprint-lens — public entry.
 *
 * See through your agent's decisions: messages, prompts, tool calls,
 * decision scope, cost — all in one timeline.
 */

// Top-level shell — the 99% consumer entry point.
export { AgentLens } from "./AgentLens";
export type { AgentLensProps } from "./AgentLens";

// Individual panels — for consumers who want to compose their own layout.
export { MessagesPanel } from "./panels/MessagesPanel";
export type { MessagesPanelProps } from "./panels/MessagesPanel";
export { IterationStrip } from "./panels/IterationStrip";
export type { IterationStripProps } from "./panels/IterationStrip";
export { ToolCallInspector } from "./panels/ToolCallInspector";
export type { ToolCallInspectorProps } from "./panels/ToolCallInspector";
export { SkillsPanel } from "./panels/SkillsPanel";
export type { SkillsPanelProps } from "./panels/SkillsPanel";
export { StageFlow } from "./panels/StageFlow";
export type { StageFlowProps } from "./panels/StageFlow";
export { TimeTravel } from "./panels/TimeTravel";
export type { TimeTravelProps } from "./panels/TimeTravel";
export { AskCard } from "./panels/AskCard";
export type { AskCardProps } from "./panels/AskCard";
export { RunSummary } from "./panels/RunSummary";
export type { RunSummaryProps } from "./panels/RunSummary";
export { deriveStages } from "./adapters/deriveStages";
export type { Stage, StageNodeId, StagePrimitive } from "./adapters/deriveStages";

// Primary path: collect during traversal via the builder/hook. This is
// the footprintjs-idiomatic approach — ingest emit events as they fire,
// build the AgentTimeline incrementally, live-update the UI mid-run.
export { LiveTimelineBuilder } from "./adapters/LiveTimelineBuilder";
export { useLiveTimeline } from "./adapters/useLiveTimeline";
export type { UseLiveTimelineResult } from "./adapters/useLiveTimeline";

// Fallback path: parse a completed snapshot (e.g. an imported trace, or
// a run that finished before Lens was wired up). Still useful — but the
// live path is preferred for in-app debugging because it respects the
// "no post-process" principle (every field is written once, when its
// source event fires during traversal).
export { fromAgentSnapshot } from "./adapters/fromAgentSnapshot";

export type {
  AgentTimeline,
  AgentTurn,
  AgentIteration,
  AgentMessage,
  AgentToolInvocation,
  AgentToolCallStub,
  LensSkill,
} from "./adapters/types";

// Theme — the resolved palette the panels render against.
// Consumers shouldn't need to use this directly; it's available for
// custom panel authors who want to match the Lens look.
export { useLensTheme, resolve as resolveLensTheme } from "./theme/useLensTheme";
export type { LensTheme } from "./theme/useLensTheme";
