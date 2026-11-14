import { describe, expect, it } from 'vitest';
import { readTimeReplyInput } from './read.js';
import { selectedTimeReply } from './selection.js';
describe('opaque native field keys', () => {
  it('keeps prototype-like ids as owned data without changing object prototypes', () => {
    const model = readTimeReplyInput({ requestId: 'r', fields: [
      { id: '__proto__', type: 'string', enum: ['exact/choice'] }, { id: 'constructor', type: 'string' },
    ] }, () => [{ range: '__proto__', correction: 'constructor' }]);
    if (model.status !== 'ready') throw Error('expected form');
    const values = Object.fromEntries([['__proto__', 'exact/choice']]);
    const answer = selectedTimeReply(model.form, values)!;
    expect(Object.prototype.hasOwnProperty.call(answer.values, '__proto__')).toBe(true);
    expect(answer.values.__proto__).toBe('exact/choice');
    expect(Object.getPrototypeOf(answer.values)).toBe(Object.prototype);
    expect(JSON.stringify(answer)).toContain('"__proto__":"exact/choice"');
  });
  it('does not silently drop unknown fields from a purported complete answer', () => {
    const model = readTimeReplyInput({ requestId: 'r', fields: [
      { id: 'r', type: 'string', enum: ['x/y'] }, { id: 'c', type: 'string' },
    ] }, () => [{ range: 'r', correction: 'c' }]);
    if (model.status !== 'ready') throw Error('expected form');
    expect(selectedTimeReply(model.form, { r: 'x/y', extra: 'cannot drop this' })).toBeUndefined();
  });
});
