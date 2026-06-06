/**
 * Tests — `selectContextEngineeringInjections`.
 *
 * Verifies the baseline vs. engineered distinction. Baseline sources
 * (`user`, `tool-result`) are dropped; engineered sources (rag, skill,
 * memory, instruction, grounding, custom) pass through.
 *
 * 7 patterns cover the full consumer circle:
 *   1. Empty / undefined input → empty output
 *   2. All baseline → empty output
 *   3. All engineered → all pass through
 *   4. Mixed input → only engineered returned
 *   5. Preserves injection order (no sort)
 *   6. Custom source is treated as engineered
 *   7. `isContextEngineering` predicate is the source of truth
 */

import { describe, it, expect } from 'vitest';
import type { ContextInjection } from 'agentfootprint/observe';
import {
  BASELINE_SOURCES,
  isContextEngineering,
  selectContextEngineeringInjections,
} from './selectContextEngineeringInjections.js';

function mk(source: string, extra: Partial<ContextInjection> = {}): ContextInjection {
  return {
    slot: 'messages',
    source,
    ...extra,
  };
}

describe('selectContextEngineeringInjections — pattern 1: empty/undefined', () => {
  it('returns [] for undefined and empty arrays', () => {
    expect(selectContextEngineeringInjections(undefined)).toEqual([]);
    expect(selectContextEngineeringInjections([])).toEqual([]);
  });
});

describe('selectContextEngineeringInjections — pattern 2: all baseline', () => {
  it('returns [] when every source is in BASELINE_SOURCES', () => {
    const all = [mk('user'), mk('tool-result'), mk('user')];
    expect(selectContextEngineeringInjections(all)).toEqual([]);
  });
});

describe('selectContextEngineeringInjections — pattern 3: all engineered', () => {
  it('passes every chip through when none are baseline', () => {
    const all = [mk('rag'), mk('skill'), mk('memory'), mk('instruction'), mk('grounding')];
    expect(selectContextEngineeringInjections(all)).toHaveLength(5);
  });
});

describe('selectContextEngineeringInjections — pattern 4: mixed', () => {
  it('drops baseline, keeps engineered', () => {
    const mixed = [
      mk('user'),
      mk('rag', { sourceId: 'doc1' }),
      mk('tool-result'),
      mk('skill', { sourceId: 'billing' }),
    ];
    const out = selectContextEngineeringInjections(mixed);
    expect(out.map((i) => i.source)).toEqual(['rag', 'skill']);
  });
});

describe('selectContextEngineeringInjections — pattern 5: order preserved', () => {
  it('returns engineered chips in input order', () => {
    const chips = [
      mk('skill', { sourceId: 'a' }),
      mk('user'),
      mk('rag', { sourceId: 'b' }),
      mk('memory', { sourceId: 'c' }),
    ];
    const out = selectContextEngineeringInjections(chips);
    expect(out.map((i) => i.sourceId)).toEqual(['a', 'b', 'c']);
  });
});

describe('selectContextEngineeringInjections — pattern 6: custom source', () => {
  it('treats unknown sources as engineered', () => {
    const custom = [mk('my-company-retrieval'), mk('legal-clause-injector')];
    expect(selectContextEngineeringInjections(custom)).toHaveLength(2);
  });
});

describe('isContextEngineering — pattern 7: predicate contract', () => {
  it('is false for every baseline source and true for everything else', () => {
    for (const baseline of BASELINE_SOURCES) {
      expect(isContextEngineering(mk(baseline))).toBe(false);
    }
    expect(isContextEngineering(mk('rag'))).toBe(true);
    expect(isContextEngineering(mk('skill'))).toBe(true);
    expect(isContextEngineering(mk('memory'))).toBe(true);
    expect(isContextEngineering(mk('instruction'))).toBe(true);
    expect(isContextEngineering(mk('custom-xyz'))).toBe(true);
  });
});
