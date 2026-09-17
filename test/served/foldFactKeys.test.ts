/**
 * `FOLD_FACT_KEYS` — the list, the README that counts it, and the Held band
 * that draws it, held in step.
 *
 * WHY. 0.61.0 added `findingsLedger` to the list and the Served-graph README
 * kept saying "the six `FOLD_FACT_KEYS`" — nothing read the count back
 * against the list, so the suite stayed green over a false sentence. This
 * file is the pin: the list is spelled out here by name, the README's HELD
 * item must count it in words and name every key, and `servedGraphAt ·
 * heldNodes` must draw exactly one node per key on a real fixture.
 *
 * Test types: Unit (the list) · Doc-truth (the README's count and names) ·
 * Law (one Held node per key; the ledger key is `not-on-record` on an
 * unarmed run and `reconstructed` on the armed one — omit-never-deny).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { FOLD_FACT_KEYS } from '../../src/core/served/index.js';
import { graphAt, load, turnStops } from './helpers.js';

const README = join(dirname(fileURLToPath(import.meta.url)), '../../src/core/served/README.md');

/** The count as the README spells it — a word, the house style for a small number. */
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'] as const;

/** The README's HELD item — from its heading to the SERVED item's. */
function heldItemOf(readme: string): string {
  const start = readme.indexOf('1. **HELD**');
  const end = readme.indexOf('2. **SERVED**', start);
  if (start < 0 || end < 0) throw new Error('foldFactKeys: the Served-graph README has no HELD / SERVED items');
  return readme.slice(start, end);
}

describe('FOLD_FACT_KEYS — the list', () => {
  it('is the seven keys, by name and in order (a change here is a change to the Held band and its README)', () => {
    expect([...FOLD_FACT_KEYS]).toEqual([
      'iteration',
      'currentSkillId',
      'stepPointer',
      'mapEngagement',
      'activeInjections',
      'hiddenSkillIds',
      'findingsLedger',
    ]);
    expect(Object.isFrozen(FOLD_FACT_KEYS)).toBe(true);
  });
});

describe('FOLD_FACT_KEYS — the README counts what the list holds', () => {
  const held = heldItemOf(readFileSync(README, 'utf8'));

  it('the HELD item counts the keys in words, and the word is the list’s length', () => {
    const word = NUMBER_WORDS[FOLD_FACT_KEYS.length];
    expect(word).toBeDefined();
    expect(held).toContain(`The ${word} \`FOLD_FACT_KEYS\``);
    // No other count word stands in front of the name.
    for (const other of NUMBER_WORDS) {
      if (other === word) continue;
      expect(held).not.toContain(`The ${other} \`FOLD_FACT_KEYS\``);
    }
  });

  it('the HELD item names every key in the list', () => {
    for (const key of FOLD_FACT_KEYS) expect(held).toContain(`\`${key}\``);
  });
});

describe('FOLD_FACT_KEYS — the Held band draws one node per key, on the real fixtures', () => {
  const keyed = (held: readonly { key: string; status: string; value?: unknown }[]) =>
    held.filter((h) => (FOLD_FACT_KEYS as readonly string[]).includes(h.key));

  it('an unarmed run: every key has a node, and `findingsLedger` is drawn as not-on-record — never omitted', () => {
    const f = load('flat-dynamic-tools');
    const stops = turnStops(f, 'flat-dynamic-tools');
    const { graph } = graphAt(f, stops[stops.length - 1]!);
    const nodes = keyed(graph.held);
    expect(nodes.map((h) => h.key)).toEqual([...FOLD_FACT_KEYS]);
    const ledger = nodes.find((h) => h.key === 'findingsLedger')!;
    expect(ledger.status).toBe('not-on-record');
    expect(ledger.value).toBeUndefined();
  });

  it('the armed run at its answer: `findingsLedger` is reconstructed and holds the rows the record committed', () => {
    const f = load('findings-ledger');
    const stops = turnStops(f, 'findings-ledger');
    const { graph, fold } = graphAt(f, stops[stops.length - 1]!);
    const nodes = keyed(graph.held);
    expect(nodes).toHaveLength(FOLD_FACT_KEYS.length);
    const ledger = nodes.find((h) => h.key === 'findingsLedger')!;
    expect(ledger.status).toBe('reconstructed');
    expect(ledger.value).toBe(fold.findingsLedger);
    expect(Array.isArray(ledger.value)).toBe(true);
  });
});
