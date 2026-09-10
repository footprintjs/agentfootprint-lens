/**
 * generate — produce the Served tab's fixtures from REAL agentfootprint runs
 * (house rule: fixture data is GENERATED, never hand-authored).
 *
 * Every file is `{ snapshot, events, structure }` as `recordRun` froze it, so
 * `observeRecording` reads it whole. Each run is shaped to exercise ONE arm of
 * the tab:
 *
 *   flat-dynamic-tools.json   Agent, `reactMode: 'dynamic'`, two tools, one
 *                             call then done → two epochs, receipts on both.
 *   dynamic-grouped.json      the same turn under `'dynamic-grouped'` — the
 *                             epoch's pieces live in the turn's inner log.
 *   llmcall.json              an `LLMCall` chart: rebuilds, mints NO receipt →
 *                             gaps with `cause: 'no-receipt-committed'`.
 *   paused-resumed-no-base.json  a pause + resume whose snapshot then travelled
 *                             WITHOUT `initialState` → `no-fold-base`. The
 *                             stripping is the one edit made to a real
 *                             recording, and it is the shape a checkpointed run
 *                             has when its base does not travel.
 *   tool-forced.json          `outputSchema(…, { strategy: 'tool-forced' })` →
 *                             a forced tool named, its schema a declared gap.
 *   tool-set-changes.json     a stepped skill: `lookup` served on epoch 1,
 *                             `charge` on epoch 2 — the tool set moves between
 *                             calls. The system pieces do NOT move: the step
 *                             note leads the matching TOOL's description, and
 *                             the skill body and the stepped-procedure line are
 *                             the same text at both epochs.
 *   hidden-skills.json        a PermissionPolicy whose role may not see one
 *                             skill → `hiddenSkillIds` on the FOLD (and, by the
 *                             library's first law, nowhere on a receipt).
 *   instructions-move.json    two `defineInstruction`s beside one tool: one
 *                             active until a tool has run, one on `lookup`'s
 *                             return → the SYSTEM TEXT differs between epoch 1
 *                             and epoch 2 (one piece leaves, one enters; the
 *                             tool set stays).
 *   tagged-chart.json         a plain footprintjs chart with the author's OWN
 *                             tag (`audit`) beside milestone tags, no agent
 *                             events → the tag legend and picker on a name
 *                             the domain does not classify.
 *
 * Run:  npx tsx test/served/fixtures/generate.ts             all nine
 *       npx tsx test/served/fixtures/generate.ts <name>…     only those; the
 *       other files are not touched (every run mints a fresh runId, so a
 *       regenerated fixture never has the bytes it had).
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Agent,
  LLMCall,
  defineTool,
  isPaused,
  pauseHere,
  servedAt,
  type LLMRequest,
  type LLMResponse,
} from 'agentfootprint';
import { defineInstruction, defineSkill, skillGraph } from 'agentfootprint/context';
import { PermissionPolicy } from 'agentfootprint/security';
import { recordRun } from 'agentfootprint/observe';
import { mock } from 'agentfootprint/providers';
import { flowChart, FlowChartExecutor } from 'footprintjs';

const here = dirname(fileURLToPath(import.meta.url));

/** Fixture names given on the command line; none = every fixture. */
const only = new Set(process.argv.slice(2));
const wanted = (name: string): boolean => only.size === 0 || only.has(name);

type Reply = Partial<LLMResponse>;
const answer = (content: string): Reply => ({ content, toolCalls: [], stopReason: 'stop' });
const call = (id: string, name: string, args: Record<string, unknown> = {}): Reply => ({
  content: '',
  toolCalls: [{ id, name, args }],
  stopReason: 'tool_use',
});

/** A scripted mock: reply i answers call i; the last reply repeats. */
function scripted(script: readonly Reply[]) {
  let i = 0;
  return mock({
    respond: (_req: LLMRequest) => {
      const reply = script[Math.min(i, script.length - 1)] ?? answer('done');
      i += 1;
      return reply;
    },
  });
}

const tool = (name: string) =>
  defineTool({
    name,
    description: `the ${name} tool`,
    inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
    execute: () => `${name} result`,
  });

interface Frozen {
  snapshot: unknown;
  events: unknown;
  structure: unknown;
}

function write(name: string, recording: Frozen, check: (r: Frozen) => void): void {
  check(recording);
  const out = join(here, `${name}.json`);
  writeFileSync(out, JSON.stringify(recording));
  // eslint-disable-next-line no-console
  console.log(`wrote ${out}`);
}

const epochsOf = (r: Frozen): number => {
  const snap = r.snapshot as { commitLog?: { stageId?: string }[]; subflowResults?: Record<string, unknown> };
  const flat = (snap.commitLog ?? []).filter((b) => (b.stageId ?? '').endsWith('call-llm')).length;
  const grouped = Object.keys(snap.subflowResults ?? {}).filter((k) => k.startsWith('sf-llm-call#')).length;
  return Math.max(flat, grouped);
};

