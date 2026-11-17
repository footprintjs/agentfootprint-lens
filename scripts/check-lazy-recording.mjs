// Packed feature-band probe: no repository aliases, private APIs, or source patches.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';
const require = createRequire(import.meta.url);
const full = JSON.parse(readFileSync(new URL('./lazy-recorded-turn.json', import.meta.url), 'utf8'));
for (const [format, load] of [['ESM', name => import(name)], ['CJS', name => require(name)]]) {
  const codec = await load('agentfootprint-lens/recording');
  const client = await load('agentfootprint-lens/recording/react');
  const view = await load('agentfootprint-lens');
  assert.equal(typeof codec.projectRecordingSource, 'function');
  assert.equal(typeof codec.readRecordingSourceRoot, 'function');
  assert.equal(typeof codec.readRecordingSubflow, 'function');
  assert.equal(typeof client.useRecordingSource, 'function');
  const projected = codec.projectRecordingSource(full);
  assert.equal(projected.status, 'ready');
  const root = projected.value;
  assert.equal(root.invocations.length, 25);
  assert.equal(root.recording.snapshot.subflowResults, undefined);
  let calls = 0, release;
  const waiting = new Promise(resolve => { release = resolve; });
  const source = client.createLensRecordingSource({ root, loadSubflow: async request => {
    calls++; await waiting;
    const selected = codec.readRecordingSubflow(full, request);
    assert.equal(selected.status, 'ready');
    return selected.value;
  } });
  try {
    assert.equal(calls, 0);
    const recording = source.getSnapshot().recording;
    const observed = source.observed;
    const eventCount = observed.recorder.selectEventLog().length;
    const version = observed.recorder.getVersion();
    const request = root.invocations[0];
    const first = source.load(request), second = source.load(request);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
    assert.equal(source.getSnapshot().recording, recording);
    assert.equal(observed.recorder.getVersion(), version);
    release(); await Promise.all([first, second]);
    assert.equal(source.observed, observed);
    assert.equal(observed.recorder.selectEventLog().length, eventCount);
    assert.equal(observed.runner.getLastSnapshot(), source.getSnapshot().recording.snapshot);
    assert.ok(source.getSnapshot().recording.snapshot.subflowResults[request.mountRuntimeStageId]);
    await source.load(request); assert.equal(calls, 1);
    const markup = renderToString(React.createElement(view.Lens, { recorder: observed.recorder,
      runner: observed.runner, recordingSource: source }));
    assert.ok(markup.length > 0);
    console.log(format, 'lazy recording: exact admission, deduplication, stable replay, source-backed Lens SSR');
  } finally { source.dispose(); }
}
