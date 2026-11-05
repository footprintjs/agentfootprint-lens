import React from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { PlainWords } from './PlainWords.js';
import { loadReply, tamperedReply } from '../../../test/plain-words/helpers.js';

describe('<PlainWords> — STAND reader order', () => {
  it('heads the unchanged row order State, Assess, Trace, Name, Decide', () => {
    const { account, shown } = loadReply();
    render(<PlainWords account={account} shown={shown} />);
    expect(screen.getAllByTestId('plain-stand-heading').map((h) => h.textContent)).toEqual([
      'State', 'Assess', 'Trace', 'Name', 'Decide',
    ]);
    const rows = screen.getAllByTestId('plain-row');
    expect(rows.map((r) => r.dataset.row)).toEqual(account.rows.map((r) => r.id));
    expect(rows.map((r) => within(r).getByRole('heading', { level: 3 }).textContent)).toEqual(
      account.rows.map((r) => r.heading.text),
    );
    expect(screen.getAllByTestId('plain-line-text').map((el) => el.textContent)).toEqual([
      account.summary.sentence.text, ...account.rows.flatMap((r) => r.lines.map((l) => l.text)),
    ]);
    expect(rows[0]!.compareDocumentPosition(screen.getByTestId('plain-one-liner')) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it.each([
    ['checked', 'Assess'],
    ['not-checked', 'Assess'],
    ['found', 'Trace'],
  ])('heads %s as %s while keeping its sentences and evidence', (id, heading) => {
    const { account, shown } = loadReply();
    render(<PlainWords account={account} shown={shown} />);
    const row = screen.getAllByTestId('plain-row').find((el) => el.dataset.row === id)!;
    let previous = row.previousElementSibling;
    while (previous !== null && previous.tagName !== 'H2') previous = previous.previousElementSibling;
    expect(previous).toHaveTextContent(heading);
    const recorded = account.rows.find((entry) => entry.id === id)!;
    expect(within(row).getAllByTestId('plain-line-text').map((el) => el.textContent)).toEqual(
      recorded.lines.map((line) => line.text),
    );
    expect(within(row).getAllByTestId('plain-evidence')).toHaveLength(recorded.lines.length);
  });

  it('Name keeps the supplied standing and reason sentence rather than deriving one from summary tone', () => {
    const reply = tamperedReply((r) => {
      r.account.summary.tone = 'ok';
      const row = r.account.rows.find((row) => row.id === 'how-sure')!;
      // Explicitly shaped account data, not a newly generated engine verdict.
      const text = 'not-sure · period-not-held';
      row.lines = [{ ...row.lines[0]!, text, parts: [{ text }] }];
    });
    render(<PlainWords account={reply.account} shown={reply.shown} />);
    const name = screen.getByRole('heading', { level: 2, name: 'Name' });
    const row = screen.getAllByTestId('plain-row').find((r) => r.dataset.row === 'how-sure')!;
    expect(name.nextElementSibling).toBe(row);
    expect(within(row).getByTestId('plain-line-text').textContent).toBe('not-sure · period-not-held');
    expect(screen.getByTestId('plain-one-liner')).toHaveAttribute('data-tone', 'ok');
  });

  it.each(['future-row', 'constructor'])('retains an unfamiliar %s row and its evidence rather than silently filtering it out', (id) => {
    const reply = tamperedReply((r) => {
      // A future payload at the JS boundary; no new row policy is inferred.
      Object.assign(r.account.rows[1]!, { id });
    });
    render(<PlainWords account={reply.account} shown={reply.shown} />);
    const rows = screen.getAllByTestId('plain-row');
    expect(rows).toHaveLength(reply.account.rows.length);
    expect(rows[1]).toHaveAttribute('data-row', id);
    expect(within(rows[1]!).getAllByTestId('plain-line-text').map((el) => el.textContent)).toEqual(
      reply.account.rows[1]!.lines.map((line) => line.text),
    );
    expect(within(rows[1]!).getAllByTestId('plain-evidence')).toHaveLength(reply.account.rows[1]!.lines.length);
  });
});
