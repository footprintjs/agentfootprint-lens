/**
 * Lens component integration test — renders a real v2 Agent run through
 * all three view modes and asserts the React tree contains the expected
 * content. Not a snapshot test (visual styling may churn); content
 * assertions stay resilient.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Agent, type LLMProvider } from 'agentfootprint';
import { lensRecorder } from '../core/LensRecorder.js';
import { structureGraphFromRunner } from '../core/collapser/structureGraphFromRunner.js';
import type { TraceFlowLayout } from 'footprint-explainable-ui/flowchart';
import { Lens } from './Lens.js';

/** Build the consumer chart the engineer view requires (real structure graph +
 *  passthrough layout). Mirrors how the playground supplies `chart` to `<Lens>`. */
const passthroughLayout: TraceFlowLayout = (g) => g;
const chartFor = (runner: Parameters<typeof structureGraphFromRunner>[0]) => ({
  graph: structureGraphFromRunner(runner),
  layout: passthroughLayout,
});

function scripted(): LLMProvider {
  return {
    name: 'scripted',
    complete: async (req) => {
      const hadTool = req.messages.some((m) => m.role === 'tool');
      if (hadTool) {
        return {
          content: 'final answer: ship it',
          toolCalls: [],
          usage: { input: 30, output: 10 },
          stopReason: 'stop',
        };
      }
      return {
        content: '',
        toolCalls: [{ id: 't1', name: 'lookup', args: { q: 'x' } }],
        usage: { input: 20, output: 5 },
        stopReason: 'tool_use',
      };
    },
  };
}

function buildAgent() {
  return Agent.create({ provider: scripted(), model: 'mock' })
    .system('')
    .tool({
      schema: { name: 'lookup', description: '', inputSchema: { type: 'object' } },
      execute: () => 'found',
    })
    .build();
}

async function runAgent(): Promise<{
  recorder: ReturnType<typeof lensRecorder>;
  runner: ReturnType<typeof buildAgent>;
}> {
  const agent = buildAgent();
  const recorder = lensRecorder();
  recorder.observe(agent);
  await agent.run({ message: 'go' });
  return { recorder, runner: agent };
}

describe('<Lens> engineer view', () => {
  it('renders the chart, summary, and commentary when a runner is attached', async () => {
    const { recorder, runner } = await runAgent();
    const { container } = render(
      <Lens recorder={recorder} runner={runner} chart={chartFor(runner)} view="engineer" />,
    );

    // Summary card
    expect(container.textContent).toMatch(/LLM calls/i);
    expect(container.textContent).toMatch(/Tool calls/i);
    expect(container.textContent).toMatch(/Iterations/i);

    // L4: the chart is the single LensFlow xyflow renderer. Detect by
    // xyflow's root class — present whenever <ReactFlow> mounts.
    expect(container.querySelector('.react-flow')).toBeTruthy();

    // Commentary — humanized teaching narration (Chatbot/LLM verb discipline).
    expect(container.textContent).toMatch(/Chatbot sent/);
  });

  it('shows an empty-state hint when no runner is attached', async () => {
    const { recorder } = await runAgent();
    const { container } = render(<Lens recorder={recorder} view="engineer" />);
    expect(container.textContent).toMatch(/No runner attached/);
    // No xyflow root in the empty-state branch.
    expect(container.querySelector('.react-flow')).toBeFalsy();
  });
});

describe('<Lens> analyst view', () => {
  it('renders humanized commentary lines', async () => {
    const { recorder } = await runAgent();
    const { container } = render(<Lens recorder={recorder} view="analyst" />);
    expect(container.textContent).toMatch(/Chatbot sent/);
    expect(container.textContent).toMatch(/User asked Chatbot/);
  });
});

describe('<Lens> user view', () => {
  it('surfaces the final LLM content', async () => {
    const { recorder } = await runAgent();
    const { container } = render(<Lens recorder={recorder} view="user" />);
    expect(container.textContent).toMatch(/final answer: ship it/);
  });
});
