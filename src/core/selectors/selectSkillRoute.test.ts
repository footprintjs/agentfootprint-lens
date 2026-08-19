/**
 * selectSkillRoute — the routing fold, over a REAL recording plus era arms.
 *
 * The centrepiece is S1, the WORKED FAILURE, replayed end to end from
 * `__fixtures__/skill-route-refusal.json` — a run of the real library, not a
 * hand-written log (see that folder's README). One turn, four iterations:
 *
 *   iter 1  the model reaches for `audit-log`, which is reachable only from
 *           `volume-lookup`. The gate refuses.
 *   iter 2  the cursor is resolved again and NOTHING moved it — `by: 'stay'`,
 *           from `triage` to `triage`. That is the proof the refusal held.
 *   iter 3  the model picks a reachable skill instead → `by: 'model-pick'`.
 *   iter 4  the tool return fires the author's declared edge → `by: 'route'`.
 *
 * S1 asserts the FOUR facts of the failure on one row, correlated across the
 * one-iteration lag between a refusal and the cursor row that answers it:
 * the refusal's own fields, the refusal sentence the model read back, the
 * `read_skill` menu it was reading when it asked, and the cursor that did not
 * move. Break the correlation and S1 must fail — that is what it is for.
 *
 * The remaining arms are synthetic on purpose: they cover events the fixture's
 * era does not emit (`agent.evidence_checked` shipped in agentfootprint 9.35.0,
 * after this package's 9.30.0 devDependency) and shapes a single happy run
 * cannot contain (a refusal on the last iteration, two turns, a plain agent).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import type { AgentfootprintEvent } from 'agentfootprint/events';

import { observeRecording, type Recording } from '../observeRecording.js';
import type { EventLogEntry } from '../types.js';
import { selectSkillRoute, type SkillHop } from './selectSkillRoute.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');

function loadRecording(): Recording {
  return JSON.parse(
    readFileSync(join(FIXTURES, 'skill-route-refusal.json'), 'utf8'),
  ) as Recording;
}

/** The real rail a consumer uses: recording → LensRecorder → event log. */
function logFromFixture(): readonly EventLogEntry[] {
  return observeRecording(loadRecording()).recorder.selectEventLog();
}

/** A synthetic log entry — same envelope the dispatcher stamps. */
let seq = 0;
function entry(
  type: string,
  payload: Record<string, unknown>,
  runtimeStageId = `stage#${seq}`,
): EventLogEntry {
  seq += 1;
  return {
    seq,
    wallClockMs: 1000 + seq,
    runOffsetMs: seq,
    runtimeStageId,
    event: {
      type,
      payload,
      meta: {
        wallClockMs: 1000 + seq,
        runOffsetMs: seq,
        runtimeStageId,
        subflowPath: [],
        compositionPath: [],
        runId: 'test',
      },
    } as unknown as AgentfootprintEvent,
  };
}

const EVALUATED = 'agentfootprint.context.evaluated';
const LLM_START = 'agentfootprint.stream.llm_start';
const TOOL_START = 'agentfootprint.stream.tool_start';
const TOOL_END = 'agentfootprint.stream.tool_end';
const REJECTED = 'agentfootprint.skill.rejected';
const TURN_START = 'agentfootprint.agent.turn_start';
const ITERATION_START = 'agentfootprint.agent.iteration_start';
const TURN_ROUTED = 'agentfootprint.skill.turn_routed';
const ROUTE_CONFLICT = 'agentfootprint.skill.route_conflict';
const REROUTE_SUPERSEDED = 'agentfootprint.skill.reroute_superseded';
const EVIDENCE_CHECKED = 'agentfootprint.agent.evidence_checked';

function hopAt(hops: readonly SkillHop[], iteration: number, turnIndex = 0): SkillHop {
  const hop = hops.find((h) => h.iteration === iteration && h.turnIndex === turnIndex);
  if (hop === undefined) throw new Error(`no hop at turn ${turnIndex} iteration ${iteration}`);
  return hop;
}

