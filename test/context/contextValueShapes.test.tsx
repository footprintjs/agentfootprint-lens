import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { contextValueShapesAt, projectContext } from '../../src/context/index.js';
import { lensCursorFrom } from '../../src/core/cursor/lensCursor.js';
import * as formatter from '../../src/core/context/previewRecordedValue.js';
import { ContextView } from '../../src/react/components/ContextView.js';

const root = ['inventory'];
const rows = ['inventory', 'rows'];
const initial = [[root, 'object'], [rows, 'array', 90], [['a.b'], 'number']];
const changes = [
  [0, [[rows, 'array', 100]]],
  [1, [[root, 'object'], [rows, 'deleted']]],
  [2, [[root, 'unknown']]],
];
const values = (n: number) => Array.from({ length: n }, (_, i) => i);
const snapshot = () => ({
  initialState: { inventory: { rows: values(90) }, 'a.b': 5 },
  commitLog: [{ stage: 'write', stageId: 'write', runtimeStageId: 'write#0', updates: {},
    trace: [{ path: 'inventory', verb: 'set' }], overwrite: { inventory: { rows: values(100) } } }],
  contextShapes: { version: 1, initial, changes },
});
const axis = [
  { kind: 'group-start' as const, depth: 0, commitIdx: 0, runtimeGroupId: '', runtimeStageId: '__root__#0', label: 'Start' },
  { kind: 'commit' as const, depth: 0, commitIdx: 0, runtimeGroupId: '', runtimeStageId: 'write#0', label: 'Write' },
];

describe('recorded state shapes', () => {
  it('reads metadata without loading state and honors the commit, path segments, tombstones and a new run', () => {
    const record = { contextShapes: { version: 1, initial, changes },
      get initialState(): unknown { throw Error('state touched'); },
      get commitLog(): unknown { throw Error('log touched'); } };
    const at = (idx: number) => contextValueShapesAt(record, idx)!;
    expect(at(0).get(rows)).toEqual({ path: rows, type: 'array', arrayLength: 100 });
    expect(at(-1).get(rows)?.arrayLength).toBe(90);
    expect(at(1).get(rows)).toBeUndefined();
    expect(at(1).get(root)?.type).toBe('object');
    expect(at(2).get(root)).toBeUndefined();
    expect(at(2).get(['a.b'])?.type).toBe('number');
    expect(at(2).get(['a', 'b'])).toBeUndefined();
    const next = { contextShapes: { version: 1, initial: [[rows, 'array', 1]], changes: [] } };
    expect(contextValueShapesAt(next, -1)?.get(rows)?.arrayLength).toBe(1);
  });

  it('rejects invalid metadata at the cursor without disclosing later facts', () => {
    expect(contextValueShapesAt({}, 0)).toBeUndefined();
    for (const entry of [[rows, 'array', -1], [rows, 'array', 0x100000000], [rows, 'string', 2], [[], 'null']]) {
      const record = { contextShapes: { version: 1, initial, changes: [[1, [entry]]] } };
      expect(contextValueShapesAt(record, 0)?.get(rows)?.arrayLength).toBe(90);
      expect(contextValueShapesAt(record, 1)).toBeUndefined();
    }
    expect(contextValueShapesAt({ contextShapes: { version: 2, initial, changes } }, 0)).toBeUndefined();
    expect(contextValueShapesAt({ contextShapes: { version: 1, initial, changes: [[0, []], [0, []]] } }, 1)).toBeUndefined();
  });

  it('shows empty and singleton arrays with their recorded counts', () => {
    const source = { initialState: { queue: [] }, commitLog: [{
      stage: 'write', stageId: 'write', runtimeStageId: 'write#0', updates: {},
      trace: [{ path: 'queue', verb: 'set' }], overwrite: { queue: ['done'] },
    }], contextShapes: { version: 1, initial: [[['queue'], 'array', 0]], changes: [
      [0, [[['queue'], 'array', 1]]],
    ] } };
    const at = (step: number) => <ContextView runner={source} cursor={lensCursorFrom(axis, step, () => {})} />;
    const view = render(at(0));
    expect(screen.getByTestId('context-value-shape')).toHaveTextContent('array · 0 items');
    view.rerender(at(1));
    expect(screen.getByTestId('context-value-shape').textContent?.trim()).toBe('array · 1 item');
  });

  it('refreshes metadata added to a live snapshot and suppresses facts that contradict its fold', () => {
    const wire = { version: 1, initial, changes: [] as unknown[] };
    const live = { contextShapes: wire };
    expect(contextValueShapesAt(live, 0)?.get(rows)?.arrayLength).toBe(90);
    wire.changes.push(changes[0]);
    expect(contextValueShapesAt(live, 0)?.get(rows)?.arrayLength).toBe(100);
    const bad = { ...snapshot(), contextShapes: { ...wire, initial: [[root, 'null'], [rows, 'array', 9]] } };
    const model = projectContext(bad, { runtimeStageId: 'start', commitIdx: -1 });
    expect(model.keys[0]).not.toHaveProperty('shape');
    expect(model.keys[0]).not.toHaveProperty('nestedArrays');
  });

  it('uses the summary for a large collapsed value, follows replay, and formats full JSON on demand', () => {
    const source = snapshot();
    const renderAt = (stop: number) => <ContextView runner={source} cursor={lensCursorFrom(axis, stop, () => {})} />;
    const preview = vi.spyOn(formatter, 'previewRecordedValue');
    try {
      const view = render(renderAt(0));
      expect(screen.getByTestId('context-array-shape')).toHaveTextContent('rows · array · 90 items');
      expect(preview.mock.calls.some(([value]) => typeof value === 'object')).toBe(false);
      view.rerender(renderAt(1));
      expect(screen.getByTestId('context-array-shape')).toHaveTextContent('100 items');
      fireEvent.click(screen.getByTestId('context-value-toggle'));
      expect(JSON.parse(screen.getByTestId('context-value-full').textContent!)).toEqual({ rows: values(100) });
      view.rerender(renderAt(0));
      expect(screen.getByTestId('context-array-shape')).toHaveTextContent('90 items');
      fireEvent.click(screen.getByTestId('context-mode-json'));
      expect(JSON.parse(screen.getByTestId('context-json').textContent!)).toEqual(source.initialState);
      const legacy = { initialState: source.initialState, commitLog: source.commitLog };
      view.rerender(<ContextView runner={legacy} cursor={lensCursorFrom(axis, 0, () => {})} />);
      fireEvent.click(screen.getByTestId('context-mode-keys'));
      expect(screen.queryByTestId('context-array-shape')).toBeNull();
      expect(screen.getByTestId('context-value-toggle')).toBeInTheDocument();
    } finally { preview.mockRestore(); }
  });
});
