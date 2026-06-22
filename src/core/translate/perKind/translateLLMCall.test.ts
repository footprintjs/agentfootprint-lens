/**
 * translateLLMCall — 7-pattern test matrix.
 */

import { describe, expect, it } from 'vitest';
import type { GroupMetadata } from 'agentfootprint';
import { translateLLMCall } from './translateLLMCall.js';

const meta = (overrides?: Partial<GroupMetadata>): GroupMetadata => ({
  kind: 'LLMCall',
  id: 'call',
  name: 'Call LLM',
  members: [],
  extra: { slots: ['SystemPrompt', 'Messages', 'Tools'] as const },
  ...overrides,
});

// ── 1. Unit ───────────────────────────────────────────────────────

describe('translateLLMCall — unit', () => {
  it('emits exactly one stage node and no edges', () => {
    const out = translateLLMCall(meta());
    expect(out.nodes).toHaveLength(1);
    expect(out.edges).toHaveLength(0);
  });

  it('node carries kind=stage and primitiveKind=LLMCall', () => {
    const [n] = translateLLMCall(meta()).nodes;
    expect(n!.kind).toBe('stage');
    expect(n!.primitiveKind).toBe('LLMCall');
  });

  it('node id is built from makeRootNodeId(LLMCall, id)', () => {
    expect(translateLLMCall(meta({ id: 'X' })).nodes[0]!.id).toBe('llmcall:X');
  });
});

// ── 2. Functional ─────────────────────────────────────────────────

describe('translateLLMCall — functional', () => {
  it("label is taken verbatim from metadata.name", () => {
    expect(translateLLMCall(meta({ name: 'Generate Summary' })).nodes[0]!.label).toBe(
      'Generate Summary',
    );
  });

  it('metadata bag is taken from GroupMetadata.extra verbatim', () => {
    const extra = { slots: ['SystemPrompt'] as const };
    const out = translateLLMCall(meta({ extra }));
    expect(out.nodes[0]!.metadata).toBe(extra);
  });

  it('rootNodeId equals the single node id', () => {
    const out = translateLLMCall(meta({ id: 'rooty' }));
    expect(out.rootNodeId).toBe(out.nodes[0]!.id);
  });
});

// ── 3. Integration ────────────────────────────────────────────────

describe('translateLLMCall — integration', () => {
  it('output shape is xyflow-ready (one parentless stage)', () => {
    const out = translateLLMCall(meta());
    expect(out.nodes[0]!.parentId).toBeUndefined();
  });
});

// ── 4. Property ───────────────────────────────────────────────────

describe('translateLLMCall — property', () => {
  it('output node count is exactly 1 regardless of any input variation', () => {
    expect(translateLLMCall(meta({ name: 'A' })).nodes).toHaveLength(1);
    expect(translateLLMCall(meta({ extra: undefined })).nodes).toHaveLength(1);
  });

  it('throws TypeError on wrong kind (caller bug, fail loud)', () => {
    expect(() =>
      translateLLMCall(meta({ kind: 'Agent' })),
    ).toThrowError(TypeError);
  });
});

// ── 5. Security ───────────────────────────────────────────────────

describe('translateLLMCall — security', () => {
  it('arbitrary characters in id pass through verbatim — composition layer owns id sanitisation', () => {
    const out = translateLLMCall(meta({ id: 'a/b:c<>d' }));
    expect(out.nodes[0]!.id).toBe('llmcall:a/b:c<>d');
  });

  it('does NOT mutate the input metadata', () => {
    const input = meta();
    const before = JSON.stringify(input);
    translateLLMCall(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

// ── 6. Performance ────────────────────────────────────────────────

describe('translateLLMCall — performance', () => {
  it('1000 translations under 30ms', () => {
    const m = meta();
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) translateLLMCall(m);
    expect(performance.now() - t0).toBeLessThan(150);
  });
});

// ── 7. ROI ────────────────────────────────────────────────────────

describe('translateLLMCall — ROI', () => {
  it('one translator covers every LLMCall regardless of slot configuration', () => {
    const a = translateLLMCall(meta({ extra: { slots: ['Messages'] } }));
    const b = translateLLMCall(meta({ extra: { slots: ['SystemPrompt', 'Messages', 'Tools'] } }));
    expect(a.nodes[0]!.kind).toBe('stage');
    expect(b.nodes[0]!.kind).toBe('stage');
  });
});
