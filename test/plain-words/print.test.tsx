/**
 * Save as PDF (design §5.2): `<AnswerReportPrint>` is the one-page report,
 * `printAnswerAccount` prints it from a hidden frame titled "Answer report".
 *
 * Pinned: the real `<title>`; the meta line's run id, ISO-8601 UTC times and
 * template set; the rows as a table with row headers and "said by …" plus the
 * template id under each line; the folds (6 items, 1,200 answer characters);
 * NO "show me" in the print; the frame `aria-hidden` while mounted and gone on
 * `afterprint`; and the join that reads the recorded time off the lens's log.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { AnswerReportPrint, printAnswerAccount, PLAIN_WORDS_LABELS as LABELS, PRINT_ITEMS_FOLD } from '../../src/react/index.js';
import { recordedAtOf } from '../../src/react/components/plainWordsLayout.js';
import type { EventLogEntry } from '../../src/core/types.js';
import { loadReply, tamperedReply } from './helpers.js';

const RECORDED = 1790361930313; // the turn_start's meta.wallClockMs in the archived recording
const PRINTED = Date.UTC(2026, 8, 25, 12, 0, 0);

describe('<AnswerReportPrint> — the one-page report', () => {
  const { account, shown } = loadReply('A');

  it('title, question, meta line: run id, ISO UTC times, model, template set', () => {
    render(<AnswerReportPrint account={account} recordedAt={RECORDED} printedAt={PRINTED} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(LABELS.reportTitle);
    const meta = screen.getByTestId('print-meta').textContent!;
    expect(meta).toContain(`${LABELS.run} run-1790361930311-2`);
    expect(meta).toContain(`${LABELS.recorded} ${new Date(RECORDED).toISOString()}`);
    expect(meta).toMatch(/recorded \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    expect(meta).toContain(`${LABELS.printed} 2026-09-25T12:00:00.000Z`);
    expect(meta).toContain(`${LABELS.model} claude-haiku-4-5-20251001`);
    expect(meta).toContain(`${LABELS.templates} answer-account v${account.templates.version}`);
  });

  it('without a recorded time the meta line says so — never a guess', () => {
    render(<AnswerReportPrint account={account} />);
    expect(screen.getByTestId('print-meta')).toHaveTextContent(`${LABELS.recorded} ${LABELS.notRecorded}`);
    expect(screen.getByTestId('print-meta').textContent).not.toContain(LABELS.printed);
  });

  it('the seven rows as a table, each a row header; every line with who says so and its template', () => {
    render(<AnswerReportPrint account={account} printedAt={PRINTED} />);
    const headers = screen.getAllByRole('rowheader');
    expect(headers.map((h) => h.textContent)).toEqual(account.rows.map((r) => r.heading.text));
    for (const h of headers) expect(h).toHaveAttribute('scope', 'row');
    const understood = screen.getAllByTestId('print-row')[1]!;
    const by = within(understood).getAllByTestId('print-by').map((el) => el.textContent);
    expect(by[0]).toBe(`said by: the library's record · template ${account.rows[1]!.lines[0]!.template.id}@1`);
    expect(by[1]).toContain('said by: the app (not recorded with the run)');
    expect(by[3]).toBe(`not recorded · template ${account.rows[1]!.lines[3]!.template.id}@1`);
  });

  it('the one-liner, with its tone word, and the answer as plain text', () => {
    render(<AnswerReportPrint account={account} />);
    const one = screen.getByTestId('print-one-liner');
    expect(one).toHaveTextContent(LABELS.toneWarn);
    expect(one).toHaveTextContent(account.summary.sentence.text);
    expect(screen.getByTestId('print-answer').textContent).toBe(account.answer.value);
  });

  it('prints no "show me": no buttons, no evidence, no leaf values, no pointer places', () => {
    const { container } = render(<AnswerReportPrint account={account} />);
    expect(container.querySelector('button')).toBeNull();
    expect(container.textContent).not.toContain(LABELS.showMe);
    expect(container.textContent).not.toContain('/userPrompt');
    expect(container.textContent).not.toContain('seed#0');
    // A leaf only "show me" would print (the evidence posture) never appears.
    expect(Object.values(shown).some((l) => 'value' in l && l.value === 'guard')).toBe(true);
    expect(container.textContent).not.toContain('guard');
  });

  it('a list row folds past six items; the answer folds at 1,200 characters', () => {
    const reply = tamperedReply((r) => {
      const row = r.account.rows.find((x) => x.id === 'not-checked')!;
      const item = row.lines[1]!;
      row.lines = [row.lines[0]!, ...Array.from({ length: 8 }, (_, i) => ({ ...structuredClone(item), text: `item ${i}`, parts: [{ text: `item ${i}` }] }))];
      r.account.answer.value = 'x'.repeat(1500);
    });
    render(<AnswerReportPrint account={reply.account} />);
    const row = screen.getAllByTestId('print-row').find((x) => x.dataset.row === 'not-checked')!;
    const items = within(row).getAllByRole('listitem');
    expect(items).toHaveLength(PRINT_ITEMS_FOLD + 1);
    expect(within(row).getByTestId('print-fold')).toHaveTextContent(`… 2 ${LABELS.more}`);
    const answer = screen.getByTestId('print-answer').textContent!;
    expect(answer.startsWith('x'.repeat(1200) + ' … ')).toBe(true);
    expect(answer).not.toContain('x'.repeat(1201));
    expect(answer).toContain(LABELS.answerCut);
  });
});

describe('printAnswerAccount — the print frame', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll('iframe').forEach((f) => f.remove());
  });

  /** Replace every frame window's `print` with a spy (jsdom has no print dialog, and no `focus`). */
  function spyPrint(): ReturnType<typeof vi.fn> {
    const print = vi.fn();
    const real = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow')!;
    vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockImplementation(function (this: HTMLIFrameElement) {
      const win = real.get!.call(this) as Window | null;
      if (win !== null) Object.assign(win, { print, focus: () => {} });
      return win;
    });
    return print;
  }

  it('mounts an aria-hidden frame titled "Answer report" holding the report, and prints it', async () => {
    const print = spyPrint();
    const { account } = loadReply('A');
    await printAnswerAccount(account, { recordedAt: RECORDED, printedAt: PRINTED });
    const frame = document.querySelector('iframe[data-testid="answer-report-frame"]') as HTMLIFrameElement;
    expect(frame).not.toBeNull();
    expect(frame).toHaveAttribute('aria-hidden', 'true');
    const doc = frame.contentDocument!;
    expect(doc.title).toBe('Answer report');
    expect(doc.querySelector('title')!.textContent).toBe('Answer report');
    expect(doc.querySelector('style')!.textContent).toContain('@page');
    const report = doc.querySelector('[data-testid="answer-report"]')!;
    expect(report.textContent).toContain(account.summary.sentence.text);
    expect(report.textContent).toContain(new Date(RECORDED).toISOString());
    expect(report.textContent).not.toContain(LABELS.showMe);
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('removes the frame on afterprint, and a second print replaces the first frame', async () => {
    spyPrint();
    const { account } = loadReply('A');
    await printAnswerAccount(account);
    await printAnswerAccount(account);
    const frames = document.querySelectorAll('iframe[data-testid="answer-report-frame"]');
    expect(frames).toHaveLength(1);
    const frame = frames[0] as HTMLIFrameElement;
    frame.contentWindow!.dispatchEvent(new Event('afterprint'));
    expect(document.querySelector('iframe[data-testid="answer-report-frame"]')).toBeNull();
  });
});

