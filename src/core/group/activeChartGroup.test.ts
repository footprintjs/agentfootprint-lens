/**
 * activeChartGroup + groupDisplayName — 7-pattern test matrix.
 *
 * What is being pinned: on the GROUPED ruler the cursor is a group, so the chart
 * needs (a) the group's members as CHART NODE IDS and (b) ONE spelling of its
 * name. Both come out of the recording that was already fetched — the boundary
 * ranges and the commit log — which is the property the perf + ROI cases state.
 */

import { describe, expect, it } from 'vitest';
import { CommitRangeIndex } from 'footprintjs/trace';
import type { BoundaryRangeLabel } from 'agentfootprint/observe';
import { buildGroups } from './buildGroups.js';
import { activeChartGroup, chartNodeIdOf } from './activeChartGroup.js';
import { groupDisplayName } from './groupDisplayName.js';
import type { Group } from './Group.js';

/** A run root + one subflow "Committee" spanning commits 2…5. */
function index(): CommitRangeIndex<BoundaryRangeLabel> {
  const idx = new CommitRangeIndex<BoundaryRangeLabel>();
  idx.open(
    { type: 'run.entry', runtimeStageId: '__root__#0', subflowPath: [], depth: 0, ts: 0 } as BoundaryRangeLabel,
    0,
  );
  const committee = idx.open(
    {
      type: 'subflow.entry',
      runtimeStageId: 'sf-committee#0',
      subflowName: 'Committee',
      subflowPath: ['__root__', 'sf-committee'],
      depth: 1,
      ts: 0,
    } as BoundaryRangeLabel,
    2,
  );
  idx.close(committee, 5);
  return idx;
}

/** Commit log: index i wrote stage `s{i}`, the ones inside the subflow prefixed. */
const commits = [
  { runtimeStageId: 'start#0' },
  { runtimeStageId: 'plan#0' },
  { runtimeStageId: 'sf-committee/gather#0' },
  { runtimeStageId: 'sf-committee/call-llm#0' },
  { runtimeStageId: 'sf-committee/call-llm#1' }, // same stage, second execution
  { runtimeStageId: 'sf-committee/merge#0' },
  { runtimeStageId: 'finish#0' },
];

const groupsOf = (): readonly Group[] => buildGroups(index());

// ── 1. Unit ───────────────────────────────────────────────────────

describe('chartNodeIdOf — unit', () => {
  it('drops the execution index and keeps the subflow path', () => {
    expect(chartNodeIdOf('sf-committee/legal/call-llm#4')).toBe('sf-committee/legal/call-llm');
  });

  it('leaves an id with no execution index alone', () => {
    expect(chartNodeIdOf('plain-stage')).toBe('plain-stage');
  });
});

describe('groupDisplayName — unit', () => {
  it('prefers the subflow name', () => {
    expect(groupDisplayName({ subflowName: 'Committee', compositionName: 'Par', runtimeStageId: 'sf-x#0' }))
      .toBe('Committee');
  });

  it('falls through composition name → primitive kind → the id itself', () => {
    expect(groupDisplayName({ compositionName: 'Parallel A', runtimeStageId: 'sf-x#0' })).toBe('Parallel A');
    expect(groupDisplayName({ primitiveKind: 'LLMCall', runtimeStageId: 'sf-x#0' })).toBe('LLMCall');
    expect(groupDisplayName({ runtimeStageId: 'sf-x#0' })).toBe('sf-x#0');
  });

  it('names the synthetic run root "Run" rather than its address', () => {
    expect(groupDisplayName({ type: 'run.entry', runtimeStageId: '__root__#0' })).toBe('Run');
  });
});

// ── 2. Functional ─────────────────────────────────────────────────

describe('activeChartGroup — functional', () => {
  it('returns the enclosing group with every commit in its range as a member', () => {
    const group = activeChartGroup({ groups: groupsOf(), commits, commitIdx: 3 });
    expect(group?.name).toBe('Committee');
    expect([...(group?.memberNodeIds ?? [])].sort()).toEqual([
      'sf-committee', // the group's own mount
      'sf-committee/call-llm',
      'sf-committee/gather',
      'sf-committee/merge',
    ]);
  });

  it('collapses repeat executions of one stage to ONE chart node', () => {
    // Commits 3 and 4 are `call-llm#0` and `call-llm#1` — one node on the chart.
    const group = activeChartGroup({ groups: groupsOf(), commits, commitIdx: 4 });
    const calls = [...(group?.memberNodeIds ?? [])].filter((id) => id.endsWith('call-llm'));
    expect(calls).toHaveLength(1);
  });

  it('says nothing at a commit only the run root encloses', () => {
    // A boundary drawn around the WHOLE chart states nothing, so the default is
    // "no group here" and the chart renders as it does on the per-commit ruler.
    expect(activeChartGroup({ groups: groupsOf(), commits, commitIdx: 0 })).toBeUndefined();
  });

  it('returns the run root when the caller explicitly asks for it', () => {
    const group = activeChartGroup({ groups: groupsOf(), commits, commitIdx: 0, includeRoot: true });
    expect(group?.name).toBe('Run');
  });
});

// ── 3. Integration ────────────────────────────────────────────────

