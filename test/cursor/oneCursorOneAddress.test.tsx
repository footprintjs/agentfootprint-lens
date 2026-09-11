/**
 * ONE ADDRESS, ONE CURSOR — the contract, measured on frozen real runs.
 *
 * **A stage id is an ADDRESS, not a POSITION.** It says WHICH stage, never
 * WHERE on an axis; only an axis can answer that, and it may honestly answer
 * "not here". `LensCursor` is that law as a shape: a READING, `resolve`, and
 * the one `moveTo` funnel.
 *
 * Three cases the contract must name, because each is a real run — and each is
 * measured here on a fixture in `test/served/fixtures/`, never a hand-written
 * log:
 *
 *   1. the axis does not stop there  → `tagged-chart` on a tag axis
 *   2. the id belongs to an inner log → `dynamic-grouped`'s subflow mounts
 *   3. the event has no stage at all  → the run's own bookends
 *
 * Plus the additive law: every existing prop still works, pinned by rendering
 * the SAME view twice — once wired the old way, once handed only the cursor —
 * and requiring byte-identical HTML.
 */

/** @vitest-environment jsdom */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

import { lensCursorFrom } from '../../src/core/cursor/lensCursor.js';
import { resolveNavigation } from '../../src/core/group/resolveNavigation.js';
import { stepForRuntimeStageId } from '../../src/core/group/stepForRuntimeStageId.js';
import { tagAxisPositions } from '../../src/core/tags/index.js';
import type { CursorPosition } from '../../src/core/group/cursorPositionsAtDrill.js';
import { ServedTab } from '../../src/react/components/ServedTab.js';
import { SkillGraphDebugger } from '../../src/react/skillgraph/SkillGraphDebugger.js';
import { load } from '../served/helpers.js';

const noMove = (): void => {};

/** The library's own sentence for a refused address — narrowed, so a test can
 *  compare against it without re-typing a word of it. */
function refusalMessage(positions: readonly CursorPosition[], id: string): string {
  const to = resolveNavigation(positions, id);
  if (to.ok) throw new Error(`refusalMessage: "${id}" is a hit on this axis`);
  return to.message;
}

/**
 * The view whose behaviour this packet generalises: a real consumer's data
 * graph took `{ step, total, stepOf(id), onStep }` and drew an element
 * `unplaced` when `stepOf` came back below zero — a NUMBER a view had to
 * invent a meaning for. Written against `cursor.resolve`, the meaning comes
 * from the library, and so do the words.
 */
function AddressList({
  cursor,
  ids,
}: {
  cursor: ReturnType<typeof lensCursorFrom>;
  ids: readonly string[];
}): React.ReactElement {
  return (
    <ul>
      {ids.map((id) => {
        const to = cursor.resolve(id);
        return to.ok ? (
          <li key={id} data-testid={id} data-step={to.step} data-match={to.match}>
            {to.label}
          </li>
        ) : (
          // Drawn, never hidden — and the sentence is the LIBRARY's.
          <li key={id} data-testid={id} data-unplaced="true" data-reason={to.reason}>
            {to.message}
          </li>
        );
      })}
    </ul>
  );
}

