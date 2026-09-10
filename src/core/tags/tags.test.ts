/**
 * Declared tags, read side — on REAL recordings (test/served/fixtures,
 * generated on agentfootprint 9.90.0, which declares its milestones as tags).
 *
 *   · the legend from STRUCTURE lists what the chart can produce, with hit
 *     counts from the log; a recording with no structure lists only what the
 *     run hit, and says which source it read;
 *   · milestone tags print agentfootprint's declared label, a foreign tag its
 *     raw name; the `milestone-label:` carrier is folded, not listed;
 *   · the tag axis wears the Lens's bookends and positions, and the
 *     EQUIVALENCE LAW holds: a picked stop sits at the same commit as the
 *     default axis's stop for that stage and folds the same through both
 *     lens strategies.
 */

import { describe, expect, it } from 'vitest';
import { stateAt, timeTravel } from 'footprintjs/trace';

import { load, loadTampered } from '../../../test/served/helpers.js';
import { scrubAxisFor } from '../group/scrubAxisFor.js';
import { lensStopsStrategy } from '../timeTravel/lensStops.js';
import { tagAxisPositions, tagLegend, tagStopsFor } from './index.js';

const structureOf = (f: ReturnType<typeof load>): unknown =>
  (f.runner as { getSpec: () => { buildTimeStructure: unknown } }).getSpec().buildTimeStructure;

describe('tagLegend', () => {
  it('from the structure: declared tags with the run’s hit counts, milestone labels, carrier folded', () => {
    const f = load('flat-dynamic-tools');
    const legend = tagLegend(structureOf(f), f.snapshot);
    expect(legend.source).toBe('structure');
    const byName = Object.fromEntries(legend.entries.map((e) => [e.name, e]));
    expect(byName['milestone:llm-turn']).toMatchObject({ label: 'LLM turn', declared: true, milestone: 'llm-turn' });
    expect(byName['milestone:llm-turn']!.hits).toBeGreaterThanOrEqual(2);
    expect(byName['milestone:iteration']!.hits).toBeGreaterThanOrEqual(2);
    // The label carrier names its sibling; it is not a stop of its own.
    expect(legend.entries.some((e) => e.name.startsWith('milestone-label:'))).toBe(false);
    // Sorted by what is printed.
    expect(legend.entries.map((e) => e.label)).toEqual([...legend.entries.map((e) => e.label)].sort((a, b) => a.localeCompare(b)));
  });

  it('from the log only when the recording carried no structure — and says so', () => {
    const f = loadTampered('flat-dynamic-tools', (r) => {
      delete (r as { structure?: unknown }).structure;
    });
    const legend = tagLegend(undefined, f.snapshot);
    expect(legend.source).toBe('log');
    expect(legend.entries.every((e) => !e.declared && e.hits > 0)).toBe(true);
    expect(legend.entries.map((e) => e.name)).toContain('milestone:llm-turn');
  });

  it('a declared tag the run never hit is listed with 0 hits; a foreign tag prints its raw name', () => {
    const structure = { name: 'x', id: 'a', tags: ['audit'], next: { name: 'y', id: 'b', tags: ['milestone:decision', 'milestone-label:Route'] } };
    const snapshot = { commitLog: [{ runtimeStageId: 'b#1', tags: ['milestone:decision', 'milestone-label:Route'] }] };
    const legend = tagLegend(structure, snapshot);
    expect(legend.entries).toEqual([
      { name: 'audit', label: 'audit', declared: true, hits: 0, rootHits: 0, mountHits: 0 },
      { name: 'milestone:decision', label: 'Route', declared: true, hits: 1, rootHits: 1, mountHits: 0, milestone: 'decision' },
    ]);
  });

  it('a plain footprintjs chart with the author’s OWN tag: raw name beside milestone labels, any-of keeps both audit stops', () => {
    const f = load('tagged-chart');
    const legend = tagLegend(structureOf(f), f.snapshot);
    expect(legend.source).toBe('structure');
    expect(legend.entries.map((e) => [e.label, e.hits, e.milestone ?? null])).toEqual([
      ['audit', 2, null],
      ['LLM turn', 1, 'llm-turn'],
      ['Route', 1, 'decision'],
    ]);
    const stops = tagStopsFor(f.snapshot, ['audit'])!;
    expect(stops.filter((s) => s.kind === 'commit').map((s) => s.stageId)).toEqual(['route', 'finish']);
    // `normalise` (untagged) folded into the LLM turn before it: the audit
    // axis's first kept stop starts after it.
    expect(stops[1]?.commitIdx).toBe(3);
  });

  it('EXACT counts, root and mount apart — each mount log walked ONCE (subflowResults is dual-keyed)', () => {
    const counts = (name: 'dynamic-grouped' | 'llmcall'): Record<string, [number, number]> => {
      const f = load(name);
      return Object.fromEntries(tagLegend(structureOf(f), f.snapshot).entries.map((e) => [e.name, [e.rootHits, e.mountHits]]));
    };
    // The grouped turn: the LLM turn and the six slot mounts live INSIDE the
    // two `sf-llm-call` mounts; the iterations are declared on both levels.
    expect(counts('dynamic-grouped')).toEqual({
      'milestone:iteration': [2, 2],
      'milestone:llm-turn': [0, 2],
      'milestone:decision': [2, 0],
      'milestone:slot': [0, 6],
      'milestone:tool-call': [1, 0],
    });
    expect(counts('llmcall')).toEqual({
      'milestone:iteration': [1, 0],
      'milestone:llm-turn': [0, 1],
      'milestone:slot': [0, 2],
    });
  });
});

