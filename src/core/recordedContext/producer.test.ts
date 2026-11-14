import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StepGraph } from 'agentfootprint/observe';
import type { LensRecorder } from '../LensRecorder.js';
import { readAgentRecording } from '../recordingInput.js';
import { buildLLMText } from '../copyForLLM.js';
import { contextPayloads } from './payload.js';
import { printRecordedContext } from './print.js';

interface Fixture {
  decoded: { recording: { events: { type: string; meta: { runOffsetMs: number } }[] }; calls: unknown[] };
  dictionary: { id: string; value: unknown }[];
  graph: StepGraph;
  requests: unknown[];
  /** Expanded by the producer's applyContextChange, not a second Lens delta decoder. */
  expandedCalls: unknown[][];
}
const fixturePath = process.env.LENS_CONTEXT_FIXTURE ??
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../test/fixtures/recordedContext/producer.json');

describe('real producer-decoded recording fixture', () => {
  it('keeps exact values and compares complete per-call context with the compact dictionary', () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Fixture;
    const values = new Map(fixture.dictionary.map((piece) => [piece.id, piece.value]));
    const verdict = readAgentRecording({ ...fixture.decoded, values: { resolve(reference: unknown) {
      const id = (reference as { ref: string }).ref;
      if (!values.has(id)) throw new Error('missing fixture reference');
      return values.get(id);
    } } });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok || !verdict.context) throw new Error('producer context refused');
    expect(verdict.context.calls).toHaveLength(fixture.requests.length);
    expect(verdict.context.dictionary).toEqual(fixture.dictionary);
    const payloads = contextPayloads(verdict.context);
    for (const request of fixture.requests)
      expect(payloads.expand(payloads.project(request))).toEqual(request);
    // Exact wire messages come from the provider fixture, never StepNode.toolResult.
    for (const [index, request] of fixture.requests.entries()) {
      const evidence = verdict.context.toolInputs?.[index];
      expect(evidence?.status).toBe('available');
      if (evidence?.status !== 'available') throw new Error('exact root call evidence missing');
      const actual = (request as { messages: { role: string; toolCallId?: string; content: unknown }[] })
        .messages.filter(message => message.role === 'tool')
        .map(({ toolCallId, content }) => ({ toolCallId, content }));
      expect(evidence.messages.map(({ toolCallId, content }) => ({ toolCallId, content }))).toEqual(actual);
      expect(evidence.messages.every(message => message.status === 'verified')).toBe(true);
    }
    const recorder = {
      selectSummary: () => ({ status: 'completed', durationMs: 0,
        llmCallCount: fixture.requests.length, toolCallCount: fixture.requests.length - 1,
        iterationCount: fixture.requests.length, totalTokens: { input: 0, output: 0 }, permissionDenials: 0 }),
      selectEventLog: () => fixture.decoded.recording.events.map((event, index) =>
        ({ event, seq: index + 1, runOffsetMs: event.meta.runOffsetMs })),
    } as unknown as LensRecorder;
    const before = buildLLMText({ recorder, stepGraph: fixture.graph });
    const after = buildLLMText({ recorder, stepGraph: fixture.graph, context: verdict.context });
    const beforeBytes = Buffer.byteLength(before);
    const afterBytes = Buffer.byteLength(after);
    const expandedContextBytes = Buffer.byteLength(JSON.stringify(fixture.expandedCalls));
    const dictionaryAndDeltaBytes = Buffer.byteLength(printRecordedContext({ ...verdict.context, toolInputs: undefined }));
    console.log(JSON.stringify({ fixtureCalls: fixture.requests.length, beforeBytes, afterBytes,
      expandedContextBytes, dictionaryAndDeltaBytes,
      exactRequestExpansion: true, sectionsBefore: before.split(/^# /m).map((part) =>
        [part.split('\n')[0], Buffer.byteLength(part)]), sectionsAfter: after.split(/^# /m).map((part) =>
        [part.split('\n')[0], Buffer.byteLength(part)]) }));
    // The old formatter omitted the full context dictionary. Its smaller
    // partial copy is reported separately, not used as an equal-information baseline.
    expect(dictionaryAndDeltaBytes).toBeLessThan(expandedContextBytes);
    expect(after).toContain('# Recorded context dictionary');
    expect(after).not.toMatch(/^\+\d+ms\s+\[agentfootprint\./m);
  });
});