describe('case 1 — the axis does not stop there', () => {
  /** The tag axis of the plain-chart fixture: `audit` keeps `route` and
   *  `finish`; `normalise` folds into the stop before it. */
  function auditAxis(): { axis: readonly CursorPosition[]; absent: string } {
    const f = load('tagged-chart');
    const axis = tagAxisPositions(f.snapshot, ['audit'], f.positions);
    expect(axis, 'the tag axis is available on this peer').toBeDefined();
    // The stage the run really executed, and the tag axis really does not stop at.
    expect(axis!.map((p) => p.runtimeStageId)).not.toContain('normalise#2');
    return { axis: axis!, absent: 'normalise#2' };
  }

  it('refuses by name, with the library’s own message and the nearest stop offered', () => {
    const { axis, absent } = auditAxis();
    const to = lensCursorFrom(axis, 0, noMove).resolve(absent);

    expect(to.ok).toBe(false);
    if (to.ok) throw new Error('unreachable');
    expect(to.reason).toBe('not-on-axis');
    // The words are `resolveNavigation`'s, byte for byte — the lens writes none.
    expect(to.message).toBe(refusalMessage(axis, absent));
    expect(to.message).toContain(absent);
    // An OFFER, not a move: the nearest earlier stop rides back as data.
    expect(to.nearest?.runtimeStageId).toBe(axis[0]!.runtimeStageId);
    expect(to.nearest?.step).toBe(0);
  });

  it('a view draws the element UNPLACED from the refusal — never hides it', () => {
    const { axis, absent } = auditAxis();
    const cursor = lensCursorFrom(axis, 0, noMove);
    const onAxis = axis[1]!.runtimeStageId;

    const { getByTestId } = render(<AddressList cursor={cursor} ids={[onAxis, absent]} />);

    // Placed: a step to move to.
    expect(getByTestId(onAxis).getAttribute('data-step')).toBe('1');
    expect(getByTestId(onAxis).getAttribute('data-match')).toBe('exact');
    // Unplaced: present on screen, carrying the library's reason and sentence.
    const missing = getByTestId(absent);
    expect(missing.getAttribute('data-unplaced')).toBe('true');
    expect(missing.getAttribute('data-reason')).toBe('not-on-axis');
    expect(missing.textContent).toBe(refusalMessage(axis, absent));
  });

  it('is the case the flattened reading cannot tell apart from “nowhere”', () => {
    const { axis, absent } = auditAxis();
    // `stepForRuntimeStageId` TAKES the offer silently and answers with a bare
    // number; a consumer then has to invent what it meant. Both readings still
    // ship, and this is the difference the deprecation note points at.
    expect(stepForRuntimeStageId(axis, absent)).toBe(0);
    expect(lensCursorFrom(axis, 0, noMove).resolve(absent).ok).toBe(false);
  });
});

describe('case 2 — the id belongs to an inner log', () => {
  it('lands on the MOUNT and says so, rather than refusing or guessing', () => {
    const f = load('dynamic-grouped');
    // A subflow's stages commit into their own isolated log, so this address
    // is nowhere in the parent axis — the mount that contains it is.
    const inner = 'sf-llm-call/sf-system-prompt#9';
    expect(f.positions.map((p) => p.runtimeStageId)).not.toContain(inner);

    const to = lensCursorFrom(f.positions, 0, noMove).resolve(inner);

    expect(to.ok).toBe(true);
    if (!to.ok) throw new Error('unreachable');
    // The landing is TRUE at the granularity this axis has, and it names where
    // the cursor actually stands — the mount, not the address asked for.
    expect(to.match).toBe('enclosing');
    expect(to.runtimeStageId).toBe('sf-llm-call#1');
    expect(f.positions[to.step]!.runtimeStageId).toBe('sf-llm-call#1');
    expect(to.label).toBe('Iteration 1');
  });

  it('names the right mount for an id in the SECOND iteration’s inner log', () => {
    const f = load('dynamic-grouped');
    const to = lensCursorFrom(f.positions, 0, noMove).resolve('sf-llm-call/sf-tools#37');
    expect(to.ok && to.match).toBe('enclosing');
    expect(to.ok && to.runtimeStageId).toBe('sf-llm-call#25');
  });

  it('a view that must tell “on it” from “inside it” branches on `match`', () => {
    const f = load('dynamic-grouped');
    const cursor = lensCursorFrom(f.positions, 0, noMove);
    const mount = 'sf-llm-call#1';
    const { getByTestId } = render(
      <AddressList cursor={cursor} ids={[mount, 'sf-llm-call/sf-system-prompt#9']} />,
    );
    expect(getByTestId(mount).getAttribute('data-match')).toBe('exact');
    expect(getByTestId('sf-llm-call/sf-system-prompt#9').getAttribute('data-match')).toBe(
      'enclosing',
    );
    // Same step, different truth about how it was reached.
    expect(getByTestId(mount).getAttribute('data-step')).toBe(
      getByTestId('sf-llm-call/sf-system-prompt#9').getAttribute('data-step'),
    );
  });
});

