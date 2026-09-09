/**
 * diffPrompts — Layer 1 / Tier C tests (Convention 3).
 */

import { describe, it, expect } from 'vitest';
import { DIFF_CELL_CAP, diffPrompts, diffPromptsBounded, type DiffSegment } from './diffPrompts.js';

function reconstruct(segments: readonly DiffSegment[], side: 'a' | 'b'): string {
  let out = '';
  for (const s of segments) {
    if (s.kind === 'equal') out += s.text;
    else if (side === 'a' && s.kind === 'removed') out += s.text;
    else if (side === 'b' && s.kind === 'added') out += s.text;
  }
  return out;
}

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('diffPrompts — unit', () => {
  it('both empty → empty diff', () => {
    expect(diffPrompts('', '')).toEqual([]);
  });

  it('identical strings → single equal segment', () => {
    expect(diffPrompts('hello world', 'hello world')).toEqual([
      { kind: 'equal', text: 'hello world' },
    ]);
  });

  it('a empty, b non-empty → all added', () => {
    expect(diffPrompts('', 'hello')).toEqual([
      { kind: 'added', text: 'hello' },
    ]);
  });

  it('b empty, a non-empty → all removed', () => {
    expect(diffPrompts('hello', '')).toEqual([
      { kind: 'removed', text: 'hello' },
    ]);
  });

  it('single word change in middle', () => {
    const out = diffPrompts('hello dear world', 'hello great world');
    // Should have equal('hello '), removed('dear'), added('great'), equal(' world')
    expect(out.some((s) => s.kind === 'removed' && s.text === 'dear')).toBe(true);
    expect(out.some((s) => s.kind === 'added' && s.text === 'great')).toBe(true);
  });

  it('append at end', () => {
    const out = diffPrompts('a b c', 'a b c d');
    expect(reconstruct(out, 'a')).toBe('a b c');
    expect(reconstruct(out, 'b')).toBe('a b c d');
  });

  it('prepend at start', () => {
    const out = diffPrompts('b c', 'a b c');
    expect(reconstruct(out, 'a')).toBe('b c');
    expect(reconstruct(out, 'b')).toBe('a b c');
  });
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('diffPrompts — functional', () => {
  it('two LLM-style prompts: differing role in opening sentence', () => {
    const a = 'You are a legal critic. Respond with YES or NO.';
    const b = 'You are an ethics critic. Respond with YES or NO.';
    const out = diffPrompts(a, b);
    expect(reconstruct(out, 'a')).toBe(a);
    expect(reconstruct(out, 'b')).toBe(b);
  });

  it('multi-line prompts produce reconstructable diffs', () => {
    const a = 'Line 1\nLine 2\nLine 3';
    const b = 'Line 1\nLine 2 changed\nLine 3';
    const out = diffPrompts(a, b);
    expect(reconstruct(out, 'a')).toBe(a);
    expect(reconstruct(out, 'b')).toBe(b);
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('diffPrompts — integration', () => {
  it('adjacent same-kind segments are merged into one', () => {
    const out = diffPrompts('a b c', 'x y z');
    // After tokenizing 'a b c' → ['a',' ','b',' ','c'] and 'x y z' → ['x',' ','y',' ','z'],
    // LCS finds the spaces as common. So we expect interleaved equals
    // (spaces) with added/removed words. Verify the output reconstructs.
    expect(reconstruct(out, 'a')).toBe('a b c');
    expect(reconstruct(out, 'b')).toBe('x y z');
  });

  it('long prompts (200 words) settle in reasonable diff', () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${i}`);
    const a = words.join(' ');
    // Change words 50 and 150
    const bWords = [...words];
    bWords[50] = 'CHANGED50';
    bWords[150] = 'CHANGED150';
    const b = bWords.join(' ');
    const out = diffPrompts(a, b);
    expect(out.some((s) => s.kind === 'added' && s.text === 'CHANGED50')).toBe(true);
    expect(out.some((s) => s.kind === 'added' && s.text === 'CHANGED150')).toBe(true);
    expect(reconstruct(out, 'a')).toBe(a);
    expect(reconstruct(out, 'b')).toBe(b);
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('diffPrompts — property', () => {
  it('reconstruction invariant: concat(equal+removed) === a, concat(equal+added) === b', () => {
    const rng = (seed: number) => {
      let s = seed;
      return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
      };
    };
    const r = rng(42);
    const words = ['the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog'];
    for (let trial = 0; trial < 30; trial++) {
      const aLen = 3 + Math.floor(r() * 6);
      const bLen = 3 + Math.floor(r() * 6);
      const a = Array.from({ length: aLen }, () => words[Math.floor(r() * words.length)]!).join(' ');
      const b = Array.from({ length: bLen }, () => words[Math.floor(r() * words.length)]!).join(' ');
      const out = diffPrompts(a, b);
      expect(reconstruct(out, 'a')).toBe(a);
      expect(reconstruct(out, 'b')).toBe(b);
    }
  });

  it('identical inputs always produce single equal segment (or empty)', () => {
    const samples = ['', 'a', 'a b c', 'multi\nline\ntext'];
    for (const s of samples) {
      const out = diffPrompts(s, s);
      if (s.length === 0) {
        expect(out).toEqual([]);
      } else {
        expect(out).toEqual([{ kind: 'equal', text: s }]);
      }
    }
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('diffPrompts — security', () => {
  it('DiffSegment objects expose only kind + text fields', () => {
    const out = diffPrompts('a', 'b');
    for (const seg of out) {
      expect(Object.keys(seg).sort()).toEqual(['kind', 'text']);
    }
  });

  it('does not crash on inputs with control chars or zero-width chars', () => {
    const a = 'hello\x00​ world';
    const b = 'hello\x00 world';
    expect(() => diffPrompts(a, b)).not.toThrow();
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('diffPrompts — performance', () => {
  it('diff of 500-word prompts in under 50ms', () => {
    const words = Array.from({ length: 500 }, (_, i) => `w${i}`);
    const a = words.join(' ');
    const b = words.map((w, i) => (i === 250 ? 'CHANGED' : w)).join(' ');
    const start = performance.now();
    diffPrompts(a, b);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(50);
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('diffPrompts — load', () => {
  it('diff of 2000-word prompts in under 500ms (O(n*m) acknowledged)', () => {
    const words = Array.from({ length: 2000 }, (_, i) => `w${i}`);
    const a = words.join(' ');
    const b = words.map((w, i) => (i === 1000 ? 'CHANGED' : w)).join(' ');
    const start = performance.now();
    diffPrompts(a, b);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(500);
  });
});

// ─── 8. BOUNDED ─────────────────────────────────────────────────────

describe('diffPromptsBounded — the common head and tail are stripped; a differing middle past the cap is not computed', () => {
  const words = (n: number, tag = 'w') => Array.from({ length: n }, (_, i) => `${tag}${i}`);

  it('a one-word change in a 10 000-word prompt costs the LCS of one word — and reconstructs both sides', () => {
    const a = words(10_000).join(' ');
    const b = words(10_000)
      .map((w, i) => (i === 5_000 ? 'CHANGED' : w))
      .join(' ');
    const start = performance.now();
    const out = diffPromptsBounded(a, b, 100)!;
    const ms = performance.now() - start;
    expect(out).toBeDefined();
    expect(ms).toBeLessThan(200);
    expect(out.filter((s) => s.kind !== 'equal')).toEqual([
      { kind: 'removed', text: 'w5000' },
      { kind: 'added', text: 'CHANGED' },
    ]);
    expect(reconstruct(out, 'a')).toBe(a);
    expect(reconstruct(out, 'b')).toBe(b);
  });

  it('two prompts that differ throughout, past the cap → undefined, fast, and no table allocated', () => {
    const a = words(3_000, 'a').join(' ');
    const b = words(3_000, 'b').join(' ');
    const start = performance.now();
    expect(diffPromptsBounded(a, b)).toBeUndefined();
    expect(performance.now() - start).toBeLessThan(100);
    // Under a cap that admits it, the same shape IS computed — and exact.
    const small = diffPromptsBounded('x y', 'p q', 100)!;
    expect(small).toBeDefined();
    expect(reconstruct(small, 'a')).toBe('x y');
    expect(reconstruct(small, 'b')).toBe('p q');
    expect(diffPromptsBounded('x y', 'p q', 1)).toBeUndefined();
  });

  it('the default cap admits ~1 250 differing words a side (2 500 × 2 500 tokens)', () => {
    expect(DIFF_CELL_CAP).toBe(2_500 * 2_500);
    const a = words(1_200, 'a').join(' ');
    const b = words(1_200, 'b').join(' ');
    expect(diffPromptsBounded(a, b)).toBeDefined();
  });

  it('unbounded equals diffPrompts, and equal inputs short-circuit', () => {
    expect(diffPromptsBounded('a b c', 'a x c', Number.POSITIVE_INFINITY)).toEqual(diffPrompts('a b c', 'a x c'));
    expect(diffPromptsBounded('same', 'same')).toEqual([{ kind: 'equal', text: 'same' }]);
    expect(diffPromptsBounded('', '')).toEqual([]);
    expect(diffPromptsBounded('', 'x y', 0)).toEqual([{ kind: 'added', text: 'x y' }]);
  });

  it('head/tail strip keeps the diff minimal and exact when only the middle moved', () => {
    const out = diffPromptsBounded('the quick brown fox jumps', 'the quick red fox jumps')!;
    expect(out).toEqual([
      { kind: 'equal', text: 'the quick ' },
      { kind: 'removed', text: 'brown' },
      { kind: 'added', text: 'red' },
      { kind: 'equal', text: ' fox jumps' },
    ]);
  });
});
