/**
 * `selectSkillTopology` — the drawable graph at one beat, over the REAL
 * recording plus the arms it cannot contain.
 *
 * The facts under test are the ones a canvas cannot invent for itself:
 *
 *   • DECLARED and OBSERVED are one edge row with two booleans, so an
 *     author's edge that fired is drawn once, not twice;
 *   • what a recording declares is a LOWER BOUND, and `declaredSource` says
 *     so — the difference between "the author drew one edge" and "one edge
 *     fired" is the difference between a lie and a fact;
 *   • node state is resolved ONCE, in a stated precedence, so two panels
 *     cannot disagree about where the cursor is.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import { observeRecording, type Recording } from '../observeRecording.js';
import { selectSkillRoute, type SkillRoute } from './selectSkillRoute.js';
import { selectSkillBeats, type SkillBeat } from './selectSkillBeats.js';
import { selectSkillTopology } from './selectSkillTopology.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');

function realRoute(): SkillRoute {
  const recording = JSON.parse(
    readFileSync(join(FIXTURES, 'skill-route-refusal.json'), 'utf8'),
  ) as Recording;
  return selectSkillRoute({ log: observeRecording(recording).recorder.selectEventLog() });
}

function beatsOf(route: SkillRoute): readonly SkillBeat[] {
  return selectSkillBeats({ route });
}

describe('selectSkillTopology — over the recording the library produced', () => {
  it('states the cursor, the refusal, and the reachable set at the opening beat', () => {
    const route = realRoute();
    const topo = selectSkillTopology({ route, beat: beatsOf(route)[0] });
    const byId = new Map(topo.nodes.map((n) => [n.id, n]));

    expect(byId.get('triage')!.state).toBe('current');
    // The gate refused this one HERE — a stronger fact than "not visited".
    expect(byId.get('audit-log')!.state).toBe('refused');
    expect(byId.get('audit-log')!.refusedHere).toBe(true);
    // Named by `skill.rejected.allowed` — the only typed reachable list there is.
    expect(byId.get('volume-lookup')!.state).toBe('reachable');
    expect(byId.get('triage')!.pickedByModel).toBe(false);
  });

  it('moves the states with the beat, and marks the edge the beat took', () => {
    const route = realRoute();
    const beats = beatsOf(route);

    const atPick = selectSkillTopology({ route, beat: beats[2] });
    const pickById = new Map(atPick.nodes.map((n) => [n.id, n]));
    expect(pickById.get('volume-lookup')!.state).toBe('current');
    expect(pickById.get('volume-lookup')!.pickedByModel).toBe(true);
    expect(pickById.get('triage')!.state).toBe('visited');
    expect(atPick.edges.find((e) => e.id === 'triage->volume-lookup')!.active).toBe(true);

    const atRoute = selectSkillTopology({ route, beat: beats[3] });
    expect(new Map(atRoute.nodes.map((n) => [n.id, n])).get('audit-log')!.state).toBe('current');
    expect(atRoute.edges.find((e) => e.id === 'triage->volume-lookup')!.active).toBe(false);
    expect(atRoute.edges.find((e) => e.id === 'volume-lookup->audit-log')!.active).toBe(true);
  });

  it('keeps declared and observed apart on ONE row per edge', () => {
    const route = realRoute();
    const topo = selectSkillTopology({ route, beat: beatsOf(route)[3] });

    // The author's edge, which also fired: one row, both booleans.
    const declaredAndTaken = topo.edges.find((e) => e.id === 'volume-lookup->audit-log')!;
    expect(declaredAndTaken.declared).toBe(true);
    expect(declaredAndTaken.observed).toBe(true);
    expect(declaredAndTaken.by).toBe('route');
    expect(declaredAndTaken.triggerKind).toBe('on-tool-return');
    expect(declaredAndTaken.takenAt).toEqual([{ turnIndex: 0, iteration: 4 }]);

    // The model's own hop: observed, and the recording never declared it.
    const modelHop = topo.edges.find((e) => e.id === 'triage->volume-lookup')!;
    expect(modelHop.observed).toBe(true);
    expect(modelHop.declared).toBe(false);

    // The cold start is not an edge between two nodes.
    expect(topo.edges.some((e) => e.to === 'triage' && e.from === undefined)).toBe(false);
    expect(topo.edges).toHaveLength(2);
  });

  it('says the declared set came from the RECORDING — a lower bound', () => {
    const route = realRoute();
    expect(selectSkillTopology({ route }).declaredSource).toBe('recording');
  });

  it('takes the author\'s full graph when a caller has it, without dropping what fired', () => {
    const route = realRoute();
    const topo = selectSkillTopology({
      route,
      beat: beatsOf(route)[0],
      declaredEdges: [
        { from: 'triage', to: 'volume-lookup', label: 'model edge' },
        { from: 'triage', to: 'inventory', label: 'model edge' },
      ],
    });
    expect(topo.declaredSource).toBe('graph');
    expect(topo.edges.find((e) => e.id === 'triage->volume-lookup')!.declared).toBe(true);
    expect(topo.edges.find((e) => e.id === 'triage->volume-lookup')!.label).toBe('model edge');
    // A caller's list can be stale; an edge that FIRED demonstrably exists.
    expect(topo.edges.find((e) => e.id === 'volume-lookup->audit-log')!.declared).toBe(true);
    // A node only the author's graph knows about still gets drawn.
    expect(topo.nodes.some((n) => n.id === 'inventory')).toBe(true);
    expect(topo.nodes.find((n) => n.id === 'inventory')!.state).toBe('idle');
  });

  it('before the first routing stop, everything is idle and nothing is active', () => {
    const route = realRoute();
    const topo = selectSkillTopology({ route });
    expect(topo.nodes.every((n) => n.state === 'idle')).toBe(true);
    expect(topo.edges.every((e) => !e.active)).toBe(true);
    // The whole-run visited flag still reports what the run did.
    expect(topo.nodes.every((n) => n.visitedInRun)).toBe(true);
  });
});

describe('selectSkillTopology — the shapes one run does not have', () => {
  const emptyRoute: SkillRoute = {
    hasRouting: false,
    nodes: [],
    hops: [],
    observedEdges: [],
    declaredEdges: [],
    turns: [],
  };

  it('reports an empty graph as empty, and says nothing was declared', () => {
    const topo = selectSkillTopology({ route: emptyRoute });
    expect(topo.nodes).toEqual([]);
    expect(topo.edges).toEqual([]);
    expect(topo.declaredSource).toBe('none');
  });

  it('draws a skill the catalog never listed but the cursor stood in', () => {
    const route: SkillRoute = {
      ...emptyRoute,
      hasRouting: true,
      nodes: [{ id: 'ghost', visited: true }],
      hops: [],
      observedEdges: [{ from: 'ghost', to: 'other', by: 'route', takenAt: [] }],
    };
    const topo = selectSkillTopology({ route });
    expect(topo.nodes.map((n) => n.id).sort()).toEqual(['ghost', 'other']);
  });

  it('does not mutate the route it was given', () => {
    const route = realRoute();
    const before = JSON.stringify(route);
    const topo = selectSkillTopology({ route, beat: beatsOf(route)[2] });
    (topo.nodes as unknown[]).push({ id: 'injected' });
    expect(JSON.stringify(route)).toBe(before);
    expect(selectSkillTopology({ route }).nodes.some((n) => n.id === 'injected')).toBe(false);
  });
});
