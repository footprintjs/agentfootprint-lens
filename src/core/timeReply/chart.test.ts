import { describe, expect, it, vi } from 'vitest';
import { submitTimeReplyInput } from './chart.js';
import type { TimeReplyValues } from './selection.js';
const awaiting = { requestId: 'private-request', fields: [
  { id: 'window', type: 'string', enum: ['exact/ISO'] }, { id: 'words', type: 'string' },
] };
const reader = () => [{ range: 'window', correction: 'words' }];
describe('time reply feature chart', () => {
  it('submits exact correction text and keeps the raw request/answer out of its trace', async () => {
    const onAnswer = vi.fn(); const result = await submitTimeReplyInput({ awaiting, reader,
      values: { words: '  private correction  ' }, onAnswer });
    expect(result.status).toBe('submitted');
    expect(onAnswer).toHaveBeenCalledWith({ requestId: 'private-request', values: { words: '  private correction  ' } });
    expect(JSON.stringify(result.trace)).not.toContain('private');
  });
  it('does not submit both/neither or incomplete forms', async () => {
    const onAnswer = vi.fn();
    for (const values of [{}, { window: 'exact/ISO', words: 'no' }] as TimeReplyValues[])
      expect((await submitTimeReplyInput({ awaiting, reader, values, onAnswer })).status).toBe('refused');
    expect(onAnswer).not.toHaveBeenCalled();
  });
  it('does not leak a host exception or confuse it with an answered question', async () => {
    const result = await submitTimeReplyInput({ awaiting, reader, values: { words: 'no' },
      onAnswer() { throw Error('private host error'); } });
    expect(result.status).toBe('failed'); expect(JSON.stringify(result.trace)).not.toContain('private');
  });
});
