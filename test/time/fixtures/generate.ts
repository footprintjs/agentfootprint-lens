/**
 * generate — the time-rows fixtures, from REAL agentfootprint runs (house
 * rule: fixture data is GENERATED, never hand-authored).
 *
 * Each scenario builds an armed agent (`.time()`) on a scripted provider (no
 * model is called), runs it, and freezes what the lens reads:
 * `agent.findings()` (the ledger) and `coverageDeclared` (each call's declared
 * period). The wall clock is pinned (`Date.now`), so the output is the same
 * every run. The scenarios follow agentfootprint's own time tests
 * (`test/core/time/*-run.test.ts`) and together carry every row kind the
 * Time band draws:
 *
 *   control-window   clock with a `control` window; a bounds tool FILLED
 *                    exactly; its result declares a covered period and a
 *                    second call's result a held `unknown` period (period rows)
 *   widened          a fixture reader reads "yesterday" (a `time-reading`
 *                    row); a look-back-only tool is filled WIDER than asked
 *                    (`sent` + `differs.extra`)
 *   drift            30 minutes after `now`: the library's look-back fill is
 *                    `redrawn`; the model's own look-back runs `shifted`
 *   refused          a future window to a `past` tool — refused before dispatch
 *   clock-on-resume  a check-in pause resumed with a different `time`
 *   open-reading     "10/09/26 8 AM to 8:40 AM" under the default policy —
 *                    the date order is left `open`
 *   ask              a `requestInput` time-range field: the first pause, then
 *                    the re-ask after an out-of-order answer (`refused`,
 *                    `repeat`)
 *   (control-window is also frozen as a full recording, time-recording.json,
 *   so the ContextView test reads the band off the fold at a stop)
 *   axis             a dataset minted with a declared time axis, one value
 *                    with no offset (the library counts it: clock unknown)
 *
 *   npm run fixtures:time
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Agent,
  checkInApproved,
  defineTool,
  describedResult,
  inMemoryArtifacts,
  isPaused,
  requestInput,
  type TimeReader,
  type Tool,
  type ToolExecutionContext,
} from 'agentfootprint';
import { recordRun } from 'agentfootprint/observe';

const here = dirname(fileURLToPath(import.meta.url));

// ─── The pinned clock ────────────────────────────────────────────────────

const NOW = '2026-10-09T15:40:00Z';
const NOW_MS = Date.parse(NOW);
let wall = NOW_MS + 5_000;
Date.now = () => wall;

const LA = 'America/Los_Angeles';
const LAST_HOUR = { from: '2026-10-09T14:40:00Z', to: NOW };
const MORNING = { from: '2026-10-09T15:00:00Z', to: '2026-10-09T15:41:00Z' };
const TOMORROW = { from: '2026-10-10T15:00:00Z', to: '2026-10-10T15:41:00Z' };

// ─── The harness ─────────────────────────────────────────────────────────

type Reply = { content: string; toolCalls?: { id: string; name: string; args: object }[] };

function scripted(script: readonly Reply[]) {
  let i = 0;
  return {
    name: 'time-fixture-mock',
    complete: async () => {
      const reply = script[Math.min(i, script.length - 1)] ?? { content: 'done' };
      i += 1;
      return { content: reply.content, toolCalls: reply.toolCalls ?? [], usage: { input: 0, output: 0 } };
    },
  };
}

const call = (id: string, name: string, args: object = {}): Reply => ({
  content: '',
  toolCalls: [{ id, name, args }],
});
const answer = (content: string): Reply => ({ content });

function build(
  script: readonly Reply[],
  tools: readonly Tool[],
  arm: (b: ReturnType<typeof Agent.create>) => ReturnType<typeof Agent.create>,
) {
  return arm(
    Agent.create({ provider: scripted(script) as never, model: 'mock', maxIterations: 6 }).tools(tools),
  ).build();
}

/** What the lens reads: the ledger and the state's `coverageDeclared`, as plain JSON. */
function frozen(agent: { findings(): unknown; getSnapshot(): unknown }) {
  const state = ((agent.getSnapshot() as { sharedState?: Record<string, unknown> } | undefined)
    ?.sharedState ?? {}) as Record<string, unknown>;
  return JSON.parse(
    JSON.stringify({ ledger: agent.findings() ?? [], coverage: state.coverageDeclared ?? [] }),
  ) as { ledger: unknown[]; coverage: unknown[] };
}

// ─── The tools (agentfootprint's own test shapes) ────────────────────────

