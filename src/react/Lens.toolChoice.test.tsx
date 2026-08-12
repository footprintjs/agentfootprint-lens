/**
 * <Lens toolChoice> wiring — RFC-002 C7 integration.
 *
 * A REAL Agent run (scripted provider, two tools so the margin has
 * competition) with the agentfootprint/observe `toolChoiceRecorder`
 * attached. Proves the recorder-prop pattern: pass the handle →
 * the "Tool choice" pill + panel mount in the engineer view; omit the
 * prop → zero trace of the panel (no second data path, no overhead).
 */

/** @vitest-environment jsdom */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Agent, type LLMProvider } from 'agentfootprint'
import { mockEmbedder } from 'agentfootprint/memory';
import { toolChoiceRecorder } from 'agentfootprint/observe';
import { lensRecorder } from '../core/LensRecorder.js';
import { Lens } from './Lens.js';

function scripted(): LLMProvider {
  return {
    name: 'scripted',
    complete: async (req) => {
      const hadTool = req.messages.some((m) => m.role === 'tool');
      if (hadTool) {
        return {
          content: 'the port is registered',
          toolCalls: [],
          usage: { input: 30, output: 10 },
          stopReason: 'stop',
        };
      }
      return {
        content: '',
        toolCalls: [{ id: 't1', name: 'lookup_registry', args: { q: 'x' } }],
        usage: { input: 20, output: 5 },
        stopReason: 'tool_use',
      };
    },
  };
}

async function runAgentWithToolChoice() {
  const choices = toolChoiceRecorder({ embedder: mockEmbedder() });
  const agent = Agent.create({ provider: scripted(), model: 'mock' })
    .system('You are a registry triage agent.')
    .tool({
      schema: {
        name: 'lookup_registry',
        description: 'Look up a device in the live registry.',
        inputSchema: { type: 'object' },
      },
      execute: () => 'found',
    })
    .tool({
      schema: {
        name: 'send_email',
        description: 'Send a notification email after a report.',
        inputSchema: { type: 'object' },
      },
      execute: () => 'sent',
    })
    .watch(choices)
    .build();
  const recorder = lensRecorder();
  recorder.observe(agent);
  await agent.run({ message: 'is wwpn 21:00 registered?' });
  return { recorder, choices };
}

describe('<Lens toolChoice> wiring', () => {
  it('mounts the Tool choice pill with the flagged/scored summary', async () => {
    const { recorder, choices } = await runAgentWithToolChoice();
    render(<Lens recorder={recorder} view="engineer" toolChoice={choices} />);

    // Pill label renders immediately…
    expect(screen.getByText('Tool choice')).toBeTruthy();
    // …and the async lazy-scoring read fills the summary detail.
    await waitFor(() => expect(screen.getByText(/flagged · 1 scored/)).toBeTruthy(), {
      timeout: 5000,
    });
  });

  it('expanding the pill reveals the cursor-derived panel + honest caption', async () => {
    const { recorder, choices } = await runAgentWithToolChoice();
    render(<Lens recorder={recorder} view="engineer" toolChoice={choices} />);
    await waitFor(() => expect(screen.getByText(/flagged · 1 scored/)).toBeTruthy(), {
      timeout: 5000,
    });

    fireEvent.click(screen.getByText('Tool choice'));
    const panel = within(screen.getByRole('region', { name: 'Tool choice' }));
    // The honest-claim caption is always part of the panel.
    expect(
      panel.getByText(/embedding-geometry proxies .*not.*model internals/s),
    ).toBeTruthy();
    // The live-edge cursor resolves to the LAST recorded call (the final
    // answer turn still offered tools but chose none → honest skip note).
    expect(panel.getByText(/Iteration/)).toBeTruthy();
  });

  it('without the prop the panel leaves zero trace', async () => {
    const { recorder } = await runAgentWithToolChoice();
    render(<Lens recorder={recorder} view="engineer" />);
    expect(screen.queryByText('Tool choice')).toBeNull();
    expect(screen.queryByText(/embedding-geometry proxies/)).toBeNull();
  });
});
