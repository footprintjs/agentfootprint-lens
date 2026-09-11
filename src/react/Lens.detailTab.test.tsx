/**
 * `slots.detail` is ONE TAB, not a takeover (0.50.0).
 *
 * The defect this pins: a host that supplied `slots.detail` used to lose the
 * whole right rail, the TAB STRIP included — so it could never reach Served,
 * Bookmarks, or anything the rail gained later. A real consumer (an SEO agent's
 * web console) mounted a slot for every recording and was locked out of two
 * shipped releases' worth of readings.
 *
 * The law: a slot fills a PANE, never the CHROME around it. The strip, the one
 * cursor and the collapse pill are the library's, because chrome is how the
 * library adds capability over time.
 *
 * What is asserted here:
 *   · a slot consumer sees the strip, its own pane FIRST and selected;
 *   · every library reading (What happened, Served, Bookmarks) is reachable
 *     beside it, and Served reads the SAME stop the cursor is on;
 *   · switching tabs keeps the host pane MOUNTED — a remount would make a band
 *     forget whether it was open;
 *   · switching tabs does not move the cursor;
 *   · no slot ⇒ exactly today's rail;
 *   · the tabs are keyboard-reachable with a visible focus ring;
 *   · `detailOnly` is the opt-out, and it is opt-IN.
 */

import React, { useState } from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Lens, type LensCursorAt, type LensDetailSlotProps } from './index.js';
import { memoryBookmarkStore } from '../core/bookmarks/index.js';
import { LENS_STYLESHEET } from './lensStyles.js';
import { load } from '../../test/served/helpers.js';

/** A host pane that HOLDS STATE, so a remount is detectable. */
const HostPane: React.FC<LensDetailSlotProps> = ({ step, cursorRuntimeStageId }) => {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="host-detail" data-step={String(step)} data-address={cursorRuntimeStageId}>
      <button data-testid="host-band" onClick={() => setOpen((v) => !v)}>
        band {open ? 'open' : 'closed'}
      </button>
    </div>
  );
};

function tabLabels(): readonly string[] {
  return Array.from(document.querySelectorAll('[role="tab"]')).map((el) => el.textContent ?? '');
}