// ─── S1 — the worked failure, from the real recording ────────────────────

describe('selectSkillRoute — S1: a refused pick, end to end', () => {
  it('reads the recording the library actually produced', () => {
    // Pins the fixture: a swapped or re-recorded turn fails loudly here rather
    // than quietly re-baselining every assertion below.
    const recording = loadRecording();
    expect(recording.events?.length).toBe(102);
    const log = logFromFixture();
    expect(log.length).toBe(102);
  });

  it('surfaces all four facts of the failure, correlated by iteration', () => {
    const route = selectSkillRoute({ log: logFromFixture() });
    expect(route.hasRouting).toBe(true);

    // The refusal is stamped on the iteration the model ASKED on.
    const asked = hopAt(route.hops, 1);
    expect(asked.refusals).toHaveLength(1);
    const refusal = asked.refusals[0]!;

    // FACT 1 — what was refused, from where, and what was reachable instead.
    expect(refusal.requestedId).toBe('audit-log');
    expect(refusal.currentSkillId).toBe('triage');
    expect(refusal.allowed).toEqual(['volume-lookup']);

    // FACT 2 — the sentence the MODEL read: the refused call's tool result.
    expect(refusal.refusalText).toBe(
      'read_skill("audit-log") is not reachable from here. Reachable skills: volume-lookup. Pick one of these, or finish.',
    );
    expect(refusal.toolCallId).toBe('c1');

    // FACT 3 — what told it what was reachable: read_skill's own description,
    // verbatim, off the same iteration's llm_start.
    expect(asked.readSkillDescription).toContain('Reachable from here:');
    expect(asked.readSkillDescription).toContain('- volume-lookup:');
    expect(asked.readSkillDescription).toContain(
      'Not reachable from here (read_skill for these will be refused)',
    );
    expect(asked.readSkillDescription).toContain('audit-log');
    expect(asked.toolsAsSent.map((t) => t.name)).toEqual(['read_skill']);

    // FACT 4 — the cursor did NOT move. It is the NEXT iteration's row that
    // says so (the one-iteration lag), and the refusal carries it.
    expect(refusal.cursorAfter).toEqual({
      iteration: 2,
      from: 'triage',
      to: 'triage',
      by: 'stay',
      moved: false,
    });
    // The same row, read directly — the correlation above is not a private copy.
    const stayed = hopAt(route.hops, 2);
    expect(stayed.by).toBe('stay');
    expect(stayed.moved).toBe(false);
    expect(stayed.refusals).toHaveLength(0);
  });

  it('folds the whole cursor chain — all four iterations, in order', () => {
    const route = selectSkillRoute({ log: logFromFixture() });
    expect(route.hops.map((h) => [h.iteration, h.by, h.from, h.to])).toEqual([
      [1, 'entry', undefined, 'triage'],
      [2, 'stay', 'triage', 'triage'],
      [3, 'model-pick', 'triage', 'volume-lookup'],
      [4, 'route', 'volume-lookup', 'audit-log'],
    ]);
    expect(route.hops.map((h) => h.moved)).toEqual([true, false, true, true]);
    // Every hop is anchored to the evaluate stage its cursor resolved at, so a
    // view can move the ONE lens cursor to it.
    expect(route.hops.map((h) => h.runtimeStageId)).toEqual([
      'sf-injection-engine/evaluate#3',
      'sf-injection-engine/evaluate#26',
      'sf-injection-engine/evaluate#49',
      'sf-injection-engine/evaluate#72',
    ]);
  });

  it('folds the catalog into nodes, and marks which ones the cursor visited', () => {
    const route = selectSkillRoute({ log: logFromFixture() });
    expect(route.nodes).toEqual([
      { id: 'triage', description: 'Start here: triage a storage request.', visited: true },
      {
        id: 'volume-lookup',
        description: 'Resolve a storage volume by WWN and report its load.',
        visited: true,
      },
      {
        id: 'audit-log',
        description: 'Read the audit log for a resolved volume.',
        visited: true,
      },
    ]);
  });

  it('folds the hops the cursor took into observed edges — a stay is not one', () => {
    const route = selectSkillRoute({ log: logFromFixture() });
    expect(
      route.observedEdges.map((e) => [e.from, e.to, e.by, e.takenAt.length]),
    ).toEqual([
      [undefined, 'triage', 'entry', 1],
      ['triage', 'volume-lookup', 'model-pick', 1],
      ['volume-lookup', 'audit-log', 'route', 1],
    ]);
    // The author's declared edge, off `routing[]` provenance — and its trigger.
    expect(route.declaredEdges).toEqual([
      { from: 'volume-lookup', to: 'audit-log', triggerKind: 'on-tool-return' },
    ]);
    const routed = route.observedEdges.find((e) => e.by === 'route');
    expect(routed?.triggerKind).toBe('on-tool-return');
  });

  it('carries what each iteration had loaded and what the skills injected', () => {
    const route = selectSkillRoute({ log: logFromFixture() });
    expect(hopAt(route.hops, 1).activeIds).toEqual(['triage']);
    expect(hopAt(route.hops, 3).activeIds).toEqual(['triage', 'volume-lookup']);
    const injected = hopAt(route.hops, 3).skillInjections;
    expect(injected.some((i) => i.skillId === 'volume-lookup' && i.slot === 'system-prompt')).toBe(
      true,
    );
    expect(injected.find((i) => i.skillId === 'volume-lookup')?.text).toContain(
      'get_volume_by_wwn',
    );
  });

  it('this run had no turn-start cascade, and says so rather than inventing one', () => {
    const route = selectSkillRoute({ log: logFromFixture() });
    expect(route.turns).toEqual([]);
  });
});

