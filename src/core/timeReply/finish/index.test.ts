import { expect, it } from 'vitest';
import { submitTimeReplyInput } from '../../timeReply.js';
it('keeps asynchronous host failure out of a successful answer and debug trace', async () => {
  const result = await submitTimeReplyInput({ awaiting: { requestId: 'r', fields: [
    { id: 'range', type: 'string', enum: ['original/choice'] }, { id: 'words', type: 'string' },
  ] }, reader: () => [{ range: 'range', correction: 'words' }], values: { range: 'original/choice' },
    onAnswer: async () => { throw Error('private host body'); } });
  expect(result.status).toBe('unconfirmed'); expect(JSON.stringify(result.trace)).not.toContain('private');
});
