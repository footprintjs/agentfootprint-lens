import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Agent } from 'agentfootprint';
import * as observe from 'agentfootprint/observe';
import { mock } from 'agentfootprint/providers';
import producer from 'agentfootprint/package.json';
import { contextAt, projectContext } from '../../src/context/index.js';
import { lensCursorFrom } from '../../src/core/cursor/lensCursor.js';
import * as formatter from '../../src/core/context/previewRecordedValue.js';
import { ContextView } from '../../src/react/components/ContextView.js';

const inventory = ['inventory'];
const rows = ['inventory', 'rows'];
const shapePaths = [rows];
const items = (length: number) => Array.from({ length }, (_, i) => i);
const initialState = { inventory: { rows: items(90) }, 'a.b': 5 };
const commit = { stage: 'write', stageId: 'write', runtimeStageId: 'write#0', updates: {},
  trace: [{ path: 'inventory', verb: 'set' }], overwrite: { inventory: { rows: items(100) } } };
const initial = [[inventory, 'object'], [rows, 'array', 90], [['a.b'], 'number']];
const changes = [[0, [[rows, 'array', 100]]]];
const index = { version: 1, initial, changes };
const snapshot = { initialState, commitLog: [commit], contextShapes: index };
const start = { runtimeStageId: '__root__#0', commitIdx: -1 };
const end = { runtimeStageId: 'write#0', commitIdx: 0 };
const axis = [
  { kind: 'group-start' as const, depth: 0, commitIdx: 0, runtimeGroupId: '', runtimeStageId: '__root__#0', label: 'Start' },
  { kind: 'commit' as const, depth: 0, commitIdx: 0, runtimeGroupId: '', runtimeStageId: 'write#0', label: 'Write' },
];
const cursor = (step: number) => lensCursorFrom(axis, step, () => {});
const hasReader = typeof Reflect.get(observe, 'contextShapeAt') === 'function';
const expectedProducer = process.env.LENS_CONTEXT_SHAPE_PEER;

describe('Context shape compatibility', () => {
  it('can open, expand and rewind a recording with no shape metadata', () => {
    const legacy = { initialState, commitLog: [commit] };
    const pane = (step: number) => <ContextView runner={legacy} shapePaths={shapePaths} cursor={cursor(step)} />;
    const view = render(pane(1));
    expect(screen.queryByTestId('context-array-shape')).toBeNull();
    fireEvent.click(screen.getByTestId('context-value-toggle'));
    expect(JSON.parse(screen.getByTestId('context-value-full').textContent!)).toEqual(commit.overwrite.inventory);
    view.rerender(pane(0));
    expect(JSON.parse(screen.getByTestId('context-value-full').textContent!)).toEqual(initialState.inventory);
  });

  it.runIf(!hasReader)('still shows folded values when the installed peer cannot read an index', () => {
    const result = projectContext(snapshot, end, { shapePaths });
    expect(result.keys.find(key => key.path === 'inventory')).toMatchObject({
      value: commit.overwrite.inventory,
    });
    for (const key of result.keys) {
      expect(key).not.toHaveProperty('shape');
      expect(key).not.toHaveProperty('nestedArrays');
    }
  });
});