// ─── S2 — the lag, at the edges ──────────────────────────────────────────

describe('selectSkillRoute — S2: the refusal→cursor lag', () => {
  it('a refusal on the LAST iteration has no cursorAfter (no row to claim)', () => {
    const log = [
      entry(TURN_START, { turnIndex: 0 }),
      entry(EVALUATED, { iteration: 1, activeIds: ['triage'], cursorMove: { to: 'triage', by: 'entry' } }),
      entry(REJECTED, { requestedId: 'audit-log', currentSkillId: 'triage', allowed: ['volume-lookup'], iteration: 1 }),
    ];
    const route = selectSkillRoute({ log });
    expect(route.hops[0]!.refusals[0]!.cursorAfter).toBeUndefined();
  });

  it('iterations restart per turn — a refusal never reads the WRONG turn’s row', () => {
    // Turn 0 iteration 1 refuses; turn 1 iteration 1 is a fresh conversation
    // turn whose cursor DID move. Keying hops by iteration alone would hand
    // turn 0's refusal turn 1's row and report "the cursor moved".
    const log = [
      entry(TURN_START, { turnIndex: 0 }),
      entry(EVALUATED, { iteration: 1, activeIds: [], cursorMove: { to: 'triage', by: 'entry' } }),
      entry(REJECTED, { requestedId: 'audit-log', currentSkillId: 'triage', allowed: ['volume-lookup'], iteration: 1 }),
      entry(TURN_START, { turnIndex: 1 }),
      entry(EVALUATED, { iteration: 1, activeIds: [], cursorMove: { from: 'triage', to: 'billing', by: 'intent' } }),
    ];
    const route = selectSkillRoute({ log });
    const refusal = hopAt(route.hops, 1, 0).refusals[0]!;
    expect(refusal.turnIndex).toBe(0);
    expect(refusal.cursorAfter).toBeUndefined();
    expect(hopAt(route.hops, 1, 1).by).toBe('intent');
  });

  it('a refusal with no tool result carries no sentence rather than a guess', () => {
    const log = [
      entry(REJECTED, { requestedId: 'audit-log', allowed: [], iteration: 1 }),
      entry(EVALUATED, { iteration: 2, activeIds: [], cursorMove: { from: 'triage', to: 'triage', by: 'stay' } }),
    ];
    const refusal = selectSkillRoute({ log }).hops[0]!.refusals[0]!;
    expect(refusal.refusalText).toBeUndefined();
    expect(refusal.cursorAfter?.by).toBe('stay');
  });

  it('pairs each refusal with ITS OWN call when two are refused on one iteration', () => {
    const log = [
      entry(EVALUATED, { iteration: 1, activeIds: [], cursorMove: { to: 'triage', by: 'entry' } }),
      entry(TOOL_START, { toolName: 'read_skill', toolCallId: 'a1', args: { id: 'audit-log' } }),
      entry(REJECTED, { requestedId: 'audit-log', allowed: ['x'], iteration: 1 }),
      entry(TOOL_END, { toolCallId: 'a1', result: 'audit-log is not reachable from here.' }),
      entry(TOOL_START, { toolName: 'read_skill', toolCallId: 'a2', args: { id: 'billing' } }),
      entry(REJECTED, { requestedId: 'billing', allowed: ['x'], iteration: 1 }),
      entry(TOOL_END, { toolCallId: 'a2', result: 'billing is not reachable from here.' }),
    ];
    const refusals = selectSkillRoute({ log }).hops[0]!.refusals;
    expect(refusals.map((r) => [r.requestedId, r.toolCallId, r.refusalText])).toEqual([
      ['audit-log', 'a1', 'audit-log is not reachable from here.'],
      ['billing', 'a2', 'billing is not reachable from here.'],
    ]);
  });

  it('pairs by requested id, not by arrival order, inside ONE parallel batch', () => {
    // Both picks are refused before either result comes back — the shape a
    // parallel tool batch produces. Matching "the newest unanswered refusal"
    // would hand `audit-log`'s sentence to `billing`.
    const log = [
      entry(EVALUATED, { iteration: 1, activeIds: [], cursorMove: { to: 'triage', by: 'entry' } }),
      entry(TOOL_START, { toolName: 'read_skill', toolCallId: 'a1', args: { id: 'audit-log' } }),
      entry(TOOL_START, { toolName: 'read_skill', toolCallId: 'a2', args: { id: 'billing' } }),
      entry(REJECTED, { requestedId: 'audit-log', allowed: ['x'], iteration: 1 }),
      entry(REJECTED, { requestedId: 'billing', allowed: ['x'], iteration: 1 }),
      entry(TOOL_END, { toolCallId: 'a1', result: 'audit-log is not reachable from here.' }),
      entry(TOOL_END, { toolCallId: 'a2', result: 'billing is not reachable from here.' }),
    ];
    const refusals = selectSkillRoute({ log }).hops[0]!.refusals;
    expect(refusals.map((r) => [r.requestedId, r.toolCallId, r.refusalText])).toEqual([
      ['audit-log', 'a1', 'audit-log is not reachable from here.'],
      ['billing', 'a2', 'billing is not reachable from here.'],
    ]);
  });
});