// ── 1 + 2: flat and grouped, same turn ────────────────────────────────
for (const reactMode of ['dynamic', 'dynamic-grouped'] as const) {
  const name = reactMode === 'dynamic' ? 'flat-dynamic-tools' : 'dynamic-grouped';
  if (!wanted(name)) continue;
  const agent = Agent.create({
    provider: scripted([call('c1', 'alpha_tool', { q: 'x' }), answer('done')]),
    model: 'mock',
    maxIterations: 6,
    reactMode,
    temperature: 0.25,
  })
    .system('You are a bot. SYSTEM_MARKER')
    .tools([tool('alpha_tool'), tool('beta_tool')])
    .build();
  const rec = recordRun(agent);
  await agent.run({ message: 'go' });
  const frozen = rec.toRecording() as Frozen;
  rec.stop();
  write(name, frozen, (r) => {
    if (epochsOf(r) !== 2) throw new Error(`${reactMode}: expected 2 epochs, got ${epochsOf(r)}`);
  });
}

// ── 3: LLMCall — rebuilds, mints no receipt ───────────────────────────
if (wanted('llmcall')) {
  const llm = LLMCall.create({ provider: scripted([answer('done')]), model: 'mock' })
    .system('you are a probe')
    .build();
  const rec = recordRun(llm);
  await llm.run({ message: 'the one turn that went out' });
  const frozen = rec.toRecording() as Frozen;
  rec.stop();
  write('llmcall', frozen, (r) => {
    if (epochsOf(r) < 1) throw new Error('llmcall: no call-llm bundle recorded');
  });
}

// ── 4: paused + resumed, then the base is stripped ────────────────────
if (wanted('paused-resumed-no-base')) {
  const agent = Agent.create({
    provider: scripted([call('c1', 'ask_human'), answer('done')]),
    model: 'mock',
    maxIterations: 6,
  })
    .system('SYSTEM_MARKER you are a bot')
    .tool({
      schema: { name: 'ask_human', description: 'ask', inputSchema: { type: 'object' } },
      execute: () => {
        pauseHere({ question: 'proceed?' });
        return '';
      },
    })
    .build();
  const rec = recordRun(agent);
  const paused = await agent.run({ message: 'go' });
  if (!isPaused(paused)) throw new Error('paused-resumed: the run did not pause');
  await agent.resume(paused.checkpoint, 'yes');
  const frozen = rec.toRecording() as Frozen & { snapshot: { initialState?: unknown } };
  rec.stop();
  if (frozen.snapshot.initialState === undefined) {
    throw new Error('paused-resumed: the resumed snapshot carried no initialState to strip');
  }
  // THE ONE EDIT: the recording travels without its fold base.
  delete frozen.snapshot.initialState;
  write('paused-resumed-no-base', frozen, (r) => {
    if (epochsOf(r) !== 1) throw new Error(`paused-resumed: expected 1 epoch, got ${epochsOf(r)}`);
  });
}

// ── 5: tool-forced output ─────────────────────────────────────────────
if (wanted('tool-forced')) {
  const parse = (value: unknown): { ok: true; value: { ok: boolean } } => ({
    ok: true,
    value: value as { ok: boolean },
  });
  const agent = Agent.create({
    provider: scripted([call('c1', 'respond_with_schema', { ok: true })]),
    model: 'mock',
  })
    .system('bot')
    .outputSchema({ safeParse: parse, parse: (v: unknown) => v } as never, {
      strategy: 'tool-forced',
      jsonSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
    })
    .build();
  const rec = recordRun(agent);
  await agent.run({ message: 'go' });
  const frozen = rec.toRecording() as Frozen;
  rec.stop();
  write('tool-forced', frozen, (r) => {
    if (epochsOf(r) !== 1) throw new Error(`tool-forced: expected 1 epoch, got ${epochsOf(r)}`);
  });
}

// ── 6: the tool set changes between epochs (a stepped skill) ──────────
if (wanted('tool-set-changes')) {
  const stepped = skillGraph({
    skills: [
      defineSkill({
        id: 'refund',
        description: 'refunds',
        body: 'REFUND_BODY',
        tools: [tool('lookup'), tool('charge')],
        steps: [
          { tool: 'lookup', note: 'find the order first' },
          { tool: 'charge', note: 'refund the charge' },
        ],
      } as never),
    ],
    start: 'refund',
    steps: [],
    check: 'off',
  });
  const agent = Agent.create({
    provider: scripted([call('c1', 'lookup'), answer('done'), answer('done')]),
    model: 'mock',
    maxIterations: 6,
  })
    .system('bot')
    .skillGraph(stepped)
    .build();
  const rec = recordRun(agent);
  await agent.run({ message: 'go' });
  const frozen = rec.toRecording() as Frozen;
  rec.stop();
  write('tool-set-changes', frozen, (r) => {
    if (epochsOf(r) < 2) throw new Error(`tool-set-changes: expected ≥2 epochs, got ${epochsOf(r)}`);
  });
}

