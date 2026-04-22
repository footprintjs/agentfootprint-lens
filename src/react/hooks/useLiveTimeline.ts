/**
 * useLiveTimeline — React hook over the canonical `agentTimeline()`
 * recorder from agentfootprint.
 *
 * Phase 2 internal swap: previously this hook wrapped a Lens-local
 * `LiveTimelineBuilder` class. Now it wraps the canonical
 * `agentTimeline()` recorder so:
 *
 *   • Translation logic lives in agentfootprint (one place, not two)
 *   • Storage primitive is footprintjs `SequenceRecorder<T>` — we get
 *     `getEntries()`, `getEntryRanges()`, O(1) per-step lookup, etc.
 *     for free, instead of re-implementing a builder
 *   • Multi-agent: multiple instances of this hook share the same
 *     translation rules — different recorders, same shape
 *
 * The hook keeps the API compatible with the previous version so
 * upstream callers (Lens.tsx `for={runner}` path, app code) need no
 * changes:
 *
 *   const lens = useLiveTimeline();
 *   <AgentLens timeline={lens.timeline} />
 *
 *   await agent.run(prompt, { onEvent: lens.ingest });
 *
 * Internally `ingest()` translates each runner-shaped event
 * (`AgentStreamEvent`) into an `EmitEvent` shape and feeds the
 * recorder's `onEmit()`. Event names match what the agent's emit
 * channel produces, so the recorder treats them identically to events
 * delivered via `executor.attachEmitRecorder()`.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { agentTimeline, type AgentTimelineRecorder } from "agentfootprint/observe";
import type { EmitEvent } from "footprintjs";
import type { AgentTimeline } from "../../core/types";
import { timelineFromRecorder } from "../../core/timelineFromRecorder";

export interface UseLiveTimelineResult {
  readonly timeline: AgentTimeline;
  /** Feed a runner-shaped event (from `agent.run({ onEvent })` or
   *  `runner.observe(handler)`). Translates to the EmitEvent shape
   *  the recorder consumes. */
  readonly ingest: (event: unknown) => void;
  /**
   * Re-render trigger WITHOUT feeding events into the recorder. Use
   * this in dual-attach setups where the recorder receives events
   * directly via `runner.attachRecorder(lens.recorder)` AND you also
   * subscribe to `runner.observe()` purely to drive React re-renders.
   * Without this, calling `ingest()` from the observe callback would
   * double-feed events (once via attach, once via translated ingest).
   */
  readonly sync: () => void;
  /**
   * Set the user message for the next turn. Synthesizes a
   * `agentfootprint.agent.turn_start` emit — keeps backward compat
   * with consumers that called `startTurn()` before invoking
   * `agent.run()`. The agent's own `turn_start` emit (when wired) is
   * the preferred path; this fallback exists for older flows.
   */
  readonly startTurn: (userPrompt: string) => void;
  readonly setSystemPrompt: (prompt: string) => void;
  /** Reset recorder state — used between conversations. */
  readonly reset: () => void;
  /** Underlying recorder — escape hatch for advanced consumers (e.g.
   *  multi-agent shells aggregating multiple recorders by id). */
  readonly recorder: AgentTimelineRecorder;
}

export function useLiveTimeline(): UseLiveTimelineResult {
  const recorderRef = useRef<AgentTimelineRecorder | null>(null);
  if (!recorderRef.current) recorderRef.current = agentTimeline();
  const recorder = recorderRef.current;

  // Lens-local system prompt — recorder doesn't store this (it's app
  // config, not a recorded event). Keep it next to the timeline so the
  // single hook returns everything the panels need.
  const systemPromptRef = useRef<string | undefined>(undefined);

  const [timeline, setTimeline] = useState<AgentTimeline>(() =>
    decorateTimeline(timelineFromRecorder(recorder), systemPromptRef.current),
  );

  const sync = useCallback(() => {
    setTimeline(decorateTimeline(timelineFromRecorder(recorder), systemPromptRef.current));
  }, [recorder]);

  const ingest = useCallback(
    (event: unknown) => {
      const emit = runnerEventToEmit(event);
      if (emit) recorder.onEmit(emit);
      sync();
    },
    [recorder, sync],
  );

  const startTurn = useCallback(
    (userPrompt: string) => {
      recorder.onEmit(
        synthEmit("agentfootprint.agent.turn_start", { userMessage: userPrompt }),
      );
      sync();
    },
    [recorder, sync],
  );

  const setSystemPrompt = useCallback(
    (prompt: string) => {
      systemPromptRef.current = prompt;
      sync();
    },
    [sync],
  );

  const reset = useCallback(() => {
    recorder.clear();
    sync();
  }, [recorder, sync]);

  return useMemo(
    () => ({ timeline, ingest, sync, startTurn, setSystemPrompt, reset, recorder }),
    [timeline, ingest, sync, startTurn, setSystemPrompt, reset, recorder],
  );
}