// ─── S3 — the two vocabularies ───────────────────────────────────────────

describe('selectSkillRoute — S3: cursor causes vs turn verdicts', () => {
  it('keeps `menu` on the turn and off the hops (it is not a cursor cause)', () => {
    const log = [
      entry(TURN_START, { turnIndex: 0 }),
      entry(TURN_ROUTED, {
        by: 'menu',
        offered: ['billing', 'refunds'],
        stayOffered: true,
        scores: [
          { id: 'billing', score: 0.51, relevance: 0.4 },
          { id: 'refunds', score: 0.5, relevance: 0.38 },
        ],
        runnerUp: { id: 'refunds', gap: 0.01 },
        decisive: false,
        policy: { nearTieMargin: 0.15, menuSize: 3, floor: 0.2 },
      }),
      entry(EVALUATED, { iteration: 1, activeIds: [], cursorMove: { to: 'billing', by: 'model-pick', offered: ['billing', 'refunds'] } }),
    ];
    const route = selectSkillRoute({ log });
    expect(route.turns).toHaveLength(1);
    expect(route.turns[0]!.by).toBe('menu');
    expect(route.turns[0]!.turnIndex).toBe(0);
    expect(route.turns[0]!.offered).toEqual(['billing', 'refunds']);
    expect(route.turns[0]!.stayOffered).toBe(true);
    expect(route.turns[0]!.runnerUp).toEqual({ id: 'refunds', gap: 0.01 });
    expect(route.turns[0]!.policy).toEqual({ nearTieMargin: 0.15, menuSize: 3, floor: 0.2 });
    // The hop answers the OTHER question — what moved the cursor.
    expect(route.hops[0]!.by).toBe('model-pick');
    expect(route.hops[0]!.offered).toEqual(['billing', 'refunds']);
  });

  it('carries the witness — what the message said that routed the hop', () => {
    const log = [
      entry(EVALUATED, {
        iteration: 1,
        activeIds: [],
        cursorMove: { to: 'refunds', by: 'entry', witness: { text: 'I want a refund', keyword: 'refund' } },
      }),
    ];
    expect(selectSkillRoute({ log }).hops[0]!.witness).toEqual({
      text: 'I want a refund',
      keyword: 'refund',
    });
  });

  it('reads a future era’s tenth cause instead of dropping the hop', () => {
    const log = [
      entry(EVALUATED, { iteration: 1, activeIds: [], cursorMove: { from: 'a', to: 'b', by: 'teleport' } }),
    ];
    const hop = selectSkillRoute({ log }).hops[0]!;
    expect(hop.by).toBe('teleport');
    expect(hop.moved).toBe(true);
  });
});

