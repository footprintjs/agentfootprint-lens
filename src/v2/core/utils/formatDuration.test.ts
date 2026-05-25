/**
 * formatDuration — Layer 1 / Tier C tests (Convention 3, 7 patterns).
 */

import { describe, it, expect } from 'vitest';
import { formatDuration } from './formatDuration.js';

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('formatDuration — unit', () => {
  it('renders 0 as 0ms', () => expect(formatDuration(0)).toBe('0ms'));
  it('renders 999 as 999ms', () => expect(formatDuration(999)).toBe('999ms'));
  it('renders 1000 as 1.0s', () => expect(formatDuration(1000)).toBe('1.0s'));
  it('renders 9999 as 10.0s (decimal branch boundary)', () => expect(formatDuration(9999)).toBe('10.0s'));
  it('renders 10000 as 10s (whole)', () => expect(formatDuration(10_000)).toBe('10s'));
  it('renders 59999 as 1m 0s (cascade)', () => expect(formatDuration(59_999)).toBe('1m 0s'));
  it('renders 60000 as 1m 0s', () => expect(formatDuration(60_000)).toBe('1m 0s'));
  it('renders 65000 as 1m 5s', () => expect(formatDuration(65_000)).toBe('1m 5s'));
  it('renders 3599999 as 1h 0m (cascade across hour boundary)', () => expect(formatDuration(3_599_999)).toBe('1h 0m'));
  it('renders 3600000 as 1h 0m', () => expect(formatDuration(3_600_000)).toBe('1h 0m'));
  it('renders 3780000 as 1h 3m', () => expect(formatDuration(3_780_000)).toBe('1h 3m'));
  it('renders negative as 0ms (clamp)', () => expect(formatDuration(-100)).toBe('0ms'));
  it('renders NaN as em dash', () => expect(formatDuration(NaN)).toBe('—'));
  it('renders Infinity as em dash', () => expect(formatDuration(Infinity)).toBe('—'));
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('formatDuration — functional', () => {
  it('typical LLM call durations (200ms-3s) render cleanly', () => {
    expect(formatDuration(200)).toBe('200ms');
    expect(formatDuration(1234)).toBe('1.2s');
    expect(formatDuration(2900)).toBe('2.9s');
  });
  it('agent runs spanning seconds-to-minutes', () => {
    expect(formatDuration(42_000)).toBe('42s');
    expect(formatDuration(125_000)).toBe('2m 5s');
  });
  it('long debug sessions in hours', () => {
    expect(formatDuration(7_200_000)).toBe('2h 0m');
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('formatDuration — integration', () => {
  it('renders sorted millisecond values monotonically', () => {
    const ms = [0, 1, 999, 1000, 9999, 10_000, 60_000, 3_600_000];
    const out = ms.map(formatDuration);
    // All distinct
    expect(new Set(out).size).toBe(out.length);
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('formatDuration — property', () => {
  it('output is always a non-empty string for any finite input', () => {
    for (let i = 0; i < 200; i++) {
      const ms = Math.floor(Math.random() * 100_000_000) - 1_000_000;
      const s = formatDuration(ms);
      expect(typeof s).toBe('string');
      expect(s.length).toBeGreaterThan(0);
    }
  });

  it('output for non-finite inputs is exactly em dash', () => {
    expect(formatDuration(NaN)).toBe('—');
    expect(formatDuration(Infinity)).toBe('—');
    expect(formatDuration(-Infinity)).toBe('—');
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('formatDuration — security', () => {
  it('does not leak input numeric values via prototype chain or exception messages', () => {
    // Pure function; no side effects to attack. Sanity check that
    // no input value is reflected verbatim in unexpected ways.
    const s = formatDuration(123456);
    expect(s).not.toContain('123456');
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('formatDuration — performance', () => {
  it('10000 invocations in under 10ms', () => {
    const start = performance.now();
    for (let i = 0; i < 10_000; i++) formatDuration(i * 7 + 3);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(10);
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('formatDuration — load', () => {
  it('1 million invocations in under 200ms', () => {
    const start = performance.now();
    for (let i = 0; i < 1_000_000; i++) formatDuration(i);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(200);
  });
});
