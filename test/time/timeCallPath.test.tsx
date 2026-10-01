/** @vitest-environment jsdom */
/**
 * Each call's window, asked → sent → read, with the difference — over REAL rows
 * (test/time/fixtures, generated from agentfootprint runs by `npm run fixtures:time`).
 *
 * Found in the 2026-10-01 demo video: the Time view printed a call's `asked` and `person` windows
 * and nothing else, although the tab promised "asked, sent, and whether the read was wider". The
 * record was not missing anything: a `call-window` row carries `sent` only for a WIDENED fill —
 * on every other dispatched call its `asked` IS the sent range (agentfootprint `core/time/rows.ts`
 * · `CallWindowRow`: "`asked` is … the person's on a fill, the sent value read back otherwise";
 * a fill went "into form `form` exactly", or `rounded` outward) — and the read is the result's
 * declared `period.queried`, or the `period` row's own word that the result declared none
 * (`undeclared`). The view printed neither.
 *
 * Test types: UNIT (`sentOf`, `readOf` — the record's words, nothing compared) · COMPONENT
 * (`<TimeBand>` prints the three in order, each with its `data-as`, the difference after them).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { LABELS } from '../../src/core/time/labels.js';
import type { CallWindowRowShape } from '../../src/core/time/shapes.js';
import { foldTimeRows, readOf, sentOf, type TimeCall } from '../../src/core/time/timeRows.js';
import { TimeBand } from '../../src/react/components/TimeBand.js';
import old from './fixtures/time-rows.json';
import fixtures from './fixtures/time-rows-9.132.json';

afterEach(cleanup);

type Scenario = { readonly ledger: readonly Record<string, unknown>[]; readonly coverage: readonly unknown[] };
const S = fixtures as unknown as Record<string, Scenario>;
const OLD = old as unknown as Record<string, Scenario>;

const callsOf = (s: Scenario): readonly TimeCall[] =>
  foldTimeRows(s.ledger, s.coverage)!.turns.flatMap((t) => t.calls);
const mount = (s: Scenario) => render(<TimeBand rows={s.ledger} coverage={s.coverage} />);
const callEl = (id: string) =>
  screen.getAllByTestId('time-call').find((el) => el.getAttribute('data-tool-call-id') === id)!;
const range = (r: { from: string; to: string }) => `[${r.from}, ${r.to})`;

describe('UNIT — what a call sent, as the record says it', () => {
  it('an exact fill sent its asked range; a widened fill its own `sent`', () => {
    const exact = callsOf(S.controlWindow!)[0]!;
    expect(sentOf(exact.window)).toEqual({ as: 'asked', range: exact.window!.asked });
    const widened = callsOf(OLD.widened!)[0]!;
    expect(widened.window!.sent).toBeDefined();
    expect(sentOf(widened.window)).toEqual({ as: 'sent', range: widened.window!.sent });
  });

  it('the model’s own window (`model-chosen`, `model`) sent its asked range', () => {
    const chosen = callsOf(S.drift!).find((c) => c.window?.how === 'model-chosen')!;
    expect(sentOf(chosen.window)).toEqual({ as: 'asked', range: chosen.window!.asked });
    const model = callsOf(S.shifted!).find((c) => c.window?.how === 'model')!;
    expect(sentOf(model.window)).toEqual({ as: 'asked', range: model.window!.asked });
  });

  it('a rounded fill names no range it did not keep; a call that did not run sent nothing', () => {
    const rounded = {
      ...(callsOf(S.controlWindow!)[0]!.window as CallWindowRowShape),
      rounded: true as const,
    };
    expect(sentOf(rounded)).toEqual({ as: 'rounded' });
    const refused = callsOf(S.refused!)[0]!;
    expect(refused.window!.how).toBe('refused');
    expect(sentOf(refused.window)).toBeUndefined();
    const waiting = callsOf(S.widened!)[0]!; // 9.132: the call waits on the time ask
    expect(waiting.window!.how).toBe('not-filled');
    expect(sentOf(waiting.window)).toBeUndefined();
    expect(sentOf(undefined)).toBeUndefined();
  });
});

describe('UNIT — what a call read, as the record says it', () => {
  it('the declared period, or the period row’s word that none was declared', () => {
    const covered = callsOf(S.controlWindow!).find((c) => c.period?.verdict === 'covered')!;
    expect(readOf(covered)).toEqual({ as: 'declared', declared: covered.declared });
    const undeclared = callsOf(S.clockOnResume!)[0]!;
    expect(undeclared.period?.verdict).toBe('undeclared');
    expect(readOf(undeclared)).toEqual({ as: 'undeclared' });
  });

  it('nothing for a call that did not run, nor one with no period row yet', () => {
    const refused = callsOf(S.refused!)[0]!;
    expect(refused.period?.verdict).toBe('undeclared'); // filed, but the call never ran
    expect(readOf(refused)).toBeUndefined();
    expect(readOf(callsOf(S.widened!)[0]!)).toBeUndefined();
  });
});

describe('COMPONENT — <TimeBand> prints asked → sent → read, then the difference', () => {
  it('an exact fill: sent as asked, then the declared read', () => {
    const s = S.controlWindow!;
    const call = callsOf(s).find((c) => c.period?.verdict === 'covered')!;
    mount(s);
    const el = callEl(call.toolCallId);
    const sent = within(el).getByTestId('time-sent');
    expect(sent).toHaveAttribute('data-as', 'asked');
    expect(sent).toHaveTextContent(range(call.window!.asked!));
    expect(sent).toHaveTextContent(LABELS.sentAsAsked);
    const read = within(el).getByTestId('time-read');
    expect(read).toHaveAttribute('data-as', 'declared');
    expect(read).toHaveTextContent(range(call.declared!.queried));
    const text = el.textContent!;
    expect(text.indexOf(LABELS.asked)).toBeLessThan(text.indexOf(LABELS.sent));
    expect(text.indexOf(LABELS.sent)).toBeLessThan(text.indexOf(LABELS.read));
  });

  it('a widened fill: its own sent range with the extra; an undeclared read says so', () => {
    const s = OLD.widened!;
    const call = callsOf(s)[0]!;
    mount(s);
    const el = callEl(call.toolCallId);
    expect(within(el).getByTestId('time-sent')).toHaveAttribute('data-as', 'sent');
    expect(within(el).getByTestId('time-widened')).toHaveTextContent(LABELS.widened);
    const read = within(el).getByTestId('time-read');
    expect(read).toHaveAttribute('data-as', 'undeclared');
    expect(read).toHaveTextContent('undeclared');
  });

  it('a read that differs: the difference follows the read', () => {
    const s = S.checks!;
    const call = callsOf(s).find((c) => c.period?.verdict === 'covered' && c.period.differs)!;
    mount(s);
    const el = callEl(call.toolCallId);
    const text = el.textContent!;
    expect(within(el).getByTestId('time-read')).toHaveAttribute('data-as', 'declared');
    expect(text.indexOf(LABELS.read)).toBeLessThan(text.indexOf(LABELS.differs));
  });

  it('a refused call prints no sent and no read', () => {
    const s = S.refused!;
    mount(s);
    const el = callEl(callsOf(s)[0]!.toolCallId);
    expect(within(el).queryByTestId('time-sent')).toBeNull();
    expect(within(el).queryByTestId('time-read')).toBeNull();
  });
});
