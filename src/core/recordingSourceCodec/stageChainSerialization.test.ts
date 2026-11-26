// @vitest-environment node
/**
 * The stage-chain cap is chosen so every reply the codec admits can be carried
 * by the host's runtime (engines >=22): JSON text (the HTTP reply),
 * `structuredClone` and `postMessage` (which throw, or hang, near 2,000 nested
 * levels on Node 22). These tests build the deepest reply the codec admits —
 * a MAX_STAGE_CHAIN-stage chain whose last stage holds a value at the depth
 * limit — and carry it each way. CI runs them on Node 22 and Node 24.
 */
import { serialize, deserialize } from 'node:v8';
import { MessageChannel } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import { MAX_DEPTH, MAX_STAGE_CHAIN } from '../recordedContext/ownJson.js';
import { lastStage, nested, stageChainRecording } from '../../../test/fixtures/stageChain.js';
import { projectRecordingSource, readRecordingSourceRoot, readRecordingSubflow } from './index.js';

/** Deepest nesting of a JSON value, measured with an explicit stack. */
function jsonDepth(value: unknown): number {
  let deepest = 0;
  const pending: [unknown, number][] = [[value, 0]];
  while (pending.length) {
    const [item, depth] = pending.pop()!;
    deepest = Math.max(deepest, depth);
    if (typeof item === 'object' && item !== null) for (const child of Object.values(item)) pending.push([child, depth + 1]);
  }
  return deepest;
}
async function posted(value: unknown): Promise<unknown> {
  const { port1, port2 } = new MessageChannel();
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('postMessage did not deliver the reply')), 10_000);
      port2.once('message', message => { clearTimeout(timer); resolve(message); });
      port1.postMessage(value);
    });
  } finally { port1.close(); port2.close(); }
}
async function carriedEachWay(reply: unknown): Promise<string> {
  const text = JSON.stringify(reply);
  expect(JSON.stringify(JSON.parse(text))).toBe(text);
  expect(JSON.stringify(structuredClone(reply))).toBe(text);
  expect(JSON.stringify(deserialize(serialize(reply)))).toBe(text);
  expect(JSON.stringify(await posted(reply))).toBe(text);
  return text;
}
const ready = <T>(read: { status: string; value?: T; reason?: string }): T => {
  if (read.status !== 'ready') throw new Error(`Expected ready, received ${read.reason}`);
  return read.value as T;
};

describe(`the ${MAX_STAGE_CHAIN}-stage cap survives every carrier on Node ${process.versions.node}`, () => {
  it('carries the deepest admitted root reply as text, a clone and a message', async () => {
    const input = await stageChainRecording(MAX_STAGE_CHAIN);
    // The root tree sits at depth 3 of the DTO; its last stage's value nests to the depth limit.
    lastStage(input.snapshot.executionTree).stageWrites = { cursor: nested(MAX_DEPTH - 5) };
    const root = ready(projectRecordingSource(input));
    const reply = { status: 'ready', value: root, storedBytes: 1 };
    expect(jsonDepth(root)).toBeGreaterThanOrEqual(MAX_DEPTH + MAX_STAGE_CHAIN - 1);
    const text = await carriedEachWay(reply);
    expect(ready(readRecordingSourceRoot(JSON.parse(text).value))).toEqual(root);
    // One more level inside that stage, or one more stage, is refused by the codec before any carrier sees it.
    lastStage(input.snapshot.executionTree).stageWrites = { cursor: nested(MAX_DEPTH - 4) };
    expect(projectRecordingSource(input)).toEqual({ status: 'unavailable', reason: 'recording-limit' });
  }, 60_000);

  it('carries the deepest admitted child reply as text, a clone and a message', async () => {
    const input = await stageChainRecording(MAX_STAGE_CHAIN);
    const request = ready(projectRecordingSource(input)).invocations[0]!;
    const unit = input.snapshot.subflowResults[request.mountRuntimeStageId];
    // The child tree sits at depth 2 of the unit.
    lastStage(unit.treeContext.stageContexts).stageWrites = { cursor: nested(MAX_DEPTH - 4) };
    const child = ready(readRecordingSubflow(input, request));
    expect(jsonDepth(child.result)).toBeGreaterThanOrEqual(MAX_DEPTH + MAX_STAGE_CHAIN - 1);
    await carriedEachWay({ status: 'ready', value: child });
    lastStage(unit.treeContext.stageContexts).stageWrites = { cursor: nested(MAX_DEPTH - 3) };
    expect(readRecordingSubflow(input, request)).toEqual({ status: 'unavailable', reason: 'recording-limit' });
  }, 60_000);
});
