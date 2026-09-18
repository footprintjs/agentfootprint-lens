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
 *   llmcall.json              an `LLMCall` chart. Since agentfootprint 9.91.0
 *                             it MINTS a receipt with `cache.strategy: null`
 *                             (9.93.0: nothing stood between assembly and the
 *                             port) → `cache-transform` is NOT raised, and
 *                             `provider-defaults` is.
 *   no-receipt.json           the same chart with `recordReceipt: false` — the
 *                             library's own documented shape for a receipt-less
 *                             view → `no-receipt-on-chart` with
 *                             `cause: 'no-receipt-committed'`, and
 *                             `cache-transform` raised because no receipt can
 *                             say whether a strategy ran.
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
 *   window-evicts.json        `.window(slidingWindow({ keepRecentTurns: 1 }))`
 *                             on a run of three calls → the window drops
 *                             turns at an iteration's head and the call-llm
 *                             mint files them as `Receipt.omittedForAttention`
 *                             (9.93.0): one hash per evicted turn, each the
 *                             turn's own `messages.entries[].hash` as an
 *                             earlier receipt served it.
 *   wrap-up.json              `maxIterations: 2` on a model that always calls
 *                             a tool → the iteration budget runs out and the
 *                             wrap-up call (`wrapUpAtMaxIterations`, default
 *                             on) goes out with `tools.withheld: 'wrap-up'`.
 *   findings-ledger.json      an ARMED agent (`.findings({ answerAsk })`, agentfootprint
 *                             9.103.0) on the mock, `_findings` scripted on
 *                             every call: a planted fact, a noise result, a
 *                             ruled-out result with its line, an open result
 *                             with what settles it, ONE conflict declared on
 *                             the JSON answer, and one result nobody named
 *                             (UNDECLARED). The answer call's wire carries
 *                             the `source: 'findings'` system piece and two
 *                             collapsed tickets.
 *   ontology.json             an agent that DECLARED a map (`.ontology(...)`,
 *                             agentfootprint 9.106.0) on the mock: two
 *                             sources (one `configured`), four terms — one
 *                             held via a registered tool, one with a unit and
 *                             aliases, one held by two sources, one held by
 *                             none — two relations, and two tool calls. The
 *                             run constant `ontology` is seeded once and the
 *                             `source: 'ontology'` piece rides every call.
 *   coverage.json             an agent whose tools DECLARE their coverage
 *                             (agentfootprint 9.109) on the mock: one tool
 *                             returns `coverage(verdict, {...})`, one returns
 *                             `absent({...})`, one returns a bare string;
 *                             three calls in three iterations, so the tracked
 *                             key `coverageDeclared` grows a row per stop.
 *                             Two items shared word-for-word by both declaring
 *                             tools, one `what` under two different `why`s.
 *                             NO `.findings()` — declarations and no ledger;
 *                             `.limitsTravelWithTheAnswer()` on, so the
 *                             record's `finalContent` carries the library's
 *                             own composed block.
 *
 * Run:  npx tsx test/served/fixtures/generate.ts             all fifteen
 *       npx tsx test/served/fixtures/generate.ts <name>…     only those; the
 *       other files are not touched (every run mints a fresh runId, so a
 *       regenerated fixture never has the bytes it had).
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Agent,
  COVERAGE_BLOCK_HEADING,
  LLMCall,
  absent,
  coverage,
  defineTool,
  isPaused,
  pauseHere,
  receiptAt,
  servedAt,
  slidingWindow,
  type LLMRequest,
  type LLMResponse,
} from 'agentfootprint';
import { defineInstruction, defineSkill, skillGraph } from 'agentfootprint/context';
import { defineOntology } from 'agentfootprint/ontology';
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

// ── 3: LLMCall — mints a receipt that SAYS no strategy ran ─────────────
// agentfootprint 9.91.0 made `LLMCall` mint; 9.93.0 put `cache.strategy` on
// the receipt (`null` here: nothing stands between assembly and the port), so
// the `cache-transform` gap is NOT raised on this view. The receipt-less arm
// this file used to drive moved to `no-receipt` below.
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
    const receipt = receiptAt(r.snapshot, 1);
    if (receipt === undefined) throw new Error('llmcall: the call minted no receipt (expected since 9.91.0)');
    // `receiptAt` hands the receipt back AS STORED (9.94.1): a `cache`
    // container is the mint's to write, so a fresh recording without one is
    // a fact to name, not a throw to hide behind `!`.
    if (receipt.cache === undefined) throw new Error('llmcall: the receipt carries no cache container (a 9.88.0+ mint writes one)');
    if (receipt.cache.strategy !== null) {
      throw new Error(`llmcall: expected cache.strategy null, got ${JSON.stringify(receipt.cache.strategy)}`);
    }
    const gaps = servedAt(r.snapshot, 1)?.gaps.map((g) => g.gap) ?? [];
    if (gaps.includes('cache-transform')) throw new Error('llmcall: cache-transform raised beside strategy null');
  });
}

