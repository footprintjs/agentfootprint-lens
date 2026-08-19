/**
 * observeRecording — the offline rail, over two REAL recordings.
 *
 * The pair is the same turn recorded twice (see `__fixtures__/README.md`): once
 * with a `BoundaryRecorder` attached, once without. That is the whole point of
 * the entry point — the strip is rebuilt from what the run recorded, and when
 * the run recorded nothing the strip stays quiet instead of guessing.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { milestoneFor } from 'agentfootprint';
import type { AgentfootprintEvent } from 'agentfootprint/events';

import { observeRecording, hears, type Recording } from './observeRecording.js';
import { buildGroups } from './group/buildGroups.js';
import { buildCommitSyncMap } from './group/buildCommitSyncMap.js';
import { cursorPositionsAtDrill } from './group/cursorPositionsAtDrill.js';

/** The wire payload an app freezes per turn: `{ snapshot, events, blueprint }`. */
interface Artifacts {
  snapshot: {
    commitLog: { runtimeStageId?: string }[];
    recorders?: { name?: string; data?: unknown }[];
    [key: string]: unknown;
  };
  events: AgentfootprintEvent[];
  blueprint?: unknown;
}

// Node's own URL→path conversion: under jsdom the global `URL` is whatwg-url's,
// and handing one of those to `fs` resolves against the wrong root.
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');

function load(name: string): Artifacts {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as Artifacts;
}

/** What the slider actually offers — the number the step strip reports. */
function cursorPositions(observed: ReturnType<typeof observeRecording>): readonly unknown[] {
  const { recorder } = observed;
  const groups = buildGroups(recorder.boundary.boundaryIndex);
  const syncMap = buildCommitSyncMap(recorder);
  return cursorPositionsAtDrill(
    groups,
    syncMap,
    [],
    milestoneFor,
    recorder.runtime.getOverlay().executionOrder,
  );
}

const WITH_BOUNDARIES = 'recorded-turn.json';
const WITHOUT_BOUNDARIES = 'recorded-turn-no-boundaries.json';

describe('observeRecording — the fixtures are the same turn', () => {
  it('carries the same events and the same commit log in both recordings', () => {
    const a = load(WITH_BOUNDARIES);
    const b = load(WITHOUT_BOUNDARIES);
    expect(a.events.map((e) => e.type)).toEqual(b.events.map((e) => e.type));
    expect(a.snapshot.commitLog.map((c) => c.runtimeStageId)).toEqual(
      b.snapshot.commitLog.map((c) => c.runtimeStageId),
    );
    expect(a.events).toHaveLength(84);
    expect(a.snapshot.commitLog).toHaveLength(78);
  });

  it('names the chart `blueprint`, which is the shape a stored recording has', () => {
    // The wire key every recording in this ecosystem was frozen with. A README
    // reader who JSON-parses one and passes it straight in must get a chart —
    // this is the pin that `structure` is not the only spelling.
    const artifacts = load(WITH_BOUNDARIES) as Artifacts & { structure?: unknown };
    expect(artifacts.blueprint).toBeDefined();
    expect(artifacts.structure).toBeUndefined();

    const observed = observeRecording(artifacts as Recording);

    expect(observed.chart).toBe('drawn');
    expect(observed.runner).toBeDefined();
    expect(observed.notes).toEqual([]);
  });
});