/**
 * Map a runner-shaped event (`AgentStreamEvent` flat shape, or an
 * already-shaped `EmitEvent`) into the `EmitEvent` the recorder
 * consumes. Handles both because `runner.observe()` callbacks may pass
 * either depending on the runner version.
 *
 * Returns null for events the recorder doesn't understand (a future
 * stream event we haven't taught the recorder about yet) — they're
 * silently dropped, same as the recorder's own onEmit fallback.
 */
function runnerEventToEmit(event: unknown): EmitEvent | null {
  if (!event || typeof event !== "object") return null;
  const e = event as { type?: string; name?: string } & Record<string, unknown>;

  // Already an EmitEvent (has both `name` and `payload`).
  if (typeof e.name === "string" && "payload" in e) {
    return e as unknown as EmitEvent;
  }

  // Runner-shaped AgentStreamEvent: flat object with `type`. Translate
  // to the canonical emit-name + payload shape.
  if (typeof e.type !== "string") return null;
  const name = canonicalNameFor(e.type);
  if (!name) return null;

  // Strip `type` from the payload — the rest of the fields ARE the
  // payload the recorder expects. We don't bother filtering individual
  // fields per event type; the recorder's translator picks what it
  // needs and ignores the rest.
  const { type: _t, ...rest } = e;
  // The runner doesn't carry runtimeStageId. Synthesize one based on a
  // type+timestamp suffix so SequenceRecorder still has a stable key
  // for its per-step index. Not as rich as a real stage id but
  // sufficient for the keyed lookups Lens does today.
  return {
    name,
    payload: rest,
    runtimeStageId: `runner:${e.type}#${Date.now()}-${synthCounter++}`,
    stageName: e.type,
    subflowPath: [],
    pipelineId: "runner-stream",
    timestamp: Date.now(),
  };
}

let synthCounter = 0;

function canonicalNameFor(runnerType: string): string | null {
  switch (runnerType) {
    case "turn_start":
      return "agentfootprint.agent.turn_start";
    case "turn_end":
      return "agentfootprint.agent.turn_complete";
    case "llm_start":
      return "agentfootprint.stream.llm_start";
    case "llm_end":
      return "agentfootprint.stream.llm_end";
    case "tool_start":
      return "agentfootprint.stream.tool_start";
    case "tool_end":
      return "agentfootprint.stream.tool_end";
    default:
      // Already-canonical emit names pass through unchanged.
      if (
        runnerType.startsWith("agentfootprint.stream.") ||
        runnerType.startsWith("agentfootprint.context.") ||
        runnerType.startsWith("agentfootprint.agent.")
      ) {
        return runnerType;
      }
      return null;
  }
}

function synthEmit(name: string, payload: Record<string, unknown>): EmitEvent {
  return {
    name,
    payload,
    runtimeStageId: `synth:${name}#${Date.now()}-${synthCounter++}`,
    stageName: name,
    subflowPath: [],
    pipelineId: "lens-synth",
    timestamp: Date.now(),
  };
}

/**
 * Lens overlays an optional `rawSnapshot` field on AgentTimeline
 * (declared in lens core/types.ts). The recorder produces the base
 * shape; this helper passes it through unchanged today and is the
 * extension point for future Lens-only enrichments (e.g. systemPrompt
 * propagation if we move it out of the panel props).
 */
function decorateTimeline(
  base: AgentTimeline,
  _systemPrompt: string | undefined,
): AgentTimeline {
  return base;
}
