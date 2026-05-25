/**
 * translateAgent — 7-pattern test matrix.
 */

import { describe, expect, it } from 'vitest';
import type { GroupMetadata } from 'agentfootprint';
import { translateAgent } from './translateAgent.js';

const meta = (overrides?: Partial<GroupMetadata>): GroupMetadata => ({
  kind: 'Agent',
  id: 'agent-1',
  name: 'Research Agent',
  members: [],
  extra: {
    slots: ['SystemPrompt', 'Messages', 'Tools'] as const,
    toolNames: ['web-search', 'calculator'],
    maxIterations: 10,
  },
  ...overrides,
});

// ── 1. Unit ───────────────────────────────────────────────────────

describe('translateAgent — unit', () => {
  it('emits exactly one stage node and no edges', () => {
    const out = translateAgent(meta());
    expect(out.nodes).toHaveLength(1);
    expect(out.edges).toHaveLength(0);
  });

  it('node carries kind=stage and primitiveKind=Agent', () => {
    const [n] = translateAgent(meta()).nodes;
    expect(n!.kind).toBe('stage');
    expect(n!.primitiveKind).toBe('Agent');
  });

  it('node id is built from makeRootNodeId(Agent, id)', () => {
    expect(translateAgent(meta({ id: 'researcher' })).nodes[0]!.id).toBe(
      'agent:researcher',
    );
  });
});

// ── 2. Functional ─────────────────────────────────────────────────

describe('translateAgent — functional', () => {
  it("label is taken verbatim from metadata.name", () => {
    expect(translateAgent(meta({ name: 'Triage Bot' })).nodes[0]!.label).toBe(
      'Triage Bot',
    );
  });

  it('metadata bag carries slots, toolNames, maxIterations verbatim', () => {
    const extra = {
      slots: ['Messages'] as const,
      toolNames: ['x'],
      maxIterations: 1,
    };
    const out = translateAgent(meta({ extra }));
    expect(out.nodes[0]!.metadata).toBe(extra);
  });

  it('rootNodeId equals the single node id', () => {
    const out = translateAgent(meta({ id: 'A' }));
    expect(out.rootNodeId).toBe(out.nodes[0]!.id);
  });
});

// ── 3. Integration ────────────────────────────────────────────────

describe('translateAgent — integration', () => {
  it('output is xyflow-ready (parentless leaf)', () => {
    const out = translateAgent(meta());
    expect(out.nodes[0]!.parentId).toBeUndefined();
  });
});

// ── 4. Property ───────────────────────────────────────────────────

describe('translateAgent — property', () => {
  it('output node count is exactly 1 regardless of any input variation', () => {
    expect(translateAgent(meta({ name: 'A' })).nodes).toHaveLength(1);
    expect(
      translateAgent(meta({ extra: { slots: [], toolNames: [], maxIterations: 0 } })).nodes,
    ).toHaveLength(1);
  });

  it('throws TypeError on wrong kind (caller bug, fail loud)', () => {
    expect(() => translateAgent(meta({ kind: 'LLMCall' }))).toThrowError(
      TypeError,
    );
  });
});

// ── 5. Security ───────────────────────────────────────────────────

describe('translateAgent — security', () => {
  it('arbitrary characters in id pass through verbatim — composition layer owns id sanitisation', () => {
    const out = translateAgent(meta({ id: 'a:b/c' }));
    expect(out.nodes[0]!.id).toBe('agent:a:b/c');
  });

  it('does NOT mutate the input metadata', () => {
    const input = meta();
    const before = JSON.stringify(input);
    translateAgent(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

// ── 6. Performance ────────────────────────────────────────────────

describe('translateAgent — performance', () => {
  it('1000 translations under 30ms', () => {
    const m = meta();
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) translateAgent(m);
    expect(performance.now() - t0).toBeLessThan(30);
  });
});

// ── 7. ROI ────────────────────────────────────────────────────────

describe('translateAgent — ROI', () => {
  it('same translator covers Agent with any tool count or iteration budget', () => {
    const a = translateAgent(meta({ extra: { slots: [], toolNames: [], maxIterations: 1 } }));
    const b = translateAgent(meta({ extra: { slots: ['Messages'], toolNames: Array.from({ length: 50 }, (_, i) => `t${i}`), maxIterations: 1000 } }));
    expect(a.nodes[0]!.primitiveKind).toBe('Agent');
    expect(b.nodes[0]!.primitiveKind).toBe('Agent');
  });
});
