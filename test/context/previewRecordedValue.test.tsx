import React from 'react';
import { runInNewContext } from 'node:vm';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { previewRecordedValue } from '../../src/core/context/previewRecordedValue.js';
import { sameRecordedValue } from '../../src/core/context/sameRecordedValue.js';
import { lensCursorFrom } from '../../src/core/cursor/lensCursor.js';
import { ContextView } from '../../src/react/components/ContextView.js';

describe('collapsed recorded values', () => {
  it('retains compact JSON text for short values, including escapes and lone surrogates', () => {
    const text = '"\n\t\b\r\f\\\u0000\u001f😀é\ud800X\udfff';
    for (const value of [
      null, undefined, false, 0, -0, 1e21, NaN, Infinity, '', text,
      { [text]: { '2': [text, 0, null], '1': {}, empty: [], ignored: undefined } },
      [undefined, NaN, , true], Object.create(null), {}, [],
    ]) {
      expect(previewRecordedValue(value)).toEqual({ text: JSON.stringify(value) ?? '', truncated: false });
    }
  });

  it('preserves live bigint precision in the preview, expanded value and JSON pane', () => {
    const value = { count: -9007199254740993123n, padding: 'x'.repeat(180) };
    const snapshot = { initialState: { sample: value }, commitLog: [] };
    expect(previewRecordedValue({ count: value.count }).text).toBe('{"count":-9007199254740993123n}');
    expect(previewRecordedValue(10n ** 5000n)).toEqual({ text: 'BigInt…', truncated: true });
    render(<ContextView runner={snapshot} />);
    expect(screen.getByTestId('context-value').textContent).toContain('-9007199254740993123n');
    fireEvent.click(screen.getByTestId('context-value-toggle'));
    const displayed = { count: '-9007199254740993123n', padding: value.padding };
    expect(JSON.parse(screen.getByTestId('context-value-full').textContent!)).toEqual(displayed);
    fireEvent.click(screen.getByTestId('context-mode-json'));
    expect(JSON.parse(screen.getByTestId('context-json').textContent!)).toEqual({ sample: displayed });
  });

  it('renders dates and boxed scalars in the same JSON form used for historical comparisons', () => {
    const foreign = runInNewContext('[new Date(0), new Date(NaN), new Number(Infinity), new Number(3), new Boolean(false), new String("é")]') as unknown[];
    const values = [new Date(0), new Date(NaN), Object('😀'), Object(1), Object(true), ...foreign];
    for (const value of values) {
      const json = JSON.stringify(value);
      expect(previewRecordedValue(value)).toEqual({ text: json, truncated: false });
      expect(sameRecordedValue(value, JSON.parse(json))).toBe(true);
    }
    const value = Object('x'.repeat(100_000));
    expect(previewRecordedValue(value)).toEqual({ text: '"' + 'x'.repeat(156) + '…', truncated: true });
  });

  it('preserves the 160-character boundary and clips a long JSON prefix without splitting a Unicode pair', () => {
    for (const value of ['x'.repeat(158), 'x'.repeat(159), '"\\'.repeat(400), ['😀'.repeat(500)]]) {
      const json = JSON.stringify(value);
      const prefix = json.slice(0, 157).replace(/[\uD800-\uDBFF]$/, '');
      expect(previewRecordedValue(value)).toEqual(json.length > 160
        ? { text: prefix + '…', truncated: true }
        : { text: json, truncated: false });
    }
    const unicode = 'x'.repeat(155) + '😀' + 'x'.repeat(100);
    expect(previewRecordedValue(unicode).text).toBe('"' + 'x'.repeat(155) + '…');
  });

  it('bounds value inspection on wide objects, long first keys, huge arrays and deep nesting', () => {
    let inspected = 0;
    const wide = Object.fromEntries(Array.from({ length: 20_000 }, (_, i) => ['field' + i, i]));
    const value = new Proxy(wide, {
      getOwnPropertyDescriptor(target, key) {
        inspected++;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    expect(previewRecordedValue(value)).toEqual({ text: JSON.stringify(wide).slice(0, 157) + '…', truncated: true });
    expect(inspected).toBeLessThan(100);

    const giantKey = '\n'.repeat(1_000_000);
    const child = new Proxy({}, { ownKeys() { throw Error('Read the value after the long key'); } });
    expect(previewRecordedValue({ [giantKey]: child }).text).toBe(('{"' + '\\n'.repeat(79)).slice(0, 157) + '…');
    const entries = new Proxy(new Array(1_000_000), { ownKeys() { throw Error('Enumerated a sparse array'); } });
    expect(previewRecordedValue(entries).truncated).toBe(true);

    let deep: unknown = 7;
    for (let i = 0; i < 20_000; i++) deep = [deep];
    expect(previewRecordedValue(deep)).toEqual({ text: '['.repeat(157) + '…', truncated: true });
  });

  it('does not execute getters while generating a collapsed preview', () => {
    const read = vi.fn(() => { throw Error('Read a getter'); });
    const item = Object.defineProperty({}, 'row', { get: read, enumerable: true });
    expect(previewRecordedValue(item).truncated).toBe(true);
    const list: unknown[] = [];
    Object.defineProperty(list, 0, { get: read, enumerable: true });
    expect(previewRecordedValue(list).truncated).toBe(true);
    const date = new Date(0);
    Object.defineProperty(date, 'toISOString', { get: read });
    expect(previewRecordedValue(date).text).toBe('"1970-01-01T00:00:00.000Z"');
    const tagged = Object.defineProperty({ x: 1 }, Symbol.toStringTag, { get: read });
    expect(previewRecordedValue(tagged).text).toBe('{"x":1}');
    expect(sameRecordedValue(tagged, { x: 1 })).toBe(true);
    expect(read).not.toHaveBeenCalled();
  });

  it('formats full values on request, updates an open cell at a new cursor and restores its preview', () => {
    const before = ['before', 'a'.repeat(4000)];
    const after = ['after', 'b'.repeat(4000)];
    const snapshot = { initialState: { long: before }, commitLog: [{
      stage: 'write', stageId: 'write', runtimeStageId: 'write#0',
      overwrite: { long: after }, updates: {}, trace: [{ path: 'long', verb: 'set' }],
    }] };
    const axis = [
      { kind: 'group-start' as const, depth: 0, commitIdx: 0, runtimeGroupId: '', runtimeStageId: '__root__#0', label: 'Start' },
      { kind: 'commit' as const, depth: 0, commitIdx: 0, runtimeGroupId: '', runtimeStageId: 'write#0', label: 'Write' },
    ];
    const at = (step: number) => <ContextView runner={snapshot} cursor={lensCursorFrom(axis, step, () => {})} />;
    const view = render(at(0));
    expect(screen.queryByTestId('context-value-full')).toBeNull();
    expect(screen.getByTestId('context-value').textContent).toContain(JSON.stringify(before).slice(0, 157) + '…');
    fireEvent.click(screen.getByTestId('context-value-toggle'));
    expect(screen.getByTestId('context-value-full').textContent).toBe(JSON.stringify(before));
    view.rerender(at(1));
    expect(screen.getByTestId('context-value-full').textContent).toBe(JSON.stringify(after));
    fireEvent.click(screen.getByTestId('context-value-toggle'));
    expect(screen.queryByTestId('context-value-full')).toBeNull();
    expect(screen.getByTestId('context-value').textContent).toContain(JSON.stringify(after).slice(0, 157) + '…');
    fireEvent.click(screen.getByTestId('context-mode-json'));
    expect(JSON.parse(screen.getByTestId('context-json').textContent!)).toEqual({ long: after });
    view.rerender(at(0));
    expect(JSON.parse(screen.getByTestId('context-json').textContent!)).toEqual({ long: before });
  });
});
