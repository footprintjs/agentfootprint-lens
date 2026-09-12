/**
 * <Lens> mounts the Served tab on the right rail for EVERY run, and the tab
 * follows the lens's ONE cursor.
 *
 *   · the rail carries two tabs — What happened (default) and Served;
 *   · picking Served renders the tab at the current cursor, on a replayed
 *     recording (runner handed over by `observeRecording`) AND on a live
 *     `<Lens recorder>` with no runner prop (the recorder's observed runner);
 *   · moving the cursor from the transport re-renders the tab's epoch — no
 *     tab-local position.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Agent, type LLMProvider } from 'agentfootprint';

import { Lens } from '../../src/react/Lens.js';
import { lensRecorder } from '../../src/core/LensRecorder.js';
import { load, loadTampered } from './helpers.js';

describe('<Lens> · the Served tab on the right rail', () => {
  it('replayed recording: What happened by default, Served on click, following the cursor', () => {
    const f = load('flat-dynamic-tools');
    const last = f.positions.length - 1;
    // The HOST owns the one cursor (`<Lens step>`); the tab follows it.
    const at = (step: number) => (
      <Lens recorder={f.recorder} runner={f.runner as never} view="engineer" granularity="group" step={step} />
    );
    const { rerender } = render(at(last));
    // Default rail: the shipped timeline, byte for byte.
    expect(screen.getByTestId('rail-tab-happened')).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('served-tab')).toBeNull();

    fireEvent.click(screen.getByTestId('rail-tab-served'));
    expect(screen.getByTestId('served-tab')).toBeInTheDocument();
    // At Run · end — after the last call, between calls.
    expect(screen.getByTestId('served-tab').dataset.epoch).toBe('2');
    expect(screen.getByTestId('served-between-calls')).toBeInTheDocument();

    // Move THE cursor to the first stop; the tab follows — no call yet.
    rerender(at(0));
    expect(screen.getByTestId('served-no-call')).toBeInTheDocument();
    // …and onto the first call itself.
    const firstTurn = f.positions.findIndex((p) => p.milestone === 'llm-turn');
    rerender(at(firstTurn));
    expect(screen.getByTestId('served-tab').dataset.epoch).toBe('1');
    expect(screen.queryByTestId('served-between-calls')).toBeNull();
    // `step` is CONTROLLED here: the transport reports a move and the host's
    // `step` lands. Until it does, nothing moved — the tab shows the same call
    // and holds no position of its own to advance.
    fireEvent.click(screen.getByLabelText(/^Next st(ep|op)$/));
    expect(screen.getByTestId('served-tab').dataset.epoch).toBe('1');
    expect(screen.queryByTestId('served-between-calls')).toBeNull();
    // The host lands one step after the call: between calls, as of call 1.
    rerender(at(firstTurn + 1));
    expect(screen.getByTestId('served-tab').dataset.epoch).toBe('1');
    expect(screen.getByTestId('served-between-calls')).toBeInTheDocument();
  });

  it('a half-shaped receipt in the recording: the tab reads Damaged and the rest of the Lens stays mounted', () => {
    // `cache: {}` keeps this on the lens's own refusal path; a receipt with NO
    // `cache` makes agentfootprint 9.93.0's `servedAt` throw instead (pinned
    // in ServedTab.test.tsx — the boundary keeps the Lens up there too).
    const f = loadTampered('flat-dynamic-tools', (r) => {
      r.snapshot.commitLog.find((b) => b.runtimeStageId === 'call-llm#18')!.overwrite!.receipt = {
        basis: { epoch: 1, runId: 'x' },
        cache: {},
      };
    });
    const firstTurn = f.positions.findIndex((p) => p.milestone === 'llm-turn');
    const { container } = render(
      <Lens recorder={f.recorder} runner={f.runner as never} view="engineer" granularity="group" step={firstTurn} />,
    );
    fireEvent.click(screen.getByTestId('rail-tab-served'));
    expect(container.childElementCount).toBeGreaterThan(0);
    expect(screen.getByTestId('rail-tab-happened')).toBeInTheDocument();
    expect(screen.getByTestId('served-tab').dataset.epoch).toBe('1');
    const damaged = container.querySelectorAll('[data-testid="served-badge"][data-status="damaged"]');
    expect(damaged.length).toBeGreaterThan(0);
    // The other tab is still there to switch back to.
    fireEvent.click(screen.getByTestId('rail-tab-happened'));
    expect(screen.queryByTestId('served-tab')).toBeNull();
  });

  it('Run · start hands the tab no commit: no call yet, and the fold is the base', () => {
    const f = load('flat-dynamic-tools');
    render(<Lens recorder={f.recorder} runner={f.runner as never} view="engineer" granularity="group" step={0} />);
    fireEvent.click(screen.getByTestId('rail-tab-served'));
    expect(screen.getByTestId('served-no-call')).toBeInTheDocument();
  });

  it('live run, no runner prop: the tab reads the recorder\'s observed runner', async () => {
    const provider: LLMProvider = {
      name: 'scripted',
      complete: async (req) => {
        const hadTool = req.messages.some((m) => m.role === 'tool');
        return hadTool
          ? { content: 'done', toolCalls: [], usage: { input: 1, output: 1 }, stopReason: 'stop' }
          : {
              content: '',
              toolCalls: [{ id: 't1', name: 'lookup', args: { q: 'x' } }],
              usage: { input: 1, output: 1 },
              stopReason: 'tool_use',
            };
      },
    };
    const agent = Agent.create({ provider, model: 'mock' })
      .system('live bot')
      .tool({
        schema: { name: 'lookup', description: '', inputSchema: { type: 'object' } },
        execute: () => 'found',
      })
      .build();
    const recorder = lensRecorder();
    recorder.observe(agent);
    await agent.run({ message: 'go' });
    expect(recorder.observedRunner()).toBe(agent);

    render(<Lens recorder={recorder} view="engineer" />);
    fireEvent.click(screen.getByTestId('rail-tab-served'));
    expect(screen.getByTestId('served-tab').dataset.epoch).toBe('2');
    // Verified where the hashes agree — on a run that was never serialized.
    const verified = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="served-badge"][data-status="verified"]'),
    );
    expect(verified.length).toBeGreaterThan(0);
  });
});
