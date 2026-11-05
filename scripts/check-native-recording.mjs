// Copied into the installed consumer. Never execute against repository-linked
// historical peers as native evidence; the exact cohort is checked first.
import assert from 'node:assert/strict';
import { createRequire, register } from 'node:module';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

register(`data:text/javascript,${encodeURIComponent(`
  export async function load(url, context, nextLoad) {
    if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
    return nextLoad(url, context);
  }
`)}`);
const require = createRequire(import.meta.url);
require.extensions['.css'] = () => {};

function installedVersion(name, entry = name) {
  let directory = dirname(realpathSync(require.resolve(entry)));
  while (true) {
    const path = join(directory, 'package.json');
    if (existsSync(path)) {
      const manifest = JSON.parse(readFileSync(path, 'utf8'));
      if (manifest.name === name) return manifest.version;
    }
    const parent = dirname(directory);
    assert.notEqual(parent, directory, `cannot locate installed ${name}`);
    directory = parent;
  }
}

const versions = Object.fromEntries(['agentfootprint', 'footprintjs', 'foottrace'].map((name) =>
  [name, installedVersion(name)]));
const expectedCohort = JSON.parse(readFileSync(new URL('./expected-cohort.json', import.meta.url), 'utf8'));
const consumerLock = JSON.parse(readFileSync(new URL('./package-lock.json', import.meta.url), 'utf8'));
assert.deepEqual(versions, expectedCohort.pins, 'installed versions must match the source-selected cohort');
for (const [name, expected] of Object.entries(expectedCohort.packages)) {
  const entry = consumerLock.packages[`node_modules/${name}`];
  assert.equal(entry.version, expected.version);
  assert.equal(entry.resolved, expected.tarball);
  assert.equal(entry.integrity, expected.integrity);
  assert.ok(!entry.link);
}
versions.lens = installedVersion('agentfootprint-lens', 'agentfootprint-lens/core');