/** Two epoch-ms bounds (an absolute form), optionally a look-back first; declares what it read. */
function epochTool(
  opts: { facts?: Record<string, unknown>; withLookback?: boolean; checkIn?: boolean; held?: 'asked' | 'unknown' } = {},
) {
  const { facts = {}, withLookback = false, checkIn = false, held } = opts;
  return defineTool({
    name: 'client_activity',
    ...(checkIn && { checkIn: 'always' as const }),
    description: 'Client operations over a window.',
    inputSchema: {
      type: 'object',
      properties: {
        ...(withLookback && { window: { type: 'string' } }),
        start_time: { type: 'integer' },
        end_time: { type: 'integer' },
        host: { type: 'string' },
      },
    },
    askOrAssume: {
      ...(withLookback && { window: { assume: '1h' } }),
      start_time: { ask: 'From when?' },
      end_time: { ask: 'Until when?' },
    },
    period: {
      forms: [
        ...(withLookback ? [{ kind: 'lookback', argument: 'window', signed: false }] : []),
        {
          kind: 'bounds',
          from: { argument: 'start_time', as: 'epoch-ms' },
          to: { argument: 'end_time', as: 'epoch-ms', edge: 'exclusive' },
        },
      ],
      ...facts,
    } as never,
    execute: (args, ctx: ToolExecutionContext) => {
      const asked = ctx.time?.asked;
      if (held === undefined || asked === undefined) return '{"ops":42}';
      const queried = { from: asked.from, to: asked.to };
      const hostHeld = args.host === 'blind' ? 'unknown' : queried;
      return describedResult({
        facts: [{ entity: String(args.host ?? 'all'), ops: 42 }],
        provenance: { measuredAt: NOW, source: 'activity export' },
        period: { queried, held: hostHeld },
      });
    },
  });
}

/** A look-back-only search, as the `{ argument, spelling }` sugar declares it. */
function lookbackTool() {
  return defineTool({
    name: 'search_logs',
    description: 'Error lines over a look-back window.',
    inputSchema: { type: 'object', properties: { window: { type: 'string' } } },
    askOrAssume: { window: { assume: '1h' } },
    period: { argument: 'window', spelling: 'lookback' } as never,
    execute: () => 'no errors',
  });
}

const fixtureReader = (read: TimeReader['read']): TimeReader => ({
  id: 'fixture/rule',
  version: '1.0.0',
  locale: 'en-US',
  kind: 'rule',
  read,
});

/** "yesterday" — the whole of 8 October in Los Angeles. */
const yesterdayReader = fixtureReader((text) =>
  text.includes('yesterday')
    ? { mentions: [{ quote: 'yesterday', parses: [{ relative: { unit: 'day', offset: -1 } }] }] }
    : { mentions: [] },
);

/** "10/09/26 8 AM to 8:40 AM" — a numeric date whose order the default policy asks. */
const rangeReader = fixtureReader((text) =>
  text.includes('10/09/26')
    ? {
        mentions: [
          {
            quote: '10/09/26 8 AM to 8:40 AM',
            parses: [
              {
                date: { kind: 'numeric', fields: [10, 9, 26] },
                rangeOf: [{ wall: { h: 8, meridiem: 'am' } }, { wall: { h: 8, m: 40, meridiem: 'am' } }],
              },
            ],
          },
        ],
      }
    : { mentions: [] },
);

// ─── The scenarios ───────────────────────────────────────────────────────

async function controlWindow() {
  wall = NOW_MS + 5_000;
  const agent = build(
    [call('c1', 'client_activity', { host: 'web' }), call('c2', 'client_activity', { host: 'blind' }), answer('42 ops')],
    [epochTool({ held: 'asked' })],
    (b) => b.time({ zone: LA }).resultsLayer(),
  );
  const rec = recordRun(agent);
  await agent.run({ message: 'activity this morning', time: { now: NOW, window: MORNING } });
  // The same run as a recording, for the ContextView test: the band mounted
  // by the view off the fold at the cursor, not handed the rows.
  writeFileSync(join(here, 'time-recording.json'), JSON.stringify(rec.toRecording()));
  rec.stop();
  return frozen(agent);
}

async function widened() {
  wall = NOW_MS + 5_000;
  const agent = build([call('c1', 'search_logs', {}), answer('none')], [lookbackTool()], (b) =>
    b.time({ zone: LA, reader: yesterdayReader }),
  );
  await agent.run({ message: 'any errors yesterday?', time: { now: NOW } });
  return frozen(agent);
}

