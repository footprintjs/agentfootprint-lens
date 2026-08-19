/**
 * stepBands — the grouped ruler's bands as a pure projection (unit).
 *
 * Pinned here:
 *   1. iteration milestones open bands; the root bookends band alone;
 *   2. the bands TILE the axis exactly (every step in exactly one band, in
 *      order, no gaps) — the invariant that makes "active band" derivable;
 *   3. an axis with no iteration milestones degenerates to one band per step
 *      (the grouped ruler never invents structure);
 *   4. `bandIndexOf` derives the active band from the cursor — the one-cursor
 *      law's read direction;
 *   5. `bandChartGroup` resolves a band to its commit span's chart node ids,
 *      and refuses the bookends (a boundary around everything says nothing).
 */
import { describe, expect, it } from 'vitest';
import { stepBands, bandIndexOf, bandChartGroup, type StepBand } from './stepBands.js';
import type { CursorPosition } from './cursorPositionsAtDrill.js';

/** Shorthand: a stop on the milestone axis, shaped like the demo turn's. */
function stop(
  label: string,
  commitIdx: number,
  extra: Partial<CursorPosition> = {},
): CursorPosition {
  return {
    runtimeStageId: extra.runtimeStageId ?? `${label.replace(/\W+/g, '-')}#1`,
    runtimeGroupId: extra.runtimeGroupId ?? `${label.replace(/\W+/g, '-')}#1`,
    label,
    kind: extra.kind ?? 'commit',
    depth: extra.depth ?? 1,
    commitIdx,
    ...(extra.milestone !== undefined && { milestone: extra.milestone }),
  };
}

/** The demo turn's shape: bookends + three loop passes. */
const AXIS: readonly CursorPosition[] = [
  stop('Run · start', 0, { kind: 'group-start', depth: 0, runtimeStageId: '__root__#0' }),
  stop('Iteration 1', 2, { milestone: 'iteration' }),
  stop('Context 1', 5, { kind: 'parallel', milestone: 'context' }),
  stop('LLM turn 1', 17, { milestone: 'llm-turn', runtimeStageId: 'call-llm#20' }),
  stop('Tool call 1', 21, { milestone: 'tool-call', runtimeStageId: 'tool-calls#24' }),
  stop('Iteration 2', 23, { milestone: 'iteration' }),
  stop('LLM turn 2', 38, { milestone: 'llm-turn', runtimeStageId: 'call-llm#44' }),
  stop('Run · end', 45, { kind: 'group-end', depth: 0, runtimeStageId: '__root__#0' }),
];

/** Bands must tile 0..n-1 exactly — every step in exactly one band, in order. */
function expectTiling(bands: readonly StepBand[], totalSteps: number): void {
  let next = 0;
  for (const band of bands) {
    expect(band.firstStep).toBe(next);
    expect(band.lastStep).toBeGreaterThanOrEqual(band.firstStep);
    next = band.lastStep + 1;
  }
  expect(next).toBe(totalSteps);
}

describe('stepBands', () => {
  it('bands the axis by iteration, with the bookends alone', () => {
    const bands = stepBands(AXIS);
    expect(bands.map((b) => b.label)).toEqual([
      'Run · start',
      'Iteration 1',
      'Iteration 2',
      'Run · end',
    ]);
    expect(bands.map((b) => b.kind)).toEqual(['run-start', 'group', 'group', 'run-end']);
    expect(bands[1]).toMatchObject({ firstStep: 1, lastStep: 4 });
    expect(bands[2]).toMatchObject({ firstStep: 5, lastStep: 6 });
    expectTiling(bands, AXIS.length);
  });

  it('degenerates to one band per step when the run has no iterations — never invents structure', () => {
    const plain = [
      stop('Run · start', 0, { kind: 'group-start', depth: 0 }),
      stop('Fetch', 1),
      stop('Transform', 2),
      stop('Run · end', 3, { kind: 'group-end', depth: 0 }),
    ];
    const bands = stepBands(plain);
    expect(bands).toHaveLength(plain.length);
    expect(bands.map((b) => b.label)).toEqual(plain.map((p) => p.label));
    expectTiling(bands, plain.length);
  });

  it('returns [] for an empty axis', () => {
    expect(stepBands([])).toEqual([]);
  });

  it('derives the active band from the cursor — never the other way around', () => {
    const bands = stepBands(AXIS);
    expect(bandIndexOf(bands, 0)).toBe(0);
    expect(bandIndexOf(bands, 1)).toBe(1);
    expect(bandIndexOf(bands, 3)).toBe(1); // mid-band: still Iteration 1
    expect(bandIndexOf(bands, 5)).toBe(2);
    expect(bandIndexOf(bands, 7)).toBe(3);
    expect(bandIndexOf(bands, 99)).toBe(-1);
  });
});

describe('bandChartGroup', () => {
  // A commit log where each commit's stage id is recoverable from its index.
  const commits = Array.from({ length: 46 }, (_, i) => ({ runtimeStageId: `stage-${i}#${i}` }));

  it('resolves a group band to its whole commit span, named as the band', () => {
    const bands = stepBands(AXIS);
    const group = bandChartGroup({ bands, bandIndex: 1, positions: AXIS, commits });
    expect(group).toBeTruthy();
    expect(group!.name).toBe('Iteration 1');
    // Iteration 1 spans commits 2..22 (next band opens at 23).
    expect(group!.opensAtCommitIdx).toBe(2);
    expect(group!.closesAtCommitIdx).toBe(22);
    expect(group!.memberNodeIds.has('stage-2')).toBe(true);
    expect(group!.memberNodeIds.has('stage-22')).toBe(true);
    expect(group!.memberNodeIds.has('stage-23')).toBe(false);
  });

  it('refuses the bookends — a boundary around the whole run states nothing', () => {
    const bands = stepBands(AXIS);
    expect(bandChartGroup({ bands, bandIndex: 0, positions: AXIS, commits })).toBeUndefined();
    expect(
      bandChartGroup({ bands, bandIndex: bands.length - 1, positions: AXIS, commits }),
    ).toBeUndefined();
  });

  it('the last group band runs to the commit before the end bookend', () => {
    const bands = stepBands(AXIS);
    const group = bandChartGroup({ bands, bandIndex: 2, positions: AXIS, commits });
    // Iteration 2 opens at commit 23; Run · end anchors at 45 → span 23..44.
    expect(group!.opensAtCommitIdx).toBe(23);
    expect(group!.closesAtCommitIdx).toBe(44);
  });
});
