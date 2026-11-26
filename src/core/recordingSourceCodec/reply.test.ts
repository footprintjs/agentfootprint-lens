import { describe, expect, it } from 'vitest';
import { readRecordingSubflowPayloads } from './index.js';

const nested = (levels: number): unknown => {
  let value: unknown = 'leaf';
  for (let i = 0; i < levels; i++) value = { next: value };
  return value;
};

describe('readRecordingSubflowPayloads — the child reply payloads member', () => {
  it('admits ready and unavailable sides, copied and frozen', () => {
    const input = { entry: { status: 'ready', value: { messages: [{ role: 'user', content: 'hi' }] } },
      exit: { status: 'unavailable', reason: 'part-changed' } };
    const read = readRecordingSubflowPayloads(input);
    expect(read).toEqual({ status: 'ready', value: input });
    if (read.status !== 'ready') throw new Error('refused');
    const entry = read.value.entry as { status: 'ready'; value: { messages: unknown[] } };
    expect(entry.value).not.toBe(input.entry.value);
    expect(Object.isFrozen(read.value) && Object.isFrozen(entry) && Object.isFrozen(entry.value.messages[0])).toBe(true);
    expect(readRecordingSubflowPayloads({ exit: { status: 'ready', value: null } })).toEqual({ status: 'ready', value: { exit: { status: 'ready', value: null } } });
  });

  it('refuses any other shape as a whole, never a partial member', () => {
    for (const input of [
      null, [], 'payloads', {}, { both: { status: 'ready', value: 1 } },
      { entry: { status: 'ready' } }, { entry: { status: 'ready', value: 1, extra: true } }, { entry: { status: 'ready', value: 1, zone: 1 } },
      { exit: { status: 'unavailable', reason: 'part-changed', value: 1 } },
      { entry: { status: 'unavailable' } }, { entry: { status: 'unavailable', reason: '' } },
      { entry: { status: 'unavailable', reason: 7 } }, { entry: { status: 'pending', value: 1 } },
      { entry: { status: 'ready', value: 1 }, exit: { status: 'ready', value: () => 1 } },
      { entry: { status: 'ready', value: new Date() } },
    ]) expect(readRecordingSubflowPayloads(input)).toEqual({ status: 'unavailable', reason: 'invalid-recording' });
  });

  it('keeps depth 100 for payload values (app data, not an execution tree) and bounds a reason', () => {
    // The slot value sits at depth 0 of its own walk: 100 levels of objects fit.
    expect(readRecordingSubflowPayloads({ entry: { status: 'ready', value: nested(100) } }).status).toBe('ready');
    expect(readRecordingSubflowPayloads({ entry: { status: 'ready', value: nested(101) } })).toEqual({ status: 'unavailable', reason: 'recording-limit' });
    expect(readRecordingSubflowPayloads({ entry: { status: 'unavailable', reason: 'x'.repeat(4097) } })).toEqual({ status: 'unavailable', reason: 'recording-limit' });
    const wide = Array.from({ length: 150_000 }, () => 1);
    expect(readRecordingSubflowPayloads({ entry: { status: 'ready', value: wide }, exit: { status: 'ready', value: wide } }))
      .toEqual({ status: 'unavailable', reason: 'recording-limit' });
  });

  it('never calls an accessor', () => {
    let calls = 0;
    const slot = { status: 'ready' } as Record<string, unknown>;
    Object.defineProperty(slot, 'value', { enumerable: true, get() { calls++; return 1; } });
    expect(readRecordingSubflowPayloads({ entry: slot })).toEqual({ status: 'unavailable', reason: 'invalid-recording' });
    const member = {} as Record<string, unknown>;
    Object.defineProperty(member, 'exit', { enumerable: true, get() { calls++; return { status: 'ready', value: 1 }; } });
    expect(readRecordingSubflowPayloads(member)).toEqual({ status: 'unavailable', reason: 'invalid-recording' });
    expect(calls).toBe(0);
  });
});
