/**
 * `resolveNavigation` — the resolution ladder, rung by rung.
 *
 * Four things are proved here:
 *   1. the LADDER: exact → enclosing → nearest-previous-as-an-OFFER → nothing,
 *      in that order, with the innermost enclosing scope winning;
 *   2. the HONEST MISS shape: a miss never carries a step, always carries a
 *      machine-checkable `reason` and a sentence, and offers `nearest` only
 *      when there really is one;
 *   3. that the ladder NEVER guesses forward — no result ever lands on a stop
 *      after the address;
 *   4. ONE LADDER: `stepForRuntimeStageId` is this function's terse reading,
 *      not a second copy of the rule.
 */

import { describe, it, expect } from 'vitest';

import { resolveNavigation } from './resolveNavigation.js';
import { stepForRuntimeStageId } from './stepForRuntimeStageId.js';
import type { CursorPosition } from './cursorPositionsAtDrill.js';

/** A stop on a scrub axis. `commitIdx` mirrors the executionIndex here — the
 *  resolver never reads it, but a realistic fixture keeps the two honest. */
function stop(runtimeStageId: string, label = runtimeStageId): CursorPosition {
  const hash = runtimeStageId.lastIndexOf('#');
  const idx = hash < 0 ? -1 : Number(runtimeStageId.slice(hash + 1));
  return {
    runtimeStageId,
    runtimeGroupId: runtimeStageId,
    label,
    kind: 'commit',
    depth: 0,
    commitIdx: Number.isInteger(idx) ? idx : -1,
  };
}

/** A commit-axis-shaped run: one stop per executed stage. */
const commitAxis: readonly CursorPosition[] = [
  stop('compose#0', 'Compose'),
  stop('llm#1', 'LLM turn 1'),
  stop('route#2', 'Route'),
  stop('sf-tools/search#3', 'search'),
  stop('llm#4', 'LLM turn 2'),
  stop('final#5', 'Final'),
];

/** A milestone-axis-shaped run: whole iterations, subflows as ONE stop. */
const milestoneAxis: readonly CursorPosition[] = [
  stop('iteration#0', 'Iteration 1'),
  stop('sf-tools#2', 'Tools'),
  stop('iteration#6', 'Iteration 2'),
  stop('sf-tools#8', 'Tools'),
];

describe('rung 1 — exact', () => {
  it('lands on the stop whose address it is', () => {
    const to = resolveNavigation(commitAxis, 'route#2');
    expect(to).toEqual({
      ok: true,
      step: 2,
      runtimeStageId: 'route#2',
      match: 'exact',
      label: 'Route',
    });
  });

  it('returns the FIRST of several stops sharing an address (a mover means "take me there", not "to the end of there")', () => {
    const axis = [stop('a#0'), stop('grp#1', 'opens'), stop('inner#2'), stop('grp#1', 'closes')];
    const to = resolveNavigation(axis, 'grp#1');
    expect(to.ok).toBe(true);
    expect(to.ok && to.step).toBe(1);
    expect(to.ok && to.label).toBe('opens');
  });

  it('is exact on BOTH axes for the stops each one actually has', () => {
    expect(resolveNavigation(commitAxis, 'sf-tools/search#3')).toMatchObject({
      ok: true,
      step: 3,
      match: 'exact',
    });
    expect(resolveNavigation(milestoneAxis, 'sf-tools#8')).toMatchObject({
      ok: true,
      step: 3,
      match: 'exact',
    });
  });
});

describe('rung 2 — enclosing (a coarser axis is not a wrong one)', () => {
  it('lands a subflow-internal address on the subflow stop that holds it', () => {
    // The milestone axis stops at whole subflows; the address is a stage inside one.
    const to = resolveNavigation(milestoneAxis, 'sf-tools/search#3');
    expect(to).toEqual({
      ok: true,
      step: 1,
      runtimeStageId: 'sf-tools#2',
      match: 'enclosing',
      label: 'Tools',
    });
  });

  it('says WHERE it landed — the enclosing stop\'s own address, not the one asked for', () => {
    const to = resolveNavigation(milestoneAxis, 'sf-tools/search#9');
    expect(to.ok && to.runtimeStageId).toBe('sf-tools#8');
    expect(to.ok && to.match).toBe('enclosing');
  });

  it('prefers the INNERMOST enclosing scope', () => {
    const axis = [stop('a#0', 'outer'), stop('a/b#1', 'inner')];
    const to = resolveNavigation(axis, 'a/b/c#4');
    expect(to.ok && to.step).toBe(1);
    expect(to.ok && to.runtimeStageId).toBe('a/b#1');
  });

  it('never encloses FORWARD — a subflow stop that opens after the address is not its holder', () => {
    const axis = [stop('start#0'), stop('sf-tools#9', 'Tools')];
    const to = resolveNavigation(axis, 'sf-tools/search#3');
    expect(to.ok).toBe(false);
    // Falls through to the offer, which is the stop BEFORE it.
    expect(!to.ok && to.nearest?.runtimeStageId).toBe('start#0');
  });
});