describe('activeChartGroup — integration with buildGroups', () => {
  it('picks the INNERMOST group when boundaries nest', () => {
    const idx = index();
    const legal = idx.open(
      {
        type: 'subflow.entry',
        runtimeStageId: 'sf-committee/sf-legal#0',
        subflowName: 'legal',
        subflowPath: ['__root__', 'sf-committee', 'sf-legal'],
        depth: 2,
        ts: 0,
      } as BoundaryRangeLabel,
      3,
    );
    idx.close(legal, 4);
    const group = activeChartGroup({ groups: buildGroups(idx), commits, commitIdx: 3 });
    expect(group?.name).toBe('legal');
    expect(group?.depth).toBe(2);
  });

  it('an in-flight group (no close yet) runs to the end of the log', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(
      { type: 'run.entry', runtimeStageId: '__root__#0', subflowPath: [], depth: 0, ts: 0 } as BoundaryRangeLabel,
      0,
    );
    idx.open(
      {
        type: 'subflow.entry', runtimeStageId: 'sf-live#0', subflowName: 'Live',
        subflowPath: ['__root__', 'sf-live'], depth: 1, ts: 0,
      } as BoundaryRangeLabel,
      2,
    );
    const group = activeChartGroup({ groups: buildGroups(idx), commits, commitIdx: 6 });
    expect(group?.closesAtCommitIdx).toBeUndefined();
    expect(group?.memberNodeIds.has('finish')).toBe(true);
  });
});

// ── 4. Property ───────────────────────────────────────────────────

describe('activeChartGroup — property', () => {
  it('the group is always its own member, at every cursor inside it', () => {
    for (let i = 2; i <= 5; i++) {
      const group = activeChartGroup({ groups: groupsOf(), commits, commitIdx: i });
      expect(group?.memberNodeIds.has('sf-committee'), `commit ${i}`).toBe(true);
    }
  });

  it('membership never depends on WHERE inside the group the cursor is', () => {
    const seen = [2, 3, 4, 5].map((i) =>
      [...(activeChartGroup({ groups: groupsOf(), commits, commitIdx: i })?.memberNodeIds ?? [])].sort().join('|'),
    );
    expect(new Set(seen).size).toBe(1);
  });

  it('never returns a member id carrying an execution index', () => {
    const group = activeChartGroup({ groups: groupsOf(), commits, commitIdx: 3 });
    for (const id of group?.memberNodeIds ?? []) expect(id).not.toContain('#');
  });
});

// ── 5. Security / robustness ──────────────────────────────────────

describe('activeChartGroup — robustness', () => {
  it('a negative or non-finite cursor returns nothing instead of throwing', () => {
    expect(activeChartGroup({ groups: groupsOf(), commits, commitIdx: -1 })).toBeUndefined();
    expect(activeChartGroup({ groups: groupsOf(), commits, commitIdx: NaN })).toBeUndefined();
  });

  it('an empty commit log still yields the group, with its mount as the member', () => {
    const group = activeChartGroup({ groups: groupsOf(), commits: [], commitIdx: 3 });
    expect([...(group?.memberNodeIds ?? [])]).toEqual(['sf-committee']);
  });

  it('commits missing a runtimeStageId are skipped, not turned into empty ids', () => {
    const holed = commits.map((c, i) => (i === 3 ? {} : c));
    const group = activeChartGroup({ groups: groupsOf(), commits: holed, commitIdx: 3 });
    expect(group?.memberNodeIds.has('')).toBe(false);
  });
});

// ── 6. Performance ────────────────────────────────────────────────

describe('activeChartGroup — performance', () => {
  it('resolves a 5,000-commit group in under 50ms (no new fetch, one pass)', () => {
    const idx = new CommitRangeIndex<BoundaryRangeLabel>();
    idx.open(
      { type: 'run.entry', runtimeStageId: '__root__#0', subflowPath: [], depth: 0, ts: 0 } as BoundaryRangeLabel,
      0,
    );
    idx.open(
      {
        type: 'subflow.entry', runtimeStageId: 'sf-big#0', subflowName: 'Big',
        subflowPath: ['__root__', 'sf-big'], depth: 1, ts: 0,
      } as BoundaryRangeLabel,
      0,
    );
    const many = Array.from({ length: 5000 }, (_, i) => ({ runtimeStageId: `sf-big/s${i % 40}#${i}` }));
    const groups = buildGroups(idx);
    const t0 = performance.now();
    const group = activeChartGroup({ groups, commits: many, commitIdx: 2500 });
    expect(performance.now() - t0).toBeLessThan(50);
    expect(group?.memberNodeIds.size).toBe(41); // 40 stages + the mount
  });
});

// ── 7. ROI ────────────────────────────────────────────────────────

describe('activeChartGroup — ROI', () => {
  it('one function serves both rulers: the same recording, asked at any commit', () => {
    // The whole feature costs the embedder ONE call per cursor move, over data
    // the grouped ruler already computed its stops from.
    const groups = groupsOf();
    const names = [0, 3, 6].map((i) => activeChartGroup({ groups, commits, commitIdx: i })?.name);
    expect(names).toEqual([undefined, 'Committee', undefined]);
  });

  it('the chip name and the boundary rail name are the same string', () => {
    // ONE naming source: `buildGroups` reads `groupDisplayName`, and so does
    // anything rendering the WHAT HAPPENED rail. A second `??` chain is the bug
    // this pins.
    const label = index().overlapping(2, 2).map((e) => e.label).find((l) => l.runtimeStageId === 'sf-committee#0')!;
    const group = activeChartGroup({ groups: groupsOf(), commits, commitIdx: 3 });
    expect(group?.name).toBe(groupDisplayName(label));
  });
});
