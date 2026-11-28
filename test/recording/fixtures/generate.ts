/**
 * generate — the saved-recording fixture, from a REAL agentfootprint 19 run
 * (house rule: fixture data is GENERATED, never hand-authored).
 *
 * One scripted agent turn (no model is called): the model asks for one tool,
 * reads its result, then answers. It is filed twice through the agent's own
 * `artifacts` option, once in each layout:
 *
 *   parts   `recordings: { layout: 'parts' }` — an index (format 2), a base
 *           part and invocation parts. Read back with `openSavedRecording`:
 *           the index's `subflowPayloads`, `readRoot()` (the base, with each
 *           moved sub-flow payload marked `payloadWith: 'invocation'`) and
 *           `readInvocation(key)` for every invocation (`{ result, payloads }`),
 *           which is what a host's child reply passes through.
 *   whole   the default layout, read back whole (`readWhole()`): the payloads
 *           stay in the base row.
 *
 * Each layout is filed by its own child process, with the wall clock stepped
 * deterministically (`Date.now`) and `crypto.getRandomValues` seeded, so both
 * runs record the same text, ids included, and the output is the same every
 * time.
 * The agent runs with agentfootprint 19's defaults, so its tree holds write
 * markers (`writeTracking: 'summary'`), not written values.
 *
 * The committed lock stays on the agentfootprint 15 floor, so install 19 for
 * the run (as `.github/workflows/agentfootprint-newer.yml` does), then:
 *
 *   npm run fixtures:recording
 *
 * It writes `saved-turn-19.json.gz` next to this file.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { Agent, defineTool, inMemoryArtifacts } from 'agentfootprint';

// 18.2+ doors, read through a local type so this file still typechecks on the 15 floor of the lock.
type Readable = { readonly status: string; readonly reason?: string };
type Opened = Readable & {
  readonly layout: 'whole' | 'parts'; readonly complete: boolean; readonly snapshotRunId?: string;
  readonly invocations: readonly { readonly key: string; readonly path: readonly string[]; readonly subflowId: string }[];
  readRoot(): Promise<Readable & { readonly recording?: unknown }>;
  readInvocation(key: string): Promise<Readable & { readonly result?: unknown; readonly payloads?: unknown }>;
  readWhole(): Promise<Readable & { readonly recording?: unknown }>;
};
const { openSavedRecording } = (await import('agentfootprint/observe')) as unknown as {
  openSavedRecording(artifacts: unknown, ref: unknown): Promise<Opened>;
};

const here = dirname(fileURLToPath(import.meta.url));
const version = createRequire(import.meta.url)('agentfootprint/package.json').version as string;
if (Number(version.split('.')[0]) < 19) throw new Error(`Run with agentfootprint 19 or newer installed (found ${version}).`);

// A clock that moves one millisecond per read: event times stay in the order
// things happened (the viewer orders a recording's two event halves by time),
// and are the same on every run.
let now = Date.parse('2026-11-26T09:00:00Z');
Date.now = () => (now += 1);
// A seeded generator in place of the platform's (the call occurrence keys draw from it).
let seed = 0x2f6b_19a1;
Object.defineProperty(globalThis.crypto, 'getRandomValues', {
  configurable: true,
  value: <T extends ArrayBufferView>(array: T): T => {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    for (let i = 0; i < bytes.length; i++) { seed = (seed * 1_103_515_245 + 12_345) >>> 0; bytes[i] = seed >>> 24; }
    return array;
  },
});

type Reply = { content: string; toolCalls?: { id: string; name: string; args: object }[] };
function scripted(script: readonly Reply[]) {
  let i = 0;
  return {
    name: 'recording-fixture-mock',
    complete: async () => {
      const reply = script[Math.min(i, script.length - 1)] ?? { content: 'done' };
      i += 1;
      return { content: reply.content, toolCalls: reply.toolCalls ?? [], usage: { input: 0, output: 0 } };
    },
  };
}

const lookup = defineTool({
  name: 'lookup_capital',
  description: 'The capital city of a country.',
  inputSchema: { type: 'object', properties: { country: { type: 'string' } }, required: ['country'] },
  execute: (args: { country?: unknown }) => JSON.stringify({ country: args.country, capital: 'Paris' }),
});

/** One turn, filed in `layout`; returns the store bound to the run's scope and the receipt's ref. */
async function file(layout: 'parts' | 'whole') {
  const inner = inMemoryArtifacts();
  let scope: unknown;
  // Remember the scope the agent files into, to bind a reader to it.
  const store = new Proxy(inner, {
    get(target, key, receiver) {
      if (key === 'put') return (at: unknown, input: unknown) => { scope = at; return target.put(at as never, input as never); };
      const value = Reflect.get(target, key, receiver) as unknown;
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
  const agent = Agent.create({
    provider: scripted([
      { content: 'Let me look that up.', toolCalls: [{ id: 'c1', name: 'lookup_capital', args: { country: 'France' } }] },
      { content: 'The capital of France is Paris.' },
    ]) as never,
    model: 'mock',
    maxIterations: 4,
    artifacts: { store, recordings: { layout } } as never,
  }).system('You answer geography questions.').tools([lookup]).build();
  let ref: unknown;
  const kind = layout === 'parts' ? 'recording/run-index' : 'recording/run';
  agent.on('agentfootprint.artifacts.minted', (event: { payload?: { kind?: string; ref?: unknown } }) => {
    if (event.payload?.kind === kind) ref = event.payload.ref;
  });
  await agent.run({ message: 'What is the capital of France?' });
  if (ref === undefined || scope === undefined) throw new Error(`The ${layout} recording was not filed.`);
  const artifacts = { head: (at: never) => inner.head(scope as never, at), get: (at: never) => inner.get(scope as never, at) };
  return { artifacts, ref };
}

const json = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

async function readParts() {
  const parts = await file('parts');
  const saved = await openSavedRecording(parts.artifacts, parts.ref);
  if (saved.status !== 'ready' || saved.layout !== 'parts' || !saved.complete) throw new Error('The parts recording did not open complete.');
  const stored = await parts.artifacts.get(parts.ref as never) as { data?: unknown; text?: string } | null;
  const index = (typeof stored?.data === 'string' ? JSON.parse(stored.data) : stored?.data ?? JSON.parse(String(stored?.text))) as {
    format: string; subflowPayloads?: unknown;
  };
  const root = await saved.readRoot();
  if (root.status !== 'ready') throw new Error('readRoot refused.');
  const replies: Record<string, unknown> = {};
  for (const invocation of saved.invocations) {
    const read = await saved.readInvocation(invocation.key);
    if (read.status !== 'ready') throw new Error(`readInvocation(${invocation.key}) refused: ${read.reason}`);
    replies[invocation.key] = { result: read.result, ...(read.payloads !== undefined && { payloads: read.payloads }) };
  }
  return { index: { format: index.format, subflowPayloads: index.subflowPayloads }, snapshotRunId: saved.snapshotRunId,
    invocations: saved.invocations, root: root.recording, replies };
}

async function readWholeLayout() {
  const filed = await file('whole');
  const whole = await openSavedRecording(filed.artifacts, filed.ref);
  if (whole.status !== 'ready' || whole.layout !== 'whole') throw new Error('The whole recording did not open.');
  const read = await whole.readWhole();
  if (read.status !== 'ready') throw new Error('readWhole refused.');
  return read.recording;
}

const layout = process.argv[process.argv.indexOf('--layout') + 1];
if (process.argv.includes('--layout')) {
  // A child: file one layout and print what was read back.
  process.stdout.write(JSON.stringify(layout === 'parts' ? await readParts() : await readWholeLayout()));
} else {
  const run = (which: string) => JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--layout', which],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })) as unknown;
  const parts = run('parts') as { invocations: readonly unknown[]; index: { format: string } };
  const fixture = json({ agentfootprint: version, parts, whole: run('whole') });
  const output = process.env.LENS_RECORDING_FIXTURE ?? join(here, 'saved-turn-19.json.gz');
  writeFileSync(output, gzipSync(JSON.stringify(fixture), { level: 9 }));
  console.log(`agentfootprint ${version}: ${parts.invocations.length} invocations, index ${parts.index.format}`);
}