// The published-producer job requires its exact package AND exercises every positive
// case even if the reader disappears. A locked older peer exercises both fallbacks.
describe.runIf(hasReader || expectedProducer !== undefined)('Context with the published shape reader', () => {
  it('reads a shape from a recording produced by the installed AgentFootprint', async () => {
    if (expectedProducer !== undefined) expect(producer.version).toBe(expectedProducer);
    expect(hasReader).toBe(true);
    const agent = Agent.create({ model: 'mock', provider: mock({ replies: [{ content: 'done' }] }) }).build();
    const recorder = observe.recordRun(agent);
    try {
      await agent.run({ message: 'Check the history.' });
      const saved = JSON.parse(JSON.stringify(recorder.toRecording()));
      const history = contextAt(saved.snapshot, { runtimeStageId: '__root__#0', commitIdx: 0 })
        .keys.find(key => key.path === 'history');
      expect(history?.shape).toEqual({ path: ['history'], type: 'array', arrayLength: 1 });
      expect(history?.value).toHaveLength(1);
    } finally {
      recorder.stop();
    }
  });

  it('reads exact paths at the fold anchor and only displays requested nested arrays', () => {
    const initialFold = projectContext(snapshot, { ...end, foldCommitIdx: -1 }, { shapePaths });
    expect(initialFold.keys.find(key => key.path === 'a.b')?.shape).toEqual({ path: ['a.b'], type: 'number' });
    const key = initialFold.keys.find(row => row.path === 'inventory')!;
    expect(key.shape).toEqual({ path: inventory, type: 'object' });
    expect(key.nestedArrays).toEqual([{ path: rows, type: 'array', arrayLength: 90 }]);
    const finalFold = projectContext(snapshot, end, { shapePaths });
    expect(finalFold.keys.find(row => row.path === 'inventory')?.nestedArrays)
      .toEqual([{ path: rows, type: 'array', arrayLength: 100 }]);
    expect(projectContext(snapshot, end).keys.find(row => row.path === 'inventory')).not.toHaveProperty('nestedArrays');
  });

  it('omits unknown, deleted, malformed, and contradictory shape facts while retaining the value', () => {
    const variants = [
      { version: 1, initial, changes: [[0, [[inventory, 'unknown'], [rows, 'deleted']]]] },
      { version: 1, initial, changes: [[0, [[rows, 'array', -1]]]] },
      { version: 1, initial, changes: [[0, [[inventory, 'null'], [rows, 'array', 99]]]] },
    ];
    for (const contextShapes of variants) {
      const model = projectContext({ ...snapshot, contextShapes }, end, { shapePaths });
      const key = model.keys.find(row => row.path === 'inventory')!;
      expect(key.value).toEqual(commit.overwrite.inventory);
      expect(key).not.toHaveProperty('shape');
      expect(key).not.toHaveProperty('nestedArrays');
    }
  });

  it('does not label a redacted placeholder using a stale string fact', () => {
    const masked = { initialState: { secret: '' }, commitLog: [{ ...commit,
      trace: [{ path: 'secret', verb: 'set' }], overwrite: { secret: 'REDACTED' }, redactedPaths: ['secret'],
    }], contextShapes: { version: 1, initial: [[['secret'], 'string']], changes: [] } };
    const result = projectContext(masked, end);
    expect(result.redacted).toBe(true);
    expect(result.keys[0].value).toBe('REDACTED');
    expect(result.keys[0]).not.toHaveProperty('shape');
  });

  it('reads a newly published live index and restores the previous count on rewind', () => {
    const live = { ...snapshot, commitLog: [] as typeof commit[], contextShapes: { ...index, changes: [] as typeof changes } };
    const runner = { getLastSnapshot: () => live };
    const pane = (step: number) => <ContextView runner={runner} shapePaths={shapePaths} cursor={cursor(step)} />;
    const view = render(pane(0));
    expect(screen.getByTestId('context-array-shape')).toHaveTextContent('90 items');
    live.commitLog.push(commit);
    live.contextShapes.changes.push(...changes);
    view.rerender(pane(1));
    expect(screen.getByTestId('context-array-shape')).toHaveTextContent('100 items');
    view.rerender(pane(0));
    expect(screen.getByTestId('context-array-shape')).toHaveTextContent('90 items');
  });

  it('skips the large object preview until the user opens the full value', () => {
    const preview = vi.spyOn(formatter, 'previewRecordedValue');
    try {
      render(<ContextView runner={snapshot} shapePaths={shapePaths} cursor={cursor(0)} />);
      expect(screen.getByTestId('context-array-shape')).toHaveTextContent('rows · array · 90 items');
      expect(preview.mock.calls.some(([value]) => typeof value === 'object')).toBe(false);
      expect(screen.queryByTestId('context-value-full')).toBeNull();
      fireEvent.click(screen.getByTestId('context-value-toggle'));
      expect(JSON.parse(screen.getByTestId('context-value-full').textContent!)).toEqual(initialState.inventory);
    } finally {
      preview.mockRestore();
    }
  });
});
