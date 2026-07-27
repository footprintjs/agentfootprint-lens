/**
 * `<Lens theme={{ mode }}>` — one field, every surface, every view.
 *
 * `mode` stamps eui's light/dark preset, which covers everything eui draws.
 * The rest of Lens paints from tokens eui's presets have no cousin for — the
 * elevated card surface its own panels sit on, the edge colours, the
 * injection-source chips — so under `mode: 'light'` those stayed on their DARK
 * hardcoded fallbacks while the chart around them went light.
 *
 * These pin the three things that fix has to get right:
 *   1. the missing tokens are stamped at all;
 *   2. they are stamped in the `--fp-*` tier, so a consumer's `--lens-*` on an
 *      ancestor still outranks them (the documented resolution order);
 *   3. the stamp is at the LENS ROOT, so `view="analyst"` and `view="user"`
 *      get it too — they render the summary card and the transport, and used
 *      to get none of it.
 *
 * jsdom does not resolve `var()` chains, so these assert the MECHANISM (which
 * custom property is set, and where) rather than a computed colour.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { coolLight } from 'footprint-explainable-ui';
import { lensRecorder } from '../core/LensRecorder.js';
import { RAW_DEFAULTS, MODE_PALETTES } from './theme/index.js';
import { Lens, type LensView } from './Lens.js';

const ELEVATED_FP = '--fp-bg-elevated';
const ELEVATED_LENS = '--lens-bg-elevated';

/** Elements whose inline style paints them with the elevated surface token. */
function elevatedSurfaces(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[style]')].filter((el) =>
    /var\(\s*--lens-bg-elevated/.test(el.getAttribute('style') ?? ''),
  );
}

/** The element the mode switch stamped a given custom property on, if any. */
function stampRoot(container: HTMLElement, prop: string): HTMLElement | undefined {
  return [...container.querySelectorAll<HTMLElement>('[style]')].find(
    (el) => el.style.getPropertyValue(prop) !== '',
  );
}

function renderLens(mode?: 'light' | 'dark', view: LensView = 'engineer'): HTMLElement {
  const recorder = lensRecorder();
  const { container } = render(
    <Lens recorder={recorder} view={view} {...(mode ? { theme: { mode } } : {})} />,
  );
  return container;
}

describe('<Lens theme={{ mode }}> — elevated surfaces', () => {
  it('stamps a LIGHT elevated surface under mode: light', () => {
    const root = stampRoot(renderLens('light'), ELEVATED_FP);

    expect(root).toBeDefined();
    expect(root!.style.getPropertyValue(ELEVATED_FP)).toBe(
      MODE_PALETTES.light['--fp-bg-elevated'],
    );
    // The bug in one line: it used to fall through to the dark hardcoded value.
    expect(root!.style.getPropertyValue(ELEVATED_FP)).not.toBe(RAW_DEFAULTS.bgElevated);
    // …and it is a genuinely light surface, not eui's light bg re-used blindly.
    expect(root!.style.getPropertyValue('--fp-bg-primary')).toBe(coolLight.colors!.bgPrimary);
  });

  it('stamps the dark elevated surface under mode: dark', () => {
    const root = stampRoot(renderLens('dark'), ELEVATED_FP);

    expect(root).toBeDefined();
    expect(root!.style.getPropertyValue(ELEVATED_FP)).toBe(RAW_DEFAULTS.bgElevated);
  });

  it('puts the stamp where the panels resolve it — on their ancestor', () => {
    const container = renderLens('light');
    const root = stampRoot(container, ELEVATED_FP);
    const surfaces = elevatedSurfaces(container);

    expect(root).toBeDefined();
    expect(surfaces.length).toBeGreaterThan(0);
    for (const surface of surfaces) {
      expect(root!.contains(surface)).toBe(true);
    }
  });

  it('stamps nothing when the consumer passes no theme', () => {
    // No `theme` prop = the consumer's own `--lens-*` / `--fp-*` sheet owns the
    // palette; the mode switch must not reach in and override it.
    expect(stampRoot(renderLens(), ELEVATED_FP)).toBeUndefined();
  });
});

describe('<Lens theme={{ mode }}> — the consumer still wins', () => {
  it('never stamps a `--lens-*` token, so an ancestor override outranks it', () => {
    // FAILS ON THE OLD BEHAVIOUR: the mode switch stamped `--lens-bg-elevated`
    // inline on the chart wrapper. An inline custom property beats the same
    // property inherited from any ancestor, so a consumer who set
    // `--lens-bg-elevated` on a parent (the documented v0.13+ theming path) AND
    // passed `theme={{ mode }}` silently lost their override.
    const recorder = lensRecorder();
    const { container } = render(
      <div style={{ [ELEVATED_LENS]: '#ff00ff' } as React.CSSProperties}>
        <Lens recorder={recorder} view="engineer" theme={{ mode: 'light' }} />
      </div>,
    );

    const ancestor = container.firstElementChild as HTMLElement;
    expect(ancestor.style.getPropertyValue(ELEVATED_LENS)).toBe('#ff00ff');
    // Nothing Lens renders re-declares it, at any depth.
    const shadowed = [...container.querySelectorAll<HTMLElement>('[style]')].filter(
      (el) => el !== ancestor && el.style.getPropertyValue(ELEVATED_LENS) !== '',
    );
    expect(shadowed).toEqual([]);
    // The panels still read through the chain, so the ancestor's value is what
    // resolves: `var(--lens-bg-elevated, var(--fp-bg-elevated, …))`.
    expect(elevatedSurfaces(container).length).toBeGreaterThan(0);
  });
});

describe('<Lens theme={{ mode }}> — all three views', () => {
  it.each<LensView>(['engineer', 'analyst', 'user'])(
    'reaches view="%s"',
    (view) => {
      // FAILS ON THE OLD BEHAVIOUR for analyst and user: `chartThemeVars` was
      // computed and applied INSIDE EngineerView, and `Lens` returned the other
      // two before ever reaching it — so `theme={{ mode: 'light' }}` rendered
      // them fully dark, with no error.
      const root = stampRoot(renderLens('light', view), ELEVATED_FP);

      expect(root).toBeDefined();
      expect(root!.style.getPropertyValue(ELEVATED_FP)).toBe(
        MODE_PALETTES.light['--fp-bg-elevated'],
      );
    },
  );
});

describe('<Lens theme={{ mode }}> — the lens-only palettes follow too', () => {
  it('re-themes edge kinds and injection chips, which no eui preset covers', () => {
    // These have no `--fp-*` cousin in eui, so `mode: 'light'` structurally
    // could not reach them: dark-tuned edge colours on a white chart.
    const light = stampRoot(renderLens('light'), ELEVATED_FP)!;
    const dark = stampRoot(renderLens('dark'), ELEVATED_FP)!;

    expect(light.style.getPropertyValue('--fp-edge-tool')).toBe(
      MODE_PALETTES.light['--fp-edge-tool'],
    );
    expect(light.style.getPropertyValue('--fp-src-skill')).toBe(
      MODE_PALETTES.light['--fp-src-skill'],
    );
    // Dark mode is the status quo exactly — nothing moves for existing users.
    expect(dark.style.getPropertyValue('--fp-edge-tool')).toBe(RAW_DEFAULTS.edgeTool);
    expect(dark.style.getPropertyValue('--fp-src-skill')).toBe(RAW_DEFAULTS.srcSkill);
    // And they really are different palettes.
    expect(MODE_PALETTES.light['--fp-edge-tool']).not.toBe(RAW_DEFAULTS.edgeTool);
  });
});