describe('case 3 — the event has no stage at all', () => {
  it('refuses `no-id` rather than inventing an address', () => {
    const f = load('dynamic-grouped');
    const to = lensCursorFrom(f.positions, 0, noMove).resolve('');

    expect(to.ok).toBe(false);
    if (to.ok) throw new Error('unreachable');
    expect(to.reason).toBe('no-id');
    expect(to.message).toBe(refusalMessage(f.positions, ''));
    // Nothing is offered: there is no address, so there is no "near" it.
    expect(to.nearest).toBeUndefined();
  });

  it('the run’s own bookends ARE stops, and the cursor reads them as such', () => {
    const f = load('dynamic-grouped');
    // Run start / run end are lens-owned bookends: they hold a position but
    // no stage of their own, which is why `kind` is what a view reads there.
    const start = lensCursorFrom(f.positions, 0, noMove);
    const end = lensCursorFrom(f.positions, f.positions.length - 1, noMove);
    expect(start.at.kind).toBe('group-start');
    expect(end.at.kind).toBe('group-end');
    expect(start.at.runtimeStageId).toBe(end.at.runtimeStageId);
    // …and the shared bookend address resolves to the FIRST of the two, because
    // a mover means "take me there", not "take me to the end of there".
    expect(start.resolve(start.at.runtimeStageId)).toMatchObject({ ok: true, step: 0 });
  });

  it('an EMPTY axis refuses `empty-axis` — nowhere to stand, nothing invented', () => {
    const cursor = lensCursorFrom([], 0, noMove);
    expect(cursor.total).toBe(0);
    expect(cursor.at.runtimeStageId).toBe('');
    expect(cursor.at.commitIdx).toBe(-1);
    const to = cursor.resolve('llm#3');
    expect(to.ok).toBe(false);
    expect(!to.ok && to.reason).toBe('empty-axis');
  });
});

describe('the cursor holds no position of its own', () => {
  it('`at` is DERIVED from (axis, step) — two builds at one step are equal', () => {
    const f = load('dynamic-grouped');
    const a = lensCursorFrom(f.positions, 2, noMove);
    const b = lensCursorFrom(f.positions, 2, noMove);
    expect(a.at).toEqual(b.at);
    expect(a.at.step).toBe(2);
    expect(a.at.totalSteps).toBe(f.positions.length);
    expect(a.at.runtimeStageId).toBe(f.positions[2]!.runtimeStageId);
    expect(a.at.commitIdx).toBe(f.positions[2]!.commitIdx);
  });

  it('`moveTo` is the funnel it was handed — the cursor moves nothing itself', () => {
    const f = load('dynamic-grouped');
    const moveTo = vi.fn();
    const cursor = lensCursorFrom(f.positions, 0, moveTo);
    const to = cursor.resolve('sf-route#23');
    expect(to.ok).toBe(true);
    // Resolving NEVER moves. Moving is a second, explicit call.
    expect(moveTo).not.toHaveBeenCalled();
    if (to.ok) cursor.moveTo(to.step);
    expect(moveTo).toHaveBeenCalledWith(to.ok ? to.step : -1);
    // And the cursor it was built from is unchanged: it is a value, not a state.
    expect(cursor.at.step).toBe(0);
  });

  it('is frozen, so a view cannot write a position onto it', () => {
    const cursor = lensCursorFrom(load('dynamic-grouped').positions, 1, noMove);
    expect(Object.isFrozen(cursor)).toBe(true);
    expect(Object.isFrozen(cursor.at)).toBe(true);
  });
});

