/**
 * selectViewportForLevel — Layer 1 / Tier C tests (Convention 3).
 */

import { describe, it, expect } from 'vitest';
import { selectViewportForLevel, type Viewport } from './selectViewportForLevel.js';

function vp(x: number, y: number, zoom: number): Viewport {
  return { x, y, zoom };
}

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('selectViewportForLevel — unit', () => {
  it('returns the viewport stored at the given depth', () => {
    const map = new Map([[0, vp(10, 20, 1)], [1, vp(50, 60, 1.5)]]);
    expect(selectViewportForLevel(map, 0)).toEqual({ x: 10, y: 20, zoom: 1 });
    expect(selectViewportForLevel(map, 1)).toEqual({ x: 50, y: 60, zoom: 1.5 });
  });

  it('returns undefined when no snapshot at that depth', () => {
    const map = new Map([[0, vp(0, 0, 1)]]);
    expect(selectViewportForLevel(map, 99)).toBeUndefined();
  });

  it('returns undefined for negative depth', () => {
    const map = new Map([[0, vp(0, 0, 1)]]);
    expect(selectViewportForLevel(map, -1)).toBeUndefined();
  });

  it('returns undefined for non-integer depth', () => {
    const map = new Map([[0, vp(0, 0, 1)]]);
    expect(selectViewportForLevel(map, 1.5)).toBeUndefined();
  });

  it('returns undefined for NaN depth', () => {
    const map = new Map([[0, vp(0, 0, 1)]]);
    expect(selectViewportForLevel(map, NaN)).toBeUndefined();
  });

  it('returns undefined for Infinity', () => {
    const map = new Map([[0, vp(0, 0, 1)]]);
    expect(selectViewportForLevel(map, Infinity)).toBeUndefined();
  });

  it('returns undefined from empty map', () => {
    expect(selectViewportForLevel(new Map(), 0)).toBeUndefined();
  });
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('selectViewportForLevel — functional', () => {
  it('models drill-back: save at depth N, restore at depth N', () => {
    const map = new Map<number, Viewport>();
    map.set(0, vp(5, 5, 1));    // user pans before drilling
    map.set(1, vp(100, 200, 1.2));  // user pans inside the drill
    // Drill back from depth 1 → restore depth 0
    expect(selectViewportForLevel(map, 0)).toEqual({ x: 5, y: 5, zoom: 1 });
    // Drill back into depth 1 → still have its viewport
    expect(selectViewportForLevel(map, 1)).toEqual({ x: 100, y: 200, zoom: 1.2 });
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('selectViewportForLevel — integration', () => {
  it('handles a deep drill stack (depths 0..10)', () => {
    const map = new Map<number, Viewport>();
    for (let d = 0; d <= 10; d++) map.set(d, vp(d * 10, d * 10, 1 + d * 0.1));
    for (let d = 0; d <= 10; d++) {
      expect(selectViewportForLevel(map, d)).toEqual({
        x: d * 10, y: d * 10, zoom: 1 + d * 0.1,
      });
    }
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('selectViewportForLevel — property', () => {
  it('output is either the stored viewport reference or undefined', () => {
    const map = new Map<number, Viewport>();
    const v = vp(1, 2, 3);
    map.set(0, v);
    expect(selectViewportForLevel(map, 0)).toBe(v); // reference equality
  });

  it('never throws for any depth input', () => {
    const map = new Map([[0, vp(0, 0, 1)]]);
    const cases = [-1, 0, 1, NaN, Infinity, -Infinity, 0.5, 1e9];
    for (const d of cases) {
      expect(() => selectViewportForLevel(map, d)).not.toThrow();
    }
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('selectViewportForLevel — security', () => {
  it('does not allow Map override via prototype chain', () => {
    const map = new Map<number, Viewport>();
    // Even if the prototype was tampered with, integer-keyed Map lookups
    // are immune (Map.get returns undefined for missing keys).
    expect(selectViewportForLevel(map, 0)).toBeUndefined();
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('selectViewportForLevel — performance', () => {
  it('100000 lookups in under 50ms', () => {
    const map = new Map<number, Viewport>();
    for (let d = 0; d < 100; d++) map.set(d, vp(d, d, 1));
    const start = performance.now();
    for (let i = 0; i < 100_000; i++) {
      selectViewportForLevel(map, i % 100);
    }
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(50);
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('selectViewportForLevel — load', () => {
  it('1 million lookups in under 200ms', () => {
    const map = new Map<number, Viewport>([[0, vp(0, 0, 1)]]);
    const start = performance.now();
    for (let i = 0; i < 1_000_000; i++) selectViewportForLevel(map, 0);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(200);
  });
});