// ─── S4 — the rest of the wire ───────────────────────────────────────────

describe('selectSkillRoute — S4: conflicts, supersessions, evidence', () => {
  it('folds a route conflict onto its iteration', () => {
    const log = [
      entry(EVALUATED, { iteration: 2, activeIds: [], cursorMove: { from: 'a', to: 'b', by: 'route' } }),
      entry(ROUTE_CONFLICT, {
        iteration: 2,
        fromSkillId: 'a',
        winner: { toolCallId: 'c1', toolName: 'lookup', target: 'b' },
        losers: [{ toolCallId: 'c2', toolName: 'audit', target: 'c' }],
      }),
    ];
    const hop = selectSkillRoute({ log }).hops[0]!;
    expect(hop.conflicts).toHaveLength(1);
    expect(hop.conflicts[0]!.winner).toEqual({ toolCallId: 'c1', toolName: 'lookup', target: 'b' });
    expect(hop.conflicts[0]!.losers).toEqual([{ toolCallId: 'c2', toolName: 'audit', target: 'c' }]);
  });

  it('folds a superseded pick onto its iteration', () => {
    const log = [
      entry(ITERATION_START, { turnIndex: 0, iterIndex: 2 }),
      entry(REROUTE_SUPERSEDED, { volunteeredId: 'capacity', wonId: 'volume-lookup', fromSkillId: 'triage', iteration: 2 }),
    ];
    const hop = hopAt(selectSkillRoute({ log }).hops, 2);
    expect(hop.superseded).toEqual([
      { volunteeredId: 'capacity', wonId: 'volume-lookup', fromSkillId: 'triage' },
    ]);
  });

  it('folds the evidence gate’s verdict (agentfootprint 9.35.0+, newer than the dep)', () => {
    const log = [
      entry(EVALUATED, { iteration: 3, activeIds: [], cursorMove: { from: 'a', to: 'a', by: 'stay' } }),
      entry(EVIDENCE_CHECKED, {
        iteration: 3,
        posture: 'guard',
        candidates: 4,
        unsupported: [{ value: '$4,200', shape: 'currency' }],
        action: 'revision-asked',
        afterRevision: false,
      }),
    ];
    expect(selectSkillRoute({ log }).hops[0]!.evidence).toEqual({
      posture: 'guard',
      candidates: 4,
      unsupported: [{ value: '$4,200', shape: 'currency' }],
      action: 'revision-asked',
      afterRevision: false,
    });
  });

  it('keeps the suppressed entries the cursor law kept off the wire', () => {
    const log = [
      entry(EVALUATED, {
        iteration: 1,
        activeIds: ['triage'],
        supersededIds: ['billing'],
        cursorMove: { to: 'triage', by: 'entry' },
      }),
    ];
    expect(selectSkillRoute({ log }).hops[0]!.supersededIds).toEqual(['billing']);
  });
});