describe('recordedAtOf — the recorded time, joined by the account’s own pointer', () => {
  const { account } = loadReply('A');
  const entry = (type: string, runtimeStageId: string, meta: Record<string, unknown>): EventLogEntry =>
    ({ seq: 0, wallClockMs: 0, runOffsetMs: 0, runtimeStageId, event: { type, payload: {}, meta } }) as unknown as EventLogEntry;

  it('reads the turn_start the question points at (type + runtimeStageId + run id)', () => {
    const log = [
      entry('agentfootprint.agent.turn_start', 'seed#0', { wallClockMs: 1, runId: 'another-run' }),
      entry('agentfootprint.agent.turn_end', 'seed#0', { wallClockMs: 2, runId: 'run-1790361930311-2' }),
      entry('agentfootprint.agent.turn_start', 'seed#0', { wallClockMs: RECORDED, runId: 'run-1790361930311-2' }),
    ];
    expect(recordedAtOf(account, log)).toBe(RECORDED);
  });

  it('nothing to join → undefined (the print says not recorded)', () => {
    expect(recordedAtOf(account, [])).toBeUndefined();
    expect(recordedAtOf(account, [entry('agentfootprint.agent.turn_start', 'seed#9', { wallClockMs: 5 })])).toBeUndefined();
  });
});