describe('observeRecording — a recording that captured its boundaries', () => {
  it('rebuilds the step strip: 22 cursor positions, none of them invented', () => {
    const observed = observeRecording(load(WITH_BOUNDARIES) as Recording);

    expect(observed.boundaryEvents).toBe(75);
    expect(observed.boundaryRanges).toBe(26);
    expect(cursorPositions(observed)).toHaveLength(22);
  });

  it('replays every event with none skipped, and reports the counts', () => {
    const observed = observeRecording(load(WITH_BOUNDARIES) as Recording);

    expect(observed.eventsReplayed).toBe(84);
    expect(observed.eventsSkipped).toBe(0);
    expect(observed.recorder.selectEventLog()).toHaveLength(84);
  });

  it('hands back a runner so <Lens> can draw the composition that ran', () => {
    const observed = observeRecording(load(WITH_BOUNDARIES) as Recording);

    expect(observed.runner).toBeDefined();
    const spec = (observed.runner as unknown as { getSpec: () => { buildTimeStructure: unknown } })
      .getSpec();
    expect(spec.buildTimeStructure).toBeDefined();
  });

  it('reaches the run’s commit log through the runner, as the live rail does', () => {
    const observed = observeRecording(load(WITH_BOUNDARIES) as Recording);

    expect(observed.recorder.getCommitCount()).toBe(78);
    expect(observed.recorder.getCommitLog()).toHaveLength(78);
  });

  it('keeps payloads out of the boundary labels the UI renders', () => {
    const observed = observeRecording(load(WITH_BOUNDARIES) as Recording);

    const ranges = observed.recorder.boundary.boundaryIndex.overlapping(
      0,
      Number.MAX_SAFE_INTEGER,
    );
    expect(ranges.length).toBeGreaterThan(0);
    for (const range of ranges) {
      expect(range.label).not.toHaveProperty('payload');
    }
  });

  it('rebuilds the STEP GRAPH from both halves — the agent’s iterations are in it', () => {
    // FAILS ON THE OLD BEHAVIOUR: `getStepGraph()` fell through to the
    // subflow-only snapshot recorder and returned 0 nodes for this 4-iteration
    // ReAct turn — the Agents list, the hops and the per-iteration detail all
    // empty, with no warning. The structural half lives in the recording's
    // BoundaryEvents entry; the llm/tool half the typed replay just rebuilt.
    const observed = observeRecording(load(WITH_BOUNDARIES) as Recording);

    const graph = observed.recorder.getStepGraph();
    const kinds = graph.nodes.map((n) => n.kind);

    expect(graph.nodes.length).toBeGreaterThan(13);
    expect(kinds).toContain('user->llm');
    expect(kinds).toContain('llm->tool');
    expect(kinds).toContain('tool->llm');
    expect(kinds).toContain('llm->user');
    // Four ReAct iterations, and the graph knows which node belongs to which.
    const iterations = new Set(
      graph.nodes.map((n) => n.iterationIndex).filter((i): i is number => i !== undefined),
    );
    expect([...iterations].sort()).toEqual([1, 2, 3, 4]);
  });

  it('a recording that captured its llm/tool boundaries too is replayed as recorded', () => {
    // When the app also wired `boundary.subscribe(runner)` at record time, the
    // BoundaryEvents entry already holds the llm/tool half. The replay's own
    // copies are dropped rather than interleaved — one node per recorded step.
    const observed = observeRecording({
      snapshot: {
        commitLog: [],
        recorders: [
          {
            name: 'BoundaryEvents',
            data: [
              { type: 'run.entry', runtimeStageId: '__root__#0', subflowPath: ['__root__'], depth: 0, ts: 0, commitIdxBefore: 0, isRoot: true },
              { type: 'llm.start', runtimeStageId: 'call#1', subflowPath: ['__root__'], depth: 0, ts: 1, commitIdxBefore: 0, actorArrow: 'user→llm', iteration: 1, model: 'mock-1', provider: 'mock' },
              { type: 'llm.end', runtimeStageId: 'call#1', subflowPath: ['__root__'], depth: 0, ts: 2, commitIdxBefore: 0, actorArrow: 'llm→user', iteration: 1, usage: { input: 10, output: 3 }, toolCallCount: 0 },
              { type: 'run.exit', runtimeStageId: '__root__#0', subflowPath: ['__root__'], depth: 0, ts: 3, commitIdxBefore: 0 },
            ],
          },
        ],
      },
      events: [
        {
          type: 'agentfootprint.stream.llm_start',
          payload: { iteration: 9, provider: 'mock', model: 'replayed-not-recorded' },
          meta: { wallClockMs: 50, runOffsetMs: 50, runtimeStageId: 'call#9', runId: 'r1' },
        } as unknown as AgentfootprintEvent,
      ],
    });

    const graph = observed.recorder.getStepGraph();
    // One llm step, and it is the RECORDED one.
    const llmSteps = graph.nodes.filter((n) => n.kind === 'user->llm');
    expect(llmSteps).toHaveLength(1);
    expect(llmSteps[0]!.llmModel).toBe('mock-1');
  });
});

