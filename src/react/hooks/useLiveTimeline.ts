/**
 * useLiveTimeline — React hook wrapper around LiveTimelineBuilder.
 *
 * The hook owns a stable builder across renders and returns:
 *   • `timeline` — current state (re-renders on every `ingest` call)
 *   • `ingest`   — feed an agentfootprint stream event
 *   • `startTurn`, `setSystemPrompt`, `setFinalDecision`, `reset` — forward methods
 *
 * Usage:
 *
 *   const lens = useLiveTimeline();
 *   <AgentLens timeline={lens.timeline} />
 *
 *   // Before agent.run():
 *   lens.startTurn(userPrompt);
 *   await agent.run(userPrompt, { onEvent: lens.ingest });
 *
 * The hook keeps the agent-shaped view in sync AS events fire — Lens
 * updates incrementally during the run, not only after it completes.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { LiveTimelineBuilder } from "../../core/LiveTimelineBuilder";
import type { AgentTimeline } from "../../core/types";

export interface UseLiveTimelineResult {
  readonly timeline: AgentTimeline;
  readonly ingest: (event: unknown) => void;
  readonly startTurn: (userPrompt: string) => void;
  readonly setSystemPrompt: (prompt: string) => void;
  readonly setFinalDecision: (decision: Record<string, unknown>) => void;
  readonly reset: () => void;
  /** Escape hatch — exposed for integrations that need builder internals. */
  readonly builder: LiveTimelineBuilder;
}

export function useLiveTimeline(): UseLiveTimelineResult {
  const builderRef = useRef<LiveTimelineBuilder | null>(null);
  if (!builderRef.current) builderRef.current = new LiveTimelineBuilder();
  const builder = builderRef.current;

  const [timeline, setTimeline] = useState<AgentTimeline>(() => builder.getTimeline());

  const sync = useCallback(() => {
    setTimeline(builder.getTimeline());
  }, [builder]);

  const ingest = useCallback(
    (event: unknown) => {
      builder.ingest(event);
      sync();
    },
    [builder, sync],
  );

  const startTurn = useCallback(
    (userPrompt: string) => {
      builder.startTurn(userPrompt);
      sync();
    },
    [builder, sync],
  );

  const setSystemPrompt = useCallback(
    (prompt: string) => {
      builder.setSystemPrompt(prompt);
      sync();
    },
    [builder, sync],
  );

  const setFinalDecision = useCallback(
    (decision: Record<string, unknown>) => {
      builder.setFinalDecision(decision);
      sync();
    },
    [builder, sync],
  );

  const reset = useCallback(() => {
    builder.reset();
    sync();
  }, [builder, sync]);

  return useMemo(
    () => ({ timeline, ingest, startTurn, setSystemPrompt, setFinalDecision, reset, builder }),
    [timeline, ingest, startTurn, setSystemPrompt, setFinalDecision, reset, builder],
  );
}
