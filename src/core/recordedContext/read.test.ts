import { describe, expect, it } from 'vitest';
import { readDecodedContext } from './read.js';
import { contextCallLabel, printRecordedContext } from './print.js';

const call = { meta: { runId: 'run', subflowPath: ['root', 'member'], runtimeStageId: 'call#0' },
  iteration: 1, eventIndex: 5, call: 1, added: ['opaque-id'], removed: [], unchanged: 0,
  counts: { rules: 1 } };
const input = (resolve: (reference: unknown) => unknown) => ({ recording: { events: [] }, calls: [call],
  values: { resolve } });

describe('the producer-decoded presentation port', () => {
  it('calls the actual public resolver on a class behind a binding Proxy', () => {
    class Reader {
      #text = 'exact';
      resolve() { return this.#text; }
    }
    const values = new Proxy(new Reader(), { get(target, key) {
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    const result = readDecodedContext({ ...input(() => 'wrong'), values });
    expect(result?.context?.dictionary).toEqual([{ id: 'opaque-id', value: 'exact' }]);
  });

  it('owns JSON without interpreting literal reference-shaped values or mutating the adapter', () => {
    const value = { ref: 'literal', nested: ['  text\n'] };
    const result = readDecodedContext(input(() => value));
    const stored = result?.context?.dictionary[0]?.value;
    expect(stored).toEqual(value);
    expect(stored).not.toBe(value);
    value.nested[0] = 'changed';
    expect(stored).toEqual({ ref: 'literal', nested: ['  text\n'] });
    expect(Object.isFrozen(stored)).toBe(true);
  });

  it('refuses accessors without reading them, and refuses sparse/non-JSON values', () => {
    let reads = 0;
    const getter = Object.defineProperty({}, 'secret', { enumerable: true, get() { reads++; return 'private'; } });
    for (const value of [getter, [1, , 3], { number: Infinity }, { missing: undefined }])
      expect(() => readDecodedContext(input(() => value))).toThrow('Context presentation refused: invalid-context');
    expect(reads).toBe(0);
  });

  it('keeps source coordinates/order and counts without treating eventIndex as a decoded index', () => {
    const later = { ...call, meta: { ...call.meta, subflowPath: ['root', 'other'] },
      added: ['opaque-id', 'opaque-id'], counts: { rules: 2 }, order: [1, 0] };
    const result = readDecodedContext({ ...input(() => 'text'), calls: [call, later],
      droppedEvents: 4, firstRetainedEventIndex: 6 });
    expect(result?.context?.calls).toEqual([call, later]);
    expect(result?.context?.dictionary).toHaveLength(1);
    expect(result?.context?.droppedEvents).toBe(4);
    const printed = printRecordedContext(result!.context!);
    expect(printed).toContain('Source event index: 5');
    expect(printed).toContain('Recorded order: [1,0]');
    expect(printed).toContain('other');
  });

  it('does not truncate long strings or lose embedded fences in copied expansion', () => {
    const value = ' leading\n```\n' + 'complete content '.repeat(500) + '\n';
    const view = readDecodedContext(input(() => value))!.context!;
    const printed = printRecordedContext(view);
    expect(printed).toContain(value);
    expect(printed).toContain('````\n');
    expect(printed).not.toContain('truncated');
  });

  it('refuses an oversized call list before touching the resolver', () => {
    let reads = 0;
    expect(() => readDecodedContext({ recording: {}, calls: Array(10_001).fill(call),
      values: { resolve() { reads++; return 'text'; } } })).toThrow('presentation-limit');
    expect(reads).toBe(0);
  });

  it('preserves known capture/drop evidence even when the retained call list is empty', () => {
    const result = readDecodedContext({ recording: { events: [] }, calls: [],
      droppedEvents: 3, firstRetainedEventIndex: 7 });
    expect(result?.context?.droppedEvents).toBe(3);
    expect(result?.context?.firstRetainedEventIndex).toBe(7);
    expect(() => readDecodedContext({ recording: {}, calls: [], droppedEvents: -1 }))
      .toThrow('invalid-context');
  });

  it('renders complete native component, iteration and stage coordinates', () => {
    const first = { ...call, meta: { ...call.meta, compositionPath: ['parallel', 'left'] } };
    const second = { ...first, meta: { ...first.meta, compositionPath: ['parallel', 'right'] } };
    expect(contextCallLabel(first)).not.toBe(contextCallLabel(second));
    expect(contextCallLabel(first)).toContain('iteration 1');
    expect(contextCallLabel(first)).toContain('call#0');
    expect(contextCallLabel(first)).toContain('left');
  });

  it('prints many separate backtick runs without variadic argument overflow', () => {
    const value = '`x'.repeat(150_000);
    const view = readDecodedContext(input(() => value))!.context!;
    expect(printRecordedContext(view)).toContain(value);
  });

  it('keeps Proxy admission failures inside the fixed reader refusal', () => {
    const hostile = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error('private trap'); } });
    expect(() => readDecodedContext(hostile)).toThrow('Context presentation refused: invalid-context');
  });
});