// ─── S5 — runs that do not route, and logs that are not well formed ──────

describe('selectSkillRoute — S5: honest empties', () => {
  it('an empty log folds to an empty record', () => {
    const route = selectSkillRoute({ log: [] });
    expect(route).toEqual({
      hasRouting: false,
      nodes: [],
      hops: [],
      observedEdges: [],
      declaredEdges: [],
      // No `graph_declared` on the record ⇒ the declared set (empty here) is
      // only the fired lower bound, and the fold says so.
      declaredComplete: false,
      turns: [],
    });
  });

  it('a plain agent (no skills) does not claim to have routed', () => {
    // `context.evaluated` fires on EVERY agent run, so its presence alone must
    // not light up a routing view.
    const log = [
      entry(TURN_START, { turnIndex: 0 }),
      entry(EVALUATED, { iteration: 1, activeCount: 0, activeIds: [], skillCatalog: [] }),
      entry(LLM_START, { iteration: 1, tools: [{ name: 'weather', description: 'Get weather' }] }),
    ];
    const route = selectSkillRoute({ log });
    expect(route.hasRouting).toBe(false);
    expect(route.nodes).toEqual([]);
    expect(route.hops[0]!.by).toBeUndefined();
    expect(route.hops[0]!.moved).toBe(false);
    // The iteration is still a row: its tool menu is a fact about the run.
    expect(route.hops[0]!.toolsAsSent).toEqual([{ name: 'weather', description: 'Get weather' }]);
  });

  it('malformed payloads contribute nothing and never throw', () => {
    const log = [
      entry(EVALUATED, { iteration: 1, activeIds: 'not-an-array', cursorMove: 'not-an-object', skillCatalog: [{}, 7] }),
      entry(REJECTED, { allowed: ['x'], iteration: 1 }),
      entry(TOOL_END, { toolCallId: 'unknown', result: 'orphan' }),
      entry(LLM_START, { iteration: 1, tools: [{ description: 'nameless' }] }),
    ];
    const route = selectSkillRoute({ log });
    expect(route.hops[0]!.activeIds).toEqual([]);
    expect(route.hops[0]!.by).toBeUndefined();
    expect(route.hops[0]!.refusals).toEqual([]); // no requestedId ⇒ no refusal
    expect(route.hops[0]!.toolsAsSent).toEqual([]);
    expect(route.nodes).toEqual([]);
  });
});

// ─── The 9.50.0 facts, synthetically — the arms the fixtures cannot pin ───

const GRAPH_DECLARED = 'agentfootprint.skill.graph_declared';

