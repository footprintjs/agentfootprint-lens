/**
 * Tests — `agentfootprint.stream.tool_progress` (agentfootprint 9.52.0), the
 * report a tool files while it is still running.
 *
 * Two halves, tested as two different things:
 *   · the framework's stamped facts (toolName, iteration) — rendered plainly
 *   · the author's `unknown` payload — PREVIEWED, never interpreted, and cut
 *     with the cut stated
 *
 * The centrepiece replays `__fixtures__/tool-progress-turn.json`: a real
 * agentfootprint run on a mock provider whose `walk_graph` tool reports three
 * times with three different payload shapes, and whose `summarize` tool
 * reports nothing at all. Generated, not hand-authored — see the fixture README.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defaultHumanizer, makeTeachingHumanizer, teachingHumanizer } from './humanizer.js';
import { humanizeToolProgress, previewProgressPayload } from './humanizeToolProgress.js';
import { observeRecording, type Recording } from './observeRecording.js';
import type { RunTreeNode } from './types.js';
import type { AgentfootprintEvent } from 'agentfootprint/events';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');
const loadTurn = (): Recording =>
  JSON.parse(readFileSync(join(FIXTURES, 'tool-progress-turn.json'), 'utf8')) as Recording;
const TURN = loadTurn() as { events: AgentfootprintEvent[] };

const progressEvents = TURN.events.filter(
  (e) => e.type === 'agentfootprint.stream.tool_progress',
);

function evt(type: string, payload: Record<string, unknown>): AgentfootprintEvent {
  return {
    type,
    payload,
    meta: {
      wallClockMs: 1000,
      runOffsetMs: 0,
      runtimeStageId: 'test#0',
      subflowPath: [],
      compositionPath: [],
      runId: 'test',
    },
  } as unknown as AgentfootprintEvent;
}

const progress = (payload: Record<string, unknown>) =>
  evt('agentfootprint.stream.tool_progress', payload);

// ─── The stamped facts ────────────────────────────────────────────────

describe('tool_progress — the framework-stamped facts', () => {
  it('names the tool and the iteration it was dispatched on', () => {
    const out = defaultHumanizer(
      progress({ toolCallId: 'c1', toolName: 'walk_graph', iteration: 2, payload: { hop: 3 } }),
    );
    expect(out).toContain('`walk_graph`');
    expect(out).toContain('iteration 2');
    expect(out).toContain('reported progress');
  });

  it('drops the iteration clause when there is no ReAct loop (iteration 0)', () => {
    // agentfootprint uses 0 to mean "no loop here" — printing "iteration 0"
    // would invent a loop position the run never had.
    const out = defaultHumanizer(
      progress({ toolCallId: 'c1', toolName: 'walk_graph', iteration: 0, payload: 'working' }),
    );
    expect(out).not.toContain('iteration');
    expect(out).toContain('`walk_graph`');
  });

  it('still renders when the tool name is missing', () => {
    const out = defaultHumanizer(progress({ toolCallId: 'c1', payload: 'working' }));
    expect(out).toBe('A tool reported progress: working');
  });
});

// ─── The author's payload ─────────────────────────────────────────────

describe('tool_progress — the author payload is previewed, not interpreted', () => {
  it('shows an object payload as compact JSON', () => {
    expect(previewProgressPayload({ hop: 3, of: 12 })).toBe('{"hop":3,"of":12}');
  });

  it('shows a string payload as itself, without re-quoting it', () => {
    expect(previewProgressPayload('hop 3 of 12')).toBe('hop 3 of 12');
  });

  it('cuts a long payload and SAYS how much it cut', () => {
    const long = 'x'.repeat(200);
    const preview = previewProgressPayload(long);
    expect(preview).toContain('truncated; 80 more chars');
    // The preview itself is bounded — a firehose row cannot be blown open by
    // a tool that reports a megabyte.
    expect(preview!.length).toBeLessThan(200);
  });

  it('says nothing rather than something empty when there is no payload', () => {
    expect(previewProgressPayload(undefined)).toBeNull();
    expect(humanizeToolProgress({ toolName: 'walk_graph', iteration: 1 })).toBe(
      '`walk_graph` reported progress (iteration 1).',
    );
  });

  it('degrades honestly on a payload with no JSON form', () => {
    // Not reachable through the library (a payload must survive
    // structuredClone to have got here) — but a hand-built or hand-edited
    // event must not crash a stream row.
    expect(previewProgressPayload(() => 1)).toBeNull();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(previewProgressPayload(circular)).toBe('(payload could not be shown)');
  });

  it('invents no progress arithmetic the tool did not send', () => {
    // The payload is author-defined `unknown`. A line that read "hop 3 of 12"
    // off a payload shaped `{ stage: 'indexing' }` would be putting words in
    // the tool's mouth.
    const out = defaultHumanizer(
      progress({ toolName: 'reindex', iteration: 1, payload: { stage: 'indexing' } }),
    );
    expect(out).toBe('`reindex` reported progress (iteration 1): {"stage":"indexing"}');
  });
});

// ─── The teaching voice ───────────────────────────────────────────────

describe('tool_progress — the teaching humanizer keeps its no-field-dumps rule', () => {
  it('narrates the event as prose, with no payload bytes', () => {
    const out = teachingHumanizer(
      progress({ toolName: 'walk_graph', iteration: 1, payload: { hop: 3, of: 12 } }),
    );
    expect(out).toBe('The `walk_graph` tool reported progress while it was still running.');
    expect(out).not.toContain('{');
    expect(out).not.toContain('12');
  });

  it('holds for a custom app name too (the line is about the tool, not the app)', () => {
    const out = makeTeachingHumanizer({ appName: 'Neo' })(
      progress({ toolName: 'walk_graph', iteration: 1, payload: 'busy' }),
    );
    expect(out).toContain('`walk_graph`');
    expect(out).not.toContain('busy');
  });
});

// ─── The real run ─────────────────────────────────────────────────────

describe('tool_progress — replayed from a real agentfootprint 9.52.0 run', () => {
  it('the fixture carries three reports from one call, and none from the quiet tool', () => {
    expect(progressEvents.length).toBe(3);
    const ids = new Set(progressEvents.map((e) => (e.payload as { toolCallId: string }).toolCallId));
    expect(ids).toEqual(new Set(['c1']));
    // `summarize` never calls ctx.progress, so it files nothing. Absence is a
    // real state, not a gap in the fixture.
    const names = new Set(progressEvents.map((e) => (e.payload as { toolName: string }).toolName));
    expect(names).toEqual(new Set(['walk_graph']));
  });

  it('every report arrives BETWEEN its call start and its call end', () => {
    const types = TURN.events.map((e) => e.type);
    const start = types.indexOf('agentfootprint.stream.tool_start');
    const end = types.indexOf('agentfootprint.stream.tool_end');
    const progressIdx = types
      .map((t, i) => (t === 'agentfootprint.stream.tool_progress' ? i : -1))
      .filter((i) => i >= 0);
    expect(progressIdx.every((i) => i > start && i < end)).toBe(true);
  });

  it('renders all three payload shapes, truncating only the one that needs it', () => {
    const lines = progressEvents.map((e) => defaultHumanizer(e));
    expect(lines[0]).toBe(
      '`walk_graph` reported progress (iteration 1): {"hop":1,"of":3,"node":"svc-a"}',
    );
    expect(lines[1]).toBe('`walk_graph` reported progress (iteration 1): still walking — 2 of 3');
    expect(lines[2]).toContain('truncated;');
    expect(lines[2]).toContain('more chars');
    expect(lines.every((l) => l !== null && !l.startsWith('['))).toBe(true);
  });

  it('the reports hang off the tool-call node, not the run root', () => {
    // The recorder pushes a node on tool_start and pops it on tool_end, so a
    // report filed in between attaches to the call it came from — which is
    // what lets a details panel show a call's own progress.
    const tree = observeRecording(loadTurn()).recorder.selectRunTree();
    const findTool = (node: RunTreeNode, name: string): RunTreeNode | undefined =>
      node.kind === 'tool-call' && node.label.includes(name)
        ? node
        : node.children.map((c) => findTool(c, name)).find((n) => n !== undefined);
    const countProgress = (node: RunTreeNode) =>
      node.events.filter((e) => e.event.type === 'agentfootprint.stream.tool_progress').length;

    const walk = findTool(tree, 'walk_graph');
    expect(walk).toBeDefined();
    expect(countProgress(walk!)).toBe(3);

    // The quiet tool's node is there and simply carries none — the absence
    // lives on the call it belongs to, not as a hole in the tree.
    const quiet = findTool(tree, 'summarize');
    expect(quiet).toBeDefined();
    expect(countProgress(quiet!)).toBe(0);
  });
});

// ─── Forward compatibility ────────────────────────────────────────────

describe('an event kind from a NEWER agentfootprint still renders', () => {
  it('falls back to the terse [type] line rather than crashing', () => {
    // The property that must survive every future release: an unknown event
    // is a row, not an exception.
    const future = evt('agentfootprint.stream.tool_teleport', { anything: true });
    expect(defaultHumanizer(future)).toBe('[agentfootprint.stream.tool_teleport]');
    expect(() => teachingHumanizer(future)).not.toThrow();
  });

  it('an unknown event still lands in the log a view reads', () => {
    const recording = loadTurn();
    const withFuture: Recording = {
      ...recording,
      events: [
        ...(recording.events ?? []),
        evt('agentfootprint.stream.tool_teleport', { anything: true }),
      ],
    };
    const log = observeRecording(withFuture).recorder.selectEventLog();
    expect(log[log.length - 1]?.event.type).toBe('agentfootprint.stream.tool_teleport');
    // ...and every row in the stream renders without throwing, this one
    // included (`null` is the deliberate "too low-signal to show" answer).
    expect(
      log.every((e) => {
        const line = defaultHumanizer(e.event);
        return line === null || typeof line === 'string';
      }),
    ).toBe(true);
  });
});