describe('observeRecording — a recording that captured none', () => {
  it('leaves the strip quiet rather than deriving stops from the commit log', () => {
    const artifacts = load(WITHOUT_BOUNDARIES);
    // The commit log is right there, 78 bundles of it — and it is still not
    // enough to say WHEN a boundary opened. Nothing is invented from it.
    expect(artifacts.snapshot.commitLog).toHaveLength(78);
    expect(artifacts.snapshot.recorders).toBeUndefined();

    const observed = observeRecording(artifacts as Recording);

    expect(observed.boundaryEvents).toBe(0);
    expect(observed.boundaryRanges).toBe(0);
    expect(observed.recorder.boundary.boundaryIndex.size).toBe(0);
    expect(cursorPositions(observed)).toHaveLength(0);
  });

  it('is degraded, not dead — the event log is still whole', () => {
    const observed = observeRecording(load(WITHOUT_BOUNDARIES) as Recording);

    expect(observed.eventsReplayed).toBe(84);
    expect(observed.eventsSkipped).toBe(0);
    expect(observed.recorder.selectEventLog()).toHaveLength(84);
    const summary = observed.recorder.selectSummary();
    expect(summary.llmCallCount).toBe(4);
    expect(summary.toolCallCount).toBe(3);
  });

  it('says so out loud — the note rides the recorder, not just the return', () => {
    const observed = observeRecording(load(WITHOUT_BOUNDARIES) as Recording);

    expect(observed.notes.some((n) => /no step boundaries/i.test(n))).toBe(true);
    expect(observed.recorder.getNotes()).toEqual(observed.notes);
    expect(observed.recorder.isReplay()).toBe(true);
  });

  it('ignores a boundary entry stripped out of an otherwise-complete recording', () => {
    const artifacts = load(WITH_BOUNDARIES);
    artifacts.snapshot.recorders = (artifacts.snapshot.recorders ?? []).filter(
      (r) => r.name !== 'BoundaryEvents',
    );

    const observed = observeRecording(artifacts as Recording);

    expect(observed.boundaryEvents).toBe(0);
    expect(cursorPositions(observed)).toHaveLength(0);
  });
});

describe('observeRecording — the typed replay never leaves ranges behind', () => {
  /** A composition enter/exit pair as the typed dispatcher fires it. */
  const compositionTurn = (): AgentfootprintEvent[] =>
    [
      {
        type: 'agentfootprint.composition.enter',
        payload: { kind: 'Parallel', id: 'c1', name: 'Fanout', childCount: 2 },
        meta: { wallClockMs: 1, runOffsetMs: 0, runtimeStageId: 'fan#0', runId: 'r1' },
      },
      {
        type: 'agentfootprint.composition.exit',
        payload: { kind: 'Parallel', id: 'c1', name: 'Fanout', status: 'ok', durationMs: 5 },
        meta: { wallClockMs: 9, runOffsetMs: 8, runtimeStageId: 'merge#3', runId: 'r1' },
      },
    ] as unknown as AgentfootprintEvent[];

  const fourCommits = [{ idx: 0 }, { idx: 1 }, { idx: 2 }, { idx: 3 }];

  it('a composition run with NO boundary entry leaves an EMPTY index', () => {
    // FAILS ON THE OLD BEHAVIOUR: the rebuild returned early when it found no
    // `BoundaryEvents` entry, BEFORE clearing — so the range agentfootprint's
    // live BoundaryRecorder opened during the typed replay survived, pinned by
    // `getCommitCount()` to the FINAL commit count: a zero-width slice at the
    // end of the run. The counts said 0 while the index the UI reads held 1.
    const observed = observeRecording({
      snapshot: { commitLog: fourCommits },
      events: compositionTurn(),
    });

    expect(observed.boundaryRanges).toBe(0);
    expect(observed.boundaryEvents).toBe(0);
    expect(observed.recorder.boundary.boundaryIndex.size).toBe(0);
    // …and therefore no phantom step for the strip to stop on.
    expect(buildGroups(observed.recorder.boundary.boundaryIndex)).toHaveLength(0);
  });

  it('a composition run WITH a boundary entry keeps the RECORDED commit indices', () => {
    // The same typed events, plus the run's own recording of that composition.
    // The live recorder would have stamped both ends at the final commit count
    // (4); the recording says 1 → 3, and the recording is what the strip is
    // indexed by. Deleting the `clear()` in the rebuild fails this.
    const observed = observeRecording({
      snapshot: {
        commitLog: fourCommits,
        recorders: [
          {
            name: 'BoundaryEvents',
            data: [
              {
                type: 'composition.start',
                runtimeStageId: 'fan#0',
                subflowPath: ['__root__'],
                depth: 0,
                ts: 1,
                compositionId: 'c1',
                kind: 'Parallel',
                name: 'Fanout',
                commitIdxBefore: 1,
              },
              {
                type: 'composition.end',
                runtimeStageId: 'merge#3',
                subflowPath: ['__root__'],
                depth: 0,
                ts: 9,
                compositionId: 'c1',
                kind: 'Parallel',
                name: 'Fanout',
                commitIdxBefore: 3,
              },
            ],
          },
        ],
      },
      events: compositionTurn(),
    });

    expect(observed.boundaryRanges).toBe(1);
    const ranges = observed.recorder.boundary.boundaryIndex.overlapping(0, 100);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]!.startIdx).toBe(1);
    expect(ranges[0]!.endIdx).toBe(3);
    // The live-recorder stamp would have been the final commit count on both ends.
    expect(ranges[0]!.startIdx).not.toBe(observed.recorder.getCommitCount());
  });
});

