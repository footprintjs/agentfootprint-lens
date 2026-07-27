/**
 * Theme-token coverage — the drift catcher (mirrors eui's
 * `test/unit/themeTokens.test.ts`).
 *
 * A component can only be themed through variables that actually resolve to
 * something. When a component reads `var(--lens-agent-color-3)` with NO
 * fallback and nothing defines it, that declaration is invalid and the element
 * paints nothing — which is exactly how the agent legend's swatches shipped
 * blank while the JSDoc called it "theme-portable".
 *
 * So this doesn't hand-list tokens: it GREPS the source for every `--lens-*`
 * read and asserts each one is either defined by `T` / the shipped stylesheet,
 * or carries an inline fallback. Add a component that reads a new `--lens-*`
 * and this fails until the token is real.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { T, RAW_DEFAULTS, MODE_PALETTES, AGENT_COLORS, agentColor } from './tokens.js';
import { LENS_STYLESHEET } from '../lensStyles.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) return [];
    return [full];
  });
}

/**
 * Every `var(--lens-…)` a component writes DIRECTLY, and whether every one of
 * those reads supplies its own fallback (`var(--lens-x, #hex)` vs the bare
 * `var(--lens-x)`).
 *
 * Most of Lens paints through `T`, whose chain always ends in a literal. The
 * dangerous reads are the hand-written ones that bypass it — an indexed family
 * built in a template (`--lens-agent-color-${i}`) is the shape that shipped
 * blank, so a template hole normalises to `…-N` and is checked like any other.
 */
function directReads(): Map<string, { files: string[]; everyReadHasFallback: boolean }> {
  const found = new Map<string, { files: string[]; everyReadHasFallback: boolean }>();
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/var\(\s*(--lens-[^,)]*?)\s*([,)])/g)) {
      const name = match[1]!.replace(/\$\{[^}]*\}/g, 'N');
      const hasFallback = match[2] === ',';
      const rel = file.slice(SRC.length + 1);
      const entry = found.get(name);
      if (entry) {
        if (!entry.files.includes(rel)) entry.files.push(rel);
        entry.everyReadHasFallback &&= hasFallback;
      } else {
        found.set(name, { files: [rel], everyReadHasFallback: hasFallback });
      }
    }
  }
  return found;
}

/** Every `--lens-*` name the library actually emits, from `T` and the sheet. */
function emittedTokens(): Set<string> {
  const names = new Set<string>();
  const sources = [...Object.values(T), LENS_STYLESHEET, agentColor(0)];
  for (const value of sources) {
    for (const match of value.matchAll(/var\(\s*(--lens-[a-zA-Z0-9-]+)/g)) names.add(match[1]!);
  }
  return names;
}

describe('lens theme tokens — every `--lens-*` a component reads resolves', () => {
  const reads = directReads();
  const emitted = emittedTokens();

  it('the scan found the tokens (guards against a silently empty pass)', () => {
    expect(emitted.size).toBeGreaterThan(15);
    expect([...emitted]).toContain('--lens-bg-elevated');
    expect([...reads.keys()]).toContain('--lens-agent-color-N');
  });

  it('every hand-written read carries its own fallback', () => {
    // FAILS ON THE OLD BEHAVIOUR: the agent legend read
    // `var(--lens-agent-color-${idx})` with nothing behind it, so the swatch
    // background was an invalid declaration and painted nothing at all.
    const orphans = [...reads.entries()]
      .filter(([name, info]) => !emitted.has(name) && !info.everyReadHasFallback)
      .map(([name, info]) => `${name} (read in ${info.files.join(', ')})`);
    expect(
      orphans,
      'these paint NOTHING unless the consumer happens to define them',
    ).toEqual([]);
  });

  it('every token `T` resolves has a raw fallback baked into the chain', () => {
    for (const [key, value] of Object.entries(T)) {
      // `var(--lens-x, var(--fp-x, FALLBACK))` — the innermost value is a
      // literal, never another `var()`, or the chain can bottom out at nothing.
      expect(value, key).toMatch(/var\(--lens-[a-z0-9-]+, var\(--fp-[a-z0-9-]+, [^)]+\)\)/);
    }
  });
});

