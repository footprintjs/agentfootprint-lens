/** @vitest-environment node */
import type { StepNode } from 'agentfootprint/observe';
import { describe, expect, it, vi } from 'vitest';

import type { CursorPosition } from '../group/cursorPositionsAtDrill.js';
import { prepareSkillGraph } from './prepareSkillGraph.js';
import type { SkillHop, SkillRoute } from './selectSkillRoute.js';

function hop(iteration: number, fields: Partial<SkillHop> = {}): SkillHop {
  return {
    turnIndex: 0,
    iteration,
    moved: false,
    activeIds: [],
    supersededIds: [],
    refusals: [],
    conflicts: [],
    superseded: [],
    toolsAsSent: [],
    skillInjections: [],
    ...fields,
  };
}

function route(): SkillRoute {
  return {
    hasRouting: true,
    nodes: [{ id: 'triage', visited: true }, { id: 'lookup', visited: true }, { id: 'audit', visited: false }],
    hops: [
      hop(1, { runtimeStageId: 'skill/evaluate#3', to: 'triage', by: 'entry', moved: true }),
      hop(2, { from: 'triage', to: 'triage', by: 'stay' }),
      hop(3, { runtimeStageId: 'skill/evaluate#10', from: 'triage', to: 'triage', by: 'stay' }),
      hop(4, { runtimeStageId: 'skill/evaluate#15', from: 'triage', to: 'lookup', by: 'route', moved: true }),
      hop(5, { turnIndex: 1, runtimeStageId: 'skill/evaluate#20', from: 'lookup', to: 'triage', by: 'model-pick', moved: true }),
    ],
    observedEdges: [{ from: 'triage', to: 'lookup', by: 'route', takenAt: [{ turnIndex: 0, iteration: 4 }] }],
    declaredEdges: [{ from: 'triage', to: 'lookup', label: 'Look up' }],
    turns: [
      { turnIndex: 0, by: 'rule', to: 'triage', scores: [] },
      { turnIndex: 0, by: 'decider', to: 'audit', scores: [] },
      { turnIndex: 1, by: 'resume', to: 'lookup', scores: [] },
    ],
  };
}

function position(runtimeStageId: string, kind: CursorPosition['kind'] = 'commit'): CursorPosition {
  return { runtimeStageId, runtimeGroupId: runtimeStageId, label: runtimeStageId, kind, depth: 0, commitIdx: 0 };
}

function call(runtimeStageId: string): StepNode {
  return { id: runtimeStageId, kind: 'user->llm', label: 'Model call', startOffsetMs: 0, subflowPath: [], runtimeStageId };
}

describe('prepareSkillGraph', () => {
  it('keeps repeated visits in routing order and skips only unaddressable jump targets', () => {
    const view = prepareSkillGraph(route());

    expect(view.beats.map(({ cursorSkillId }) => cursorSkillId)).toEqual(['triage', 'triage', 'triage', 'lookup', 'triage']);
    expect(view.beats[1]?.runtimeStageId).toBeUndefined();
    expect([...view.jumpableSkillIds]).toEqual(['triage', 'lookup']);
    expect(view.nextVisit('triage')).toBe('skill/evaluate#3');
    expect(view.nextVisit('triage', 0)).toBe('skill/evaluate#10');
    expect(view.nextVisit('triage', 2)).toBe('skill/evaluate#20');
    expect(view.nextVisit('triage', 4)).toBe('skill/evaluate#3');
    expect(view.nextVisit('audit')).toBeUndefined();
  });

  it('reads the first recorded turn verdict and distinguishes bookends from active beats', () => {
    const recording = route();
    const view = prepareSkillGraph(recording);

    const before = view.at('__root__#0', 'group-start');
    expect(before.beat).toBeUndefined();
    expect(before.turnStart).toBeUndefined();
    expect(before.topology.nodes.every(({ state }) => state === 'idle')).toBe(true);
    expect(view.at('skill#2').beat).toBe(view.beats[0]);
    const active = view.at('other#17');
    expect(active.beat).toBe(view.beats[3]);
    expect(active.turnStart).toBe(recording.turns[0]);
    expect(active.topology.edges[0]).toMatchObject({ declared: true, observed: true, active: true });
    const finished = view.at('__root__#21', 'group-end');
    expect(finished.turnStart).toBe(recording.turns[2]);
    expect(view.at('')).toBe(finished);
    expect(view.at('unknown-address').beat).toBeUndefined();
  });

  it('deduplicates first exact and enclosing stops, and keeps the earlier fallback for snaps', () => {
    const recording = route();
    const view = prepareSkillGraph({ ...recording, hops: [...recording.hops, hop(6, { runtimeStageId: 'other#22' })] });
    const axis = [position('skill#2'), position('skill/evaluate#3', 'group-start'),
      position('skill/evaluate#3', 'group-end'), position('skill#8'), position('previous#18')];

    expect(view.snapSteps(axis)).toEqual([1, 3, 4]);
    expect(view.snapSteps([])).toBeUndefined();
    expect(view.snapSteps([position('later#50')])).toBeUndefined();
  });

  it('reuses the last reading without mutating earlier results or the routing record', () => {
    const recording = route();
    const sourceBefore = structuredClone(recording);
    const view = prepareSkillGraph(recording);
    const first = view.at('skill/evaluate#3');
    expect(view.at('other#5')).toBe(first);
    const firstTopology = structuredClone(first.topology);

    const authorEdges = [{ from: 'triage', to: 'audit' }];
    const complete = view.at('skill/evaluate#3', undefined, authorEdges);
    expect(complete).not.toBe(first);
    expect(complete.topology.declaredComplete).toBe(true);
    expect(view.at('other#5', undefined, authorEdges)).toBe(complete);
    view.at('skill/evaluate#15');
    const replayed = view.at('skill/evaluate#3');
    expect(replayed).not.toBe(first);
    expect(replayed.topology).toEqual(firstTopology);
    expect(first.topology).toEqual(firstTopology);
    expect(recording).toEqual(sourceBefore);
  });

  it('reads model frame evidence on demand within the selected beat window', () => {
    const view = prepareSkillGraph(route());
    const readNodes = vi.fn(() => [call('llm#12'), call('llm#22')]);
    const graph = { get nodes() { return readNodes(); } };
    const noBeat = view.at('__root__#0', 'group-start');
    const first = view.at('skill/evaluate#10');
    const next = view.at('skill/evaluate#15');

    expect(noBeat.frameContext(graph)).toBeUndefined();
    expect(readNodes).not.toHaveBeenCalled();
    expect(first.frameContext(graph)).toMatchObject({ paired: true, stepRuntimeStageId: 'llm#12', injections: [] });
    expect(next.frameContext(graph)).toEqual({ paired: false, injections: [], totalInjections: 0 });
    expect(readNodes).toHaveBeenCalledTimes(2);
  });
});
