/**
 * makeEdge — 7-pattern test matrix.
 */

import { describe, expect, it } from 'vitest';
import { makeEdge } from './makeEdge.js';

// ── 1. Unit ───────────────────────────────────────────────────────

describe('makeEdge — unit', () => {
  it('builds a basic next edge', () => {
    expect(makeEdge('next', 'a', 'b')).toEqual({
      id: 'next:a->b',
      source: 'a',
      target: 'b',
      kind: 'next',
    });
  });

  it('omits the label field when not provided (exactOptionalPropertyTypes-safe)', () => {
    const e = makeEdge('next', 'a', 'b');
    expect('label' in e).toBe(false);
  });

  it('includes the label when provided', () => {
    expect(makeEdge('decision-branch', 'route', 'hi', { label: 'urgent' })).toMatchObject({
      label: 'urgent',
    });
  });
});

// ── 2. Functional ─────────────────────────────────────────────────

describe('makeEdge — functional', () => {
  it.each([
    'next',
    'fork-branch',
    'loop-iteration',
    'decision-branch',
  ] as const)('encodes kind=%s in the id', (kind) => {
    expect(makeEdge(kind, 'x', 'y').id).toBe(`${kind}:x->y`);
  });

  it('disambiguates with #N suffix when n is provided', () => {
    expect(makeEdge('loop-iteration', 'body', 'body', { n: 1 }).id).toBe(
      'loop-iteration:body->body#1',
    );
    expect(makeEdge('loop-iteration', 'body', 'body', { n: 2 }).id).toBe(
      'loop-iteration:body->body#2',
    );
  });
});

// ── 3. Integration ────────────────────────────────────────────────

describe('makeEdge — integration', () => {
  it('many edges with distinct source/target/kind combinations have unique ids', () => {
    const seen = new Set<string>();
    const edges = [
      makeEdge('next', 'a', 'b'),
      makeEdge('next', 'a', 'c'),
      makeEdge('fork-branch', 'a', 'b'),
      makeEdge('decision-branch', 'a', 'b'),
      makeEdge('loop-iteration', 'body', 'body'),
    ];
    for (const e of edges) seen.add(e.id);
    expect(seen.size).toBe(edges.length);
  });
});

// ── 4. Property ───────────────────────────────────────────────────

describe('makeEdge — property', () => {
  it('same (kind, source, target) → same id (deterministic)', () => {
    expect(makeEdge('next', 'a', 'b').id).toBe(makeEdge('next', 'a', 'b').id);
  });

  it('any of (kind, source, target, n) differing changes the id', () => {
    const base = makeEdge('next', 'a', 'b').id;
    expect(makeEdge('next', 'a', 'c').id).not.toBe(base);
    expect(makeEdge('fork-branch', 'a', 'b').id).not.toBe(base);
    expect(makeEdge('next', 'a', 'b', { n: 1 }).id).not.toBe(base);
  });
});

// ── 5. Security ───────────────────────────────────────────────────

describe('makeEdge — security', () => {
  it('arbitrary characters in source/target/label pass through verbatim (caller owns id sanitisation)', () => {
    // Composition layer ensures clean ids; helper trusts its inputs.
    const e = makeEdge('next', 'a:b/c', 'd:e/f', { label: 'x<>y' });
    expect(e.source).toBe('a:b/c');
    expect(e.target).toBe('d:e/f');
    expect(e.label).toBe('x<>y');
  });
});

// ── 6. Performance ────────────────────────────────────────────────

describe('makeEdge — performance', () => {
  it('10k edges built under 50ms', () => {
    const t0 = performance.now();
    for (let i = 0; i < 10_000; i++) makeEdge('next', `a${i}`, `b${i}`);
    expect(performance.now() - t0).toBeLessThan(50);
  });
});

// ── 7. ROI ────────────────────────────────────────────────────────

describe('makeEdge — ROI', () => {
  it('one factory covers all 4 edge kinds without per-kind branches', () => {
    const kinds = ['next', 'fork-branch', 'loop-iteration', 'decision-branch'] as const;
    for (const k of kinds) {
      const e = makeEdge(k, 's', 't');
      expect(e.kind).toBe(k);
    }
  });
});
