/**
 * makeNodeId — 7-pattern test matrix (unit / functional / integration /
 * property / security / performance / ROI). Pure function, so most
 * patterns collapse to short assertions.
 */

import { describe, expect, it } from 'vitest';
import { makeChildNodeId, makeRootNodeId } from './makeNodeId.js';

// ── 1. Unit — basic shape ────────────────────────────────────────

describe('makeRootNodeId — unit', () => {
  it('lower-cases the kind and joins with the id via colon', () => {
    expect(makeRootNodeId('Parallel', 'committee')).toBe('parallel:committee');
    expect(makeRootNodeId('Agent', 'classifier')).toBe('agent:classifier');
    expect(makeRootNodeId('LLMCall', 'oneShot')).toBe('llmcall:oneShot');
  });
});

describe('makeChildNodeId — unit', () => {
  it('joins parent + member with a forward slash', () => {
    expect(makeChildNodeId('parallel:committee', 'legal')).toBe(
      'parallel:committee/legal',
    );
  });
});

// ── 2. Functional — composition (root + child) ───────────────────

describe('makeNodeId — functional', () => {
  it('composes cleanly: root + N children', () => {
    const root = makeRootNodeId('Parallel', 'committee');
    expect(makeChildNodeId(root, 'legal')).toBe('parallel:committee/legal');
    expect(makeChildNodeId(root, 'ethics')).toBe('parallel:committee/ethics');
  });

  it('supports recursive nesting (child of child)', () => {
    const outer = makeRootNodeId('Sequence', 'pipeline');
    const inner = makeChildNodeId(outer, 'parallel-step');
    const leaf = makeChildNodeId(inner, 'legal');
    expect(leaf).toBe('sequence:pipeline/parallel-step/legal');
  });
});

// ── 3. Integration — used across both helpers consistently ───────

describe('makeNodeId — integration', () => {
  it('the same root id can spawn many distinct children without collision', () => {
    const root = makeRootNodeId('Parallel', 'x');
    const seen = new Set<string>();
    for (const m of ['a', 'b', 'c', 'd', 'e']) {
      seen.add(makeChildNodeId(root, m));
    }
    expect(seen.size).toBe(5);
  });
});

// ── 4. Property — determinism + same input → same output ─────────

describe('makeNodeId — property', () => {
  it.each([
    ['Parallel', 'committee'] as const,
    ['Agent', 'react-bot'] as const,
    ['LLMCall', 'one-shot'] as const,
    ['Sequence', 'pipe-1'] as const,
    ['Loop', 'retries'] as const,
    ['Conditional', 'router'] as const,
  ])('deterministic for kind=%s id=%s', (kind, id) => {
    const a = makeRootNodeId(kind, id);
    const b = makeRootNodeId(kind, id);
    expect(a).toBe(b);
  });

  it('distinct kinds with same id produce distinct root ids', () => {
    expect(makeRootNodeId('Parallel', 'x')).not.toBe(makeRootNodeId('Agent', 'x'));
  });
});

// ── 5. Security — hostile inputs don't crash the helper ──────────

describe('makeNodeId — security', () => {
  it('empty member id produces an unambiguous trailing slash (caller bug, observable)', () => {
    // The library doesn't enforce non-empty member ids — that's the
    // composition's job (e.g., `Parallel.branch()` rejects duplicates
    // and slash characters). This helper just concatenates. The result
    // is detectable by the test that it ends with `/`, surfacing the
    // upstream bug rather than papering over it.
    expect(makeChildNodeId('parallel:committee', '')).toBe('parallel:committee/');
  });

  it('arbitrary characters in id (incl. colons + slashes) are passed through verbatim', () => {
    // Composition-level validation (in Parallel.branch, etc.) already
    // rejects bad ids; this helper trusts its input.
    expect(makeRootNodeId('Parallel', 'a:b/c')).toBe('parallel:a:b/c');
  });
});

// ── 6. Performance — sub-µs even for large fan-out ───────────────

describe('makeNodeId — performance', () => {
  it('10k makeChildNodeId calls complete under 50ms', () => {
    const root = makeRootNodeId('Parallel', 'committee');
    const t0 = performance.now();
    for (let i = 0; i < 10_000; i++) makeChildNodeId(root, `m${i}`);
    expect(performance.now() - t0).toBeLessThan(50);
  });
});

// ── 7. ROI — same helper across all 6 composition kinds ──────────

describe('makeNodeId — ROI', () => {
  it('one helper covers all 6 composition kinds without per-kind branches', () => {
    const kinds = ['Parallel', 'Agent', 'LLMCall', 'Sequence', 'Loop', 'Conditional'] as const;
    for (const k of kinds) {
      const root = makeRootNodeId(k, 'x');
      expect(root).toMatch(/^[a-z]+:x$/);
    }
  });
});
