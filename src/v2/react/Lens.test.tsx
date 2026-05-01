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
import { Lens } from './Lens.js';

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

async function runAgent(): Promise<ReturnType<typeof lensRecorder>> {
  const agent = Agent.create({ provider: scripted(), model: 'mock' })
    .system('')
    .tool({
      schema: { name: 'lookup', description: '', inputSchema: { type: 'object' } },
      execute: () => 'found',
    })
    .build();
  const recorder = lensRecorder();
  recorder.observe(agent);
  await agent.run({ message: 'go' });
  return recorder;
}

describe('<Lens> engineer view', () => {
  it('renders the run tree, event stream, and summary', async () => {
    const recorder = await runAgent();
    const { container } = render(<Lens recorder={recorder} view="engineer" />);

    // Summary card
    expect(container.textContent).toMatch(/LLM calls/i);
    expect(container.textContent).toMatch(/Tool calls/i);
    expect(container.textContent).toMatch(/Iterations/i);

    // Flowchart empty-state — without a StepGraph prop, Lens shows
    // a copy-and-paste snippet telling the consumer how to wire
    // enable.flowchart(). Not a Turn/tree anymore — the run-flow
    // panel is the StepGraph-driven triangle.
    expect(container.textContent).toMatch(/runner\.enable\.flowchart/);

    // Commentary — humanized teaching narration (Chatbot/LLM verb discipline).
    // teachingHumanizer renders "Chatbot sent the question to the LLM" for
    // llm.start (iter 1).
    expect(container.textContent).toMatch(/Chatbot sent/);
  });
});

describe('<Lens> analyst view', () => {
  it('renders humanized commentary lines', async () => {
    const recorder = await runAgent();
    const { container } = render(<Lens recorder={recorder} view="analyst" />);
    // teachingHumanizer renders "Chatbot sent the question to the LLM" for
    // llm.start, and "User asked Chatbot:" for agent.turn_start.
    expect(container.textContent).toMatch(/Chatbot sent/);
    expect(container.textContent).toMatch(/User asked Chatbot/);
  });
});

describe('<Lens> user view', () => {
  it('surfaces the final LLM content', async () => {
    const recorder = await runAgent();
    const { container } = render(<Lens recorder={recorder} view="user" />);
    expect(container.textContent).toMatch(/final answer: ship it/);
  });
});
