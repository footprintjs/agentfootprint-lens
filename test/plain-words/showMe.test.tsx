/**
 * "show me" — every line's evidence: where it lives in the record, the leaf
 * the op allowed out, the template id@version and the voucher. Leaves only;
 * a withheld leaf says why; no `shown` map → the pointers as text; the Flow
 * Lens link only when the host passes `onOpenInLens`; the softened hint when
 * a call's emptiness was read from the model's view.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { answerAccountPointerKey } from 'agentfootprint/observe';

import { PlainWords, PLAIN_WORDS_LABELS as LABELS } from '../../src/react/index.js';
import { loadReply, tamperedReply } from './helpers.js';

/** The row's first line's "show me" button, and the panel it controls. */
function firstLineOf(rowId: string): { button: HTMLElement; panel: HTMLElement } {
  const row = screen.getAllByTestId('plain-row').find((r) => r.dataset.row === rowId)!;
  const line = within(row).getAllByTestId('plain-line')[0]!;
  const button = [...line.children].find((el) => el.getAttribute('data-testid') === 'plain-show-me') as HTMLElement;
  const panel = document.getElementById(button.getAttribute('aria-controls')!)!;
  return { button, panel };
}

describe('"show me" on the real account', () => {
  const { account, shown } = loadReply('A');

  it('every line has one: a button with aria-expanded, controlling a hidden panel', () => {
    render(<PlainWords account={account} shown={shown} />);
    const buttons = screen.getAllByTestId('plain-show-me');
    expect(buttons).toHaveLength(account.rows.flatMap((r) => r.lines).length + 1);
    for (const b of buttons) {
      expect(b.tagName).toBe('BUTTON');
      expect(b).toHaveAttribute('aria-expanded', 'false');
      const panel = document.getElementById(b.getAttribute('aria-controls')!);
      expect(panel).not.toBeNull();
      expect(panel).not.toBeVisible();
    }
  });

  it('opens to the leaf: the question line shows where it lives and the value the op returned', () => {
    render(<PlainWords account={account} shown={shown} />);
    const { button, panel } = firstLineOf('asked');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveTextContent(LABELS.hide);
    expect(panel).toBeVisible();
    const line = account.rows[0]!.lines[0]!;
    const pointer = line.pointers[0]!;
    expect(pointer.kind).toBe('event');
    expect(panel).toHaveTextContent('agentfootprint.agent.turn_start · seed#0 · /userPrompt');
    const leaf = shown[answerAccountPointerKey(pointer)] as { value: string };
    expect(within(panel).getByTestId('plain-leaf')).toHaveTextContent(leaf.value);
    // The template and the voucher are always listed.
    expect(panel).toHaveTextContent(`${line.template.id}@${line.template.version}`);
    expect(panel).toHaveTextContent('person');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(panel).not.toBeVisible();
  });

  it('a derived emptiness leaf prints its row count, never rows', () => {
    render(<PlainWords account={account} shown={shown} />);
    const found = screen.getAllByTestId('plain-row').find((r) => r.dataset.row === 'found')!;
    const inView = within(found).getAllByTestId('plain-line')[1]!;
    fireEvent.click(within(inView).getByTestId('plain-show-me'));
    const leaves = within(inView).getAllByTestId('plain-leaf').map((el) => el.textContent);
    expect(leaves).toContain(`0 ${LABELS.rows} ${LABELS.at} /content/volumes`);
  });

  it('an app declaration says so', () => {
    render(<PlainWords account={account} shown={shown} />);
    const understood = screen.getAllByTestId('plain-row').find((r) => r.dataset.row === 'understood')!;
    const routed = within(understood).getAllByTestId('plain-line')[0]!;
    fireEvent.click(within(routed).getByTestId('plain-show-me'));
    expect(within(routed).getByTestId('plain-evidence')).toHaveTextContent(LABELS.declaredByApp);
  });

  it('a withheld leaf says why, in the pane’s words — never a value', () => {
    const reply = tamperedReply((r) => {
      const pointer = r.account.rows[0]!.lines[0]!.pointers[0]!;
      r.shown[answerAccountPointerKey(pointer)] = { withheld: 'not-shown-here' };
    });
    render(<PlainWords account={reply.account} shown={reply.shown} />);
    const { button, panel } = firstLineOf('asked');
    fireEvent.click(button);
    const leaf = within(panel).getByTestId('plain-leaf');
    expect(leaf).toHaveTextContent(LABELS.notShownHere);
    expect(leaf).toHaveClass('lens-plain-withheld');
  });

  it('each withheld reason has its own words', () => {
    const reasons = ['not-shown-here', 'too-large', 'not-found', 'foreign'] as const;
    const words = [LABELS.notShownHere, LABELS.tooLarge, LABELS.notFound, LABELS.foreign];
    reasons.forEach((reason, i) => {
      const reply = tamperedReply((r) => {
        const pointer = r.account.rows[0]!.lines[0]!.pointers[0]!;
        r.shown[answerAccountPointerKey(pointer)] = { withheld: reason };
      });
      const { unmount } = render(<PlainWords account={reply.account} shown={reply.shown} />);
      const { button, panel } = firstLineOf('asked');
      fireEvent.click(button);
      expect(within(panel).getByTestId('plain-leaf')).toHaveTextContent(words[i]!);
      unmount();
    });
  });

  it('a pointer the map does not carry reads "not shown here"', () => {
    const reply = tamperedReply((r) => {
      for (const key of Object.keys(r.shown)) delete r.shown[key];
    });
    render(<PlainWords account={reply.account} shown={reply.shown} />);
    const { button, panel } = firstLineOf('asked');
    fireEvent.click(button);
    expect(within(panel).getByTestId('plain-leaf')).toHaveTextContent(LABELS.notShownHere);
  });

  it('without `shown`, the pointers are listed as text and no value is drawn', () => {
    render(<PlainWords account={account} />);
    const { button, panel } = firstLineOf('asked');
    fireEvent.click(button);
    expect(panel).toHaveTextContent('agentfootprint.agent.turn_start · seed#0 · /userPrompt');
    expect(within(panel).queryByTestId('plain-leaf')).toBeNull();
  });

  it('no `onOpenInLens` → no Flow Lens link anywhere', () => {
    render(<PlainWords account={account} shown={shown} />);
    for (const b of screen.getAllByTestId('plain-show-me')) fireEvent.click(b);
    expect(screen.queryByRole('button', { name: LABELS.openInLens })).toBeNull();
  });

  it('with `onOpenInLens`, each record pointer gets the link, and it hands back that pointer', () => {
    const open = vi.fn();
    render(<PlainWords account={account} shown={shown} onOpenInLens={open} />);
    const { button, panel } = firstLineOf('asked');
    fireEvent.click(button);
    fireEvent.click(within(panel).getByRole('button', { name: LABELS.openInLens }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(account.rows[0]!.lines[0]!.pointers[0]);
  });

  it('the softened hint: a line into a call read from the model’s view without the report-only fields', () => {
    const reply = tamperedReply((r) => {
      (r.account.facts.calls[0] as { view?: string }).view = 'model-result-record-only';
    });
    render(<PlainWords account={reply.account} shown={reply.shown} />);
    const found = screen.getAllByTestId('plain-row').find((r) => r.dataset.row === 'found')!;
    const line = within(found).getAllByTestId('plain-line')[0]!;
    fireEvent.click(within(line).getByTestId('plain-show-me'));
    expect(within(line).getByTestId('plain-view-hint')).toHaveTextContent(LABELS.viewRecordOnly);
  });

  it('…and the plain hint when the model read something else', () => {
    const reply = tamperedReply((r) => {
      (r.account.facts.calls[0] as { view?: string }).view = 'model-result';
    });
    render(<PlainWords account={reply.account} shown={reply.shown} />);
    const found = screen.getAllByTestId('plain-row').find((r) => r.dataset.row === 'found')!;
    const line = within(found).getAllByTestId('plain-line')[0]!;
    fireEvent.click(within(line).getByTestId('plain-show-me'));
    expect(within(line).getByTestId('plain-view-hint')).toHaveTextContent(LABELS.viewModelResult);
  });

  it('the real run (the tool’s own result) carries no hint', () => {
    render(<PlainWords account={account} shown={shown} />);
    for (const b of screen.getAllByTestId('plain-show-me')) fireEvent.click(b);
    expect(screen.queryByTestId('plain-view-hint')).toBeNull();
  });
});