describe('tagAxisPositions — the Lens’s positions over tagStops', () => {
  it('borrows the default axis’s bookends and lists one ordinal-labelled stop per tagged stage', () => {
    const f = load('flat-dynamic-tools');
    const axis = tagAxisPositions(f.snapshot, ['milestone:llm-turn'], f.positions)!;
    expect(axis[0]).toBe(f.positions[0]);
    expect(axis[axis.length - 1]).toBe(f.positions[f.positions.length - 1]);
    const inner = axis.slice(1, -1);
    expect(inner.map((p) => p.label)).toEqual(['LLM turn 1', 'LLM turn 2']);
    expect(inner.every((p) => p.kind === 'commit' && p.depth === 1 && p.milestone === 'llm-turn')).toBe(true);
    expect(inner.every((p) => p.runtimeGroupId === p.runtimeStageId)).toBe(true);
  });

  it('any-of: two picked tags interleave in commit order; an empty log is an empty axis', () => {
    const f = load('flat-dynamic-tools');
    const axis = tagAxisPositions(f.snapshot, ['milestone:llm-turn', 'milestone:tool-call'], f.positions)!;
    const inner = axis.slice(1, -1);
    expect(inner.map((p) => p.milestone)).toEqual(['llm-turn', 'tool-call', 'llm-turn']);
    for (let i = 1; i < inner.length; i++) expect(inner[i]!.commitIdx).toBeGreaterThan(inner[i - 1]!.commitIdx);
    expect(tagAxisPositions({ commitLog: [] }, ['x'], [])).toEqual([]);
  });

  it('THE EQUIVALENCE LAW: a picked stop sits at the default axis’s commit for that stage and folds the same', () => {
    const f = load('flat-dynamic-tools');
    const snapshot = f.snapshot as Parameters<typeof timeTravel>[0];
    const fold = f.snapshot as Parameters<typeof stateAt>[0];
    const commitAxis = scrubAxisFor(f.recorder, 'step');
    const picked = tagAxisPositions(f.snapshot, ['milestone:llm-turn', 'milestone:decision'], f.positions)!;
    for (const p of picked.slice(1, -1)) {
      const twin = commitAxis.find((c) => c.runtimeStageId === p.runtimeStageId);
      expect(twin, p.runtimeStageId).toBeDefined();
      expect(p.commitIdx).toBe(twin!.commitIdx);
      expect(stateAt(fold, p.commitIdx).state).toEqual(stateAt(fold, twin!.commitIdx).state);
    }
    // Through the cursor, over BOTH lens strategies: the tag stop's fold
    // (through its last commit) equals the commit axis folded at that same
    // last index — the state the next tagged stage started from.
    const tagged = timeTravel(snapshot, { strategy: lensStopsStrategy(picked) });
    const plain = timeTravel(snapshot, { strategy: lensStopsStrategy(commitAxis) });
    for (const stop of tagged.stops) {
      const twin =
        plain.stops.find((s) => s.lastCommitIdx === stop.lastCommitIdx && s.kind !== 'end') ??
        plain.stops[plain.stops.length - 1]!;
      expect(tagged.stateAt(stop).state).toEqual(plain.stateAt(twin).state);
    }
  });

  it('tagStopsFor reads the library strategy off the namespace (present on this peer)', () => {
    const f = load('flat-dynamic-tools');
    const stops = tagStopsFor(f.snapshot, ['milestone:llm-turn'])!;
    expect(stops[0]?.kind).toBe('start');
    expect(stops[stops.length - 1]?.kind).toBe('end');
    expect(stops.filter((s) => s.kind === 'commit').every((s) => s.meta?.includes('milestone:llm-turn'))).toBe(true);
  });
});
