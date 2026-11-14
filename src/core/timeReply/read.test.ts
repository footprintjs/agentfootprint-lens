import { describe, expect, it, vi } from 'vitest';
import { readTimeReplyInput } from './read.js';
const request = () => ({ requestId: 'same', fields: [
  { id: 'range', type: 'string', format: 'time-range', required: false, enum: ['exact/ISO'], labels: ['Exact label'] },
  { id: 'words', type: 'string', required: false, description: 'Correct this reading' },
], context: { opaque: 'the reader owns this' } });
const reader = () => [{ range: 'range', correction: 'words' }];
describe('native time reply reader port', () => {
  it('passes the complete original native request and preserves exact values without inferring IDs', () => {
    const input = request(); const native = vi.fn(reader);
    const result = readTimeReplyInput({ pauseData: { awaitingInput: input } }, native);
    expect(native).toHaveBeenCalledWith(input); expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw Error('expected form');
    expect(result.form.request).toBe(input); expect(result.form.complete).toBe(true);
    expect(result.form.pairs[0]).toMatchObject({ range: { id: 'range', choices: [{ value: 'exact/ISO', label: 'Exact label' }] },
      correction: { id: 'words', description: 'Correct this reading' } });
  });
  it('distinguishes missing reader, no native pairs and an unreadable binding', () => {
    expect(readTimeReplyInput(request())).toEqual({ status: 'unchecked', reason: 'reader-missing' });
    expect(readTimeReplyInput(request(), () => [])).toEqual({ status: 'none' });
    expect(readTimeReplyInput(request(), () => { throw Error('private correction'); }))
      .toEqual({ status: 'unavailable', reason: 'binding-unavailable' });
  });
  it('does not treat extra fields as covered or promote correction-looking names', () => {
    const input = { ...request(), fields: [...request().fields, { id: 'range-correction', type: 'string' }] };
    const result = readTimeReplyInput(input, reader);
    expect(result.status === 'ready' && result.form.complete).toBe(false);
    expect(readTimeReplyInput(input, () => [])).toEqual({ status: 'none' });
  });
  it('rejects ambiguous or undeclared reader output rather than making partial controls', () => {
    expect(readTimeReplyInput(request(), () => [{ range: 'missing', correction: 'words' }]).status).toBe('unavailable');
    expect(readTimeReplyInput(request(), () => [...reader(), ...reader()]).status).toBe('unavailable');
  });
});

describe('display metadata safety before the native reader', () => {
  it('refuses numeric getters without invoking them or the reader', () => {
    let reads = 0; const labels: string[] = [];
    Object.defineProperty(labels, '0', { enumerable: true, get() { reads++; return 'private label'; } });
    const input = request(); input.fields[0]!.labels = labels;
    const native = vi.fn(reader);
    expect(readTimeReplyInput(input, native).status).toBe('unavailable');
    expect(reads).toBe(0); expect(native).not.toHaveBeenCalled();
  });
  it('refuses sparse and method-overridden arrays instead of consuming input methods', () => {
    const input = request(); input.fields[0]!.enum = new Array(2);
    expect(readTimeReplyInput(input, reader).status).toBe('unavailable');
    const fields = request().fields; Object.defineProperty(fields, 'find', { get() { throw Error('private'); } });
    expect(readTimeReplyInput({ ...request(), fields }, reader).status).toBe('unavailable');
  });
  it('bounds the complete displayed string budget without truncating a large label', () => {
    const input = request(); input.fields[0]!.labels = ['x'.repeat(4 * 1024 * 1024)];
    expect(readTimeReplyInput(input, reader)).toEqual({ status: 'unavailable', reason: 'presentation-limit' });
  });
});