async function drift() {
  wall = NOW_MS + 30 * 60_000;
  const agent = build(
    [call('c1', 'client_activity', {}), call('c2', 'client_activity', { window: '1h' }), answer('x')],
    [epochTool({ withLookback: true })],
    (b) => b.time({ zone: LA }),
  );
  await agent.run({ message: 'activity', time: { now: NOW, window: LAST_HOUR } });
  return frozen(agent);
}

async function refused() {
  wall = NOW_MS + 5_000;
  const agent = build(
    [call('c1', 'client_activity', {}), answer('cannot')],
    [epochTool({ facts: { direction: 'past' } })],
    (b) => b.time({ zone: LA }),
  );
  await agent.run({ message: 'tomorrow?', time: { now: NOW, window: TOMORROW } });
  return frozen(agent);
}

async function clockOnResume() {
  wall = NOW_MS + 5_000;
  const agent = build(
    [call('c1', 'client_activity', {}), answer('x')],
    [epochTool({ checkIn: true })],
    (b) => b.time({ zone: LA }),
  );
  const paused = await agent.run({ message: 'activity', time: { now: NOW, window: LAST_HOUR } });
  if (!isPaused(paused)) throw new Error('clock-on-resume: expected a check-in pause');
  wall = NOW_MS + 30 * 60_000;
  const cp = JSON.parse(JSON.stringify(paused.checkpoint));
  await agent.resume(cp, checkInApproved({ by: 'ops' }), {
    time: { now: '2026-10-09T16:10:00Z', zone: 'Europe/Paris' },
  });
  return frozen(agent);
}

async function openReading() {
  wall = NOW_MS + 5_000;
  const agent = build([answer('Which date did you mean?')], [], (b) =>
    b.time({ zone: LA, reader: rangeReader }),
  );
  await agent.run({ message: 'errors on 10/09/26 8 AM to 8:40 AM', time: { now: NOW } });
  return frozen(agent);
}

async function ask() {
  wall = NOW_MS + 5_000;
  const agent = build(
    [call('c1', 'collect_window', {}), answer('Done.')],
    [
      defineTool({
        name: 'collect_window',
        description: 'Collect the query time window.',
        inputSchema: { type: 'object', properties: {} },
        execute: () =>
          requestInput({
            id: 'query-window',
            question: 'Which window should the search cover?',
            fields: [
              {
                id: 'window',
                type: 'string',
                format: 'time-range',
                description: 'The window to search, from/to.',
              },
            ],
          }),
      }),
    ],
    (b) => b.time({ zone: LA }),
  );
  const first = await agent.run({ message: 'errors this morning?', time: { now: NOW } });
  if (!isPaused(first) || first.awaitingInput === undefined) throw new Error('ask: expected an input pause');
  const second = await agent.resume(first.checkpoint, {
    requestId: first.awaitingInput.requestId,
    values: { window: '2026-10-09T08:41-07:00/2026-10-09T08:00-07:00' },
  });
  if (!isPaused(second) || second.awaitingInput === undefined) throw new Error('ask: expected the re-ask');
  return JSON.parse(
    JSON.stringify({ first: first.awaitingInput, reasked: second.awaitingInput }),
  ) as Record<string, unknown>;
}

async function axis() {
  const store = inMemoryArtifacts();
  const scope = { conversationId: 'conv-time-fixture' };
  const rows = [
    { hour: '2026-10-09T14:00:00Z', read_iops: 120 },
    { hour: '2026-10-09T15:00:00-07:00', read_iops: 180 },
    { hour: '2026-10-09T16:00:00', read_iops: 90 },
    { read_iops: 70 },
  ];
  const { meta } = await store.put(scope, {
    kind: 'dataset/rows',
    mediaType: 'application/json',
    label: 'IOPS by hour',
    data: rows,
    timeAxis: { column: 'hour', unit: 'iso', interval: '1h', aggregate: { read_iops: 'avg' } },
  });
  return JSON.parse(JSON.stringify({ meta, rows })) as Record<string, unknown>;
}

const out = {
  generatedWith: 'agentfootprint@9.129.0',
  controlWindow: await controlWindow(),
  widened: await widened(),
  drift: await drift(),
  refused: await refused(),
  clockOnResume: await clockOnResume(),
  openReading: await openReading(),
  ask: await ask(),
  axis: await axis(),
};
writeFileSync(join(here, 'time-rows.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log('wrote time-rows.json');
