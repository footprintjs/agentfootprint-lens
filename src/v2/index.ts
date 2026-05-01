/**
 * agentfootprint-lens v2 — public entry.
 *
 * The v2 surface is a complete rewrite against agentfootprint v2's
 * typed EventDispatcher. Key differences from Lens v1:
 *
 *   • Subject: any `Runner<TIn, TOut>`, not just Agent
 *   • Data shape: recursive `RunTree` + typed `EventLog`
 *   • Recorder: `LensRecorder` in Lens (was `AgentTimelineRecorder`
 *     in agentfootprint)
 *   • Commentary: pluggable `Humanizer`
 *   • Views: 3 audience modes (engineer / analyst / user)
 *
 * Lens v1 remains available at the root `agentfootprint-lens` subpath
 * during the migration window. Scheduled for removal after the
 * playground has migrated.
 */

export * from './core/index.js';
export * from './react/index.js';
