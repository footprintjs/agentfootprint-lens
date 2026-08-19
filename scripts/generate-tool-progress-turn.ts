/**
 * generate-tool-progress-turn — produce
 * `src/core/__fixtures__/tool-progress-turn.json` from a REAL agentfootprint
 * run (house rule: fixture data is GENERATED, never hand-authored).
 *
 * agentfootprint 9.52.0 gave a tool a way to speak while it is still running:
 * `ctx.progress(payload)` files one `agentfootprint.stream.tool_progress`
 * event, in call order, between that call's `tool_start` and its `tool_end`.
 * The three identity fields (`toolCallId`, `toolName`, `iteration`) are stamped
 * by the framework; `payload` is the tool author's own data, forwarded
 * untouched — which is why it is typed `unknown` and why the Lens renders a
 * PREVIEW of it rather than pretending to understand it.
 *
 * One turn, shaped so the fixture carries every arm the Lens has to render:
 *
 *   iter 1  `walk_graph` reports three times and then returns.
 *             · report 1 — an object payload   ({ hop, of, node })
 *             · report 2 — a string payload
 *             · report 3 — a LONG string, past the preview limit, so the
 *                          truncation path is exercised against a real event
 *   iter 2  `summarize` runs and reports NOTHING — the honest-absence arm. A
 *           tool that never calls `ctx.progress` files no events at all, and a
 *           fixture that only ever showed the loud tool would hide that.
 *   iter 3  the model answers; the turn ends.
 *
 * Frozen as `{ events, structure }` — no `snapshot`, matching
 * `skill-route-refusal.json`: nothing that reads this file uses the commit
 * axis, and the snapshot is several times the size of the events.
 *
 * Run:  npm run fixtures:tool-progress
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Agent, defineTool } from 'agentfootprint';
import { mock } from 'agentfootprint/providers';
import { recordRun } from 'agentfootprint/observe';

const here = dirname(fileURLToPath(import.meta.url));

/** A deliberately long report — longer than the Lens's preview limit, so the
 *  fixture proves truncation against a real event rather than a synthetic one. */
const LONG_REPORT =
  'walked svc-a → svc-b → svc-c → svc-d → svc-e → svc-f → svc-g → svc-h → svc-i → ' +
  'svc-j → svc-k → svc-l; 3 cycles skipped; 2 nodes unreachable from the entry point';

const walkGraph = defineTool({
  name: 'walk_graph',
  description: 'Walk a service dependency graph and report what it finds.',
  inputSchema: { type: 'object', properties: { start: { type: 'string' } } },
  execute: async (_args, ctx) => {
    // Three reports, three payload SHAPES — the author picks the shape per
    // call, and the library neither reads nor normalizes any of them.
    ctx.progress({ hop: 1, of: 3, node: 'svc-a' });
    ctx.progress('still walking — 2 of 3');
    ctx.progress(LONG_REPORT);
    return { nodes: 12, cycles: 3, unreachable: 2 };
  },
});

const summarize = defineTool({
  name: 'summarize',
  description: 'Summarize a graph walk for the customer.',
  inputSchema: { type: 'object', properties: { nodes: { type: 'number' } } },
  // Reports nothing. This is the arm that keeps the fixture honest.
  execute: async () => ({ summary: '12 services, 3 cycles, 2 unreachable' }),
});

let i = 0;
const scripted = mock({
  respond: () => {
    i += 1;
    if (i === 1)
      return {
        content: 'Let me walk the dependency graph.',
        toolCalls: [{ id: 'c1', name: 'walk_graph', args: { start: 'svc-a' } }],
        stopReason: 'tool_use' as const,
      };
    if (i === 2)
      return {
        content: 'Now summarizing what the walk found.',
        toolCalls: [{ id: 'c2', name: 'summarize', args: { nodes: 12 } }],
        stopReason: 'tool_use' as const,
      };
    return {
      content: 'Your graph has 12 services, 3 dependency cycles, and 2 unreachable nodes.',
      toolCalls: [],
      stopReason: 'stop' as const,
    };
  },
});

const agent = Agent.create({ provider: scripted, model: 'mock', maxIterations: 8 })
  .system('You are a service-topology assistant.')
  .tools([walkGraph, summarize])
  .build();

const recorder = recordRun(agent);
await agent.run({ message: 'Walk my service graph and tell me what is wrong with it.' });
const recording = recorder.toRecording();
recorder.stop();

const out = join(here, '..', 'src', 'core', '__fixtures__', 'tool-progress-turn.json');
writeFileSync(out, JSON.stringify({ events: recording.events, structure: recording.structure }));

const progressCount = recording.events.filter(
  (e: { type: string }) => e.type === 'agentfootprint.stream.tool_progress',
).length;
if (progressCount !== 3) {
  throw new Error(
    `tool-progress fixture: expected 3 tool_progress events, the run filed ${progressCount}. ` +
      'Check that the installed agentfootprint is >= 9.52.0.',
  );
}
// eslint-disable-next-line no-console
console.log(
  `wrote ${out} — ${recording.events.length} events, ${progressCount} tool_progress, ` +
    `structure ${recording.structure ? 'present' : 'ABSENT'}`,
);
