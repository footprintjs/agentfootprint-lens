/** Synthetic, zero-provider-cost contract using only the producers' exported doors. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
const agentRoot = resolve(args.get('--agent-dir') ?? 'producer-agent');
const valuesRoot = resolve(args.get('--values-dir') ?? 'producer-values');
const output = resolve(args.get('--out') ?? 'context-producer.json');
async function door(root, name) {
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const entry = pkg.exports[name]?.import?.default;
  assert.equal(typeof entry, 'string', `producer must export ${name}`);
  return import(pathToFileURL(resolve(root, entry)).href);
}
const { Agent, defineTool } = await door(agentRoot, '.');
const { MockProvider } = await door(agentRoot, './providers');
const { recordContextRun, readContextRecording, applyContextChange, buildStepGraphFromEvents } =
  await door(agentRoot, './observe');
const { createValueTable, readValueRecord } = await door(valuesRoot, './values');
let calls = 0;
const requests = [];
const provider = new MockProvider({ respond(request) {
  requests.push(JSON.parse(JSON.stringify(request)));
  return ++calls < 3 ? { toolCalls: [{ id: `lookup-${calls}`, name: 'lookup', args: {} }] } : 'Finished.';
} });
const agent = Agent.create({ provider, model: 'mock' })
  .system('Use the declared evidence; preserve exact context. '.repeat(30))
  .tool(defineTool({ name: 'lookup', description: 'Read one declared item. '.repeat(12),
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execute: () => ({ rows: [{ value: 'stored result' }] }),
  })).maxIterations(4).build();
const handle = recordContextRun(agent, createValueTable({ redact: value => value }));
await agent.run({ message: 'Perform the declared steps.' });
handle.stop();
const encoded = await handle.toRecording();
const decoded = await readContextRecording(JSON.parse(JSON.stringify(encoded)), readValueRecord);
assert.equal(decoded.calls.length, 3);
const ids = new Set(decoded.calls.flatMap(call => [...call.added, ...call.removed]));
const dictionary = [...ids].map(id => ({ id, value: decoded.values.resolve({ ref: id }) }));
const previous = new Map();
const expandedCalls = decoded.calls.map(call => {
  const owner = JSON.stringify([call.meta.runId, call.meta.compositionPath, call.meta.subflowPath]);
  const ids = applyContextChange(previous.get(owner) ?? [], call);
  previous.set(owner, ids);
  return ids.map(id => decoded.values.resolve({ ref: id }));
});
const boundary = decoded.recording.snapshot.recorders.find(entry => entry.name === 'BoundaryEvents');
const graph = buildStepGraphFromEvents(boundary.data);
const result = { provenance: { kind: 'synthetic MockProvider producer-decoded fixture',
  encodedSha256: createHash('sha256').update(JSON.stringify(encoded)).digest('hex'),
  agentSource: args.get('--agent-head') ?? 'explicit supplied build',
  valuesSource: args.get('--values-head') ?? 'explicit supplied build' },
  decoded: { recording: decoded.recording, calls: decoded.calls, droppedEvents: decoded.droppedEvents,
    firstRetainedEventIndex: decoded.firstRetainedEventIndex }, dictionary, graph, requests, expandedCalls };
await writeFile(output, JSON.stringify(result));
console.log(JSON.stringify({ calls: decoded.calls.length, bytes: Buffer.byteLength(JSON.stringify(result)),
  provenance: result.provenance }));
