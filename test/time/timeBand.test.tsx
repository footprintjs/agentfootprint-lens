/** @vitest-environment jsdom */
/**
 * <TimeBand> and `foldTimeRows` over REAL rows (test/time/fixtures, generated
 * from agentfootprint 9.129.0 runs by `npm run fixtures:time`) — one block per
 * row kind the band draws, plus the laws: omit, never deny (no time row → no
 * band); never infer (the widened flag only where the row says `differs`);
 * a row the lens cannot narrow is passed over, not guessed at.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { foldTimeRows, spellMs } from '../../src/core/time/timeRows.js';
import { LABELS } from '../../src/core/time/labels.js';
import { TimeBand } from '../../src/react/components/TimeBand.js';
import fixtures from './fixtures/time-rows.json';

afterEach(cleanup);

type Scenario = { readonly ledger: readonly Record<string, unknown>[]; readonly coverage: readonly unknown[] };
const S = fixtures as unknown as Record<string, Scenario>;
const rowOf = (s: Scenario, kind: string, i = 0) => s.ledger.filter((r) => r.kind === kind)[i]!;
const mount = (s: Scenario) => render(<TimeBand rows={s.ledger} coverage={s.coverage} />);
const callEl = (id: string) =>
  screen.getAllByTestId('time-call').find((el) => el.getAttribute('data-tool-call-id') === id)!;

describe('the clock row', () => {
  it('prints now and zone with their sources, and the control window', () => {
    const s = S.controlWindow!;
    const clock = rowOf(s, 'clock') as { now: string; zone: string; nowSource: string; zoneSource: string; window: { from: string; to: string } };
    mount(s);
    const el = screen.getByTestId('time-clock');
    expect(el).toHaveTextContent(clock.now);
    expect(el).toHaveTextContent(clock.nowSource);
    expect(el).toHaveTextContent(clock.zone);
    expect(el).toHaveTextContent(clock.zoneSource);
    expect(el).toHaveTextContent(`[${clock.window.from}, ${clock.window.to})`);
    expect(el).toHaveTextContent('control');
  });
});

describe('the clock-on-resume row', () => {
  it('prints what the resume passed and the clock that was kept', () => {
    const s = S.clockOnResume!;
    const row = rowOf(s, 'clock-on-resume') as { passed: { now: string; zone: string }; kept: { now: string; zone: string } };
    mount(s);
    const el = screen.getByTestId('time-clock-on-resume');
    expect(el).toHaveTextContent(LABELS.passed);
    expect(el).toHaveTextContent(row.passed.now);
    expect(el).toHaveTextContent(row.passed.zone);
    expect(el).toHaveTextContent(LABELS.kept);
    expect(el).toHaveTextContent(row.kept.now);
    expect(el).toHaveTextContent(row.kept.zone);
  });
});

describe('the time-reading row', () => {
  it('a settled reading: the quote, the reader, the tz database, the candidate and how it settled', () => {
    const s = S.widened!;
    const row = rowOf(s, 'time-reading') as { quote: string; tzdata: string; candidates: unknown[] };
    mount(s);
    const el = screen.getByTestId('time-reading');
    expect(within(el).getByTestId('time-reading-quote')).toHaveTextContent(row.quote);
    expect(el).toHaveTextContent('fixture/rule@1.0.0');
    expect(el).toHaveTextContent(row.tzdata);
    expect(within(el).getAllByTestId('time-candidate')).toHaveLength(row.candidates.length);
    expect(el).toHaveAttribute('data-choice', 'only');
  });

  it('an open reading names the candidates left and the questions only the person can settle', () => {
    const s = S.openReading!;
    const row = rowOf(s, 'time-reading') as { choice: { by: string; remaining: number[]; open: string[] } };
    expect(row.choice.by).toBe('open');
    mount(s);
    const el = screen.getByTestId('time-reading');
    expect(el).toHaveAttribute('data-choice', 'open');
    for (const q of row.choice.open) expect(el).toHaveTextContent(q);
    for (const n of row.choice.remaining) expect(el).toHaveTextContent(`#${n}`);
  });

  it('an unknown tz database is labelled clock unknown — and only then', () => {
    const s = S.widened!;
    mount(s);
    expect(screen.queryByTestId('time-tzdata-unknown')).toBeNull();
    cleanup();
    // The runtime that could not name its tz database (`process.versions.tz` absent).
    const ledger = s.ledger.map((r) => (r.kind === 'time-reading' ? { ...r, tzdata: 'unknown' } : r));
    render(<TimeBand rows={ledger} />);
    expect(screen.getByTestId('time-tzdata-unknown')).toHaveTextContent(LABELS.clockUnknown);
  });
});

describe('the call-window row', () => {
  it('an exact fill: asked, the person’s control window, no widened flag', () => {
    const s = S.controlWindow!;
    const w = rowOf(s, 'call-window') as { toolCallId: string; asked: { from: string; to: string } };
    mount(s);
    const el = callEl(w.toolCallId);
    expect(el).toHaveAttribute('data-how', 'filled');
    expect(el).toHaveTextContent(`[${w.asked.from}, ${w.asked.to})`);
    expect(el).toHaveTextContent('control');
    expect(within(el).queryByTestId('time-widened')).toBeNull();
  });

  it('a widened fill says so, with the range it sent and the extra it reads', () => {
    const s = S.widened!;
    const w = rowOf(s, 'call-window') as {
      toolCallId: string;
      sent: { from: string; to: string };
      differs: { extra: { from: string; to: string }[] };
    };
    mount(s);
    const el = callEl(w.toolCallId);
    expect(within(el).getByTestId('time-widened')).toHaveTextContent(LABELS.widened);
    expect(el).toHaveTextContent(`[${w.sent.from}, ${w.sent.to})`);
    for (const x of w.differs.extra) expect(el).toHaveTextContent(`[${x.from}, ${x.to})`);
  });

  it('a refused call prints the refusal code', () => {
    const s = S.refused!;
    const w = rowOf(s, 'call-window') as { toolCallId: string; refused: string };
    mount(s);
    const el = callEl(w.toolCallId);
    expect(el).toHaveAttribute('data-how', 'refused');
    expect(within(el).getByTestId('time-refused')).toHaveAttribute('data-code', w.refused);
    expect(within(el).queryByTestId('time-dispatched-at')).toBeNull(); // it never ran
  });

  it('the model’s own differing window is printed as the record words it', () => {
    const s = S.drift!;
    const w = rowOf(s, 'call-window', 1) as { toolCallId: string; how: string };
    mount(s);
    expect(callEl(w.toolCallId)).toHaveAttribute('data-how', w.how);
  });
});

describe('the call row', () => {
  it('prints dispatchedAt; drift only on the calls whose row carries it', () => {
    const s = S.drift!;
    const calls = s.ledger.filter((r) => r.kind === 'call') as {
      toolCallId: string;
      dispatchedAt: string;
      drift: { byMs: number; outcome: string; form?: number };
    }[];
    mount(s);
    for (const c of calls) {
      const el = callEl(c.toolCallId);
      expect(within(el).getByTestId('time-dispatched-at')).toHaveTextContent(c.dispatchedAt);
      const d = within(el).getByTestId('time-drift');
      expect(d).toHaveAttribute('data-outcome', c.drift.outcome);
      expect(d).toHaveTextContent(spellMs(c.drift.byMs));
    }
    expect(calls.map((c) => c.drift.outcome).sort()).toEqual(['redrawn', 'shifted']);
    cleanup();
    mount(S.controlWindow!);
    expect(screen.queryByTestId('time-drift')).toBeNull();
  });

  it('spells a drift as the record’s number, exactly', () => {
    expect(spellMs(30 * 60_000)).toBe('+30m');
    expect(spellMs(-(3_600_000 + 5 * 60_000))).toBe('-1h 5m');
    expect(spellMs(45_250)).toBe('+45s 250ms');
    expect(spellMs(0)).toBe('+0ms');
  });
});

describe('the period rows', () => {
  it('each verdict beside the period its result declared; a held `unknown` is labelled so', () => {
    const s = S.controlWindow!;
    const periods = s.ledger.filter((r) => r.kind === 'period') as { toolCallId: string; verdict: string }[];
    mount(s);
    for (const p of periods) {
      expect(within(callEl(p.toolCallId)).getByTestId('time-period')).toHaveAttribute('data-verdict', p.verdict);
    }
    const blind = periods.find((p) => p.verdict === 'unknown')!;
    expect(within(callEl(blind.toolCallId)).getByTestId('time-held-unknown')).toHaveTextContent(LABELS.clockUnknown);
    const covered = periods.find((p) => p.verdict === 'covered')!;
    expect(within(callEl(covered.toolCallId)).queryByTestId('time-held-unknown')).toBeNull();
  });

  it('a result that declared nothing: the record’s `undeclared`, and no queried line', () => {
    const s = S.widened!;
    const p = rowOf(s, 'period') as { toolCallId: string; verdict: string };
    expect(p.verdict).toBe('undeclared');
    mount(s);
    const el = callEl(p.toolCallId);
    expect(within(el).getByTestId('time-period')).toHaveAttribute('data-verdict', 'undeclared');
    expect(el).not.toHaveTextContent(LABELS.queried);
  });
});

describe('the laws', () => {
  it('omit, never deny: a ledger with no time or period row draws nothing', () => {
    const findingsOnly = [{ kind: 'basis', turn: 1, iteration: 1, toolCallId: 'c1' }];
    expect(foldTimeRows(findingsOnly)).toBeUndefined();
    const { container } = render(<TimeBand rows={findingsOnly} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('a row it cannot narrow is passed over, and the rest still draw', () => {
    const s = S.controlWindow!;
    const broken = [...s.ledger, { kind: 'clock', turn: 2, iteration: 1, now: 42 }, { kind: 'call', turn: 1 }];
    const fold = foldTimeRows(broken, s.coverage)!;
    expect(fold.rows).toBe(foldTimeRows(s.ledger, s.coverage)!.rows);
    expect(fold.turns.map((t) => t.turn)).toEqual([1]);
  });

  it('joins one call’s window, dispatch and verdict under its turn', () => {
    const s = S.controlWindow!;
    const fold = foldTimeRows(s.ledger, s.coverage)!;
    const [turn] = fold.turns;
    expect(turn!.calls.map((c) => [c.toolCallId, c.window?.how, c.dispatch !== undefined, c.period?.verdict])).toEqual([
      ['c1', 'filled', true, 'covered'],
      ['c2', 'filled', true, 'unknown'],
    ]);
    const declared = (s.coverage[0] as { period: { queried: unknown } }).period.queried;
    expect(turn!.calls[0]!.declared?.queried).toEqual(declared);
  });
});
