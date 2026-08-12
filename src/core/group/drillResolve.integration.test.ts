/**
 * drillResolve — integration: drill is reachable end-to-end against
 * REAL groups built from a REAL run (not synthetic fixtures).
 *
 * This is the coverage the drill-wiring audit flagged as missing: prove
 * that a clicked chart node id maps to a valid runtimeGroupId chain over
 * groups produced by buildGroups(recorder.boundary.boundaryIndex), and
 * that the chain re-keys the slider's cursor positions.
 */

import { describe, it, expect } from 'vitest';
import { LLMCall, Sequence } from 'agentfootprint'
import { MockProvider } from 'agentfootprint/providers';
import { LensRecorder } from '../LensRecorder.js';
import { buildGroups } from './buildGroups.js';
import { buildCommitSyncMap } from './buildCommitSyncMap.js';
import { cursorPositionsAtDrill } from './cursorPositionsAtDrill.js';
import { resolveDrillChain, innerGroupSubflowPath } from './drillResolve.js';

function llm(reply: string, id?: string, name?: string) {
  const opts: Record<string, unknown> = { provider: new MockProvider({ reply }), model: 'mock' };
  if (id) opts.id = id;
  if (name) opts.name = name;
  return LLMCall.create(opts as never).system('hi').build();
}

describe('drillResolve — integration: atomic LLMCall synth card', () => {
  it('synth LLM node → real sf-llm-call group chain, and the chain re-keys the slider', async () => {
    const runner = llm('hello');
    const rec = new LensRecorder();
    const off = rec.observe(runner);
    await runner.run({ message: 'hi' });
    off();

    const groups = buildGroups(rec.boundary.boundaryIndex);
    const commits = buildCommitSyncMap(rec);

    // The atomic-LLMCall chart renders a synthesized LLM card; clicking
    // it must resolve to the real LLMCall group.
    const chain = resolveDrillChain(groups, '__lens_llm_call_synth__');
    expect(chain).not.toBeNull();
    expect(chain!.length).toBeGreaterThanOrEqual(1);
    // The resolved id must be a REAL group.
    const known = new Set(groups.map((g) => g.runtimeGroupId));
    for (const id of chain!) expect(known.has(id)).toBe(true);

    // selectHops adapter yields the innermost group's real subflowPath.
    const sub = innerGroupSubflowPath(groups, chain!);
    expect(sub[sub.length - 1]).toMatch(/sf-llm-call/);

    // Drilling re-keys the slider: positions at the drilled level differ
    // from the empty (top-level) positions — i.e. drill actually does
    // something, it isn't dormant.
    const top = cursorPositionsAtDrill(groups, commits, []);
    const drilled = cursorPositionsAtDrill(groups, commits, chain!);
    expect(drilled.length).toBeGreaterThan(0);
    expect(drilled).not.toEqual(top);
  });
});

describe('drillResolve — integration: Sequence of 2 LLMCalls', () => {
  it('clicking a step node resolves to that step group; non-existent node → null', async () => {
    const runner = Sequence.create({ id: 'seq', name: 'Pipeline' })
      .step('classify', llm('A', 'classify-call', 'Classify'))
      .step('respond', llm('B', 'respond-call', 'Respond'))
      .build();
    const rec = new LensRecorder();
    const off = rec.observe(runner);
    await runner.run({ message: 'go' });
    off();

    const groups = buildGroups(rec.boundary.boundaryIndex);
    expect(groups.length).toBeGreaterThan(1);

    // Real click targets are groups with a UNIQUE last segment (the
    // chart renders one node per distinct subflow box). Repeated inner
    // segments like `sf-llm-call` (one per step) are NOT directly
    // clickable chart nodes — the resolver disambiguates them to the
    // shallowest, which we assert separately below.
    const segCount = new Map<string, number>();
    for (const g of groups) {
      if (g.isRoot) continue;
      const seg = g.subflowPath[g.subflowPath.length - 1]!;
      segCount.set(seg, (segCount.get(seg) ?? 0) + 1);
    }
    for (const g of groups) {
      if (g.isRoot) continue;
      const seg = g.subflowPath[g.subflowPath.length - 1]!;
      if (segCount.get(seg) !== 1) continue; // skip ambiguous inner segs
      const chain = resolveDrillChain(groups, seg);
      expect(chain).not.toBeNull();
      expect(chain![chain!.length - 1]).toBe(g.runtimeGroupId);
    }

    // Ambiguous repeated segment (sf-llm-call appears once per step) →
    // resolver is deterministic: shallowest / earliest match, never throws.
    const repeated = [...segCount.entries()].find(([, n]) => n > 1)?.[0];
    if (repeated) {
      const chain = resolveDrillChain(groups, repeated);
      expect(chain).not.toBeNull();
      const known = new Set(groups.map((g) => g.runtimeGroupId));
      for (const id of chain!) expect(known.has(id)).toBe(true);
    }

    // Garbage node id → no drill (null), never a wrong scope.
    expect(resolveDrillChain(groups, 'does-not-exist')).toBeNull();
    expect(resolveDrillChain(groups, '__lens_user__')).toBeNull();
  });
});
