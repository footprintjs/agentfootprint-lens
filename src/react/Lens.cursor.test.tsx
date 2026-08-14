/**
 * <Lens step / onStepChange> — the controlled cursor, end to end on a real run.
 *
 * Three things are proved here:
 *   1. the controlled/uncontrolled matrix (host drives · host observes · lens
 *      self-drives · out-of-range),
 *   2. that EVERY internal mover reports — a mover that forgets is a second
 *      cursor in disguise,
 *   3. the ZERO-DELTA pin: with none of the new props the rendered DOM is
 *      byte-identical to the shipped lens's.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Agent, type LLMProvider } from 'agentfootprint';
import { lensRecorder } from '../core/LensRecorder.js';
import { Lens, type LensCursorAt } from './index.js';

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

function stepButtons(): HTMLElement[] {
  return screen.getAllByLabelText(/^Go to step /);
}

/** The step strip marks the cursor with `aria-current="step"` — the cursor
 *  made visible, read straight off the DOM. */
function focusedStep(): number {
  return stepButtons().findIndex((b) => b.getAttribute('aria-current') === 'step');
}

describe('<Lens> uncontrolled — the lens is self-driving (unchanged)', () => {
  it('holds the cursor itself with no cursor props at all', async () => {
    const { recorder, runner } = await runAgent();
    const { container } = render(<Lens recorder={recorder} runner={runner} />);
    const steps = stepButtons();
    expect(steps.length).toBeGreaterThan(2);

    fireEvent.click(steps[1]!);
    expect(focusedStep()).toBe(1);
  });

  it('reports moves to a host that only OBSERVES, and still moves itself', async () => {
    const { recorder, runner } = await runAgent();
    const onStepChange = vi.fn();
    const { container } = render(
      <Lens recorder={recorder} runner={runner} onStepChange={onStepChange} />,
    );
    onStepChange.mockClear();

    const steps = stepButtons();
    fireEvent.click(steps[1]!);

    expect(onStepChange).toHaveBeenCalledTimes(1);
    expect(onStepChange.mock.calls[0]?.[0]).toBe(1);
    expect(focusedStep()).toBe(1);
  });

  it('reports the cursor address in every unit the lens knows', async () => {
    const { recorder, runner } = await runAgent();
    const onStepChange = vi.fn();
    render(<Lens recorder={recorder} runner={runner} onStepChange={onStepChange} />);
    onStepChange.mockClear();

    fireEvent.click(stepButtons()[1]!);
    const at = onStepChange.mock.calls[0]?.[1] as LensCursorAt;
    expect(at.step).toBe(1);
    expect(at.totalSteps).toBe(stepButtons().length);
    expect(at.runtimeStageId).toMatch(/#\d+$/);
    expect(at.commitIdx).toBeGreaterThanOrEqual(0);
    expect(at.label.length).toBeGreaterThan(0);
    expect(at.clamped).toBe(false);
  });
});

describe('<Lens step> controlled — the host owns the cursor', () => {
  it('renders the host value and follows the host', async () => {
    const { recorder, runner } = await runAgent();
    const { container, rerender } = render(
      <Lens recorder={recorder} runner={runner} step={0} onStepChange={() => {}} />,
    );
    const total = stepButtons().length;
    expect(focusedStep()).toBe(0);

    rerender(
      <Lens recorder={recorder} runner={runner} step={2} onStepChange={() => {}} />,
    );
    expect(focusedStep()).toBe(2);
  });

  it('does not move itself — an internal click reports and waits', async () => {
    const { recorder, runner } = await runAgent();
    const onStepChange = vi.fn();
    const { container } = render(
      <Lens recorder={recorder} runner={runner} step={0} onStepChange={onStepChange} />,
    );
    const total = stepButtons().length;
    onStepChange.mockClear();

    fireEvent.click(stepButtons()[2]!);
    expect(onStepChange).toHaveBeenCalledTimes(1);
    expect(onStepChange.mock.calls[0]?.[0]).toBe(2);
    expect(focusedStep()).toBe(0); // still the host's value
  });

  it('a host that echoes the callback moves — the loop closes once, not forever', async () => {
    const { recorder, runner } = await runAgent();
    const seen: number[] = [];
    function Host(): React.ReactElement {
      const [step, setStep] = React.useState(0);
      return (
        <Lens
          recorder={recorder}
          runner={runner}
          step={step}
          onStepChange={(n) => {
            seen.push(n);
            setStep(n);
          }}
        />
      );
    }
    const { container } = render(<Host />);
    const total = stepButtons().length;
    seen.length = 0;

    fireEvent.click(stepButtons()[3]!);
    expect(focusedStep()).toBe(3);
    expect(seen).toEqual([3]);
  });

  it('every mover reports: the step strip, ◀ ▶, ⟳ Live and the arrow keys', async () => {
    const { recorder, runner } = await runAgent();
    const moves: number[] = [];
    function Host(): React.ReactElement {
      const [step, setStep] = React.useState(0);
      return (
        <Lens
          recorder={recorder}
          runner={runner}
          step={step}
          onStepChange={(n) => {
            moves.push(n);
            setStep(n);
          }}
        />
      );
    }
    render(<Host />);
    const total = stepButtons().length;
    moves.length = 0;

    fireEvent.click(screen.getByLabelText('Next event'));
    fireEvent.click(screen.getByLabelText('Previous event'));
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    fireEvent.click(screen.getByLabelText('Jump to latest'));
    // At the live edge the transport disables ◀/▶ nothing else; Home rewinds.
    fireEvent.keyDown(document.body, { key: 'Home' });

    expect(moves).toEqual([1, 0, 1, total - 1, 0]);
  });
});

describe('<Lens step> out of range — clamped, and said out loud', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('shows the nearest real position and reports the correction', async () => {
    const { recorder, runner } = await runAgent();
    const onStepChange = vi.fn();
    const { container } = render(
      <Lens recorder={recorder} runner={runner} step={999} onStepChange={onStepChange} />,
    );
    const total = stepButtons().length;

    expect(focusedStep()).toBe(total - 1);
    expect(onStepChange).toHaveBeenCalledTimes(1);
    expect(onStepChange.mock.calls[0]?.[0]).toBe(total - 1);
    expect(onStepChange.mock.calls[0]?.[1].clamped).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('ZERO-DELTA PIN — none of the new props, none of the new behaviour', () => {
  it('renders DOM byte-identical to passing the new props as undefined', async () => {
    const { recorder, runner } = await runAgent();
    const a = render(<Lens recorder={recorder} runner={runner} />);
    const before = a.container.innerHTML;
    a.unmount();

    const b = render(
      <Lens
        recorder={recorder}
        runner={runner}
        step={undefined}
        onStepChange={undefined}
        slots={undefined}
      />,
    );
    expect(b.container.innerHTML).toBe(before);
  });

  it('adds no layout attribute and keeps the two-column row while wide', async () => {
    const { recorder, runner } = await runAgent();
    const { container } = render(<Lens recorder={recorder} runner={runner} />);
    expect(container.innerHTML).not.toContain('data-lens-layout');
    expect(container.querySelector('[data-lens-layout]')).toBeNull();
  });

  it('renders the built-in timeline when no detail slot is given', async () => {
    const { recorder, runner } = await runAgent();
    const { container } = render(<Lens recorder={recorder} runner={runner} />);
    expect(container.textContent).toMatch(/What happened/i);
  });

  it('an observation-only `onStepChange` changes nothing on screen', async () => {
    const { recorder, runner } = await runAgent();
    const a = render(<Lens recorder={recorder} runner={runner} />);
    const before = a.container.innerHTML;
    a.unmount();

    const b = render(
      <Lens recorder={recorder} runner={runner} onStepChange={() => {}} />,
    );
    expect(b.container.innerHTML).toBe(before);
  });
});
