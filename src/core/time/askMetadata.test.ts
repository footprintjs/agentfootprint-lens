import { describe, expect, it } from 'vitest';
import { AskMetadataError, readAskMetadata } from './askMetadata.js';
import { timeAskOf } from './timeAsk.js';
describe('shared time ask metadata admission', () => {
  it('does not promote arbitrary formatless or opaque collector fields into time rows', () => {
    expect(timeAskOf({ fields: [{ id: 'object-choice', type: 'object', enum: [{ opaque: true }] }],
      refused: { answer: { 'object-choice': { opaque: true } }, reason: 'collector-owned' } })).toBeUndefined();
  });
  it('keeps refusal answers with prototype-like field names as owned data', () => {
    const request = JSON.parse('{"fields":[{"id":"__proto__","type":"string","format":"time-range"}],"refused":{"answer":{"__proto__":"original answer"},"reason":"Native reason"}}');
    const view = timeAskOf(request)!;
    expect(Object.prototype.hasOwnProperty.call(view.refused!.answer, '__proto__')).toBe(true);
    expect(view.refused!.answer!.__proto__).toBe('original answer');
  });
  it('turns hostile descriptor errors into payload-free read failures', () => {
    const bad = new Proxy({}, { getOwnPropertyDescriptor() { throw Error('private source detail'); } });
    expect(() => readAskMetadata(bad)).toThrow(AskMetadataError);
    expect(() => readAskMetadata(bad)).not.toThrow('private source detail');
  });
});
