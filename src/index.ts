/**
 * agentfootprint-lens — public entry.
 *
 * Root import forwards everything from the React implementation, which
 * is the default and the only one shipped today. Future framework
 * implementations (Vue, Angular, etc.) will live under sibling
 * subpaths — consumers can opt in via:
 *
 *   import { ExplorerShell } from "agentfootprint-lens"        // React (default)
 *   import { ExplorerShell } from "agentfootprint-lens/react"  // React (explicit)
 *   import type { AgentTimeline } from "agentfootprint-lens/core" // headless
 *
 * See through your agent's decisions: messages, prompts, tool calls,
 * decision scope, cost — all in one timeline.
 */
export * from "./react";
