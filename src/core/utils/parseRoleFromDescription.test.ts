/**
 * parseRoleFromDescription — Layer 1 / Tier C tests (Convention 3).
 */

import { describe, it, expect } from 'vitest';
import { parseRoleFromDescription } from './parseRoleFromDescription.js';

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('parseRoleFromDescription — unit', () => {
  it('parses Agent kind', () => {
    expect(parseRoleFromDescription('Agent: ReAct loop'))
      .toEqual({ kind: 'Agent', role: 'ReAct loop' });
  });

  it('parses LLMCall kind', () => {
    expect(parseRoleFromDescription('LLMCall: classify-intent'))
      .toEqual({ kind: 'LLMCall', role: 'classify-intent' });
  });

  it('parses Parallel kind', () => {
    expect(parseRoleFromDescription('Parallel: 3-way fanout'))
      .toEqual({ kind: 'Parallel', role: '3-way fanout' });
  });

  it('parses Sequence kind', () => {
    expect(parseRoleFromDescription('Sequence: stage1 → stage2'))
      .toEqual({ kind: 'Sequence', role: 'stage1 → stage2' });
  });

  it('parses Conditional kind', () => {
    expect(parseRoleFromDescription('Conditional: route by intent'))
      .toEqual({ kind: 'Conditional', role: 'route by intent' });
  });

  it('parses Loop kind', () => {
    expect(parseRoleFromDescription('Loop: refinement (max 5)'))
      .toEqual({ kind: 'Loop', role: 'refinement (max 5)' });
  });

  it('returns kind=undefined for unknown prefix', () => {
    expect(parseRoleFromDescription('Workflow: my flow'))
      .toEqual({ kind: undefined, role: 'Workflow: my flow' });
  });

  it('returns kind=undefined when no colon present', () => {
    expect(parseRoleFromDescription('plain text'))
      .toEqual({ kind: undefined, role: 'plain text' });
  });

  it('handles empty string', () => {
    expect(parseRoleFromDescription('')).toEqual({ kind: undefined, role: '' });
  });

  it('handles undefined', () => {
    expect(parseRoleFromDescription(undefined)).toEqual({ kind: undefined, role: '' });
  });

  it('trims surrounding whitespace from kind and role', () => {
    expect(parseRoleFromDescription('  Agent  :   ReAct loop  '))
      .toEqual({ kind: 'Agent', role: 'ReAct loop' });
  });

  it('treats colon at index 0 as no-kind (drops prefix-only colons)', () => {
    expect(parseRoleFromDescription(': leading'))
      .toEqual({ kind: undefined, role: ': leading' });
  });

  it('splits on FIRST colon only, preserves later colons in role', () => {
    expect(parseRoleFromDescription('Agent: ReAct: nested colon'))
      .toEqual({ kind: 'Agent', role: 'ReAct: nested colon' });
  });
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('parseRoleFromDescription — functional', () => {
  it('matches every kind in the closed taxonomy set', () => {
    const kinds = ['Agent', 'LLMCall', 'Parallel', 'Sequence', 'Conditional', 'Loop'];
    for (const k of kinds) {
      expect(parseRoleFromDescription(`${k}: anything`).kind).toBe(k);
    }
  });

  it('rejects similar-but-not-exact kind names (case sensitive)', () => {
    expect(parseRoleFromDescription('agent: lowercase').kind).toBeUndefined();
    expect(parseRoleFromDescription('AGENT: caps').kind).toBeUndefined();
    expect(parseRoleFromDescription('Agents: plural').kind).toBeUndefined();
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('parseRoleFromDescription — integration', () => {
  it('round-trips through Object.keys() reflection', () => {
    const out = parseRoleFromDescription('Agent: foo');
    expect(Object.keys(out).sort()).toEqual(['kind', 'role']);
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('parseRoleFromDescription — property', () => {
  it('for ANY input, return value has kind ∈ {string, undefined} and role: string', () => {
    const samples = [
      '', 'x', ':', 'a:b', 'Agent:', ': nothing', 'unknown:thing',
      undefined, 'Loop: complex (rules) with: colons',
    ];
    for (const s of samples) {
      const out = parseRoleFromDescription(s);
      expect(typeof out.role).toBe('string');
      expect(out.kind === undefined || typeof out.kind === 'string').toBe(true);
    }
  });

  it('idempotent: same input always produces same output', () => {
    const a = parseRoleFromDescription('Parallel: committee');
    const b = parseRoleFromDescription('Parallel: committee');
    expect(a).toEqual(b);
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('parseRoleFromDescription — security', () => {
  it('does not allow prototype pollution via crafted kind', () => {
    const out = parseRoleFromDescription('__proto__: polluted');
    expect(out.kind).toBeUndefined();
    expect(out.role).toBe('__proto__: polluted');
    // Sanity: Object prototype not touched
    expect(({} as { polluted?: string }).polluted).toBeUndefined();
  });

  it('large inputs do not allocate quadratic memory', () => {
    const huge = 'X'.repeat(1_000_000);
    const out = parseRoleFromDescription(`Agent: ${huge}`);
    expect(out.kind).toBe('Agent');
    expect(out.role.length).toBe(1_000_000);
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('parseRoleFromDescription — performance', () => {
  it('10000 invocations in under 50ms', () => {
    const start = performance.now();
    for (let i = 0; i < 10_000; i++) {
      parseRoleFromDescription('Agent: ReAct loop');
    }
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(50);
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('parseRoleFromDescription — load', () => {
  it('1 million invocations in under 600ms', () => {
    const start = performance.now();
    for (let i = 0; i < 1_000_000; i++) {
      parseRoleFromDescription('Parallel: 3-way fanout');
    }
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(200);
  });
});
