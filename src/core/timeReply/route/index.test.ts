import { expect, it, vi } from 'vitest';
import { submitTimeReplyInput } from '../../timeReply.js';
it('routes correction words without locally classifying them as a cancel or time interval', async () => {
  const onAnswer = vi.fn();
  const result = await submitTimeReplyInput({ awaiting: { requestId: 'r', fields: [
    { id: 'range', type: 'string', enum: ['original/choice'] }, { id: 'words', type: 'string' },
  ] }, reader: () => [{ range: 'range', correction: 'words' }], values: { words: 'no' }, onAnswer });
  expect(result.status).toBe('submitted');
  expect(onAnswer).toHaveBeenCalledWith({ requestId: 'r', values: { words: 'no' } });
});