describe('hears — the replay’s subscription rules', () => {
  const TYPE = 'agentfootprint.context.injected';

  it('hears the exact type it subscribed to, and nothing else exact', () => {
    expect(hears(TYPE, TYPE)).toBe(true);
    expect(hears('agentfootprint.context.assembled', TYPE)).toBe(false);
  });

  it('`*` hears everything, including a type with no dots at all', () => {
    expect(hears('*', TYPE)).toBe(true);
    expect(hears('*', 'weird')).toBe(true);
    expect(hears('*', '')).toBe(true);
  });

  it('a domain wildcard hears the types whose domain it IS', () => {
    expect(hears('agentfootprint.context.*', TYPE)).toBe(true);
    expect(hears('agentfootprint.stream.*', TYPE)).toBe(false);
  });

  it('a domain wildcard is not a prefix match — the near-miss cases', () => {
    // The dispatcher buckets domain wildcards by the event type's domain KEY
    // (everything before the last dot) and looks them up exactly. Two ways to
    // get this wrong, both of which a prefix test would wave through:
    expect(hears('agentfootprint.context.*', 'agentfootprint.contextual.thing')).toBe(false);
    expect(hears('agentfootprint.*', TYPE)).toBe(false);
    // …and the one it must still hear:
    expect(hears('agentfootprint.*', 'agentfootprint.done')).toBe(true);
  });
});

