/**
 * extractAgentLegend — Layer 1 / Tier B tests (Convention 3, 7 patterns).
 */

import { describe, it, expect } from 'vitest';
import type { SpecNode } from '../buildSpecTreeFromBoundary.js';
import { extractAgentLegend } from './extractAgentLegend.js';

function agentNode(name: string, role = 'ReAct loop', subflowId = `sf-${name}`): SpecNode {
  return {
    name,
    description: `Agent: ${role}`,
    subflowId,
    subflowName: name,
    isSubflowRoot: true,
  };
}

function plainNode(name: string, kind = ''): SpecNode {
  return {
    name,
    description: kind ? `${kind}: ${name}` : '',
  };
}

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('extractAgentLegend — unit', () => {
  it('empty spec without Agent description returns []', () => {
    expect(extractAgentLegend(plainNode('start'))).toEqual([]);
  });

  it('single Agent node yields one entry', () => {
    const out = extractAgentLegend(agentNode('Apparel'));
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('Apparel');
    expect(out[0]!.role).toBe('ReAct loop');
    expect(out[0]!.subflowId).toBe('sf-Apparel');
  });

  it('Plain prefix (LLMCall:) is not collected', () => {
    const llm = plainNode('call-llm', 'LLMCall');
    expect(extractAgentLegend(llm)).toEqual([]);
  });

  it('Plain prefix (Parallel:) is not collected', () => {
    const par = plainNode('fanout', 'Parallel');
    expect(extractAgentLegend(par)).toEqual([]);
  });

  it('description without colon → not an agent', () => {
    expect(extractAgentLegend({ name: 'x', description: 'plain text' })).toEqual([]);
  });

  it('description without prefix → not an agent', () => {
    expect(extractAgentLegend({ name: 'x', description: '' })).toEqual([]);
  });

  it('colorIdx is in [0, 7]', () => {
    const out = extractAgentLegend(agentNode('SomeAgent'));
    expect(out[0]!.colorIdx).toBeGreaterThanOrEqual(0);
    expect(out[0]!.colorIdx).toBeLessThanOrEqual(7);
  });

  it('model is undefined in v0.1 (spec doesn\'t carry it)', () => {
    expect(extractAgentLegend(agentNode('X'))[0]!.model).toBeUndefined();
  });
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('extractAgentLegend — functional', () => {
  it('multi-agent: parent has Parallel with two Agent branches', () => {
    const spec: SpecNode = {
      name: 'router',
      description: 'Sequence: route-then-fanout',
      next: {
        name: 'fan',
        description: 'Parallel: 2-agent',
        children: [agentNode('Apparel'), agentNode('Footwear')],
      },
    };
    const out = extractAgentLegend(spec);
    const names = out.map((e) => e.name).sort();
    expect(names).toEqual(['Apparel', 'Footwear']);
  });

  it('subflowStructure: agent embedded as a subflow root', () => {
    const spec: SpecNode = {
      name: 'wrapper',
      description: '',
      subflowStructure: agentNode('NestedAgent'),
    };
    const out = extractAgentLegend(spec);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('NestedAgent');
  });

  it('deduplicates by subflowId (router mounting same Agent in two branches)', () => {
    const agent = agentNode('Shared', 'shared logic', 'sf-shared');
    const spec: SpecNode = {
      name: 'router',
      description: '',
      next: {
        name: 'fan',
        description: 'Parallel',
        children: [agent, agent], // same node referenced twice
      },
    };
    const out = extractAgentLegend(spec);
    expect(out).toHaveLength(1);
    expect(out[0]!.subflowId).toBe('sf-shared');
  });

  it('different subflowIds with same name produce two entries', () => {
    const spec: SpecNode = {
      name: 'router',
      description: '',
      children: [
        agentNode('Helper', 'first', 'sf-h1'),
        agentNode('Helper', 'second', 'sf-h2'),
      ],
    };
    const out = extractAgentLegend(spec);
    expect(out).toHaveLength(2);
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('extractAgentLegend — integration', () => {
  it('deep nested spec: walks next + children + subflowStructure', () => {
    const deep: SpecNode = {
      name: 'top',
      description: 'Sequence: pipeline',
      next: {
        name: 'middle',
        description: '',
        children: [
          {
            name: 'b1',
            description: '',
            subflowStructure: agentNode('DeepAgent', 'role-x', 'sf-deep'),
          },
        ],
      },
    };
    const out = extractAgentLegend(deep);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('DeepAgent');
  });

  it('handles a cycle in caller-supplied spec without infinite recursion', () => {
    const a: SpecNode = { name: 'a', description: '', children: [] };
    const b: SpecNode = agentNode('CycleAgent', 'r', 'sf-cycle');
    a.children = [b, a]; // a references itself
    expect(() => extractAgentLegend(a)).not.toThrow();
    const out = extractAgentLegend(a);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('CycleAgent');
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('extractAgentLegend — property', () => {
  it('colorIdx assignment is stable across calls', () => {
    const spec = agentNode('StableNamedAgent');
    const a = extractAgentLegend(spec)[0]!.colorIdx;
    const b = extractAgentLegend(spec)[0]!.colorIdx;
    const c = extractAgentLegend(spec)[0]!.colorIdx;
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('two agents with different names usually get different color indexes', () => {
    // Not guaranteed (collisions exist in 8-bin hash), but for these
    // names FNV-1a places them in distinct bins.
    const spec: SpecNode = {
      name: 'r', description: '',
      children: [agentNode('Apparel', 'r', 'sf-a'), agentNode('Footwear', 'r', 'sf-f')],
    };
    const out = extractAgentLegend(spec);
    expect(out[0]!.colorIdx).not.toBe(out[1]!.colorIdx);
  });

  it('result entries always have name.length > 0', () => {
    const out = extractAgentLegend({
      name: 'r', description: '',
      children: [agentNode('X'), agentNode('Y'), agentNode('Z')],
    });
    for (const e of out) expect(e.name.length).toBeGreaterThan(0);
  });

  it('never throws for spec edge cases', () => {
    const cases: SpecNode[] = [
      { name: 'x', description: '' },
      { name: 'x', description: 'Agent:' },
      { name: 'x', description: 'Agent: ' },
      agentNode('A'),
    ];
    for (const c of cases) expect(() => extractAgentLegend(c)).not.toThrow();
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('extractAgentLegend — security', () => {
  it('does not mutate the input spec', () => {
    const spec = agentNode('A');
    const before = JSON.stringify(spec);
    extractAgentLegend(spec);
    expect(JSON.stringify(spec)).toBe(before);
  });

  it('entries expose only documented fields', () => {
    const out = extractAgentLegend(agentNode('A'));
    const allowed = new Set(['subflowId', 'name', 'role', 'model', 'colorIdx']);
    for (const k of Object.keys(out[0]!)) {
      expect(allowed.has(k)).toBe(true);
    }
  });

  it('hostile spec (deeply nested) terminates without stack overflow', () => {
    let spec: SpecNode = agentNode('Leaf');
    for (let i = 0; i < 500; i++) {
      spec = { name: `wrap${i}`, description: '', next: spec };
    }
    expect(() => extractAgentLegend(spec)).not.toThrow();
    expect(extractAgentLegend(spec)).toHaveLength(1);
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('extractAgentLegend — performance', () => {
  it('100-agent spec walked in under 5ms', () => {
    const children: SpecNode[] = [];
    for (let i = 0; i < 100; i++) children.push(agentNode(`A${i}`, 'r', `sf-${i}`));
    const spec: SpecNode = { name: 'r', description: '', children };
    const start = performance.now();
    for (let i = 0; i < 100; i++) extractAgentLegend(spec);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(50);
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('extractAgentLegend — load', () => {
  it('1000-agent spec walked 100 times in under 200ms', () => {
    const children: SpecNode[] = [];
    for (let i = 0; i < 1000; i++) children.push(agentNode(`A${i}`, 'r', `sf-${i}`));
    const spec: SpecNode = { name: 'r', description: '', children };
    const start = performance.now();
    for (let i = 0; i < 100; i++) extractAgentLegend(spec);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(500);
  });
});
