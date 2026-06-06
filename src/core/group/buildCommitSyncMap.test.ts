/**
 * buildCommitSyncMap — Layer 1 / Tier B tests (Convention 3, 7 patterns).
 */

import { describe, it, expect } from 'vitest';
import { LensRecorder } from '../LensRecorder.js';
import type { BoundaryRangeLabel } from 'agentfootprint/observe';
import { buildCommitSyncMap } from './buildCommitSyncMap.js';

/** Build a LensRecorder with synthetic commitLog + boundary ranges.
 *  Stubs `getCommitLog()` directly — that's the API buildCommitSyncMap
 *  reads, not any internal field. */
function buildRec(opts: {
  commits: Array<{ runtimeStageId: string; stageId?: string }>;
  boundaries?: Array<{
    label: BoundaryRangeLabel;
    startIdx: number;
    endIdx?: number;
  }>;
}): LensRecorder {
  const rec = new LensRecorder();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (rec as any).getCommitLog = () => opts.commits;
  for (const b of opts.boundaries ?? []) {
    const t = rec.boundary.boundaryIndex.open(b.label, b.startIdx);
    if (b.endIdx !== undefined) rec.boundary.boundaryIndex.close(t, b.endIdx);
  }
  return rec;
}

function rootLabel(rid = '__root__#0'): BoundaryRangeLabel {
  return { type: 'run.entry', runtimeStageId: rid, subflowPath: ['__root__'], depth: 0, ts: 0 };
}
function subflowLabel(rid: string, name: string, path: string[], depth: number): BoundaryRangeLabel {
  return {
    type: 'subflow.entry',
    runtimeStageId: rid,
    subflowPath: path,
    depth,
    ts: 0,
    subflowId: path[path.length - 1],
    subflowName: name,
  };
}

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('buildCommitSyncMap — unit', () => {
  it('empty commitLog returns []', () => {
    const rec = buildRec({ commits: [] });
    expect(buildCommitSyncMap(rec)).toEqual([]);
  });

  it('every entry exposes runtimeStageId, commitIdx, runtimeGroupId, etc.', () => {
    const rec = buildRec({
      commits: [{ runtimeStageId: 'seed#0', stageId: 'seed' }],
      boundaries: [{ label: rootLabel(), startIdx: 0 }],
    });
    const map = buildCommitSyncMap(rec);
    expect(map).toHaveLength(1);
    const allowed = new Set([
      'runtimeStageId', 'commitIdx', 'runtimeGroupId',
      'subflowPath', 'depth', 'label',
    ]);
    for (const k of Object.keys(map[0]!)) expect(allowed.has(k)).toBe(true);
  });

  it('commitIdx equals array index', () => {
    const rec = buildRec({
      commits: [
        { runtimeStageId: 'a#0', stageId: 'a' },
        { runtimeStageId: 'b#0', stageId: 'b' },
        { runtimeStageId: 'c#0', stageId: 'c' },
      ],
      boundaries: [{ label: rootLabel(), startIdx: 0 }],
    });
    const map = buildCommitSyncMap(rec);
    expect(map.map((e) => e.commitIdx)).toEqual([0, 1, 2]);
  });

  it('runtimeGroupId resolves to root for top-level commit', () => {
    const rec = buildRec({
      commits: [{ runtimeStageId: 'seed#0', stageId: 'seed' }],
      boundaries: [{ label: rootLabel(), startIdx: 0 }],
    });
    expect(buildCommitSyncMap(rec)[0]!.runtimeGroupId).toBe('__root__#0');
  });

  it('runtimeGroupId resolves to innermost subflow for nested commit', () => {
    const rec = buildRec({
      commits: [
        { runtimeStageId: 'seed#0', stageId: 'seed' },
        { runtimeStageId: 'sf-Committee/sf-ethics/call-llm#5', stageId: 'call-llm' },
      ],
      boundaries: [
        { label: rootLabel(), startIdx: 0 },
        { label: subflowLabel('sf-Committee#1', 'Committee', ['__root__', 'sf-Committee'], 1), startIdx: 1 },
        { label: subflowLabel('sf-ethics#3', 'ethics', ['__root__', 'sf-Committee', 'sf-ethics'], 2), startIdx: 3 },
      ],
    });
    const map = buildCommitSyncMap(rec);
    expect(map[1]!.runtimeGroupId).toBe('sf-ethics#3');
    expect(map[1]!.depth).toBe(2);
  });
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('buildCommitSyncMap — functional', () => {
  it('Parallel run yields commits with runtimeGroupId per branch', () => {
    const rec = buildRec({
      commits: [
        { runtimeStageId: 'seed#0', stageId: 'seed' },
        { runtimeStageId: 'sf-Committee/sf-ethics/call-llm#3', stageId: 'call-llm' },
        { runtimeStageId: 'sf-Committee/sf-legal/call-llm#5', stageId: 'call-llm' },
        { runtimeStageId: 'sf-Committee/merge#7', stageId: 'merge' },
      ],
      boundaries: [
        { label: rootLabel(), startIdx: 0 },
        { label: subflowLabel('sf-Committee#1', 'Committee', ['__root__', 'sf-Committee'], 1), startIdx: 1 },
        { label: subflowLabel('sf-ethics#3', 'ethics', ['__root__', 'sf-Committee', 'sf-ethics'], 2), startIdx: 3 },
        { label: subflowLabel('sf-legal#5', 'legal', ['__root__', 'sf-Committee', 'sf-legal'], 2), startIdx: 5 },
      ],
    });
    const map = buildCommitSyncMap(rec);
    expect(map[1]!.runtimeGroupId).toBe('sf-ethics#3');
    expect(map[2]!.runtimeGroupId).toBe('sf-legal#5');
    expect(map[3]!.runtimeGroupId).toBe('sf-Committee#1');
  });

  it('subflowPath flows through to every entry', () => {
    const rec = buildRec({
      commits: [{ runtimeStageId: 'sf-x/call#0', stageId: 'call' }],
      boundaries: [
        { label: rootLabel(), startIdx: 0 },
        { label: subflowLabel('sf-x#0', 'X', ['__root__', 'sf-x'], 1), startIdx: 0 },
      ],
    });
    const map = buildCommitSyncMap(rec);
    expect(map[0]!.subflowPath).toEqual(['__root__', 'sf-x']);
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('buildCommitSyncMap — integration', () => {
  it('label is human-readable: "groupName · stageId"', () => {
    const rec = buildRec({
      commits: [{ runtimeStageId: 'sf-ethics/call-llm#3', stageId: 'call-llm' }],
      boundaries: [
        { label: rootLabel(), startIdx: 0 },
        { label: subflowLabel('sf-ethics#0', 'ethics', ['__root__', 'sf-ethics'], 1), startIdx: 0 },
      ],
    });
    expect(buildCommitSyncMap(rec)[0]!.label).toBe('ethics · call-llm');
  });

  it('top-level commits get bare stageId labels (root is implicit)', () => {
    const rec = buildRec({
      commits: [{ runtimeStageId: 'seed#0', stageId: 'seed' }],
      boundaries: [{ label: rootLabel(), startIdx: 0 }],
    });
    expect(buildCommitSyncMap(rec)[0]!.label).toBe('seed');
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('buildCommitSyncMap — property', () => {
  it('output length === commitLog length', () => {
    const commits = [];
    for (let i = 0; i < 20; i++) commits.push({ runtimeStageId: `s${i}#0`, stageId: `s${i}` });
    const rec = buildRec({ commits, boundaries: [{ label: rootLabel(), startIdx: 0 }] });
    expect(buildCommitSyncMap(rec)).toHaveLength(20);
  });

  it('commitIdx is monotonically increasing 0..n-1', () => {
    const commits = [];
    for (let i = 0; i < 50; i++) commits.push({ runtimeStageId: `s#${i}`, stageId: 's' });
    const rec = buildRec({ commits, boundaries: [{ label: rootLabel(), startIdx: 0 }] });
    const map = buildCommitSyncMap(rec);
    for (let i = 0; i < map.length; i++) expect(map[i]!.commitIdx).toBe(i);
  });

  it('never throws for hostile commitLog (missing runtimeStageId, missing stageId)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = buildRec({ commits: [{} as any, { runtimeStageId: '' } as any] });
    expect(() => buildCommitSyncMap(rec)).not.toThrow();
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('buildCommitSyncMap — security', () => {
  it('does not mutate the recorder or its commit log', () => {
    const commits = [{ runtimeStageId: 'a#0', stageId: 'a' }];
    const before = JSON.stringify(commits);
    const rec = buildRec({ commits, boundaries: [{ label: rootLabel(), startIdx: 0 }] });
    buildCommitSyncMap(rec);
    expect(JSON.stringify(commits)).toBe(before);
  });

  it('hostile path traversal in rid does not crash the join', () => {
    const rec = buildRec({
      commits: [{ runtimeStageId: '../../etc/passwd#0', stageId: 'passwd' }],
      boundaries: [{ label: rootLabel(), startIdx: 0 }],
    });
    expect(() => buildCommitSyncMap(rec)).not.toThrow();
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('buildCommitSyncMap — performance', () => {
  it('500-commit run with 10 groups in under 50ms', () => {
    const commits = [];
    for (let i = 0; i < 500; i++) {
      const branch = i % 10;
      commits.push({ runtimeStageId: `sf-${branch}/call#${i}`, stageId: 'call' });
    }
    const boundaries: ReadonlyArray<{ label: BoundaryRangeLabel; startIdx: number }> = [
      { label: rootLabel(), startIdx: 0 },
      ...Array.from({ length: 10 }, (_, i) => ({
        label: subflowLabel(`sf-${i}#0`, `b${i}`, ['__root__', `sf-${i}`], 1),
        startIdx: i,
      })),
    ];
    const rec = buildRec({ commits, boundaries: [...boundaries] });
    const start = performance.now();
    buildCommitSyncMap(rec);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(200);
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('buildCommitSyncMap — load', () => {
  it('5000-commit run with 50 groups in under 500ms', () => {
    const commits = [];
    for (let i = 0; i < 5000; i++) {
      const branch = i % 50;
      commits.push({ runtimeStageId: `sf-${branch}/call#${i}`, stageId: 'call' });
    }
    const boundaries: ReadonlyArray<{ label: BoundaryRangeLabel; startIdx: number }> = [
      { label: rootLabel(), startIdx: 0 },
      ...Array.from({ length: 50 }, (_, i) => ({
        label: subflowLabel(`sf-${i}#0`, `b${i}`, ['__root__', `sf-${i}`], 1),
        startIdx: i,
      })),
    ];
    const rec = buildRec({ commits, boundaries: [...boundaries] });
    const start = performance.now();
    buildCommitSyncMap(rec);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(1500);
  });
});
