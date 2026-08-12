/**
 * LensRecorder — Agent (ReAct) rendering contract.
 *
 * The atomic LLMCall renders correctly in Lens (see
 * LensSnapshotRecorder.llmcall.test.ts). This file is the equivalent
 * contract for the AGENT primitive — a tool-using, multi-iteration
 * ReAct loop. It encodes the TARGET behavior:
 *
 *   1. The agent body renders — actor-arrow nodes (user→llm / llm→tool /
 *      tool→llm / llm→user), NOT an empty graph.
 *   2. Each step carries its 1-based `iterationIndex` so iterations are
 *      distinguishable on the slider.
 *   3. LLM steps carry `slotUpdated` (which of system-prompt / messages /
 *      tools was engineered) — the data the per-iteration slot pills read.
 *   4. The Agent boundary itself is still present (primitiveKind 'Agent')
 *      so the agent-list / drill keeps working.
 *
 * Source of truth: agentfootprint's `enable.flowchart()` StepGraph, which
 * already captures all of the above. Lens consumes it (compose, don't
 * duplicate) rather than re-deriving in LensSnapshotRecorder.
 */

import { describe, it, expect } from 'vitest';
import { Agent, defineTool } from 'agentfootprint'
import { MockProvider } from 'agentfootprint/providers';
import { LensRecorder } from './LensRecorder.js';

function build2IterationAgent() {
  const getWeather = defineTool({
    name: 'get_weather',
    description: 'weather for a city',
    inputSchema: { type: 'object', properties: { city: { type: 'string' } } },
    execute: () => '{"temp":72}',
  });
  // Iteration 1: call the tool. Iteration 2: final answer (no tool calls).
  const provider = new MockProvider({
    replies: [
      { content: 'let me check', toolCalls: [{ id: 't1', name: 'get_weather', args: { city: 'SF' } }] },
      { content: 'It is 72F.', toolCalls: [] },
    ],
  });
  return Agent.create({ provider, model: 'mock' }).system('weather bot').tool(getWeather).build();
}

describe('LensRecorder — Agent (ReAct) renders its reasoning', () => {
  it('produces actor-arrow step nodes with iterationIndex + slotUpdated', async () => {
    const agent = build2IterationAgent();
    const rec = new LensRecorder();
    const off = rec.observe(agent);
    await agent.run({ message: 'weather in SF?' });

    // Read via the public getStepGraph() (the ReAct flowchart handle)
    // BEFORE detaching — off() unsubscribes the handle, after which
    // getStepGraph() falls back to the subflow-only snapshot recorder.
    const sg = rec.getStepGraph();
    off();

    const kinds = sg.nodes.map((n) => n.kind);

    // 1. The agent body renders — NOT empty (the bug: 0 actor-arrow nodes).
    const reactKinds = kinds.filter(
      (k) => k === 'user->llm' || k === 'llm->tool' || k === 'tool->llm' || k === 'llm->user',
    );
    expect(reactKinds.length).toBeGreaterThan(0);

    // 2. A tool was used → an llm->tool step exists, carrying the tool name.
    const toolStep = sg.nodes.find((n) => n.kind === 'llm->tool');
    expect(toolStep).toBeDefined();
    expect(toolStep?.toolName).toBe('get_weather');

    // 3. Iterations are distinguishable — at least two distinct iteration
    //    indices across the ReAct steps (the loop ran twice).
    const iters = new Set(
      sg.nodes
        .map((n) => n.iterationIndex)
        .filter((i): i is number => typeof i === 'number'),
    );
    expect(iters.size).toBeGreaterThanOrEqual(2);

    // 4. LLM steps carry slotUpdated — the per-iteration slot-pill source.
    const withSlot = sg.nodes.filter((n) => n.slotUpdated !== undefined);
    expect(withSlot.length).toBeGreaterThan(0);

    // 5. The run boundary is still present as a subflow node (drives the
    //    agent-list / drill). When the Agent is the TOP-LEVEL runner its
    //    boundary is the run root (primitiveKind 'Run'); 'Agent' only
    //    appears when an agent is NESTED as a subflow (e.g. in a Swarm).
    const boundary = sg.nodes.find((n) => n.kind === 'subflow');
    expect(boundary).toBeDefined();
  });
});