// ── 7: a role that may not see one skill ──────────────────────────────
if (wanted('hidden-skills')) {
  const policy = PermissionPolicy.fromRoles(
    { support: ['read_skill', 'noop'] },
    'support',
    { skills: { support: ['refunds', 'lookup'] } },
  );
  const noop = defineTool({
    name: 'noop',
    description: 'does nothing',
    inputSchema: { type: 'object', properties: {} },
    execute: () => 'ok',
  });
  const builder = Agent.create({
    provider: scripted([call('c1', 'noop'), answer('done')]),
    model: 'mock',
    maxIterations: 4,
    permissionChecker: policy,
  })
    .system('support bot')
    .tool(noop);
  for (const id of ['refunds', 'payroll', 'lookup']) {
    builder.skill(defineSkill({ id, description: `${id} does things`, body: `${id}_BODY` }));
  }
  const agent = builder.build();
  const rec = recordRun(agent);
  await agent.run({ message: 'go' });
  const frozen = rec.toRecording() as Frozen;
  rec.stop();
  write('hidden-skills', frozen, (r) => {
    const text = JSON.stringify(r.snapshot);
    if (!text.includes('"hiddenSkillIds"')) {
      throw new Error('hidden-skills: the fold carries no hiddenSkillIds key');
    }
  });
}

// ── 8: the system text changes between epochs (one instruction leaves, one enters)
if (wanted('instructions-move')) {
  const agent = Agent.create({
    provider: scripted([call('c1', 'lookup', { q: 'order 41' }), answer('done')]),
    model: 'mock',
    maxIterations: 6,
  })
    .system('support bot')
    .tool(tool('lookup'))
    .instruction(
      defineInstruction({
        id: 'before-lookup',
        description: 'until a tool has run',
        activeWhen: (ctx) => ctx.lastToolResult === undefined,
        prompt: 'Look the order up before you answer.',
      }),
    )
    .instruction(
      defineInstruction({
        id: 'after-lookup',
        description: 'once lookup has returned',
        activeWhen: (ctx) => ctx.lastToolResult?.toolName === 'lookup',
        prompt: 'The order is on record. Answer from it.',
      }),
    )
    .build();
  const rec = recordRun(agent);
  await agent.run({ message: 'refund order 41' });
  const frozen = rec.toRecording() as Frozen;
  rec.stop();
  write('instructions-move', frozen, (r) => {
    if (epochsOf(r) !== 2) throw new Error(`instructions-move: expected 2 epochs, got ${epochsOf(r)}`);
    const first = servedAt(r.snapshot, 1)?.system.text;
    const second = servedAt(r.snapshot, 2)?.system.text;
    if (first === undefined || second === undefined || first === second) {
      throw new Error('instructions-move: the system text did not change between epoch 1 and epoch 2');
    }
  });
}

// ── 9: a plain footprintjs chart with a NON-milestone declared tag ───────
// Every agentfootprint chart declares only `milestone:*` tags. This one is
// the author's own vocabulary — `audit` beside a milestone kind — so the tag
// legend, the picker and `tagStops`'s any-of rule are exercised on a name
// the domain does not classify. No agentfootprint events: the recording is
// `{ snapshot, events: [], structure }`, which `observeRecording` reads as an
// empty event log over a real commit axis.
if (wanted('tagged-chart')) {
  interface State {
    trail?: string[];
    n?: number;
    [key: string]: unknown;
  }
  const push = (name: string) => (s: State) => {
    s.trail = [...(s.trail ?? []), name];
    s.n = (s.n ?? 0) + 1;
  };
  const chart = flowChart<State>('Seed', push('seed'), 'seed')
    .addFunction('Call model', push('a'), 'call-llm')
    .tag('milestone:llm-turn', 'milestone-label:LLM turn')
    .addFunction('Normalise', push('b'), 'normalise')
    .addFunction('Route', push('c'), 'route')
    .tag('milestone:decision', 'milestone-label:Route', 'audit')
    .addFunction('Finish', push('d'), 'finish')
    .tag('audit')
    .build();
  const executor = new FlowChartExecutor(chart);
  await executor.run();
  const frozen: Frozen = { snapshot: executor.getSnapshot(), events: [], structure: chart.buildTimeStructure };
  write('tagged-chart', frozen, (r) => {
    const log = (r.snapshot as { commitLog: { tags?: string[] }[] }).commitLog;
    const audits = log.filter((b) => b.tags?.includes('audit')).length;
    if (audits !== 2) throw new Error(`tagged-chart: expected 2 audit-tagged bundles, got ${audits}`);
    if (!JSON.stringify(r.structure).includes('"audit"')) throw new Error('tagged-chart: the structure lists no audit tag');
  });
}
