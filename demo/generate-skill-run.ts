/**
 * generate-skill-run — produce `demo/skill-run.json` from a REAL agentfootprint
 * run (house rule: demo data is GENERATED, never hand-authored).
 *
 * The agent is a support-triage skill graph on a scripted mock provider, shaped
 * so ONE turn exercises the routing facts the SkillGraph debugger renders:
 *
 *   iter 1  the model reaches for `refunds` from `support` — out of reach.
 *           The gate refuses (`skill.rejected` + the refusal sentence).
 *   iter 2  the cursor is resolved again and nothing moved it (`by: 'stay'`).
 *   iter 3  the model picks a reachable skill (`by: 'model-pick'`).
 *   iter 4  `inspect_charge` returns and the AUTHOR's declared edge fires
 *           (`by: 'route'`), moving billing → refunds.
 *   iter 5  the refund tool runs; the cursor stays in `refunds`.
 *
 * `recordRun()` is the producer half of the recording contract — it wires the
 * boundary recorder BEFORE the run, which is the only way the step strip (the
 * Lens's ONE cursor axis) can be rebuilt offline.
 *
 * Since agentfootprint 9.50.0 the recording also CARRIES THE MAP: the
 * `skill.graph_declared` event (the author's whole topology, fired once per
 * run), `cursorMove.reachable` on every evaluated move, and — because this
 * generator opts in with `recordSystemPrompt: true` — the assembled system
 * prompt verbatim on every `llm_start`. The pre-9.50 run this one replaced is
 * frozen at `src/core/__fixtures__/skill-run-pre-950.json`, so the fallback
 * paths keep a real old-era artifact to run against.
 *
 * Run:  npx tsx demo/generate-skill-run.ts
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Agent, defineTool } from 'agentfootprint';
import { defineSkill, skillGraph } from 'agentfootprint/context';
import { mock } from 'agentfootprint/providers';
import { recordRun } from 'agentfootprint/observe';

const here = dirname(fileURLToPath(import.meta.url));

const inspectCharge = defineTool({
  name: 'inspect_charge',
  description: 'Inspect a charge and return duplicate / refund eligibility evidence.',
  inputSchema: { type: 'object', properties: { invoice_id: { type: 'string' } } },
  execute: async () => ({ duplicate: true, refundable: true, amount: '$49.00', charge_id: 'ch_72A' }),
});

const issueRefund = defineTool({
  name: 'issue_refund',
  description: 'Issue a refund for a verified charge and amount.',
  inputSchema: { type: 'object', properties: { charge_id: { type: 'string' }, amount: { type: 'number' } } },
  execute: async () => ({ status: 'succeeded', refund_id: 're_91M', amount: '$49.00' }),
});

const lookupUser = defineTool({
  name: 'lookup_user',
  description: 'Resolve the account behind an email address.',
  inputSchema: { type: 'object', properties: { email: { type: 'string' } } },
  execute: async () => ({ user_id: 'usr_1', status: 'active' }),
});

const support = defineSkill({
  id: 'support',
  description: 'Classify and route the customer request.',
  body: 'Identify the intent. Route to a reachable specialist before taking billing or account actions.',
});
const billing = defineSkill({
  id: 'billing',
  description: 'Inspect charges and determine the resolution path.',
  body: 'Inspect the charge before choosing a resolution. Never issue money from this skill.',
  tools: [inspectCharge],
});
const account = defineSkill({
  id: 'account',
  description: 'Resolve identity and account-access issues.',
  body: 'Confirm identity, then resolve sign-in and ownership problems.',
  tools: [lookupUser],
});
const refunds = defineSkill({
  id: 'refunds',
  description: 'Authorize and issue verified refunds.',
  body: 'Refund only the verified charge id and amount. Confirm the refund id to the customer.',
  tools: [issueRefund],
});
const disputes = defineSkill({
  id: 'disputes',
  description: 'Open a charge investigation.',
  body: 'Open an investigation when a charge cannot safely be refunded.',
});
const security = defineSkill({
  id: 'security',
  description: 'Lock and escalate account risk.',
  body: 'Lock risky activity and hand it to the account-safety team.',
});

const graph = skillGraph()
  .entry(support)
  .route(support, billing) //                                    model edge
  .route(support, account) //                                    model edge
  .route(billing, refunds, { onToolReturn: 'inspect_charge' }) // declared, deterministic
  .route(billing, disputes) //                                   model edge
  .route(account, security) //                                   model edge
  .route(disputes, security) //                                  model edge
  .build();

let i = 0;
const scripted = mock({
  respond: () => {
    i += 1;
    if (i === 1)
      return {
        content: 'This is a duplicate charge — going straight to refunds.',
        toolCalls: [{ id: 'c1', name: 'read_skill', args: { id: 'refunds' } }],
        stopReason: 'tool_use' as const,
      };
    if (i === 2)
      return {
        content: 'Billing first, then.',
        toolCalls: [{ id: 'c2', name: 'read_skill', args: { id: 'billing' } }],
        stopReason: 'tool_use' as const,
      };
    if (i === 3)
      return {
        content: 'Checking the charge.',
        toolCalls: [{ id: 'c3', name: 'inspect_charge', args: { invoice_id: 'in_8841' } }],
        stopReason: 'tool_use' as const,
      };
    if (i === 4)
      return {
        content: 'Eligible — issuing the refund.',
        toolCalls: [{ id: 'c4', name: 'issue_refund', args: { charge_id: 'ch_72A', amount: 4900 } }],
        stopReason: 'tool_use' as const,
      };
    return {
      content: 'Your duplicate $49.00 charge has been refunded (re_91M).',
      toolCalls: [],
      stopReason: 'stop' as const,
    };
  },
});

const agent = Agent.create({
  provider: scripted,
  model: 'mock',
  maxIterations: 8,
  // Opt IN to the assembled-prompt fact (9.50.0) — the default is OFF for
  // privacy, and the demo exists to show the fact rendered "as sent".
  recordSystemPrompt: true,
})
  .system('You are a customer support agent.')
  .skillGraph(graph)
  .build();

const recorder = recordRun(agent);
await agent.run({ message: 'I was charged twice for my Pro plan. Can you refund the duplicate?' });
const recording = recorder.toRecording();
recorder.stop();

const out = join(here, 'skill-run.json');
writeFileSync(out, JSON.stringify(recording));

// The BUILT graph beside the recording. A recording names a declared edge only
// once it fires, so the record alone is a lower bound on the author's topology
// — this is the other half, and the debugger's `declaredEdges` prop takes it.
// Written from the built object, never typed out by hand.
const graphOut = join(here, 'skill-graph.json');
writeFileSync(graphOut, JSON.stringify({ nodes: graph.nodes, edges: graph.edges }, null, 1));
const snap = recording.snapshot as { commitLog?: unknown[]; recorders?: unknown[] } | undefined;
// eslint-disable-next-line no-console
console.log(
  `wrote ${out} — ${recording.events.length} events, ` +
    `${snap?.commitLog?.length ?? 0} commits, ` +
    `${snap?.recorders?.length ?? 0} recorder snapshots, structure ${recording.structure ? 'present' : 'ABSENT'}` +
    ` · wrote ${graphOut} — ${graph.nodes.length} nodes, ${graph.edges.length} edges`,
);
