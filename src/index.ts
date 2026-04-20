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

// Adapter — for consumers who want to transform snapshots upstream (e.g.
// memoize across renders or feed multiple Lens instances from one run).
export { fromAgentSnapshot } from "./adapters/fromAgentSnapshot";
export type {
  AgentTimeline,
  AgentTurn,
  AgentIteration,
  AgentMessage,
  AgentToolInvocation,
  AgentToolCallStub,
} from "./adapters/types";

// Theme — the resolved palette the panels render against.
// Consumers shouldn't need to use this directly; it's available for
// custom panel authors who want to match the Lens look.
export { useLensTheme, resolve as resolveLensTheme } from "./theme/useLensTheme";
export type { LensTheme } from "./theme/useLensTheme";
