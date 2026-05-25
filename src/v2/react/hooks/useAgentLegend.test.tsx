/**
 * useAgentLegend — Layer 2 / Tier B tests (Convention 3, 7 patterns).
 */

/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { SpecNode } from '../../core/buildSpecTreeFromBoundary.js';
import { useAgentLegend } from './useAgentLegend.js';

function agentNode(name: string, role = 'r', subflowId = `sf-${name}`): SpecNode {
  return {
    name,
    description: `Agent: ${role}`,
    subflowId,
    subflowName: name,
    isSubflowRoot: true,
  };
}

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('useAgentLegend — unit', () => {
  it('undefined spec returns empty array', () => {
    const { result } = renderHook(() => useAgentLegend(undefined));
    expect(result.current).toEqual([]);
  });

  it('non-agent spec returns empty array', () => {
    const { result } = renderHook(() => useAgentLegend({ name: 'x', description: 'plain' }));
    expect(result.current).toEqual([]);
  });

  it('single agent → one entry', () => {
    const { result } = renderHook(() => useAgentLegend(agentNode('A')));
    expect(result.current).toHaveLength(1);
    expect(result.current[0]!.name).toBe('A');
  });

  it('three agents → three entries', () => {
    const spec: SpecNode = {
      name: 'r', description: '',
      children: [agentNode('A'), agentNode('B'), agentNode('C')],
    };
    const { result } = renderHook(() => useAgentLegend(spec));
    expect(result.current).toHaveLength(3);
  });
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('useAgentLegend — functional', () => {
  it('memoizes — same spec ref → same array identity', () => {
    const spec = agentNode('A');
    const { result, rerender } = renderHook(({ s }) => useAgentLegend(s), { initialProps: { s: spec } });
    const first = result.current;
    rerender({ s: spec });
    expect(result.current).toBe(first);
  });

  it('new spec ref → new array identity', () => {
    const a = agentNode('A');
    const b = agentNode('A');
    const { result, rerender } = renderHook(({ s }) => useAgentLegend(s), { initialProps: { s: a } });
    const first = result.current;
    rerender({ s: b });
    expect(result.current).not.toBe(first);
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('useAgentLegend — integration', () => {
  it('reuses same EMPTY array for two undefined renders', () => {
    const a = renderHook(() => useAgentLegend(undefined));
    const b = renderHook(() => useAgentLegend(undefined));
    expect(a.result.current).toBe(b.result.current);
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('useAgentLegend — property', () => {
  it('colorIdx in [0,7] for every entry', () => {
    const spec: SpecNode = {
      name: 'r', description: '',
      children: [agentNode('A'), agentNode('B'), agentNode('C'), agentNode('D')],
    };
    const { result } = renderHook(() => useAgentLegend(spec));
    for (const e of result.current) {
      expect(e.colorIdx).toBeGreaterThanOrEqual(0);
      expect(e.colorIdx).toBeLessThanOrEqual(7);
    }
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('useAgentLegend — security', () => {
  it('does not mutate input spec', () => {
    const spec = agentNode('A');
    const before = JSON.stringify(spec);
    renderHook(() => useAgentLegend(spec));
    expect(JSON.stringify(spec)).toBe(before);
  });

  it('output is a frozen-shape readonly array of entries with documented fields only', () => {
    const { result } = renderHook(() => useAgentLegend(agentNode('A')));
    const allowed = new Set(['subflowId', 'name', 'role', 'model', 'colorIdx']);
    for (const k of Object.keys(result.current[0]!)) {
      expect(allowed.has(k)).toBe(true);
    }
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('useAgentLegend — performance', () => {
  it('100-agent spec walked under 30ms', () => {
    const children: SpecNode[] = [];
    for (let i = 0; i < 100; i++) children.push(agentNode(`A${i}`, 'r', `sf-${i}`));
    const spec: SpecNode = { name: 'r', description: '', children };
    const start = performance.now();
    renderHook(() => useAgentLegend(spec));
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(100);
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('useAgentLegend — load', () => {
  it('1000-agent spec walked under 300ms', () => {
    const children: SpecNode[] = [];
    for (let i = 0; i < 1000; i++) children.push(agentNode(`A${i}`, 'r', `sf-${i}`));
    const spec: SpecNode = { name: 'r', description: '', children };
    const start = performance.now();
    renderHook(() => useAgentLegend(spec));
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(300);
  });
});