describe('selectSkillRoute — skill.graph_declared (9.50.0)', () => {
  it('folds the declared map: nodes with descriptions, edges with their kind, START apart', () => {
    const log = [
      entry(GRAPH_DECLARED, {
        nodes: [
          { id: 'triage', kind: 'skill', description: 'Sort the request.', label: 'triage' },
          { id: 'deep', kind: 'skill', description: 'Go deep.' },
          { id: 'is-urgent', kind: 'predicate', label: 'urgent?' },
        ],
        edges: [
          { from: null, to: 'triage', kind: 'entry' },
          { from: 'triage', to: 'deep', kind: 'model' },
          { from: 'triage', to: 'is-urgent', kind: 'predicate', label: 'check urgency' },
        ],
      }),
    ];
    const route = selectSkillRoute({ log });

    // The event alone is a routing fact — a map was mounted.
    expect(route.hasRouting).toBe(true);
    expect(route.declaredComplete).toBe(true);

    // The synthetic START is an entry fact, never an edge row.
    expect(route.entryIds).toEqual(['triage']);
    expect(route.declaredEdges.map((e) => `${e.from}->${e.to}`)).toEqual([
      'triage->deep',
      'triage->is-urgent',
    ]);
    // The declared kind rides the same field routing[] fills — one vocabulary.
    expect(route.declaredEdges[0]!.triggerKind).toBe('model');
    expect(route.declaredEdges[1]!.label).toBe('check urgency');

    // Descriptions (and the drawn kind/caption) come free with the map.
    const byId = new Map(route.nodes.map((n) => [n.id, n]));
    expect(byId.get('triage')!.description).toBe('Sort the request.');
    expect(byId.get('is-urgent')!.kind).toBe('predicate');
    expect(byId.get('is-urgent')!.label).toBe('urgent?');
    expect(byId.get('deep')!.visited).toBe(false);
  });

  it('a malformed map contributes nothing instead of aborting the fold', () => {
    const log = [
      entry(GRAPH_DECLARED, { nodes: 'not-an-array', edges: [{ to: 42 }, 'junk', { from: 'a' }] }),
    ];
    const route = selectSkillRoute({ log });
    expect(route.nodes).toEqual([]);
    expect(route.declaredEdges).toEqual([]);
    // The event still proves a map was mounted — declaredComplete stands,
    // it just declared nothing drawable.
    expect(route.declaredComplete).toBe(true);
  });

  it('without the event, declaredComplete stays false — the routing[] lower bound', () => {
    const log = [
      entry(EVALUATED, {
        iteration: 1,
        cursorMove: { from: 'a', to: 'b', by: 'route' },
        routing: [{ injectionId: 'b', from: 'a', triggerKind: 'on-tool-return' }],
      }),
    ];
    const route = selectSkillRoute({ log });
    expect(route.declaredEdges).toHaveLength(1);
    expect(route.declaredComplete).toBe(false);
    expect(route.entryIds).toBeUndefined();
  });
});

describe('selectSkillRoute — cursorMove.reachable and llm_start.systemPromptText (9.50.0)', () => {
  it('keeps [] apart from absent: a dead end is a fact, an old era is an absence', () => {
    const log = [
      entry(EVALUATED, { iteration: 1, cursorMove: { to: 'a', by: 'entry', reachable: ['b'] } }),
      entry(EVALUATED, { iteration: 2, cursorMove: { from: 'a', to: 'a', by: 'stay', reachable: [] } }),
      entry(EVALUATED, { iteration: 3, cursorMove: { from: 'a', to: 'a', by: 'stay' } }),
    ];
    const { hops } = selectSkillRoute({ log });
    expect(hops[0]!.reachable).toEqual(['b']);
    expect(hops[1]!.reachable).toEqual([]); // the dead end, kept
    expect(hops[2]!.reachable).toBeUndefined(); // the older era, honest
  });

  it('carries the assembled prompt only when the event does — the opt-in, verbatim', () => {
    const log = [
      entry(EVALUATED, { iteration: 1, cursorMove: { to: 'a', by: 'entry' } }),
      entry(LLM_START, { iteration: 1, systemPromptText: 'You are exact.\\nBe brief.' }),
      entry(EVALUATED, { iteration: 2, cursorMove: { from: 'a', to: 'a', by: 'stay' } }),
      entry(LLM_START, { iteration: 2 }),
    ];
    const { hops } = selectSkillRoute({ log });
    expect(hops[0]!.systemPromptText).toBe('You are exact.\\nBe brief.');
    expect(hops[1]!.systemPromptText).toBeUndefined();
  });
});
