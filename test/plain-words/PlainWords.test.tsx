/**
 * <PlainWords> over the REAL account of the archived field run (turn 2:
 * "what applications are running on powerstore SHPSTRPLPCL003").
 *
 * What is pinned: every row and every line of the account is drawn, in the
 * library's order, as the library's own text; the one-liner carries its tone
 * as a border AND a word; the "said by" chip lands on each recorded line by
 * the library's pairing rule; items are bullets under their line; a declared
 * label is strong with its own voucher; and the pane works on the account
 * alone (A0, no app declarations).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { PlainWords, PLAIN_WORDS_LABELS as LABELS } from '../../src/react/index.js';
import { saidByOf, linesOf } from '../../src/react/components/plainWordsLayout.js';
import { loadReply, tamperedReply } from './helpers.js';

const ROW_ORDER = ['asked', 'understood', 'checked', 'not-checked', 'found', 'how-sure', 'anything-wrong'];

describe('<PlainWords> — the real account (fixture A)', () => {
  const { account, shown } = loadReply('A');

  it('draws the seven rows, in the library order, headed by the library headings', () => {
    render(<PlainWords account={account} shown={shown} />);
    const rows = screen.getAllByTestId('plain-row');
    expect(rows.map((r) => r.dataset.row)).toEqual(ROW_ORDER);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'You asked',
      'It understood',
      'It checked',
      'It did not check',
      'It found',
      'How sure',
      'Anything wrong',
    ]);
    expect(account.rows.map((r) => r.heading.text)).toEqual(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    );
  });

  it('draws every line of every row as the library wrote it — none dropped, none added', () => {
    render(<PlainWords account={account} shown={shown} />);
    const rows = screen.getAllByTestId('plain-row');
    account.rows.forEach((row, i) => {
      const drawn = within(rows[i]!)
        .getAllByTestId('plain-line-text')
        .map((el) => el.textContent);
      expect(drawn, row.id).toEqual(row.lines.map((l) => l.text));
    });
  });

  it('the one-liner: the library sentence, its tone as a border class AND a word', () => {
    render(<PlainWords account={account} shown={shown} />);
    const one = screen.getByTestId('plain-one-liner');
    expect(account.summary.tone).toBe('warn');
    expect(one.dataset.tone).toBe('warn');
    expect(one.className).toContain('lens-plain-one--warn');
    expect(within(one).getByTestId('plain-tone')).toHaveTextContent(LABELS.toneWarn);
    expect(within(one).getByTestId('plain-line-text')).toHaveTextContent(account.summary.sentence.text);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(LABELS.inOneLine);
  });

  it('items are bullets under their line: four under "It did not check", two under "It checked"', () => {
    render(<PlainWords account={account} shown={shown} />);
    const [checked, notChecked] = ['checked', 'not-checked'].map(
      (id) => screen.getAllByTestId('plain-row').find((r) => r.dataset.row === id)!,
    );
    expect(within(checked!).getAllByTestId('plain-item')).toHaveLength(2);
    expect(within(notChecked!).getAllByTestId('plain-item')).toHaveLength(4);
    // …nested in a list under the line they belong to.
    const line = within(notChecked!).getAllByTestId('plain-line')[0]!;
    expect(within(line).getAllByTestId('plain-item')).toHaveLength(4);
  });

  it('a "said by" chip on every recorded line, from the row chips, by the library rule', () => {
    render(<PlainWords account={account} shown={shown} />);
    const rows = screen.getAllByTestId('plain-row');
    account.rows.forEach((row, i) => {
      const pairing = saidByOf(row);
      // The library's rule held on every row of the real account — no fallback.
      expect(pairing.byLine.size, row.id).toBe(row.lines.filter((l) => l.status === 'recorded').length);
      const groups = linesOf(row);
      const lineEls = within(rows[i]!).getAllByTestId('plain-line');
      groups.forEach((g, n) => {
        const own = [...lineEls[n]!.children].flatMap((el) =>
          el.classList.contains('lens-plain-chips') ? [...el.querySelectorAll('[data-mark="said-by"]')] : [],
        );
        const expected = pairing.byLine.get(g.index);
        expect(own.map((c) => c.textContent), `${row.id} line ${n}`).toEqual(expected ? [expected.text] : []);
      });
    });
    // "How sure the routing was is not recorded." — nobody vouches for a missing fact.
    const understood = rows[1]!;
    const missing = within(understood).getAllByTestId('plain-line')[3]!;
    expect(missing.dataset.status).toBe('not-recorded');
    expect(missing.querySelector('[data-mark="said-by"]')).toBeNull();
    expect(missing.querySelector('[data-mark="not-recorded"]')).toHaveTextContent('not recorded');
    // The row keeps only its own chips ("1 signal"); the said-by ones moved to the lines.
    const wrong = rows[6]!;
    expect(within(wrong).getByTestId('plain-row-chips').textContent).toBe('1 signal');
  });

  it('parts are typed: the declared label is strong with its own voucher; ids are code; the question is quoted', () => {
    render(<PlainWords account={account} shown={shown} />);
    const understood = screen.getAllByTestId('plain-row')[1]!;
    const label = understood.querySelector('strong.lens-plain-label')!;
    expect(label).toHaveTextContent('array estate report');
    expect(label).toHaveAttribute('title', `${LABELS.voucher}: app`);
    expect(understood.querySelector('code')).toHaveTextContent('array-inventory');
    const asked = screen.getAllByTestId('plain-row')[0]!;
    expect(asked.querySelector('q')).toHaveTextContent(account.question.value!);
  });

  it('draws the question and the answer by default, and not when asked not to', () => {
    const { unmount } = render(<PlainWords account={account} shown={shown} />);
    const qa = screen.getByTestId('plain-qa');
    expect(qa).toHaveTextContent(account.question.value!);
    expect(qa.textContent).toContain('No applications found');
    unmount();
    render(<PlainWords account={account} shown={shown} showQuestionAndAnswer={false} />);
    expect(screen.queryByTestId('plain-qa')).toBeNull();
  });

  it('"…and n more" is drawn as the row’s last line', () => {
    const reply = tamperedReply((r) => {
      const found = r.account.rows.find((row) => row.id === 'found')!;
      found.more = { ...structuredClone(found.lines[0]!), text: '…and 3 more tool calls.', parts: [{ text: '…and 3 more tool calls.' }] };
    });
    render(<PlainWords account={reply.account} shown={reply.shown} />);
    const found = screen.getAllByTestId('plain-row').find((r) => r.dataset.row === 'found')!;
    expect(within(found).getByTestId('plain-more')).toHaveTextContent('…and 3 more tool calls.');
    const lis = found.querySelectorAll('.lens-plain-lines > li');
    expect(lis[lis.length - 1]).toHaveAttribute('data-testid', 'plain-more');
  });

  it('a row whose chips do not pair by the library rule keeps them all on the row (omit, never guess)', () => {
    const reply = tamperedReply((r) => {
      const understood = r.account.rows.find((row) => row.id === 'understood')!;
      understood.chips = understood.chips.slice(0, 1); // one said-by chip for two sources
    });
    render(<PlainWords account={reply.account} shown={reply.shown} />);
    const understood = screen.getAllByTestId('plain-row').find((r) => r.dataset.row === 'understood')!;
    const lines = within(understood).getAllByTestId('plain-line');
    for (const line of lines) expect(line.querySelector('[data-mark="said-by"]')).toBeNull();
    expect(within(understood).getByTestId('plain-row-chips')).toHaveTextContent("said by: the library's record");
  });

  it('the template ids toggle: off by default, on shows every line’s id@version', async () => {
    const { container } = render(<PlainWords account={account} shown={shown} />);
    expect(screen.queryAllByTestId('plain-template-id')).toHaveLength(0);
    screen.getByRole('checkbox', { name: LABELS.templateIds }).click();
    const ids = await screen.findAllByTestId('plain-template-id');
    const all = account.rows.flatMap((r) => r.lines).length + 1; // + the one-liner
    expect(ids).toHaveLength(all);
    expect(ids[0]).toHaveTextContent(`${account.summary.sentence.template.id}@${account.summary.sentence.template.version}`);
    expect(container.querySelector('.lens-plain-head')).not.toBeNull();
  });

  it('the toggle can be left out by the host', () => {
    render(<PlainWords account={account} shown={shown} templateIdsToggle={false} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('Save as PDF appears only with onSaveAsPdf, and calls it', () => {
    const { unmount } = render(<PlainWords account={account} shown={shown} />);
    expect(screen.queryByRole('button', { name: LABELS.saveAsPdf })).toBeNull();
    unmount();
    let calls = 0;
    render(<PlainWords account={account} shown={shown} onSaveAsPdf={() => (calls += 1)} />);
    screen.getByRole('button', { name: LABELS.saveAsPdf }).click();
    expect(calls).toBe(1);
  });
});

describe('<PlainWords> — the library alone (fixture A0, no app declarations)', () => {
  const { account, shown } = loadReply('A0');

  it('draws all seven rows and every line; no app label, no app-decision line', () => {
    render(<PlainWords account={account} shown={shown} />);
    expect(screen.getAllByTestId('plain-row')).toHaveLength(7);
    const drawn = screen.getAllByTestId('plain-line-text').map((el) => el.textContent);
    expect(drawn).toEqual([account.summary.sentence.text, ...account.rows.flatMap((r) => r.lines.map((l) => l.text))]);
    expect(document.querySelector('strong.lens-plain-label')).toBeNull();
    expect(screen.getByTestId('plain-one-liner').dataset.tone).toBe(account.summary.tone);
  });
});
