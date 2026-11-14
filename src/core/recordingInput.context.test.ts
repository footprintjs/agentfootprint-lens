import { describe, expect, it } from 'vitest';
import { readAgentRecording } from './recordingInput.js';

const change = {
  meta: { runId: 'native-run', runtimeStageId: 'call#1', subflowPath: ['native-root'] },
  iteration: 1, eventIndex: 2, call: 1, added: ['piece-a', 'piece-a'], removed: [],
  unchanged: 0, counts: { rules: 2 },
};

describe('producer-decoded context input', () => {
  it('keeps one exact dictionary value while retaining duplicate call occurrences', () => {
    const value = '  exact text\nwith a final newline\n';
    const recording = { events: [] };
    const resolved: unknown[] = [];
    const input = { recording, calls: [change], values: {
      resolve(reference: unknown) { resolved.push(reference); return value; },
    } };
    const verdict = readAgentRecording(input);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) throw new Error('decoded recording refused');
    expect(verdict.recording).toBe(recording);
    expect(verdict.context?.dictionary).toEqual([{ id: 'piece-a', value }]);
    expect(verdict.context?.calls[0]?.added).toEqual(['piece-a', 'piece-a']);
    expect(resolved).toEqual([{ ref: 'piece-a' }]);
  });

  it('accepts a producer-read legacy result without inventing a context table', () => {
    const recording = { events: [], snapshot: null };
    const verdict = readAgentRecording({ recording, calls: [] });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) throw new Error('legacy recording refused');
    expect(verdict.recording).toBe(recording);
    expect(verdict.context).toBeUndefined();
  });

  it('does not admit a raw compact marker through the ordinary events shortcut', () => {
    const verdict = readAgentRecording({ format: 'foottrace.value-record.v1', events: [], record: {} });
    expect(verdict.ok).toBe(false);
  });

  it('turns a missing dictionary reference into a fixed refusal, without adapter error text', () => {
    const secret = 'private adapter failure text';
    const verdict = readAgentRecording({ recording: { events: [] }, calls: [change],
      values: { resolve() { throw new Error(secret); } } });
    expect(verdict.ok).toBe(false);
    expect(JSON.stringify(verdict)).not.toContain(secret);
  });
});
