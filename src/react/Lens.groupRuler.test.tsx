/** @vitest-environment jsdom */
/**
 * <Lens granularity="group"> — the grouped ruler over a REAL run.
 *
 * The two claims that make ⛓ and 🔍 look like two ALTITUDES of one trace,
 * pinned end to end:
 *
 *   1. THE STRIP IS GROUPED: one labelled segment per band (the run's loop
 *      passes + the bookends), not one tick per step — and it drives the ONE
 *      cursor (a band click reports the band's first STEP; the active band is
 *      derived from the controlled step, never stored).
 *   2. FRAMEWORK PLUMBING IS COLLAPSED, HONESTLY: the `sf-*` machinery the
 *      consumer did not build is off the chart by default, the chip SAYS how
 *      many steps are hidden, and the toggle brings them back. The per-step
 *      ruler ('step') hides nothing — that is its identity.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Agent, type LLMProvider } from 'agentfootprint';
import { lensRecorder } from '../core/LensRecorder.js';
import { Lens } from './index.js';

function scripted(): LLMProvider {
  return {
    name: 'scripted',
    complete: async (req) => {
      const hadTool = req.messages.some((m) => m.role === 'tool');
      if (hadTool) {
        return { content: 'done', toolCalls: [], usage: { input: 30, output: 10 }, stopReason: 'stop' };
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

async function runAgent() {
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
  return { recorder, runner: agent };
}

const chartNodeIds = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll('.react-flow__node')).map(
    (n) => n.getAttribute('data-id') ?? '',
  );

afterEach(cleanup);

describe('<Lens granularity="group"> — the grouped strip', () => {
  it('bands the strip by iteration instead of one tick per step', async () => {
    const { recorder, runner } = await runAgent();
    render(<Lens recorder={recorder} runner={runner} granularity="group" />);

    // The per-step ticks are GONE from the transport…
    expect(screen.queryAllByLabelText(/^Go to step /)).toHaveLength(0);
    // …replaced by labelled band segments: bookends + one per loop pass.
    const bands = screen.getAllByLabelText(/^Go to /).map((b) => b.textContent?.trim());
    expect(bands[0]).toBe('Run · start');
    expect(bands[bands.length - 1]).toBe('Run · end');
    expect(bands).toContain('Iteration 1');
    expect(bands).toContain('Iteration 2');
    // GROUPED means grouped: the steps INSIDE a pass (its LLM turn, its tool
    // call) are folded into the pass's band, not segments of their own. A
    // one-band-per-step rendering would show them and fail here.
    expect(bands.some((label) => /^LLM turn/.test(label ?? ''))).toBe(false);
    expect(bands.some((label) => /^Tool call/.test(label ?? ''))).toBe(false);
    // And the count speaks in groups.
    expect(screen.getByText(/^group \d+ \/ \d+$/)).toBeTruthy();
  });

  it('a band click moves the ONE cursor to the band’s first step; the active band is derived from the controlled step', async () => {
    const { recorder, runner } = await runAgent();
    const onStepChange = vi.fn();
    const { rerender } = render(
      <Lens recorder={recorder} runner={runner} granularity="group" step={0} onStepChange={onStepChange} />,
    );

    fireEvent.click(screen.getByLabelText('Go to Iteration 2'));
    expect(onStepChange).toHaveBeenCalledTimes(1);
    const reported = onStepChange.mock.calls[0]![0] as number;
    expect(reported).toBeGreaterThan(0);

    // CONTROLLED: the lens did not move itself — the host must hand the step
    // back for the band to change. (A strip that moved on its own would be
    // holding a second cursor.)
    expect(
      screen.getByLabelText('Go to Run · start').getAttribute('aria-current'),
    ).toBe('step');

    rerender(
      <Lens recorder={recorder} runner={runner} granularity="group" step={reported} onStepChange={onStepChange} />,
    );
    expect(
      screen.getByLabelText('Go to Iteration 2').getAttribute('aria-current'),
    ).toBe('step');
  });

  it('keeps the per-step strip byte-identical on granularity="step"', async () => {
    const { recorder, runner } = await runAgent();
    render(<Lens recorder={recorder} runner={runner} granularity="step" />);
    expect(screen.getAllByLabelText(/^Go to step /).length).toBeGreaterThan(2);
    expect(screen.queryByTestId('framework-steps-chip')).toBeNull();
  });
});

describe('<Lens granularity="group"> — framework plumbing collapsed, honestly', () => {
  it('hides sf-* machinery from the chart, SAYS the count, and the toggle brings it back', async () => {
    const { recorder, runner } = await runAgent();
    const { container } = render(<Lens recorder={recorder} runner={runner} granularity="group" />);

    // Framework mounts are off the chart (the ReAct router is on every agent
    // chart), while the consumer-meaningful heroes stay.
    const collapsedIds = chartNodeIds(container);
    expect(collapsedIds).toContain('call-llm');
    expect(collapsedIds).not.toContain('sf-route');
    expect(collapsedIds).not.toContain('sf-injection-engine');

    // The honest sentence, with the count.
    const chip = screen.getByTestId('framework-steps-chip');
    expect(chip.textContent).toMatch(/\d+ framework steps hidden/);

    // The toggle reveals them — and says it did.
    fireEvent.click(screen.getByTestId('framework-steps-toggle'));
    const revealedIds = chartNodeIds(container);
    expect(revealedIds).toContain('sf-route');
    expect(screen.getByTestId('framework-steps-chip').textContent).toMatch(/Showing \d+ framework steps/);
  });

  it('the per-step ruler shows everything — no collapse, no chip', async () => {
    const { recorder, runner } = await runAgent();
    const { container } = render(<Lens recorder={recorder} runner={runner} granularity="step" />);
    expect(chartNodeIds(container)).toContain('sf-route');
    expect(screen.queryByTestId('framework-steps-chip')).toBeNull();
  });
});
