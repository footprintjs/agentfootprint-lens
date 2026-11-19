/**
 * `<Lens view="analyst">` — the In plain words upgrade (0.68.0).
 *
 * With an `account`, the analyst view leads with `<PlainWords>` and folds the
 * summary card, the transport and the commentary under a native `<details>`
 * ("More detail"). Without one its layout is BYTE-IDENTICAL with the same
 * narration inputs as 0.67.1: the snapshot
 * below was written by this test against the unmodified 0.67.1 `Lens.tsx`
 * before the upgrade landed. Only those two layout oracles receive explicit
 * frozen fixture narration; default narration wiring has its own unmocked test.
 * Historical test titles remain stable because they are the immutable snapshot keys.
 * The `engineer` and `user` views never read the prop.
 */
import { readFileSync } from 'node:fs';
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { Lens, PLAIN_WORDS_LABELS as LABELS } from '../../src/react/index.js';
import { load } from '../served/helpers.js';
import { loadReply } from './helpers.js';
import { legacyAnalystNarration } from './legacyAnalystNarration/index.js';

// EUI 1.0.1 extends its public coolLight preset with native control,
// contrast, geometry and motion tokens. Retain them in the rendered app;
// isolate those exact additions from the immutable 0.67 layout oracle.
const installedRenderer = JSON.parse(readFileSync('node_modules/footprint-explainable-ui/package.json', 'utf8')) as { version: string };
const hasDiagramActivity = Number(installedRenderer.version.split('.')[0]) >= 2;
const nativeControlTokens = {
  ...(hasDiagramActivity ? { '--fp-diagram-removed-opacity': '0.4' } : {}),
  "--fp-on-primary": "#fff",
  "--fp-on-success": "#fff",
  "--fp-on-error": "#fff",
  "--fp-on-warning": "#1a1a1a",
  "--fp-on-tracing": "#fff",
  "--fp-on-node-cursor": "#1a1a1a",
  "--fp-on-node-visited": "#fff",
  "--fp-on-node-main": "#fff",
  "--fp-radius-control": "6px",
  "--fp-radius-panel": "8px",
  "--fp-radius-badge": "12px",
  "--fp-font-size-body": "12px",
  "--fp-font-size-label": "11px",
  "--fp-font-size-small": "10px",
  "--fp-font-size-title": "14px",
  "--fp-line-height": "1.5",
  "--fp-font-weight-normal": "400",
  "--fp-font-weight-medium": "500",
  "--fp-font-weight-strong": "700",
  "--fp-space-xs": "4px",
  "--fp-space-sm": "8px",
  "--fp-space-md": "12px",
  "--fp-space-lg": "16px",
  "--fp-space-xl": "24px",
  "--fp-border-width": "1px",
  "--fp-focus-width": "2px",
  "--fp-shadow-panel": "0 2px 8px rgba(0,0,0,0.15)",
  "--fp-shadow-popover": "0 6px 24px rgba(0,0,0,0.2)",
  "--fp-shadow-focus": "none",
  "--fp-node-border-color": "initial",
  "--fp-node-border-width": "initial",
  "--fp-node-border-style": "initial",
  "--fp-node-radius": "initial",
  "--fp-node-shadow": "initial",
  "--fp-node-shape-shadow": "initial",
  "--fp-node-badge-shadow": "initial",
  "--fp-node-pulse-opacity": "initial",
  "--fp-node-group-status-display": "none",
  "--fp-motion-duration": "240ms",
  "--fp-motion-fast-duration": "120ms",
  "--fp-motion-easing": "ease",
  "--fp-control-height": "28px",
  "--fp-control-padding-x": "8px",
  "--fp-control-gap": "6px",
  "--fp-icon-size": "14px"
} as const;
const nativeControls = new RegExp(`(?:${Object.keys(nativeControlTokens).join('|')}): [^;]+;\\s?`, 'g');

describe('<Lens view="analyst"> without an account', () => {
  it('renders byte-identical to 0.67.1 (snapshot written before the upgrade)', () => {
    const f = load('flat-dynamic-tools');
    const { container } = render(<Lens recorder={f.recorder} view="analyst" humanizer={legacyAnalystNarration} />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('with a theme, byte-identical to 0.67.1 but for the four tone tokens the palette gained', () => {
    // 0.68.0 adds `--fp-tone-{ok,warn,bad,unknown}` to BOTH mode palettes (the
    // In plain words pane's tones), and `<Lens theme>` stamps the whole
    // palette at its root — so the root's style gains exactly those four
    // declarations. EUI 1.0.1 additionally supplies the exact native control
    // tokens asserted below. EUI 2 also supplies the removal opacity token.
    // Keep all additions in production, remove only
    // that closed list here, and require the historical layout bytes.
    const f = load('flat-dynamic-tools');
    const { container } = render(<Lens recorder={f.recorder} view="analyst" theme={{ mode: 'light' }} humanizer={legacyAnalystNarration} />);
    const tones = /--fp-tone-(?:ok|warn|bad|unknown): [^;]+;\s?/g;
    expect(container.innerHTML.match(tones)).toHaveLength(4);
    const themedRoot = container.firstElementChild as HTMLElement;
    for (const [name,value] of Object.entries(nativeControlTokens)) expect(themedRoot.style.getPropertyValue(name)).toBe(value);
    expect(container.innerHTML.match(nativeControls)).toHaveLength(Object.keys(nativeControlTokens).length);
    expect(container.innerHTML.replace(tones, '').replace(nativeControls, '')).toMatchSnapshot();
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
