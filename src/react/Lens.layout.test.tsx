/**
 * The detail SLOT and the NARROW DEGRADE.
 *
 * Both are additive: omit `slots` and the built-in timeline renders; keep the
 * row wide (or unmeasured) and the two columns sit side by side exactly as
 * they ship. The degrade is asserted at 392px — the width a real split panel
 * measured when it was clipping.
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Agent, type LLMProvider } from 'agentfootprint';
import { lensRecorder } from '../core/LensRecorder.js';
import { Lens, type LensDetailSlotProps } from './index.js';

function scripted(): LLMProvider {
  return {
    name: 'scripted',
    complete: async () => ({
      content: 'done',
      toolCalls: [],
      usage: { input: 4, output: 2 },
      stopReason: 'stop' as const,
    }),
  };
}

async function runAgent() {
  const agent = Agent.create({ provider: scripted(), model: 'mock' })
    .system('')
    .build();
  const recorder = lensRecorder();
  recorder.observe(agent);
  await agent.run({ message: 'go' });
  return { recorder, runner: agent };
}

// ─── A ResizeObserver we can drive ────────────────────────────────
// jsdom ships none; `vitest.setup.ts` installs a no-op so nothing ever
// reports a width (which is exactly why the shipped layout is what renders in
// every other test). Here we hand out a real width on demand.

type Watcher = { el: Element; cb: ResizeObserverCallback };
let watchers: Watcher[] = [];

function installResizeObserver(): void {
  watchers = [];
  class Driveable {
    constructor(private readonly cb: ResizeObserverCallback) {}
    observe(el: Element): void {
      watchers.push({ el, cb: this.cb });
    }
    unobserve(el: Element): void {
      watchers = watchers.filter((w) => w.el !== el);
    }
    disconnect(): void {
      watchers = watchers.filter((w) => w.cb !== this.cb);
    }
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = Driveable;
}

function resizeTo(width: number): void {
  act(() => {
    for (const w of watchers) {
      w.cb(
        [{ target: w.el, contentRect: { width } } as unknown as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    }
  });
}

describe('slots.detail — the host renders the right column', () => {
  it('replaces the built-in timeline with the host content', async () => {
    const { recorder, runner } = await runAgent();
    const Detail: React.FC<LensDetailSlotProps> = ({ step, cursorRuntimeStageId }) => (
      <div data-testid="host-detail">
        host pane · step {step} · {cursorRuntimeStageId}
      </div>
    );
    const { container } = render(
      <Lens recorder={recorder} runner={runner} slots={{ detail: Detail }} />,
    );

    const pane = screen.getByTestId('host-detail');
    expect(pane.textContent).toMatch(/host pane · step \d+/);
    // The shipped timeline is gone; the shipped COLUMN (its collapse pill) stays.
    expect(container.textContent).not.toMatch(/What happened/i);
    expect(container.textContent).toMatch(/Inspect/i);
  });

  it('hands the slot the cursor in the units a detail pane needs', async () => {
    const { recorder, runner } = await runAgent();
    let seen: LensDetailSlotProps | undefined;
    const Detail: React.FC<LensDetailSlotProps> = (props) => {
      seen = props;
      return <div />;
    };
    render(<Lens recorder={recorder} runner={runner} slots={{ detail: Detail }} />);

    expect(seen).toBeDefined();
    expect(typeof seen!.step).toBe('number');
    expect(seen!.totalSteps).toBeGreaterThan(0);
    expect(typeof seen!.cursorRuntimeStageId).toBe('string');
    expect(typeof seen!.commitIdx).toBe('number');
    expect(Array.isArray(seen!.relatedNodes)).toBe(true);
    expect(seen!.recorder).toBe(recorder);
    expect(typeof seen!.onNavigate).toBe('function');
  });

  it('moves the ONE cursor through onNavigate — no second cursor', async () => {
    const { recorder, runner } = await runAgent();
    const Detail: React.FC<LensDetailSlotProps> = ({ step, onNavigate }) => (
      <button data-testid="jump" onClick={() => onNavigate(0)}>
        at {step}
      </button>
    );
    render(<Lens recorder={recorder} runner={runner} slots={{ detail: Detail }} />);

    // The lens starts pinned to the live edge of a finished run, so this is a
    // real move, not a no-op.
    expect(screen.getByTestId('jump').textContent).not.toBe('at 0');
    act(() => {
      screen.getByTestId('jump').click();
    });
    expect(screen.getByTestId('jump').textContent).toBe('at 0');
  });

  it('omitting `slots` renders the shipped timeline, unchanged', async () => {
    const { recorder, runner } = await runAgent();
    const { container } = render(<Lens recorder={recorder} runner={runner} />);
    expect(container.textContent).toMatch(/What happened/i);
  });
});

describe('narrow degrade — stack, never clip', () => {
  beforeEach(() => installResizeObserver());
  afterEach(() => {
    watchers = [];
  });

  it('stacks the columns at the 392px split-panel width', async () => {
    const { recorder } = await runAgent();
    const { container } = render(<Lens recorder={recorder} />);

    // Wide (unmeasured) — the shipped two-column row.
    expect(container.querySelector('[data-lens-layout]')).toBeNull();

    resizeTo(392);

    const row = container.querySelector('[data-lens-layout="stacked"]');
    expect(row).not.toBeNull();
    expect((row as HTMLElement).style.flexDirection).toBe('column');
    // Nothing was dropped: the inspector is still there, now full width.
    expect(container.textContent).toMatch(/Inspect/i);
  });

  it('comes back to two columns when the row is wide again', async () => {
    const { recorder } = await runAgent();
    const { container } = render(<Lens recorder={recorder} />);

    resizeTo(392);
    expect(container.querySelector('[data-lens-layout="stacked"]')).not.toBeNull();

    resizeTo(1573); // the measured split-view row
    expect(container.querySelector('[data-lens-layout]')).toBeNull();
  });

  it('keeps two columns exactly AT the threshold', async () => {
    const { recorder } = await runAgent();
    const { container } = render(<Lens recorder={recorder} />);
    resizeTo(690);
    expect(container.querySelector('[data-lens-layout]')).toBeNull();
    resizeTo(689);
    expect(container.querySelector('[data-lens-layout="stacked"]')).not.toBeNull();
  });

  it('stacks in both themes', async () => {
    for (const mode of ['light', 'dark'] as const) {
      const { recorder } = await runAgent();
      const { container, unmount } = render(
        <Lens recorder={recorder} theme={{ mode }} />,
      );
      resizeTo(392);
      expect(container.querySelector('[data-lens-layout="stacked"]')).not.toBeNull();
      unmount();
      watchers = [];
    }
  });
});