describe('observeRecording — replay isolation and delivery order', () => {
  const event = (type: string, payload: unknown = {}): AgentfootprintEvent =>
    ({
      type,
      payload,
      meta: { wallClockMs: 1, runOffsetMs: 0, runtimeStageId: 'seed#0', runId: 'r1' },
    }) as unknown as AgentfootprintEvent;

  /**
   * The returned runner's own plumbing, typed for the probes below. `emit`
   * hands an event to the same delivery the replay loop used — subscribe
   * first, emit, and what arrived (and in what order) is observable.
   */
  type ProbeRunner = {
    on: (
      t: string,
      h: (e: AgentfootprintEvent) => void,
      o?: { once?: boolean; signal?: AbortSignal },
    ) => () => void;
    once: (t: string, h: (e: AgentfootprintEvent) => void) => () => void;
    emit: (e: AgentfootprintEvent) => void;
  };

  /** A recorder over an empty recording whose runner is still wired. */
  const emptyRun = (): { observed: ReturnType<typeof observeRecording>; runner: ProbeRunner } => {
    const observed = observeRecording({ snapshot: { commitLog: [] }, structure: {} });
    return { observed, runner: observed.runner as unknown as ProbeRunner };
  };

  it('an unreadable event costs that event and nothing else', () => {
    const unreadable = { type: 'agentfootprint.agent.turn_start', payload: {} } as unknown as
      AgentfootprintEvent; // no `meta` — every handler trips on it

    const observed = observeRecording({
      events: [
        event('agentfootprint.agent.turn_start', { turnIndex: 0, userMessage: 'hi' }),
        unreadable,
        event('agentfootprint.agent.turn_end', { content: 'done', iterations: 1 }),
      ],
      snapshot: {
        commitLog: [],
        recorders: [
          {
            name: 'BoundaryEvents',
            data: [
              { type: 'run.entry', runtimeStageId: '__root__#0', subflowPath: ['__root__'], depth: 0, ts: 0, commitIdxBefore: 0 },
              { type: 'run.exit', runtimeStageId: '__root__#0', commitIdxBefore: 0 },
            ],
          },
        ],
      },
    });

    expect(observed.eventsReplayed).toBe(3);
    expect(observed.eventsSkipped).toBe(1);
    // The two readable events still landed — the throw did not abort the replay.
    expect(observed.recorder.selectEventLog()).toHaveLength(2);
    // …and the work AFTER the replay still ran.
    expect(observed.boundaryRanges).toBe(1);
    // The skip is reported to whoever is looking, not just counted.
    expect(observed.notes.some((n) => /could not be read/i.test(n))).toBe(true);
  });

  it('a handler that throws does not cost the NEXT handler the same event', () => {
    // An event whose payload can only be read once: the first handler to touch
    // it throws, every handler behind it gets a clean read. The dispatcher's
    // order puts agentfootprint's live-state tracker (subscribed by TYPE) ahead
    // of LensRecorder's own `on('*')` — so if the event still reached the log,
    // the try/catch is around each handler and not around the delivery loop.
    let reads = 0;
    const poisoned = {
      type: 'agentfootprint.stream.llm_start',
      meta: { wallClockMs: 1, runOffsetMs: 0, runtimeStageId: 'call-llm#1', runId: 'r1' },
      get payload(): unknown {
        reads += 1;
        if (reads === 1) throw new Error('unreadable once');
        return { iteration: 1, provider: 'mock', model: 'mock-1' };
      },
    } as unknown as AgentfootprintEvent;

    const observed = observeRecording({ events: [poisoned], snapshot: { commitLog: [] } });

    expect(observed.eventsSkipped).toBe(1);
    // The typed listener went first and tripped; the wildcard behind it read
    // the event cleanly and logged it.
    expect(observed.recorder.liveState.isLLMInFlight()).toBe(false);
    expect(observed.recorder.selectEventLog()).toHaveLength(1);
  });

  it('delivers only to the handlers subscribed to that event type', () => {
    // A probe subscribed to ONE type must see exactly the events of that type —
    // not the whole log. Deleting per-type subscription (making `hears` always
    // true) fails this: `only` and `domain` would each see both events.
    const { runner } = emptyRun();
    const only: string[] = [];
    const domain: string[] = [];
    const wildcard: string[] = [];
    runner.on('agentfootprint.stream.llm_start', (e) => only.push(e.type));
    runner.on('agentfootprint.stream.*', (e) => domain.push(e.type));
    runner.on('*', (e) => wildcard.push(e.type));

    runner.emit(event('agentfootprint.agent.turn_start', { turnIndex: 0, userMessage: 'hi' }));
    runner.emit(event('agentfootprint.stream.llm_start', { iteration: 1, provider: 'm', model: 'm-1' }));

    expect(only).toEqual(['agentfootprint.stream.llm_start']);
    expect(domain).toEqual(['agentfootprint.stream.llm_start']);
    expect(wildcard).toEqual([
      'agentfootprint.agent.turn_start',
      'agentfootprint.stream.llm_start',
    ]);
  });

  it('delivers in the dispatcher’s order: typed → domain wildcard → `*`', () => {
    // FAILS ON THE OLD BEHAVIOUR: the replay fired one flat list in
    // REGISTRATION order, and `LensRecorder.observe` registers its `on('*')`
    // first — so offline the wildcard ran ahead of every typed listener,
    // inverted from the live rail this is meant to stand in for.
    const { runner } = emptyRun();
    const order: string[] = [];
    // Registered wildcard-first, on purpose: registration order must NOT be
    // delivery order.
    runner.on('*', () => order.push('all'));
    runner.on('agentfootprint.stream.*', () => order.push('domain'));
    runner.on('agentfootprint.stream.llm_start', () => order.push('typed'));

    runner.emit(event('agentfootprint.stream.llm_start', { iteration: 1, provider: 'm', model: 'm-1' }));

    expect(order).toEqual(['typed', 'domain', 'all']);
  });

  it('honours `{ once: true }` — a one-shot subscriber hears one event', () => {
    const { runner } = emptyRun();
    const seen: string[] = [];
    runner.once('agentfootprint.stream.llm_start', () => seen.push('once'));
    runner.on('agentfootprint.stream.llm_start', () => seen.push('opt'), { once: true });
    runner.on('agentfootprint.stream.llm_start', () => seen.push('every'));

    runner.emit(event('agentfootprint.stream.llm_start', { iteration: 1, provider: 'm', model: 'm-1' }));
    runner.emit(event('agentfootprint.stream.llm_start', { iteration: 2, provider: 'm', model: 'm-1' }));

    expect(seen).toEqual(['once', 'opt', 'every', 'every']);
  });

  it('honours `{ signal }` — an aborted subscriber stops hearing', () => {
    const { runner } = emptyRun();
    const controller = new AbortController();
    const seen: string[] = [];
    runner.on('agentfootprint.stream.llm_start', () => seen.push('heard'), {
      signal: controller.signal,
    });

    runner.emit(event('agentfootprint.stream.llm_start', { iteration: 1, provider: 'm', model: 'm-1' }));
    controller.abort();
    runner.emit(event('agentfootprint.stream.llm_start', { iteration: 2, provider: 'm', model: 'm-1' }));

    expect(seen).toEqual(['heard']);
  });
});