describe('ADDITIVE — the old props still work, byte for byte', () => {
  it('<ServedTab>: the two scalars and the cursor render identical HTML', () => {
    const f = load('flat-dynamic-tools');
    // A stop with a real epoch behind it, so this compares a full tab and not
    // two copies of an empty state.
    const step = f.positions.findIndex((p) => p.milestone === 'llm-turn');
    expect(step).toBeGreaterThanOrEqual(0);
    const here = f.positions[step]!;

    const old = render(
      <ServedTab
        runner={f.runner}
        cursorRuntimeStageId={here.runtimeStageId}
        commitIdx={here.commitIdx}
      />,
    );
    const oldHtml = old.container.innerHTML;
    old.unmount();

    const viaCursor = render(
      <ServedTab runner={f.runner} cursor={lensCursorFrom(f.positions, step, noMove)} />,
    );
    expect(viaCursor.container.innerHTML).toBe(oldHtml);
    expect(oldHtml.length).toBeGreaterThan(500);
  });

  it('<ServedTab>: an explicit scalar WINS over the cursor', () => {
    const f = load('flat-dynamic-tools');
    const turn = f.positions.findIndex((p) => p.milestone === 'llm-turn');
    const other = f.positions.findIndex((p, i) => i !== turn && p.milestone === 'llm-turn');
    expect(other).toBeGreaterThanOrEqual(0);

    // Cursor says `other`; the scalar says `turn`. The scalar is what renders.
    const mixed = render(
      <ServedTab
        runner={f.runner}
        cursorRuntimeStageId={f.positions[turn]!.runtimeStageId}
        commitIdx={f.positions[turn]!.commitIdx}
        cursor={lensCursorFrom(f.positions, other, noMove)}
      />,
    );
    const mixedHtml = mixed.container.innerHTML;
    mixed.unmount();

    const scalarOnly = render(
      <ServedTab
        runner={f.runner}
        cursorRuntimeStageId={f.positions[turn]!.runtimeStageId}
        commitIdx={f.positions[turn]!.commitIdx}
      />,
    );
    expect(scalarOnly.container.innerHTML).toBe(mixedHtml);
  });

  it('<SkillGraphDebugger>: the six props and the one cursor render identical HTML', () => {
    const f = load('hidden-skills');
    const step = 1;
    const here = f.positions[step]!;

    const old = render(
      <SkillGraphDebugger
        recorder={f.recorder}
        cursorRuntimeStageId={here.runtimeStageId}
        {...(here.kind !== undefined ? { cursorKind: here.kind } : {})}
        step={step}
        totalSteps={f.positions.length}
        onStepChange={noMove}
        onJumpTo={noMove}
        height={600}
      />,
    );
    const oldHtml = old.container.innerHTML;
    old.unmount();

    const viaCursor = render(
      <SkillGraphDebugger
        recorder={f.recorder}
        cursor={lensCursorFrom(f.positions, step, noMove)}
        height={600}
      />,
    );
    expect(viaCursor.container.innerHTML).toBe(oldHtml);
    expect(oldHtml).toContain('skill-node-');
  });

  it('<SkillGraphDebugger>: the cursor’s jump REFUSES an address the axis cannot hold', () => {
    const f = load('hidden-skills');
    const moveTo = vi.fn();
    const cursor = lensCursorFrom(f.positions, 1, moveTo);
    // The routing beats live in the injection engine's inner log; this axis
    // holds the mounts. The refusal that matters is a genuinely absent one.
    const absent = 'nowhere-at-all#9999';
    const to = cursor.resolve(absent);
    expect(to.ok).toBe(false);

    render(<SkillGraphDebugger recorder={f.recorder} cursor={cursor} height={600} />);
    // Nothing rendered moved the cursor, and a refused address never will.
    expect(moveTo).not.toHaveBeenCalled();
  });
});