// ── 3b: the receipt-less arm — the mint DECLINED ──────────────────────
// `recordReceipt: false` is the library's own documented way to a view with
// `no-receipt-on-chart` + `cause: 'no-receipt-committed'` (9.91.0). Nothing
// checks the rebuild, every receipt-only field is not on record, and
// `cache-transform` stays raised: with no receipt, the record cannot say
// whether a strategy ran.
if (wanted('no-receipt')) {
  const llm = LLMCall.create({ provider: scripted([answer('done')]), model: 'mock', recordReceipt: false })
    .system('you are a probe')
    .build();
  const rec = recordRun(llm);
  await llm.run({ message: 'the one turn that went out' });
  const frozen = rec.toRecording() as Frozen;
  rec.stop();
  write('no-receipt', frozen, (r) => {
    if (epochsOf(r) < 1) throw new Error('no-receipt: no call-llm bundle recorded');
    if (receiptAt(r.snapshot, 1) !== undefined) throw new Error('no-receipt: a receipt was minted');
    const gaps = servedAt(r.snapshot, 1)?.gaps ?? [];
    const gap = gaps.find((g) => g.gap === 'no-receipt-on-chart');
    if (gap?.cause !== 'no-receipt-committed') {
      throw new Error(`no-receipt: expected cause no-receipt-committed, got ${JSON.stringify(gap?.cause)}`);
    }
    if (!gaps.some((g) => g.gap === 'cache-transform')) throw new Error('no-receipt: cache-transform not raised');
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

// ── 10: the window evicts, and the receipt says what left ───────────────
// A sliding window keeping ONE recent turn on a run of three calls. The
// window stage runs at the head of every iteration from the second on and
// files what it dropped for that iteration's call-llm mint (9.93.0), which
// hashes each evicted turn exactly as `messages.entries` hashed it when it
// was served — so a drop on epoch k's receipt pairs with an earlier epoch's
// entry. The check below drives that pairing law on the real run.
if (wanted('window-evicts')) {
  const agent = Agent.create({
    provider: scripted([call('c1', 'lookup', { q: 'a' }), call('c2', 'lookup', { q: 'b' }), answer('done')]),
    model: 'mock',
    maxIterations: 6,
  })
    .system('bot')
    .tool(tool('lookup'))
    .window(slidingWindow({ keepRecentTurns: 1 }))
    .build();
  const rec = recordRun(agent);
  await agent.run({ message: 'go' });
  const frozen = rec.toRecording() as Frozen;
  rec.stop();
  write('window-evicts', frozen, (r) => {
    const epochs = epochsOf(r);
    if (epochs < 3) throw new Error(`window-evicts: expected ≥3 epochs, got ${epochs}`);
    const evicting = [1, 2, 3].filter((k) => receiptAt(r.snapshot, k)?.omittedForAttention !== undefined);
    if (evicting.length === 0) throw new Error('window-evicts: no receipt carries omittedForAttention');
    for (const k of evicting) {
      const drops = receiptAt(r.snapshot, k)!.omittedForAttention!;
      const earlier = new Set(
        Array.from({ length: k - 1 }, (_, i) => receiptAt(r.snapshot, i + 1))
          .flatMap((rcpt) => rcpt?.messages.entries.map((e) => e.hash) ?? []),
      );
      const unpaired = drops.hashes.filter((h) => !earlier.has(h));
      if (unpaired.length > 0) {
        throw new Error(`window-evicts: epoch ${k} dropped ${unpaired.length} hash(es) no earlier receipt served`);
      }
    }
  });
}

// ── 11: the iteration budget runs out and the wrap-up call withholds tools
// `maxIterations: 2` on a model that never stops calling a tool. The route
// stage sees the budget spent and asks for a wrap-up (`wrapUpAtMaxIterations`,
// default on since 9.56.0): one more call, no tools, `tools.withheld:
// 'wrap-up'` on its receipt — the library's own value for why the list is
// empty when it would not otherwise be.
if (wanted('wrap-up')) {
  const agent = Agent.create({
    provider: scripted([call('c1', 'lookup', { q: 'a' }), call('c2', 'lookup', { q: 'b' }), answer('wrapped')]),
    model: 'mock',
    maxIterations: 2,
  })
    .system('bot')
    .tool(tool('lookup'))
    .build();
  const rec = recordRun(agent);
  await agent.run({ message: 'go' });
  const frozen = rec.toRecording() as Frozen;
  rec.stop();
  write('wrap-up', frozen, (r) => {
    const epochs = epochsOf(r);
    const withheld = Array.from({ length: epochs }, (_, i) => receiptAt(r.snapshot, i + 1)?.tools.withheld);
    const at = withheld.findIndex((w) => w === 'wrap-up');
    if (at < 0) throw new Error(`wrap-up: no receipt carries tools.withheld 'wrap-up' (${JSON.stringify(withheld)})`);
    if (servedAt(r.snapshot, at + 1)?.tools.withheld !== 'wrap-up') {
      throw new Error('wrap-up: the view does not carry the withheld reason');
    }
  });
}

// ── 12: the findings ledger — the model's own standings, on the record ──
// An ARMED agent (`.findings()`, agentfootprint 9.101.0) on the mock, with
// `_findings` scripted on every call. Batch 1 makes four calls, each with a
// basis. Batch 2's first call declares the four results — a planted fact
// (one assertion), a noise result, a ruled-out result with its line, an open
// result with what settles it — and the JSON answer stands on a SECOND
// reading of the planted fact's subject and predicate with a different
// value, so `recordFindings` writes ONE conflict row (two witnesses). The
// answer is peeled only under `.outputSchema()` (the no-outputSchema
// last-batch law), and it names batch 2's first result alone: the other is
// judged by nothing — UNDECLARED on the record, in `toolResults` with no
// standing row. The tool-calls stage files a call's declarations before
// dispatch, so the answer call's wire (epoch 3) carries the
// `source: 'findings'` system piece and the noise and ruled-out results as
// collapsed tickets; epochs 1 and 2 carry neither.
if (wanted('findings-ledger')) {
  const port = { kind: 'port', id: 'fc1/7' };
  const lookup = (id: string, q: string, findings: Record<string, unknown>) => ({
    id,
    name: 'lookup',
    args: { q, _findings: findings },
  });
  const batch = (calls: readonly { id: string; name: string; args: Record<string, unknown> }[]): Reply => ({
    content: '',
    toolCalls: [...calls],
    stopReason: 'tool_use',
  });
  const agent = Agent.create({
    provider: scripted([
      batch([
        lookup('c1', 'fc1/7 state', { basis: 'direct', expect: 'high' }),
        lookup('c2', 'fc1/8 state', { basis: 'exploratory', expect: 'low' }),
        lookup('c3', 'optic swaps', {
          basis: 'exploratory',
          proposition: 'the optic on fc1/7 was swapped this week',
          predicts: 'a swap event for fc1/7 dated within seven days',
        }),
        lookup('c4', 'fc1/7 counters', { basis: 'direct' }),
      ]),
      batch([
        lookup('c5', 'fc1/7 state again', {
          basis: 'direct',
          previous: [
            {
              toolCallId: 'c1',
              standing: 'fact',
              sought: true,
              assertions: [{ subject: port, predicate: 'state', value: 'up' }],
            },
            { toolCallId: 'c2', standing: 'noise' },
            { toolCallId: 'c3', standing: 'ruled-out', line: 'the optic was not swapped this week' },
            {
              toolCallId: 'c4',
              standing: 'open',
              settles: 'a second read of the port counters',
              assertions: [{ subject: port, predicate: 'flapping', value: true }],
            },
          ],
        }),
        lookup('c6', 'fc1/7 neighbour', { basis: 'exploratory' }),
      ]),
      answer(
        JSON.stringify({
          answer: 'fc1/7',
          _findings: {
            previous: [
              {
                toolCallId: 'c5',
                standing: 'fact',
                assertions: [{ subject: port, predicate: 'state', value: 'down' }],
              },
            ],
          },
        }),
      ),
    ]),
    model: 'mock',
    maxIterations: 6,
  })
    .system('bot')
    .tool(tool('lookup'))
    .findings({ answerAsk: 'quote-facts' })
    .outputSchema({ parse: (value: unknown) => value } as never, { retries: 0 })
    .build();
  const rec = recordRun(agent);
  await agent.run({ message: 'is fc1/7 up?' });
  const frozen = rec.toRecording() as Frozen;
  rec.stop();
  write('findings-ledger', frozen, (r) => {
    if (epochsOf(r) !== 3) throw new Error(`findings-ledger: expected 3 epochs, got ${epochsOf(r)}`);
    interface Row {
      kind: string;
      toolCallId?: string;
      standing?: string;
      line?: string;
      settles?: string;
      witnesses?: unknown[];
    }
    const state = (r.snapshot as { sharedState?: { findingsLedger?: Row[]; toolResults?: { toolCallId: string }[] } }).sharedState;
    const ledger = state?.findingsLedger;
    if (!Array.isArray(ledger)) throw new Error('findings-ledger: the state carries no findingsLedger key');
    const standing = new Map<string, Row>();
    for (const row of ledger) if (row.kind === 'standing' && row.toolCallId !== undefined) standing.set(row.toolCallId, row);
    const expected: Record<string, string> = { c1: 'fact', c2: 'noise', c3: 'ruled-out', c4: 'open', c5: 'fact' };
    for (const [id, s] of Object.entries(expected)) {
      if (standing.get(id)?.standing !== s) {
        throw new Error(`findings-ledger: expected ${id} standing ${s}, got ${JSON.stringify(standing.get(id)?.standing)}`);
      }
    }
    if (standing.has('c6')) throw new Error('findings-ledger: c6 must be undeclared (no standing row)');
    if (standing.get('c3')?.line === undefined) throw new Error('findings-ledger: the ruled-out row carries no line');
    if (standing.get('c4')?.settles === undefined) throw new Error('findings-ledger: the open row carries no settles');
    const conflicts = ledger.filter((row) => row.kind === 'conflict');
    if (conflicts.length !== 1 || conflicts[0]?.witnesses?.length !== 2) {
      throw new Error(`findings-ledger: expected one conflict row with two witnesses, got ${JSON.stringify(conflicts)}`);
    }
    if (!(state?.toolResults ?? []).some((t) => t.toolCallId === 'c6')) {
      throw new Error('findings-ledger: the undeclared result c6 is not in toolResults');
    }
    const ticket = (content: unknown): boolean => {
      if (typeof content !== 'string') return false;
      try {
        const parsed = JSON.parse(content) as { collapsed?: unknown };
        return parsed !== null && typeof parsed === 'object' && parsed.collapsed === true;
      } catch {
        return false;
      }
    };
    for (const k of [1, 2, 3]) {
      const view = servedAt(r.snapshot, k);
      if (view === undefined) throw new Error(`findings-ledger: no served view at epoch ${k}`);
      const piece = view.system.pieces.some((p) => p.source === 'findings');
      const tickets = view.messages.asSent.filter((m) => m.role === 'tool' && ticket(m.content)).length;
      if (k < 3 && (piece || tickets > 0)) {
        throw new Error(`findings-ledger: epoch ${k} carries the piece or a ticket before any standing was declared`);
      }
      if (k === 3 && !piece) throw new Error('findings-ledger: epoch 3 carries no findings piece');
      if (k === 3 && tickets !== 2) throw new Error(`findings-ledger: expected 2 collapsed tickets at epoch 3, got ${tickets}`);
    }
  });
}

// ── 13: the declared ontology — the map, seeded once, served on every call ──
// An agent built with `.ontology(defineOntology({...}))` (agentfootprint
// 9.106.0) on the mock. The map: two sources — `inventory` (configured, with
// a coverage sentence) and `telemetry` (nothing said about configuration);
// four terms — `port` held by `inventory` via the registered `lookup` tool
// with its own coverage sentence, `port_error_rate` (a unit) held by
// `telemetry`, `optic` (aliases) held by BOTH sources, and
// `maintenance_window` held by no source at all (the declaration's `known,
// not held here`); two relations in the author's words. Two tool calls, then
// an answer. `seed` writes the whole spec ONCE as the run constant
// `ontology`; the `source: 'ontology'` system piece is on every epoch's
// served view. The library infers nothing from the map — nor does this
// fixture: the checks below read the record only.
if (wanted('ontology')) {
  const map = defineOntology({
    id: 'fleet',
    version: '1',
    sources: {
      inventory: { meaning: 'the switch inventory export', coverage: 'every port on every switch in the fleet', configured: true },
      telemetry: { meaning: 'the streaming counters feed' },
    },
    nodes: {
      port: {
        meaning: 'a physical switch port',
        sources: [{ source: 'inventory', via: ['lookup'], coverage: 'each port by its switch and name' }],
      },
      port_error_rate: { meaning: 'CRC errors per minute on a port', unit: 'errors/min', sources: [{ source: 'telemetry' }] },
      optic: { meaning: 'the transceiver seated in a port', aliases: ['sfp', 'transceiver'], sources: [{ source: 'inventory' }, { source: 'telemetry' }] },
      maintenance_window: { meaning: 'a scheduled change on a switch' },
    },
    edges: [
      { from: 'port_error_rate', to: 'port', relation: 'measured-on' },
      { from: 'optic', to: 'port', relation: 'seated-in', meaning: 'one optic per port' },
    ],
  });
  const agent = Agent.create({
    provider: scripted([call('c1', 'lookup', { q: 'fc1/7' }), call('c2', 'lookup', { q: 'fc1/8' }), answer('done')]),
    model: 'mock',
    maxIterations: 6,
  })
    .system('bot')
    .tool(tool('lookup'))
    .ontology(map)
    .build();
  const rec = recordRun(agent);
  await agent.run({ message: 'is fc1/7 up?' });
  const frozen = rec.toRecording() as Frozen;
  rec.stop();
  write('ontology', frozen, (r) => {
    if (epochsOf(r) !== 3) throw new Error(`ontology: expected 3 epochs, got ${epochsOf(r)}`);
    const state = (r.snapshot as { sharedState?: { ontology?: { id: string; version: string; hash: string; spec: unknown } } }).sharedState;
    const record = state?.ontology;
    if (record === undefined) throw new Error('ontology: the state carries no ontology key');
    if (record.id !== map.id || record.version !== map.version || record.hash !== map.hash) {
      throw new Error(`ontology: the record's identity differs from the map's (${JSON.stringify({ id: record.id, version: record.version, hash: record.hash })})`);
    }
    const seeds = (r.snapshot as { commitLog: { overwrite?: Record<string, unknown> }[] }).commitLog.filter(
      (b) => b.overwrite !== undefined && 'ontology' in b.overwrite,
    ).length;
    if (seeds !== 1) throw new Error(`ontology: expected the key written once, got ${seeds} bundles`);
    for (const k of [1, 2, 3]) {
      const view = servedAt(r.snapshot, k);
      if (view === undefined) throw new Error(`ontology: no served view at epoch ${k}`);
      if (!view.system.pieces.some((p) => p.source === 'ontology')) throw new Error(`ontology: epoch ${k} carries no ontology piece`);
    }
  });
}

// ── 14: declared coverage — what the tools said they checked, did not check, and can never cover ──
// An agent whose tools return the two reserved shapes (agentfootprint 9.109):
// `zone_membership` returns `coverage(verdict, {...})` — a ledger around a
// verdict — and `flogi_for_port` returns `absent({...})` — a search that found
// nothing and names the ground it covered; `port_state` returns a bare string
// and declares nothing. Three calls in three iterations, so the TRACKED key
// `coverageDeclared` grows one row per declaring stop: one row at the first
// tool-calls stop, two at the second, still two at the third. Two items are
// shared word-for-word by both declaring tools (a `checked` entry, and a
// `cannotCover` entry with its `why`), so the answer-level merge lists each
// once; one `checked` entry has the same `what` under two different `why`s,
// which the library's `sameItem` keeps as two. NO `.findings()` — the record
// carries declarations and no ledger. `.limitsTravelWithTheAnswer()` is ON,
// so the record's `finalContent` carries the library's own composed block —
// the oracle the Coverage band's boundary is pinned against.
if (wanted('coverage')) {
  const port = { type: 'object', properties: { port: { type: 'string' } } };
  const zoneMembership = defineTool({
    name: 'zone_membership',
    description: 'zone membership of one interface',
    inputSchema: port,
    execute: () =>
      coverage('fc1/3 is a member of zone Z_ESX07 in the active zoneset', {
        checked: ['shq-fab-a: the live fcns database', { what: 'window: the last 24h', why: 'the active zoneset is read live' }],
        notChecked: [{ what: 'the archived zoneset history', why: 'older than the 24h window' }],
        cannotCover: [
          { what: 'ports on the peer fabric', why: 'this collector is scoped to one fabric' },
          { what: 'host-side multipathing', why: 'no collector runs on the ESX hosts' },
        ],
      }),
  });
  const flogiForPort = defineTool({
    name: 'flogi_for_port',
    description: 'FLOGI entries for one interface',
    inputSchema: port,
    execute: () =>
      absent({
        what: 'FLOGI entries on fc1/3',
        checked: ['shq-fab-a: the live fcns database', { what: 'window: the last 24h', why: 'FLOGI history retention on this fabric' }],
        cannotCover: [{ what: 'ports on the peer fabric', why: 'this collector is scoped to one fabric' }],
        tryInstead: 'Ask for a different interface, or query the peer fabric by name.',
      }),
  });
  const portState = defineTool({
    name: 'port_state',
    description: 'the operational state of one interface',
    inputSchema: port,
    execute: () => 'fc1/3: up',
  });
  const agent = Agent.create({
    provider: scripted([
      call('c1', 'zone_membership', { port: 'fc1/3' }),
      call('c2', 'flogi_for_port', { port: 'fc1/3' }),
      call('c3', 'port_state', { port: 'fc1/3' }),
      answer('fc1/3 is up and zoned, with no FLOGI in the last 24h.'),
    ]),
    model: 'mock',
    maxIterations: 6,
  })
    .system('bot')
    .tools([zoneMembership, flogiForPort, portState])
    .limitsTravelWithTheAnswer()
    .build();
  const rec = recordRun(agent);
  await agent.run({ message: 'is fc1/3 logged in?' });
  const frozen = rec.toRecording() as Frozen;
  rec.stop();
  write('coverage', frozen, (r) => {
    if (epochsOf(r) !== 4) throw new Error(`coverage: expected 4 epochs, got ${epochsOf(r)}`);
    interface Row {
      kind: string;
      toolName: string;
      toolCallId?: string;
      iteration: number;
      lookedFor?: string;
    }
    const state = (r.snapshot as { sharedState?: { coverageDeclared?: Row[]; findingsLedger?: unknown } }).sharedState;
    const rows = state?.coverageDeclared;
    if (!Array.isArray(rows)) throw new Error('coverage: the state carries no coverageDeclared key');
    const shape = rows.map((row) => `${row.toolName}:${row.kind}:${row.iteration}`).join(' ');
    if (shape !== 'zone_membership:ledger:1 flogi_for_port:absence:2') throw new Error(`coverage: unexpected rows ${shape}`);
    if (rows[1]?.lookedFor !== 'FLOGI entries on fc1/3') throw new Error('coverage: the absence row carries no lookedFor');
    if (rows.some((row) => row.toolCallId === undefined)) throw new Error('coverage: a row carries no toolCallId');
    if (state?.findingsLedger !== undefined) throw new Error('coverage: the record carries a findings ledger — the no-ledger arm is lost');
    // The tracked key grows across stops: the first row lands as a `set` at
    // one tool-calls stop, the second as an `append` at a later one (the
    // recording is delta-encoded), so the fold at the first stop holds one
    // row and the fold at the second holds two.
    const verbs = (r.snapshot as { commitLog: { trace?: { path?: string; verb?: string }[] }[] }).commitLog
      .flatMap((b) => (b.trace ?? []).filter((row) => row.path === 'coverageDeclared').map((row) => row.verb))
      .join(',');
    if (verbs !== 'set,append') throw new Error(`coverage: expected the key written as set then append, got ${verbs}`);
    // The library's own block rides the answer — the boundary the band is
    // pinned against. The composed answer is filed by the `final` subflow
    // (its own log) and on the `agentfootprint.agent.turn_end` event's
    // `payload.finalContent` — the root state's `finalContent` is not it.
    const events = r.events as { type?: string; payload?: { finalContent?: unknown } }[];
    const turnEnd = events.find((e) => e.type === 'agentfootprint.agent.turn_end');
    const answered = turnEnd?.payload?.finalContent;
    if (typeof answered !== 'string' || !answered.includes(COVERAGE_BLOCK_HEADING)) {
      throw new Error('coverage: the turn_end event carries no coverage block on finalContent');
    }
  });
}