describe('observeRecording — rebuilding the boundary index', () => {
  const range = (over: Record<string, unknown>): Record<string, unknown> => ({
    subflowPath: ['__root__'],
    depth: 0,
    ts: 0,
    ...over,
  });

  const withBoundaryData = (data: unknown[]): Recording => ({
    snapshot: { commitLog: [], recorders: [{ name: 'BoundaryEvents', data }] },
  });

  it('skips a boundary with no commit index instead of pinning it to 0', () => {
    const observed = observeRecording(
      withBoundaryData([
        range({ type: 'run.entry', runtimeStageId: '__root__#0', commitIdxBefore: 0 }),
        range({ type: 'subflow.entry', runtimeStageId: 'sf-a#1' }), // no commitIdxBefore
        range({ type: 'subflow.entry', runtimeStageId: 'sf-b#2', commitIdxBefore: 'nope' }),
      ]),
    );

    expect(observed.boundaryEvents).toBe(3);
    expect(observed.boundaryRanges).toBe(1);
  });

  it('opens one range per boundary even if the entry was recorded twice', () => {
    const observed = observeRecording(
      withBoundaryData([
        range({ type: 'subflow.entry', runtimeStageId: 'sf-a#1', commitIdxBefore: 2 }),
        range({ type: 'subflow.entry', runtimeStageId: 'sf-a#1', commitIdxBefore: 5 }),
        range({ type: 'subflow.exit', runtimeStageId: 'sf-a#1', commitIdxBefore: 9 }),
      ]),
    );

    expect(observed.boundaryRanges).toBe(1);
    const ranges = observed.recorder.boundary.boundaryIndex.overlapping(0, 100);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]!.startIdx).toBe(2);
    expect(ranges[0]!.endIdx).toBe(9);
  });

  it('pairs a composition by its own id, not by its runtimeStageId', () => {
    const observed = observeRecording(
      withBoundaryData([
        range({
          type: 'composition.start',
          runtimeStageId: 'enter#0',
          compositionId: 'c1',
          commitIdxBefore: 1,
        }),
        range({
          type: 'composition.end',
          runtimeStageId: 'exit#7', // deliberately different stage
          compositionId: 'c1',
          commitIdxBefore: 8,
        }),
      ]),
    );

    const ranges = observed.recorder.boundary.boundaryIndex.overlapping(0, 100);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]!.startIdx).toBe(1);
    expect(ranges[0]!.endIdx).toBe(8);
  });

  it('ignores boundary events that are not entries or exits', () => {
    const observed = observeRecording(
      withBoundaryData([
        range({ type: 'fork.branch', runtimeStageId: 'fork#1', commitIdxBefore: 1 }),
        range({ type: 'loop.iteration', runtimeStageId: 'loop#2', commitIdxBefore: 2 }),
        range({ type: 'llm.start', runtimeStageId: 'call#3', commitIdxBefore: 3 }),
      ]),
    );

    expect(observed.boundaryEvents).toBe(3);
    expect(observed.boundaryRanges).toBe(0);
  });

  it('survives a hole in the event log', () => {
    // Recordings come back as parsed JSON from wherever they were stored; a
    // truncated or hand-edited one can hand over a null where an event was.
    const observed = observeRecording({
      events: [null, undefined] as unknown as AgentfootprintEvent[],
      snapshot: { commitLog: [] },
    });

    expect(observed.eventsReplayed).toBe(2);
    expect(observed.eventsSkipped).toBe(2);
    expect(observed.recorder.selectEventLog()).toHaveLength(0);
  });

  it('survives a recording with nothing in it', () => {
    const observed = observeRecording({});

    expect(observed.eventsReplayed).toBe(0);
    expect(observed.eventsSkipped).toBe(0);
    expect(observed.boundaryEvents).toBe(0);
    expect(observed.boundaryRanges).toBe(0);
    expect(observed.runner).toBeUndefined();
    expect(observed.chart).toBe('absent');
    expect(observed.recorder.getCommitLog()).toEqual([]);
  });
});

