import { describe, expect, it } from 'vitest';
import { openContextRecording } from './chart.js';
import { isDecodedContextPort } from './port.js';

describe('recorded context opening chart', () => {
  it('records admission decisions without copying record contents into the debug log', async () => {
    const input = { recording: { events: [] }, calls: [{ meta: { runId: 'run' },
      iteration: 1, eventIndex: 0, call: 1, added: ['id'], removed: [], unchanged: 0, counts: {} }],
      values: { resolve: () => 'private-context-text' } };
    const opened = await openContextRecording(input);
    expect(opened.verdict.ok).toBe(true); expect(opened.trace.state.disposition).toBe('accepted');
    expect(opened.trace.commitLog.length).toBeGreaterThan(0);
    expect(JSON.stringify(opened.trace)).not.toContain('private-context-text');
  });
  it('records a refusal and leaves unresolved content unavailable', async () => {
    const opened = await openContextRecording({ recording: { events: [] }, calls: [null] });
    expect(opened.verdict.ok).toBe(false); expect(opened.trace.state.disposition).toBe('refused');
  });
  it('detects executable ports by descriptors without reading accessors', () => {
    const value = Object.defineProperty({ recording: {} }, 'calls', { get() { throw Error('private'); } });
    expect(isDecodedContextPort(value)).toBe(true);
    expect(isDecodedContextPort(new Proxy({}, { getOwnPropertyDescriptor() { throw Error('private'); } }))).toBe(false);
  });
});
