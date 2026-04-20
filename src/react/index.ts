/**
 * agentfootprint-lens/react — React implementation.
 *
 * Everything rendering-related lives here. Core types + adapters are
 * re-exported from `core/` for convenience so React consumers get the
 * full surface from one import.
 *
 * Consumer entry points (in order of preference):
 *   • <ExplorerShell /> — one-line drop-in that renders a tabbed
 *     "Lens + Explainable Trace" surface. The 99% answer.
 *   • <AgentLens /> — just the Lens view (live agent view).
 *   • <Tabs /> — reusable tabs primitive with variants.
 *   • Individual panels (MessagesPanel, StageFlow, etc.) — for
 *     consumers composing their own layouts.
 */

// Framework-agnostic re-exports — React consumers shouldn't need to
// separately import from `agentfootprint-lens/core` for common types.
export * from "../core";

// The single public entry — consumers drop this in, hand it data,
// done. Handles both Lens (live agent view) and Explainable Trace
// internally via tabs when `traceView` is supplied.
export { Lens } from "./Lens";
export type { LensProps } from "./Lens";

// Agent view alone — for consumers who own their own chrome and want
// just the Lens surface without the tab wrapper.
export { AgentLens } from "./AgentLens";
export type { AgentLensProps } from "./AgentLens";

// Reusable primitives — layout library + Tabs.
export * from "./layout";
export { Tabs } from "./components/Tabs/Tabs";
export type { TabsProps, TabDef } from "./components/Tabs/Tabs";

// Individual panels — for consumers composing custom layouts.
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

// Hooks.
export { useLiveTimeline } from "./hooks/useLiveTimeline";
export type { UseLiveTimelineResult } from "./hooks/useLiveTimeline";

// Theme.
export { useLensTheme, resolve as resolveLensTheme } from "./theme/useLensTheme";
export type { LensTheme } from "./theme/useLensTheme";
