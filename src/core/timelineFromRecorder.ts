/**
 * timelineFromRecorder — compose an agentfootprint `AgentTimelineRecorder`
 * into Lens's render shape.
 *
 * agentfootprint v2 owns the data model: event stream + selectors +
 * humanizer. Every UI library picks the render shape IT wants by bundling
 * selectors. Lens's bundle adds a `rawSnapshot` escape hatch for the
 * snapshot-import adapter; Vue / Angular / CLI consumers would define
 * their own bundles against the same selectors.
 *
 * The principle this enforces:
 *   agentfootprint = data (events + selectors)
 *   Lens           = renderer (no derivations, just bundling for props)
 *
 * @example
 * ```typescript
 * import { agentTimeline } from 'agentfootprint';
 * import { timelineFromRecorder, Lens } from 'agentfootprint-lens';
 *
 * const t = agentTimeline();
 * await agent.recorder(t).build().run('...');
 *
 * const timeline = timelineFromRecorder(t);
 * <Lens timeline={timeline} />;
 * ```
 */
import type { AgentTimelineRecorder } from "agentfootprint";
import type { AgentTimeline } from "./types";

export function timelineFromRecorder(recorder: AgentTimelineRecorder): AgentTimeline {
  return {
    agent: recorder.selectAgent(),
    turns: recorder.selectTurns(),
    messages: recorder.selectMessages(),
    tools: recorder.selectTools(),
    subAgents: recorder.selectSubAgents(),
    finalDecision: recorder.selectFinalDecision(),
  };
}