describe('rung 3 — nearest-previous is OFFERED, never taken', () => {
  it('refuses, and hands back the nearest earlier stop as data', () => {
    const to = resolveNavigation(commitAxis, 'ghost#4');
    expect(to.ok).toBe(false);
    expect(!to.ok && to.reason).toBe('not-on-axis');
    expect(!to.ok && to.nearest).toEqual({
      runtimeStageId: 'llm#4',
      step: 4,
      label: 'LLM turn 2',
    });
  });

  it('carries no `step` on a miss — the shape itself makes a silent jump impossible', () => {
    const to = resolveNavigation(commitAxis, 'ghost#4');
    expect(to).not.toHaveProperty('step');
    expect(Object.keys(to).sort()).toEqual(['message', 'nearest', 'ok', 'reason']);
  });

  it('the offer is an EXACT hit when taken — one more call, no special case', () => {
    const to = resolveNavigation(commitAxis, 'ghost#4');
    const taken = !to.ok && to.nearest ? resolveNavigation(commitAxis, to.nearest.runtimeStageId) : undefined;
    expect(taken).toMatchObject({ ok: true, step: 4, match: 'exact' });
  });

  it('offers the FIRST stop among several sharing the nearest executionIndex', () => {
    const axis = [stop('grp#1', 'opens'), stop('grp#1', 'closes')];
    const to = resolveNavigation(axis, 'ghost#5');
    expect(!to.ok && to.nearest?.step).toBe(0);
    expect(!to.ok && to.nearest?.label).toBe('opens');
  });

  it('names the nearest stop in the sentence a person reads', () => {
    const to = resolveNavigation(commitAxis, 'ghost#4');
    expect(!to.ok && to.message).toContain('llm#4');
    expect(!to.ok && to.message).toContain('LLM turn 2');
  });
});

describe('rung 4 — nothing at or before it', () => {
  it('refuses with NO offer when every stop comes after the address', () => {
    const axis = [stop('llm#5'), stop('final#6')];
    const to = resolveNavigation(axis, 'compose#2');
    expect(to.ok).toBe(false);
    expect(!to.ok && to.reason).toBe('before-first-stop');
    expect(!to.ok && to.nearest).toBeUndefined();
  });

  it('refuses with NO offer when the string is not an address at all', () => {
    const to = resolveNavigation(commitAxis, 'the-search-step');
    expect(to.ok).toBe(false);
    expect(!to.ok && to.reason).toBe('not-on-axis');
    expect(!to.ok && to.nearest).toBeUndefined();
    expect(!to.ok && to.message).toContain('#executionIndex');
  });

  it('refuses an empty axis and an empty address, each by its own reason', () => {
    expect(resolveNavigation([], 'llm#1')).toMatchObject({ ok: false, reason: 'empty-axis' });
    expect(resolveNavigation(commitAxis, '')).toMatchObject({ ok: false, reason: 'no-id' });
  });

  it('never throws on junk', () => {
    for (const junk of ['#', 'a#', 'a#-1', 'a#x', '#3', '/', 'a/b/c']) {
      expect(() => resolveNavigation(commitAxis, junk)).not.toThrow();
      expect(resolveNavigation(commitAxis, junk).ok).toBe(false);
    }
  });
});

describe('the ladder never guesses FORWARD', () => {
  it('no answer, hit or offer, ever sits on a stop after the address', () => {
    const execOf = (id: string): number => Number(id.slice(id.lastIndexOf('#') + 1));
    for (const axis of [commitAxis, milestoneAxis]) {
      for (let target = 0; target <= 10; target += 1) {
        const to = resolveNavigation(axis, `ghost#${target}`);
        const landed = to.ok ? axis[to.step]!.runtimeStageId : to.nearest?.runtimeStageId;
        if (landed === undefined) continue;
        expect(execOf(landed)).toBeLessThanOrEqual(target);
      }
    }
  });
});

describe('ONE ladder — stepForRuntimeStageId is the terse reading of it', () => {
  const addresses = [
    'compose#0',
    'route#2',
    'sf-tools/search#3',
    'sf-tools/search#9',
    'ghost#4',
    'ghost#99',
    'compose#0',
    'the-search-step',
    '',
    'a/b/c#4',
    'grp#1',
  ];

  it('agrees with the named ladder on every address, on both axes', () => {
    for (const axis of [commitAxis, milestoneAxis, [] as CursorPosition[]]) {
      for (const id of addresses) {
        const to = resolveNavigation(axis, id);
        const terse = to.ok ? to.step : (to.nearest?.step ?? -1);
        expect(stepForRuntimeStageId(axis, id), `${id} on a ${axis.length}-stop axis`).toBe(terse);
      }
    }
  });

  it('still takes the offer silently — the shipped callers depend on it', () => {
    // `ghost#4` is a MISS with an offer; the terse reading lands on the offer.
    expect(resolveNavigation(commitAxis, 'ghost#4').ok).toBe(false);
    expect(stepForRuntimeStageId(commitAxis, 'ghost#4')).toBe(4);
  });
});
