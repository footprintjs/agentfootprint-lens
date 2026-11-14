import { describe, expect, it } from 'vitest';
import { contextPayloads } from './payload.js';
import type { RecordedContextView } from './types.js';

describe('typed payload presentation references', () => {
  const view: RecordedContextView = { calls: [], dictionary: [
    { id: 'text', value: '  exact text\n' },
    { id: 'schema', value: { name: 'lookup', inputSchema: { type: 'object' } } },
  ] };
  it('round trips nested repeated strings and complete schemas to the exact JSON values', () => {
    const value = { messages: ['  exact text\n', '  exact text\n'],
      tools: [{ name: 'lookup', inputSchema: { type: 'object' } }], kept: 0 };
    const payloads = contextPayloads(view);
    expect(payloads.expand(payloads.project(value))).toEqual(value);
    const formatted = payloads.format(value);
    expect(formatted).toContain('⟦context "text"⟧');
    expect(formatted).toContain('⟦context "schema"⟧');
    expect(formatted).not.toContain('exact text');
  });
  it('does not interpret literal data that happens to resemble an internal view node or ref', () => {
    const value = { literal: { kind: 'piece', id: 'text' }, ref: 'text', nested: { ref: 'schema' } };
    const payloads = contextPayloads(view);
    expect(payloads.expand(payloads.project(value))).toEqual(value);
    expect(payloads.format(value)).not.toContain('⟦context');
  });
});