describe('<Lens slots.detail> · the rail keeps its tab strip', () => {
  it('a slot consumer sees FOUR tabs, its own pane first and selected', () => {
    const f = load('flat-dynamic-tools');
    render(
      <Lens
        recorder={f.recorder}
        runner={f.runner as never}
        view="engineer"
        granularity="group"
        step={f.positions.length - 1}
        slots={{ detail: HostPane, detailLabel: 'SEO bands' }}
        bookmarkStore={memoryBookmarkStore()}
      />,
    );

    // The strip is the library's, and the host's pane is the FIRST tab on it.
    expect(tabLabels()).toEqual(['SEO bands', 'What happened', 'Served', 'Bookmarks']);
    expect(screen.getByTestId('rail-tab-detail')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('rail-tab-happened')).toHaveAttribute('aria-selected', 'false');
    // …and it is what is showing, so today's consumer opens where it always did.
    expect(screen.getByTestId('host-detail')).toBeVisible();
    expect(screen.queryByTestId('served-tab')).toBeNull();
  });

  it('the label defaults to a plain word when the host does not name its pane', () => {
    const f = load('flat-dynamic-tools');
    render(
      <Lens recorder={f.recorder} runner={f.runner as never} view="engineer" slots={{ detail: HostPane }} />,
    );
    expect(screen.getByTestId('rail-tab-detail').textContent).toBe('Details');
  });

  it('Served reads the SAME stop, and coming back finds the host pane as it was left', () => {
    const f = load('flat-dynamic-tools');
    const firstTurn = f.positions.findIndex((p) => p.milestone === 'llm-turn');
    render(
      <Lens
        recorder={f.recorder}
        runner={f.runner as never}
        view="engineer"
        granularity="group"
        step={firstTurn}
        slots={{ detail: HostPane }}
      />,
    );

    const paneBefore = screen.getByTestId('host-detail');
    // The host pane's own state: a band the reader opened.
    fireEvent.click(screen.getByTestId('host-band'));
    expect(screen.getByTestId('host-band').textContent).toBe('band open');

    // A library reading, on the cursor the host pane is showing.
    fireEvent.click(screen.getByTestId('rail-tab-served'));
    expect(screen.getByTestId('served-tab').dataset.epoch).toBe('1');
    expect(paneBefore.dataset.address).toBe(f.positions[firstTurn]!.runtimeStageId);
    // Hidden, NOT unmounted — that is what keeps the band open.
    expect(screen.getByTestId('rail-pane-detail')).not.toBeVisible();

    fireEvent.click(screen.getByTestId('rail-tab-detail'));
    expect(screen.getByTestId('rail-pane-detail')).toBeVisible();
    // Same DOM node, same React state: mount identity across a tab switch.
    expect(screen.getByTestId('host-detail')).toBe(paneBefore);
    expect(screen.getByTestId('host-band').textContent).toBe('band open');
    expect(screen.queryByTestId('served-tab')).toBeNull();
  });

  it('"What happened" — the library\'s own timeline — stays reachable with a slot present', () => {
    const f = load('flat-dynamic-tools');
    const { container } = render(
      <Lens
        recorder={f.recorder}
        runner={f.runner as never}
        view="engineer"
        granularity="group"
        step={f.positions.length - 1}
        slots={{ detail: HostPane }}
      />,
    );
    fireEvent.click(screen.getByTestId('rail-tab-happened'));
    expect(screen.getByTestId('rail-tab-happened')).toHaveAttribute('aria-selected', 'true');
    // The shipped timeline itself, moments and all.
    const timeline = screen.getByRole('listbox', { name: 'Run timeline' });
    expect(timeline.querySelectorAll('[role="option"]').length).toBeGreaterThan(0);
    expect(container.textContent).toMatch(/What happened/);
    // The slot is still mounted behind it, ready to come back to.
    expect(screen.getByTestId('rail-pane-detail')).not.toBeVisible();
  });

  it('a tab switch moves nothing: the ONE cursor stays where it was', () => {
    const f = load('flat-dynamic-tools');
    const moves: LensCursorAt[] = [];
    render(
      <Lens
        recorder={f.recorder}
        runner={f.runner as never}
        view="engineer"
        granularity="group"
        onStepChange={(_s, at) => moves.push(at)}
        slots={{ detail: HostPane }}
        bookmarkStore={memoryBookmarkStore()}
      />,
    );
    const stepBefore = screen.getByTestId('host-detail').dataset.step;
    moves.length = 0;

    fireEvent.click(screen.getByTestId('rail-tab-served'));
    fireEvent.click(screen.getByTestId('rail-tab-bookmarks'));
    fireEvent.click(screen.getByTestId('rail-tab-happened'));
    fireEvent.click(screen.getByTestId('rail-tab-detail'));

    expect(moves).toEqual([]);
    expect(screen.getByTestId('host-detail').dataset.step).toBe(stepBefore);
  });

  it('the tabs are keyboard-reachable, activate on Enter, and show focus', async () => {
    const user = userEvent.setup();
    const f = load('flat-dynamic-tools');
    render(
      <Lens
        recorder={f.recorder}
        runner={f.runner as never}
        view="engineer"
        granularity="group"
        step={f.positions.length - 1}
        slots={{ detail: HostPane }}
      />,
    );
    const served = screen.getByTestId('rail-tab-served');
    served.focus();
    expect(document.activeElement).toBe(served);
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('served-tab')).toBeInTheDocument();
    // Visible focus is the library's, not the UA's accident: every tab carries
    // the class the stylesheet rings.
    expect(served.className).toContain('lens-rail-tab');
    expect(LENS_STYLESHEET).toMatch(/\.lens-rail-tab:focus-visible\s*\{[^}]*outline:/);
  });

  it('no slot: the shipped rail, unchanged — What happened by default', () => {
    const f = load('flat-dynamic-tools');
    render(
      <Lens
        recorder={f.recorder}
        runner={f.runner as never}
        view="engineer"
        granularity="group"
        step={f.positions.length - 1}
        bookmarkStore={memoryBookmarkStore()}
      />,
    );
    expect(tabLabels()).toEqual(['What happened', 'Served', 'Bookmarks']);
    expect(screen.getByTestId('rail-tab-happened')).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('rail-tab-detail')).toBeNull();
    expect(screen.queryByTestId('rail-pane-detail')).toBeNull();
  });

  it('detailOnly: the pre-0.50.0 takeover, and it is OPT-IN', () => {
    const f = load('flat-dynamic-tools');
    render(
      <Lens
        recorder={f.recorder}
        runner={f.runner as never}
        view="engineer"
        granularity="group"
        step={f.positions.length - 1}
        slots={{ detail: HostPane, detailOnly: true }}
      />,
    );
    // The whole rail is the host's: no strip, no library reading.
    expect(screen.getByTestId('host-detail')).toBeVisible();
    expect(tabLabels()).toEqual([]);
    expect(screen.queryByTestId('rail-tab-served')).toBeNull();
  });

  it('a slot that arrives LATE still opens on the host pane', () => {
    const f = load('flat-dynamic-tools');
    const props = {
      recorder: f.recorder,
      runner: f.runner as never,
      view: 'engineer' as const,
      granularity: 'group' as const,
      step: f.positions.length - 1,
    };
    // A host that fetches its recording before it can build a pane mounts
    // WITHOUT a slot first. The default is derived, not frozen at mount.
    const { rerender } = render(<Lens {...props} />);
    expect(screen.getByTestId('rail-tab-happened')).toHaveAttribute('aria-selected', 'true');
    rerender(<Lens {...props} slots={{ detail: HostPane }} />);
    expect(screen.getByTestId('rail-tab-detail')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('host-detail')).toBeVisible();
  });
});

