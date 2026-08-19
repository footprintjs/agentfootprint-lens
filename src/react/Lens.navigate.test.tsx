/**
 * `<Lens navigatorRef>` — "take me to this stage", on a REAL run.
 *
 * The pointing half of the cursor API. What is proved here:
 *   1. an EXACT hit lands, on BOTH axes — and the ACTIVE axis decides, so one
 *      address is a different step under `granularity="step"` than under
 *      `granularity="group"`;
 *   2. an address the axis holds only COARSELY (a stage inside a subflow) lands
 *      on the stop that encloses it, and says so;
 *   3. an HONEST MISS moves nothing — the nearest earlier stop comes back as an
 *      offer, and no cursor event fires;
 *   4. CONTROLLED interplay: navigateTo reports through the same one channel
 *      and lets the host land it, then a user scrub still works — no fighting,
 *      exactly one report per action;
 *   5. the HEADLESS resolver gives byte-identical answers to the React path.
 */

import React, { useRef, useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { Agent, type LLMProvider } from 'agentfootprint';

import { lensRecorder, type LensRecorder } from '../core/LensRecorder.js';
import { scrubAxisFor } from '../core/group/scrubAxisFor.js';
import { resolveNavigation } from '../core/group/resolveNavigation.js';
import { Lens, type LensCursorAt, type LensNavigator } from './index.js';

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

/** The handle a host holds — the same object `useRef<LensNavigator>(null)`
 *  gives a component, built outside one so a loop can hold several. */
function navRef(): React.RefObject<LensNavigator> {
  return { current: null } as React.RefObject<LensNavigator>;
}

function stepButtons(): HTMLElement[] {
  return screen.getAllByLabelText(/^Go to step /);
}

/** The cursor, read straight off the DOM (the step strip marks it). */
function focusedStep(): number {
  return stepButtons().findIndex((b) => b.getAttribute('aria-current') === 'step');
}

/** The `runtimeStageId` of the Nth stop on an axis — the addresses a host
 *  points AT are the run's own, never invented by the test. */
function idAt(recorder: LensRecorder, granularity: 'step' | 'group', n: number): string {
  return scrubAxisFor(recorder, granularity)[n]!.runtimeStageId;
}

describe('<Lens navigatorRef> — an exact hit, on both axes', () => {
  it('moves the cursor to the stop whose address it is (commit axis)', async () => {
    const { recorder, runner } = await runAgent();
    const nav = navRef();
    render(<Lens recorder={recorder} runner={runner} navigatorRef={nav} />);

    const target = idAt(recorder, 'step', 7); // 'call-llm#18' — the first LLM turn
    let to!: ReturnType<LensNavigator['navigateTo']>;
    act(() => {
      to = nav.current!.navigateTo(target);
    });

    expect(to).toMatchObject({ ok: true, step: 7, runtimeStageId: target, match: 'exact' });
    expect(to.ok && to.label.length).toBeGreaterThan(0);
    expect(focusedStep()).toBe(7);
  });

  it('resolves on the ACTIVE axis — the SAME address is a different step per granularity', async () => {
    const { recorder, runner } = await runAgent();
    // The same stage is stop 7 of the commit ruler and stop 3 of the milestone one.
    const target = idAt(recorder, 'step', 7);
    expect(idAt(recorder, 'group', 3)).toBe(target);

    const onStepChange = vi.fn();
    const navStep = navRef();
    const { unmount } = render(
      <Lens recorder={recorder} runner={runner} granularity="step" navigatorRef={navStep} onStepChange={onStepChange} />,
    );
    let onCommitAxis!: ReturnType<LensNavigator['navigateTo']>;
    act(() => {
      onCommitAxis = navStep.current!.navigateTo(target);
    });
    unmount();

    const navGroup = navRef();
    render(
      <Lens recorder={recorder} runner={runner} granularity="group" navigatorRef={navGroup} onStepChange={onStepChange} />,
    );
    let onMilestoneAxis!: ReturnType<LensNavigator['navigateTo']>;
    act(() => {
      onMilestoneAxis = navGroup.current!.navigateTo(target);
    });

    expect(onCommitAxis).toMatchObject({ ok: true, step: 7, match: 'exact' });
    expect(onMilestoneAxis).toMatchObject({ ok: true, step: 3, match: 'exact' });
    // Same evidence, two rulers, one cursor concept — never one hard-coded axis.
    expect(onCommitAxis.ok && onCommitAxis.runtimeStageId).toBe(
      onMilestoneAxis.ok && onMilestoneAxis.runtimeStageId,
    );
  });

  it('lands the milestone axis through the shipped cursor channel', async () => {
    const { recorder, runner } = await runAgent();
    const onStepChange = vi.fn();
    const nav = navRef();
    render(
      <Lens recorder={recorder} runner={runner} granularity="group" navigatorRef={nav} onStepChange={onStepChange} />,
    );
    onStepChange.mockClear();

    const target = idAt(recorder, 'group', 5); // 'tool-calls#20' — "Tool call"
    act(() => {
      nav.current!.navigateTo(target);
    });

    expect(onStepChange).toHaveBeenCalledTimes(1);
    expect(onStepChange.mock.calls[0]?.[0]).toBe(5);
    const at = onStepChange.mock.calls[0]?.[1] as LensCursorAt;
    expect(at.runtimeStageId).toBe(target);
    expect(at.clamped).toBe(false);
  });
});

describe('<Lens navigatorRef> — a coarser stop is not a wrong one', () => {
  it('lands a subflow-internal address on the stop that ENCLOSES it, and says where it went', async () => {
    const { recorder, runner } = await runAgent();
    const nav = navRef();
    render(<Lens recorder={recorder} runner={runner} navigatorRef={nav} />);

    // A stage INSIDE the first Tools subflow — no ruler stops there.
    let to!: ReturnType<LensNavigator['navigateTo']>;
    act(() => {
      to = nav.current!.navigateTo('sf-tools/lookup#12');
    });

    expect(to.ok).toBe(true);
    expect(to.ok && to.match).toBe('enclosing');
    expect(to.ok && to.runtimeStageId).toBe(idAt(recorder, 'step', 5)); // 'sf-tools#11'
    expect(focusedStep()).toBe(5);
  });
});

describe('<Lens navigatorRef> — honest misses never move the cursor', () => {
  it('refuses an address the ruler cannot hold, and OFFERS the nearest earlier stop', async () => {
    const { recorder, runner } = await runAgent();
    const onStepChange = vi.fn();
    const nav = navRef();
    render(
      <Lens recorder={recorder} runner={runner} granularity="group" navigatorRef={nav} onStepChange={onStepChange} />,
    );
    onStepChange.mockClear();

    // `context#6` is a stop on the COMMIT ruler and nowhere on the milestone one.
    const commitOnly = idAt(recorder, 'step', 2);
    let to!: ReturnType<LensNavigator['navigateTo']>;
    act(() => {
      to = nav.current!.navigateTo(commitOnly);
    });

    expect(to.ok).toBe(false);
    expect(!to.ok && to.reason).toBe('not-on-axis');
    expect(!to.ok && to.nearest).toEqual({
      runtimeStageId: idAt(recorder, 'group', 1),
      step: 1,
      label: 'Iteration 1',
    });
    // Offered, NOT taken: nothing moved and nobody was told a move happened.
    expect(onStepChange).not.toHaveBeenCalled();

    // The caller decides — taking the offer is one more call, and it lands.
    let taken!: ReturnType<LensNavigator['navigateTo']>;
    act(() => {
      taken = nav.current!.navigateTo((to as { nearest: { runtimeStageId: string } }).nearest.runtimeStageId);
    });
    expect(taken).toMatchObject({ ok: true, step: 1, match: 'exact' });
    expect(onStepChange).toHaveBeenCalledTimes(1);
  });

  it('refuses a string that is not an address at all, with NO offer', async () => {
    const { recorder, runner } = await runAgent();
    const onStepChange = vi.fn();
    const nav = navRef();
    render(<Lens recorder={recorder} runner={runner} navigatorRef={nav} onStepChange={onStepChange} />);
    act(() => {
      nav.current!.navigateTo(idAt(recorder, 'step', 3));
    });
    onStepChange.mockClear();
    const before = focusedStep();

    let to!: ReturnType<LensNavigator['navigateTo']>;
    act(() => {
      to = nav.current!.navigateTo('the-final-answer');
    });

    expect(to.ok).toBe(false);
    expect(!to.ok && to.reason).toBe('not-on-axis');
    expect(!to.ok && to.nearest).toBeUndefined();
    expect(!to.ok && to.message).toContain('#executionIndex');
    expect(focusedStep()).toBe(before);
    expect(onStepChange).not.toHaveBeenCalled();
  });

  it('refuses an empty address without throwing', async () => {
    const { recorder, runner } = await runAgent();
    const nav = navRef();
    render(<Lens recorder={recorder} runner={runner} navigatorRef={nav} />);
    let to!: ReturnType<LensNavigator['navigateTo']>;
    act(() => {
      to = nav.current!.navigateTo('');
    });
    expect(to).toMatchObject({ ok: false, reason: 'no-id' });
  });
});

/** A host that OWNS the cursor — `<Lens step onStepChange>`, plus the ref. */
const ControlledHost: React.FC<{
  recorder: LensRecorder;
  runner: unknown;
  navRef: React.RefObject<LensNavigator>;
  onReport: (step: number) => void;
}> = ({ recorder, runner, navRef, onReport }) => {
  const [step, setStep] = useState(0);
  return (
    <Lens
      recorder={recorder}
      runner={runner as never}
      navigatorRef={navRef}
      step={step}
      onStepChange={(n) => {
        onReport(n);
        setStep(n);
      }}
    />
  );
};

describe('<Lens step navigatorRef> — controlled: one owner, no fighting', () => {
  it('reports through the one channel and lets the HOST land it, then a user scrub still works', async () => {
    const { recorder, runner } = await runAgent();
    const onReport = vi.fn();
    const nav = navRef();
    render(<ControlledHost recorder={recorder} runner={runner} navRef={nav} onReport={onReport} />);
    expect(focusedStep()).toBe(0);

    // 1. The chat points at evidence.
    const target = idAt(recorder, 'step', 7);
    let to!: ReturnType<LensNavigator['navigateTo']>;
    act(() => {
      to = nav.current!.navigateTo(target);
    });
    expect(to).toMatchObject({ ok: true, step: 7 });
    expect(onReport).toHaveBeenCalledTimes(1); // exactly one report per action
    expect(onReport).toHaveBeenLastCalledWith(7);
    expect(focusedStep()).toBe(7); // the HOST's state landed it

    // 2. The person scrubs somewhere else. The programmatic jump does not
    //    fight back — no echo, no second report, no snapping home.
    fireEvent.click(stepButtons()[2]!);
    expect(onReport).toHaveBeenCalledTimes(2);
    expect(onReport).toHaveBeenLastCalledWith(2);
    expect(focusedStep()).toBe(2);

    // 3. And a second jump still works from wherever the person left it.
    act(() => {
      nav.current!.navigateTo(idAt(recorder, 'step', 11));
    });
    expect(onReport).toHaveBeenCalledTimes(3);
    expect(focusedStep()).toBe(11);
  });

  it('a jump to the stop already showing is not a move — no event, still ok', async () => {
    const { recorder, runner } = await runAgent();
    const onReport = vi.fn();
    const nav = navRef();
    render(<ControlledHost recorder={recorder} runner={runner} navRef={nav} onReport={onReport} />);
    act(() => {
      nav.current!.navigateTo(idAt(recorder, 'step', 4));
    });
    onReport.mockClear();

    let again!: ReturnType<LensNavigator['navigateTo']>;
    act(() => {
      again = nav.current!.navigateTo(idAt(recorder, 'step', 4));
    });
    expect(again).toMatchObject({ ok: true, step: 4 });
    expect(onReport).not.toHaveBeenCalled();
    expect(focusedStep()).toBe(4);
  });

  it('the handle is identity-stable across re-renders', async () => {
    const { recorder, runner } = await runAgent();
    const nav = navRef();
    const { rerender } = render(<Lens recorder={recorder} runner={runner} navigatorRef={nav} />);
    const first = nav.current;
    rerender(<Lens recorder={recorder} runner={runner} navigatorRef={nav} granularity="group" />);
    expect(nav.current).toBe(first);
    // …and it now resolves against the NEW axis, not a captured stale one.
    let to!: ReturnType<LensNavigator['navigateTo']>;
    act(() => {
      to = nav.current!.navigateTo(idAt(recorder, 'group', 5));
    });
    expect(to).toMatchObject({ ok: true, step: 5, match: 'exact' });
  });
});

describe('headless parity — the same answer with nothing mounted', () => {
  it('resolveNavigation(scrubAxisFor(...)) equals what the React navigator returns', async () => {
    const { recorder, runner } = await runAgent();

    for (const granularity of ['step', 'group'] as const) {
      const nav = navRef();
      const { unmount } = render(
        <Lens recorder={recorder} runner={runner} granularity={granularity} navigatorRef={nav} />,
      );
      const positions = scrubAxisFor(recorder, granularity);

      const addresses = [
        positions[0]!.runtimeStageId,          // exact, first stop
        positions[Math.floor(positions.length / 2)]!.runtimeStageId, // exact, mid
        'sf-tools/lookup#12',                  // enclosing
        idAt(recorder, 'step', 2),             // a commit-only address
        'the-final-answer',                    // not an address
        '',                                    // nothing asked
      ];

      for (const id of addresses) {
        let fromReact!: ReturnType<LensNavigator['navigateTo']>;
        act(() => {
          fromReact = nav.current!.navigateTo(id);
        });
        expect(fromReact, `${id} @ ${granularity}`).toEqual(resolveNavigation(positions, id));
      }
      unmount();
    }
  });

  it('is computable with no component mounted at all', async () => {
    const { recorder } = await runAgent();
    const to = resolveNavigation(scrubAxisFor(recorder, 'step'), 'call-llm#18');
    expect(to).toMatchObject({ ok: true, step: 7, match: 'exact' });
  });
});

