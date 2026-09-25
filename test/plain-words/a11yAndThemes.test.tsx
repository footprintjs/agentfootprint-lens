/**
 * <PlainWords> — accessibility (design §5.5) and both themes (§5.4).
 *
 * A11y: a labelled region, or a `tabpanel` labelled by the host's tab; `h2`
 * "In one line"; an `h3` per row; lines in lists; every "show me" a real
 * button with `aria-expanded` + `aria-controls`; focus to the pane's heading
 * when the host opens it from Explain. Themes: standalone, the pane stamps the
 * lens palette for its mode — including the four tone tokens — and a tone is
 * always a word too.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { PlainWords, PLAIN_WORDS_LABELS as LABELS } from '../../src/react/index.js';
import { MODE_PALETTES, RAW_DEFAULTS } from '../../src/react/theme/index.js';
import { loadReply, tamperedReply } from './helpers.js';

const { account, shown } = loadReply('A');

describe('<PlainWords> accessibility', () => {
  it('standalone: a region named "In plain words"', () => {
    render(<PlainWords account={account} shown={shown} />);
    expect(screen.getByRole('region', { name: LABELS.pane })).toBe(screen.getByTestId('plain-words'));
  });

  it('under a host tab: role="tabpanel" labelled by that tab', () => {
    render(
      <>
        <button role="tab" id="tab-plain" aria-selected="true">
          In plain words
        </button>
        <PlainWords account={account} shown={shown} labelledBy="tab-plain" />
      </>,
    );
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('aria-labelledby', 'tab-plain');
    expect(panel).toHaveAccessibleName('In plain words');
  });

  it('headings: h2 "In one line", then one h3 per row, each naming its section', () => {
    render(<PlainWords account={account} shown={shown} />);
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(LABELS.inOneLine);
    const h3 = screen.getAllByRole('heading', { level: 3 });
    expect(h3).toHaveLength(7);
    for (const row of screen.getAllByTestId('plain-row')) {
      expect(row).toHaveAccessibleName(within(row).getByRole('heading', { level: 3 }).textContent!);
    }
  });

  it('lines are list items; items are a nested list', () => {
    render(<PlainWords account={account} shown={shown} />);
    for (const line of screen.getAllByTestId('plain-line')) expect(line.tagName).toBe('LI');
    for (const item of screen.getAllByTestId('plain-item')) {
      expect(item.tagName).toBe('LI');
      expect(item.parentElement!.tagName).toBe('UL');
      expect(item.parentElement!.closest('li')).not.toBeNull();
    }
  });

  it('every "show me" is a button whose aria-controls names an element that exists', () => {
    render(<PlainWords account={account} shown={shown} />);
    const buttons = screen.getAllByRole('button', { name: LABELS.showMe });
    expect(buttons.length).toBeGreaterThan(20);
    const ids = new Set<string>();
    for (const b of buttons) {
      expect(b).toHaveAttribute('aria-expanded', 'false');
      const id = b.getAttribute('aria-controls')!;
      expect(document.getElementById(id)).not.toBeNull();
      ids.add(id);
    }
    expect(ids.size).toBe(buttons.length);
  });

  it('focusOnMount moves focus to the pane’s heading (opened from Explain)', () => {
    render(<PlainWords account={account} shown={shown} focusOnMount />);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2 }));
  });

  it('without focusOnMount, focus stays where it was', () => {
    render(<PlainWords account={account} shown={shown} />);
    expect(document.activeElement).toBe(document.body);
  });
});

describe('<PlainWords> both themes', () => {
  it('light: stamps the light palette, tones included', () => {
    render(<PlainWords account={account} shown={shown} theme={{ mode: 'light' }} />);
    const root = screen.getByTestId('plain-words');
    for (const [name, value] of Object.entries(MODE_PALETTES.light)) {
      expect(root.style.getPropertyValue(name), name).toBe(value);
    }
    expect(root.style.getPropertyValue('--fp-tone-warn')).toBe('#b45309');
  });

  it('dark: stamps the dark palette — the shipped defaults', () => {
    render(<PlainWords account={account} shown={shown} theme={{ mode: 'dark' }} />);
    const root = screen.getByTestId('plain-words');
    expect(root.style.getPropertyValue('--fp-tone-warn')).toBe(RAW_DEFAULTS.toneWarn);
    expect(root.style.getPropertyValue('--fp-tone-ok')).toBe(RAW_DEFAULTS.toneOk);
  });

  it('no theme: stamps nothing, so a host’s tokens (or `<Lens theme>`) govern', () => {
    render(<PlainWords account={account} shown={shown} />);
    expect(screen.getByTestId('plain-words').getAttribute('style')).toBeNull();
  });

  it('every tone is a word as well as a colour', () => {
    const tones = ['ok', 'warn', 'bad', 'unknown'] as const;
    const words = [LABELS.toneOk, LABELS.toneWarn, LABELS.toneBad, LABELS.toneUnknown];
    tones.forEach((tone, i) => {
      const reply = tamperedReply((r) => {
        r.account.summary.tone = tone;
      });
      const { unmount } = render(<PlainWords account={reply.account} shown={reply.shown} />);
      const one = screen.getByTestId('plain-one-liner');
      expect(one.dataset.tone).toBe(tone);
      expect(within(one).getByTestId('plain-tone')).toHaveTextContent(words[i]!);
      unmount();
    });
    // …and a chip's tone rides beside the library's own chip word.
    render(<PlainWords account={account} shown={shown} />);
    const undeclared = document.querySelector('[data-mark="undeclared-empty"]')!;
    expect(undeclared).toHaveAttribute('data-tone', 'warn');
    expect(undeclared).toHaveClass('lens-plain-chip--warn');
    expect(undeclared).toHaveTextContent('undeclared empty');
  });
});