describe('lens theme tokens — the mode palettes are complete and real', () => {
  it('light and dark stamp the same token set', () => {
    expect(Object.keys(MODE_PALETTES.light).sort()).toEqual(
      Object.keys(MODE_PALETTES.dark).sort(),
    );
  });

  it('every stamped token is a `--fp-*`, never a `--lens-*`', () => {
    // The `--lens-*` tier belongs to the consumer. A mode switch that stamped
    // it would silently outrank an ancestor's override.
    for (const palette of Object.values(MODE_PALETTES)) {
      for (const name of Object.keys(palette)) {
        expect(name.startsWith('--fp-'), name).toBe(true);
      }
    }
  });

  it('every stamped token is one `T` actually reads', () => {
    const fpNames = new Set<string>();
    for (const value of Object.values(T)) {
      for (const match of value.matchAll(/var\(\s*(--fp-[a-zA-Z0-9-]+)/g)) fpNames.add(match[1]!);
    }
    for (const name of Object.keys(MODE_PALETTES.dark)) {
      expect(fpNames.has(name), `${name} is stamped but nothing reads it`).toBe(true);
    }
  });

  it('light really is a different palette from dark', () => {
    const same = Object.keys(MODE_PALETTES.dark).filter(
      (name) => MODE_PALETTES.dark[name] === MODE_PALETTES.light[name],
    );
    expect(same, 'these tokens stay dark under mode: light').toEqual([]);
  });

  it('dark keeps the shipped defaults exactly — nothing moves for existing users', () => {
    expect(MODE_PALETTES.dark['--fp-bg-elevated']).toBe(RAW_DEFAULTS.bgElevated);
    expect(MODE_PALETTES.dark['--fp-edge-user']).toBe(RAW_DEFAULTS.edgeUser);
    expect(MODE_PALETTES.dark['--fp-src-rag']).toBe(RAW_DEFAULTS.srcRag);
  });
});

describe('lens theme tokens — the agent swatch palette', () => {
  it('gives every index a colour, wrapping past the eighth agent', () => {
    // FAILS ON THE OLD BEHAVIOUR: the strip read `var(--lens-agent-color-N)`
    // with no fallback, so the swatch background was an invalid declaration and
    // painted nothing at all.
    for (let i = 0; i < 20; i++) {
      expect(agentColor(i)).toMatch(/^var\(--lens-agent-color-\d+, #[0-9a-f]{6}\)$/);
    }
    expect(agentColor(0)).toContain(AGENT_COLORS[0]);
    expect(agentColor(AGENT_COLORS.length)).toContain(AGENT_COLORS[0]);
  });

  it('the colours are distinct — the strip exists to tell agents apart', () => {
    expect(new Set(AGENT_COLORS).size).toBe(AGENT_COLORS.length);
  });
});

describe('the shipped stylesheet covers the class-styled components', () => {
  /**
   * Every `lens-*` class name a component puts in a `className`. Read from
   * quoted strings in the `.tsx` files only — a class name is always the whole
   * (or the leading part of the) string it appears in, which keeps prose in
   * comments out of the scan.
   */
  function classNamesUsed(): Set<string> {
    const names = new Set<string>();
    for (const file of sourceFiles(SRC).filter((f) => f.endsWith('.tsx'))) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/(['"`])(\s?lens-[^'"`]*)\1/g)) {
        for (const word of match[2]!.split(/\s+/)) {
          if (/^lens-[a-zA-Z0-9_-]+$/.test(word)) names.add(word);
        }
      }
    }
    return names;
  }

  /** Is `name` styled — as a class rule, or as a keyframes name? */
  function isDefined(name: string): boolean {
    const boundary = '(?![a-zA-Z0-9_-])';
    return (
      new RegExp(`\\.${name}${boundary}`).test(LENS_STYLESHEET) ||
      new RegExp(`@keyframes ${name}${boundary}`).test(LENS_STYLESHEET)
    );
  }

  it('defines a rule for every class the components render', () => {
    // FAILS ON THE OLD BEHAVIOUR: `find src dist -name '*.css'` returned
    // nothing, so all eight class-styled components — `<Replay>` among them —
    // rendered completely unstyled.
    const used = [...classNamesUsed()];
    expect(used.length).toBeGreaterThan(20);
    expect(used.filter((name) => !isDefined(name))).toEqual([]);
  });

  it('paints through the token chain, so one sheet themes both halves of Lens', () => {
    // Every colour comes from `T` (i.e. lives inside a `var()` chain). A raw
    // hex sitting outside one is a value `theme={{ mode }}` can never reach —
    // exactly the hole this stylesheet exists to close. `#ffffff` on the
    // current-iteration pill is the one deliberate constant: it is contrast
    // against the accent fill, not a themeable surface.
    const outsideVars = LENS_STYLESHEET.replace(/var\((?:[^()]|\([^()]*\))*\)/g, '');
    const stray = [...outsideVars.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    expect(stray, 'colours no token can reach').toEqual(['#ffffff']);
    expect(LENS_STYLESHEET).toContain('var(--lens-bg-elevated');
  });
});
