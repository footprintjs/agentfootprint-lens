/**
 * `<Lens view="analyst">` — the In plain words upgrade (0.68.0).
 *
 * With an `account`, the analyst view leads with `<PlainWords>` and folds the
 * summary card, the transport and the commentary under a native `<details>`
 * ("More detail"). Without one it is BYTE-IDENTICAL to 0.67.1: the snapshot
 * below was written by this test against the unmodified 0.67.1 `Lens.tsx`
 * before the upgrade landed, so it fails on any drift of the old path.
 * The `engineer` and `user` views never read the prop.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { Lens, PLAIN_WORDS_LABELS as LABELS } from '../../src/react/index.js';
import { load } from '../served/helpers.js';
import { loadReply } from './helpers.js';

describe('<Lens view="analyst"> without an account', () => {
  it('renders byte-identical to 0.67.1 (snapshot written before the upgrade)', () => {
    const f = load('flat-dynamic-tools');
    const { container } = render(<Lens recorder={f.recorder} view="analyst" />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('with a theme, byte-identical to 0.67.1 but for the four tone tokens the palette gained', () => {
    // 0.68.0 adds `--fp-tone-{ok,warn,bad,unknown}` to BOTH mode palettes (the
    // In plain words pane's tones), and `<Lens theme>` stamps the whole
    // palette at its root — so the root's style gains exactly those four
    // declarations. Strip them and the rest is 0.67.1's bytes.
    const f = load('flat-dynamic-tools');
    const { container } = render(<Lens recorder={f.recorder} view="analyst" theme={{ mode: 'light' }} />);
    const tones = /--fp-tone-(?:ok|warn|bad|unknown): [^;]+;\s?/g;
    expect(container.innerHTML.match(tones)).toHaveLength(4);
    expect(container.innerHTML.replace(tones, '')).toMatchSnapshot();
  });
});

describe('<Lens view="analyst" account> — the In plain words upgrade', () => {
  const { account, shown } = loadReply('A');

  afterEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll('iframe').forEach((f) => f.remove());
  });

  it('leads with <PlainWords>; the summary, transport and commentary fold under a closed "More detail"', () => {
    const f = load('flat-dynamic-tools');
    const { container } = render(<Lens recorder={f.recorder} view="analyst" account={account} accountShown={shown} />);
    const pane = screen.getByTestId('plain-words');
    const details = screen.getByTestId('analyst-more-detail') as HTMLDetailsElement;
    // The pane comes first in document order.
    expect(pane.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(details.tagName).toBe('DETAILS');
    expect(details.open).toBe(false);
    expect(within(details).getByText(LABELS.moreDetail).tagName).toBe('SUMMARY');
    // What the analyst view drew before is all inside the fold, unchanged.
    expect(within(details).getByText('Commentary')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid="plain-row"]')).toHaveLength(7);
    // The op's leaves reach "show me".
    fireEvent.click(within(screen.getAllByTestId('plain-row')[0]!).getByTestId('plain-show-me'));
    expect(within(screen.getAllByTestId('plain-row')[0]!).getByTestId('plain-leaf')).toHaveTextContent(account.question.value!);
  });

  it('Save as PDF prints the account from the frame', () => {
    const print = vi.fn();
    const real = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow')!;
    vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockImplementation(function (this: HTMLIFrameElement) {
      const win = real.get!.call(this) as Window | null;
      if (win !== null) Object.assign(win, { print, focus: () => {} });
      return win;
    });
    const f = load('flat-dynamic-tools');
    render(<Lens recorder={f.recorder} view="analyst" account={account} accountShown={shown} />);
    fireEvent.click(screen.getByRole('button', { name: LABELS.saveAsPdf }));
    const frame = document.querySelector('iframe[data-testid="answer-report-frame"]') as HTMLIFrameElement;
    expect(frame.contentDocument!.title).toBe(LABELS.reportTitle);
    // This recorder is another run: nothing joins, so the recorded time is not guessed.
    expect(frame.contentDocument!.body.textContent).toContain(`${LABELS.recorded} ${LABELS.notRecorded}`);
    return vi.waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  });

  it('the engineer and user views never read the account', () => {
    const f = load('flat-dynamic-tools');
    const { unmount } = render(<Lens recorder={f.recorder} view="user" account={account} accountShown={shown} />);
    expect(screen.queryByTestId('plain-words')).toBeNull();
    unmount();
    render(<Lens recorder={f.recorder} runner={f.runner as never} view="engineer" account={account} accountShown={shown} />);
    expect(screen.queryByTestId('plain-words')).toBeNull();
  });
});