describe('observeRecording — unreadable is not the same as absent', () => {
  it('an events log that survived storage as JSON TEXT says so', () => {
    const observed = observeRecording({
      events: '[{"type":"agentfootprint.agent.turn_start"}]' as unknown as AgentfootprintEvent[],
      snapshot: { commitLog: [] },
    });

    expect(observed.eventsReplayed).toBe(0);
    expect(observed.notes.some((n) => /"events" is a string, not an array/.test(n))).toBe(true);
  });

  it('a snapshot that survived storage as JSON TEXT says so', () => {
    const observed = observeRecording({
      snapshot: '{"commitLog":[]}' as unknown as Recording['snapshot'],
    });

    expect(observed.recorder.getCommitLog()).toEqual([]);
    expect(observed.notes.some((n) => /"snapshot" is a string, not an object/.test(n))).toBe(true);
  });

  it('a BoundaryEvents entry whose data is not an array is unreadable, not empty', () => {
    // The old read filtered the entry out by `Array.isArray(r.data)` and
    // reported `boundaryEvents: 0` — "this run recorded no boundaries", which
    // is a false statement about a run that recorded them and lost them.
    const observed = observeRecording({
      snapshot: {
        commitLog: [],
        recorders: [{ name: 'BoundaryEvents', data: { '0': { type: 'run.entry' } } }],
      },
    });

    expect(observed.boundaryEvents).toBe(0);
    expect(observed.boundaryRanges).toBe(0);
    expect(observed.notes.some((n) => /unreadable, not absent/i.test(n))).toBe(true);
  });
});

describe('observeRecording — the runtime overlay is recovered from the commit log', () => {
  it('seeds recorder.runtime so the chart lights: one step per executed stage, ids spelled as the cursor spells them', () => {
    const artifacts = load(WITH_BOUNDARIES);
    const observed = observeRecording({
      snapshot: artifacts.snapshot,
      events: artifacts.events,
      structure: artifacts.blueprint,
    });
    const overlay = observed.recorder.runtime.getOverlay();
    // The replay's overlay mirrors the commit log: every bundle's
    // runtimeStageId lands (deduped, first occurrence), so LensFlow's
    // findIndex resolves a scrubIndex for EVERY cursor stop.
    const logIds = new Set(
      artifacts.snapshot.commitLog
        .map((c) => c.runtimeStageId)
        .filter((id): id is string => typeof id === 'string'),
    );
    expect(overlay.executionOrder.length).toBeGreaterThan(0);
    expect(overlay.executionOrder).toHaveLength(logIds.size);
    for (const step of overlay.executionOrder) {
      expect(logIds.has(step.runtimeStageId)).toBe(true);
      // Path kept, `#index` stripped — the id the chart's nodes are keyed by.
      expect(step.stageId).toBe(step.runtimeStageId.split('#')[0]);
    }
    // A recording is a finished run by definition.
    expect(overlay.running).toBe(false);
  });

  it('a recording with no snapshot seeds nothing — the chart honestly stays unlit', () => {
    const observed = observeRecording({ events: [], structure: {} });
    expect(observed.recorder.runtime.getOverlay().executionOrder).toHaveLength(0);
  });
});