const report = { schema: 1, expectedCohort, versions, formats: {} };
for (const [format, load] of [
  ['ESM', (name) => import(name)],
  ['CJS', (name) => require(name)],
]) {
  const { Agent, defineTool } = await load('agentfootprint');
  const { mock } = await load('agentfootprint/providers');
  const { recordRun } = await load('agentfootprint/observe');
  const { LensRecorder, observeRecording, buildGroups } = await load('agentfootprint-lens/core');
  const { attempt } = await load('footprintjs');
  const { attempts } = await load('footprintjs/recorders');

  let toolCalls = 0;
  let modelCalls = 0;
  const tool = defineTool({
    name: 'native_lookup', description: 'Return the requested probe key',
    inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
    execute: async (args) => {
      assert.deepEqual(args, { key: 'ready' });
      toolCalls += 1;
      return { key: 'ready', value: 'native-recorded-value' };
    },
  });
  const agent = Agent.create({
    provider: mock({ respond: (request) => {
      modelCalls += 1;
      if (modelCalls === 1) return {
        content: '', stopReason: 'tool_use',
        toolCalls: [{ id: 'native-call-1', name: 'native_lookup', args: { key: 'ready' } }],
      };
      assert.equal(modelCalls, 2, 'the bounded mock must not acquire an unexpected extra turn');
      assert.match(JSON.stringify(request.messages), /native-recorded-value/,
        'the second model call must receive the actual tool result');
      return { content: 'native probe done', stopReason: 'stop', toolCalls: [] };
    } }),
    model: 'mock', maxIterations: 3,
  }).system('Use native_lookup once, then answer.').tools([tool]).build();

  const live = new LensRecorder();
  const recording = recordRun(agent);
  let replay;
  try {
    live.observe(agent);
    const result = await agent.run({ message: 'Look up ready.' });
    assert.equal(result, 'native probe done');
    assert.equal(modelCalls, 2);
    assert.equal(toolCalls, 1);
    assert.equal(recording.droppedEvents, 0);
    const json = JSON.stringify(recording.toRecording());
    const saved = JSON.parse(json);
    assert.ok(saved.snapshot && Array.isArray(saved.snapshot.commitLog));
    assert.ok(saved.snapshot.commitLog.length > 0, 'native run must leave real commits');
    assert.ok(saved.events.length > 0 && saved.structure, 'canonical recording must carry events and structure');
    replay = observeRecording(saved);
    assert.equal(replay.chart, 'drawn');
    assert.ok(replay.runner);
    assert.equal(replay.eventsSkipped, 0);
    assert.equal(replay.eventsReplayed, saved.events.length);
    assert.ok(replay.boundaryEvents > 0 && replay.boundaryRanges > 0, 'real recorded boundaries must rebuild');

    const liveSummary = live.selectSummary();
    const replaySummary = replay.recorder.selectSummary();
    for (const summary of [liveSummary, replaySummary]) {
      assert.equal(summary.llmCallCount, 2);
      assert.equal(summary.toolCallCount, 1);
    }
    const eventTypes = (recorder) => recorder.selectEventLog().map((entry) => entry.event.type);
    assert.deepEqual(eventTypes(replay.recorder), eventTypes(live), 'live/replayed typed event order');
    assert.deepEqual(eventTypes(replay.recorder), saved.events.map((event) => event.type));
    const commitIds = (recorder) => recorder.getCommitLog().map((entry) => entry.runtimeStageId);
    assert.deepEqual(commitIds(replay.recorder), commitIds(live), 'live/replayed native commit addresses');
    const groupRows = (recorder) => buildGroups(recorder.boundary.boundaryIndex).map((group) =>
      [group.runtimeGroupId, group.opensAtCommitIdx, group.closesAtCommitIdx]);
    assert.deepEqual(groupRows(replay.recorder), groupRows(live), 'live/replayed boundary addresses');
    const overlayIds = replay.recorder.runtime.getOverlay().executionOrder.map((entry) => entry.runtimeStageId);
    assert.ok(overlayIds.length > 0, 'JSON replay must seed the runtime overlay');
    const savedIds = new Set(saved.snapshot.commitLog.map((entry) => entry.runtimeStageId));
    assert.ok(overlayIds.every((id) => savedIds.has(id)), 'replay overlay addresses must come from recorded commits');
    assert.equal(JSON.stringify(saved), json, 'replay must not rewrite the serialized recording');

    // This is a REAL public FP11 producer, independent of application success:
    // an HTTP-shaped 503 value is an answer; an earlier lost reply remains an
    // unknown series effect even when the final physical attempt was applied.
    const physical = [];
    const summaries = [];
    let executions = 0;
    const response = await attempt(() => {
      if (++executions === 1) throw new Error('reply lost');
      return { status: 503 };
    }, { attempts: 2 }, {
      target: 'native.inventory', touches: 'inventory', idempotencyKey: 'lens-native-probe',
      onAttempt: (row) => { physical.push(row); }, onEnd: (summary) => { summaries.push(summary); },
    });
    assert.deepEqual(response, { status: 503 });
    assert.deepEqual(physical.map((row) => [row.reason, row.effect]),
      [['retryable', 'unknown'], ['answered', 'applied']]);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].effect, 'unknown');
    assert.equal(summaries[0].last.reason, 'answered');
    assert.equal(summaries[0].last.effect, 'applied');

    // A labelled legacy WIRE-SHAPE control, not a claimed archived producer.
    // Only the installed FP recorder admits/normalizes it; Lens never edits it.
    const legacy = JSON.stringify([Object.freeze({
      kind: 'attempt', id: 'saved#0@1', series: 'saved#0', runtimeStageId: 'saved#0',
      target: 'saved', runId: 'legacy-data', startedAt: 1, durationMs: 1,
      outcome: 'ok', next: 'done', reason: 'succeeded', attemptKind: 'stage', attempt: 1,
    })]);
    const reader = attempts({ store: { append() {}, async read() { return JSON.parse(legacy); } } });
    const aggregate = await reader.aggregate();
    const read = aggregate.byTarget.get('saved');
    assert.equal(read?.count, 1, 'actual installed recorder must admit the old row');
    assert.equal(read.exemplars.slowest[0]?.reason, 'answered');
    assert.equal(JSON.parse(legacy)[0].reason, 'succeeded', 'stored legacy bytes stay unchanged');

    report.formats[format] = {
      result, modelCalls, toolCalls, liveSummary, replaySummary, recording: saved,
      jsonBytes: Buffer.byteLength(json), commits: commitIds(live), groups: groupRows(live), overlayIds,
      attempts: { response, physical, summary: summaries[0] },
      legacyReader: { kind: 'wire-shape control', stored: JSON.parse(legacy),
        reason: read.exemplars.slowest[0].reason, storage: aggregate.storage },
    };
  } finally {
    try { replay?.recorder.detach(); } finally {
      try { live.detach(); } finally { recording.stop(); }
    }
  }
  console.log(`${format}: real mock/tool run, canonical JSON recording, live/replay and native11 attempt evidence passed`);
}

writeFileSync(join(process.cwd(), 'native-recording.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
