import { describe, expect, it } from 'vitest';
import { AskMetadataError, readAskMetadata, ownAskData, askDataArray } from './askMetadata.js';
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
  it('normalizes thrown Proxies at every metadata boundary without inspecting them', () => {
    let traps = 0;
    const hostile = new Proxy({}, { getPrototypeOf() { traps++; throw Error('private trap detail'); } });
    const revoked = Proxy.revocable({}, {}); revoked.revoke();
    for (const error of [hostile, revoked.proxy]) {
      const badObject = new Proxy({}, { getOwnPropertyDescriptor() { throw error; } });
      const badArray = new Proxy([], { getPrototypeOf() { throw error; } });
      expect(() => ownAskData(badObject, 'fields')).toThrow('time-question-unavailable');
      expect(() => askDataArray(badArray, 2)).toThrow('time-question-unavailable');
      expect(() => readAskMetadata({ fields: [{}] }, () => { throw error; })).toThrow('time-question-unavailable');
    }
    expect(traps).toBe(0);
  });
});