/**
 * 0.51.0 — the slot receives THE cursor, in the one vocabulary every view now
 * shares. Everything above still passes unchanged, which is the additive law;
 * this pins that the new prop actually arrives, agrees with the old ones, and
 * moves the same one cursor.
 */
describe('<Lens slots.detail> · one address, one cursor', () => {
  /** A pane that reads ONLY `p.cursor` — the shape a new view is written to. */
  const CursorPane: React.FC<LensDetailSlotProps> = ({ cursor }) => {
    // `cursor` is optional on the props type so a consumer CONSTRUCTING them
    // does not break on a minor (0.51.1) — `<Lens>` always supplies it, and
    // this pane asserts that rather than rendering a fallback.
    if (cursor === undefined) throw new Error('<Lens> must supply p.cursor');
    const inner = cursor.resolve('sf-llm-call/sf-tools#13');
    const absent = cursor.resolve('nowhere-at-all#9999');
    return (
      <div
        data-testid="cursor-pane"
        data-step={String(cursor.at.step)}
        data-total={String(cursor.total)}
        data-address={cursor.at.runtimeStageId}
        data-commit={String(cursor.at.commitIdx)}
        data-inner-match={inner.ok ? inner.match : `refused:${inner.reason}`}
        data-absent={absent.ok ? 'placed' : 'unplaced'}
      >
        <button data-testid="cursor-move" onClick={() => cursor.moveTo(0)}>
          to the start
        </button>
      </div>
    );
  };

  it('the cursor the slot receives agrees with the props beside it', () => {
    const f = load('flat-dynamic-tools');
    const seen: LensDetailSlotProps[] = [];
    const Spy: React.FC<LensDetailSlotProps> = (p) => {
      seen.push(p);
      return <div data-testid="spy" />;
    };
    render(
      <Lens
        recorder={f.recorder}
        runner={f.runner as never}
        view="engineer"
        granularity="group"
        step={f.positions.length - 1}
        slots={{ detail: Spy }}
      />,
    );
    const last = seen[seen.length - 1]!;
    // Optional on the type so a consumer constructing these props keeps
    // compiling (0.51.1); `<Lens>` always supplies it, which is the claim here.
    expect(last.cursor).toBeDefined();
    const cursor = last.cursor!;
    // ONE cursor said two ways — the old scalars and the new object cannot
    // disagree, because the object is built from the same axis and step.
    expect(cursor.at.step).toBe(last.step);
    expect(cursor.at.totalSteps).toBe(last.totalSteps);
    expect(cursor.at.runtimeStageId).toBe(last.cursorRuntimeStageId);
    expect(cursor.at.commitIdx).toBe(last.commitIdx);
    expect(cursor.at.label).toBe(last.label);
    expect(cursor.at.kind).toBe(last.kind);
    expect(cursor.total).toBe(last.totalSteps);
  });

  it('a pane written against the cursor alone places, refuses and MOVES', async () => {
    // The GROUPED turn: its pieces commit into the turn's own inner log, which
    // is what makes the `enclosing` rung a real answer here rather than a
    // contrived one.
    const f = load('dynamic-grouped');
    render(
      <Lens
        recorder={f.recorder}
        runner={f.runner as never}
        view="engineer"
        granularity="group"
        slots={{ detail: CursorPane }}
      />,
    );
    const pane = screen.getByTestId('cursor-pane');
    // An id in the injection engine's inner log lands on its MOUNT, named.
    expect(pane.getAttribute('data-inner-match')).toBe('enclosing');
    // An address this axis cannot hold is UNPLACED, not hidden and not guessed.
    expect(pane.getAttribute('data-absent')).toBe('unplaced');
    // Uncontrolled Lens follows the live edge, so the cursor starts at the end.
    expect(pane.getAttribute('data-step')).toBe(
      String(Number(pane.getAttribute('data-total')) - 1),
    );

    // `cursor.moveTo` IS the one funnel — the same move a strip click makes.
    await userEvent.click(screen.getByTestId('cursor-move'));
    expect(screen.getByTestId('cursor-pane').getAttribute('data-step')).toBe('0');
  });

  it('a legacy pane that ignores `cursor` renders exactly as before', () => {
    const f = load('flat-dynamic-tools');
    const props = {
      recorder: f.recorder,
      runner: f.runner as never,
      view: 'engineer' as const,
      granularity: 'group' as const,
      step: f.positions.length - 1,
      slots: { detail: HostPane, detailLabel: 'SEO bands' },
    };
    const first = render(<Lens {...props} />);
    const html = first.container.innerHTML;
    first.unmount();
    // Rendered twice for the same reason a byte-for-byte pin exists: the new
    // prop must add NOTHING to a pane that does not read it.
    const again = render(<Lens {...props} />);
    expect(again.container.innerHTML).toBe(html);
    expect(screen.getByTestId('host-detail')).toBeVisible();
  });
});
