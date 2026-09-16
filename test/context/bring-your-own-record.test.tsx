/**
 * Bring your own record — the Context view over a record no executor wrote.
 *
 * footprintjs's record contract (docs/guides/record-contract.md there): a
 * frozen base, an append-only log of bundles, four verbs, one address per
 * bundle, tags declared. This record is built by hand, the way a runtime
 * that is not footprintjs would write it, and the view reads it unchanged:
 * its own milestone axis from the declared tags, the fold at each stop, who
 * wrote each key, what moved.
 *
 * Test types: Contract (a hand-built record renders, walks, folds) ·
 * Attribution (writers are the bundles' addresses) · Honesty (a bundle the
 * reader cannot read is reported on the view as skipped, nothing coerced).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { ContextView, LABELS } from '../../src/react/components/ContextView.js';

type Row = { path: string; verb: 'set' | 'merge' | 'append' | 'delete' };
const bundle = (
  runtimeStageId: string,
  trace: readonly Row[],
  overwrite: Record<string, unknown>,
  updates: Record<string, unknown>,
  tags?: readonly string[],
) => ({ runtimeStageId, trace, overwrite, updates, redactedPaths: [], ...(tags ? { tags } : {}) });

/** Declared tags use the view's own milestone vocabulary so it walks them. */
function handBuiltRecord() {
  return {
    initialState: { count: 0, items: [] as number[], profile: { name: 'a' } },
    commitLog: [
      bundle('seed#0', [{ path: 'count', verb: 'set' }], { count: 1 }, {}, ['milestone:iteration']),
      bundle('grow#1', [{ path: 'items', verb: 'append' }], { items: [10] }, {}, ['milestone:tool-call']),
      bundle('enrich#2', [{ path: 'profile', verb: 'merge' }], {}, { profile: { age: 3 } }, ['milestone:llm-turn']),
      bundle('forget#3', [{ path: 'count', verb: 'delete' }], { count: undefined }, {}, ['milestone:decision']),
    ],
  };
}

afterEach(cleanup);

describe('<ContextView> over a record built by hand', () => {
  it('walks the declared tags as its axis and folds the record at each stop', () => {
    const record = handBuiltRecord();
    render(<ContextView runner={record} />);
    const view = screen.getByTestId('context-view');
    expect(Number(view.getAttribute('data-step'))).toBeGreaterThanOrEqual(0);
    // Walk to the end: the fold there is the record's final state.
    const next = () => screen.getByLabelText('Next step') as HTMLButtonElement;
    for (let i = 0; i < 20 && !next().disabled; i++) fireEvent.click(next());
    const paths = screen.getAllByTestId('context-key').map((r) => r.getAttribute('data-path'));
    expect(paths).toContain('items');
    expect(paths).toContain('profile');
    expect(paths).not.toContain('count');
  });

  it('names the bundle that wrote each key — the record’s own addresses, nothing invented', () => {
    const record = handBuiltRecord();
    render(<ContextView runner={record} />);
    const next = () => screen.getByLabelText('Next step') as HTMLButtonElement;
    for (let i = 0; i < 20 && !next().disabled; i++) fireEvent.click(next());
    const writers = screen.getAllByTestId('context-wrote-by').map((c) => c.textContent ?? '');
    expect(writers.some((w) => w.includes('grow#1'))).toBe(true);
    expect(writers.some((w) => w.includes('enrich#2'))).toBe(true);
    expect(writers.every((w) => w.includes(LABELS.wroteBy) || w.includes(LABELS.unattributed))).toBe(true);
  });

  it('a bundle the reader cannot read is shown as skipped, and the rest still folds (footprintjs 9.27.0 reader)', () => {
    const record = handBuiltRecord();
    const broken = { ...record.commitLog[1]!, trace: [{ path: 'items', verb: 'upsert' as never }] };
    const damaged = { ...record, commitLog: [record.commitLog[0], broken, record.commitLog[2], record.commitLog[3]] };
    render(<ContextView runner={damaged} />);
    const next = () => screen.getByLabelText('Next step') as HTMLButtonElement;
    for (let i = 0; i < 20 && !next().disabled; i++) fireEvent.click(next());
    expect(screen.getByTestId('context-facts').textContent).toContain(LABELS.skipped);
    const paths = screen.getAllByTestId('context-key').map((r) => r.getAttribute('data-path'));
    expect(paths).toContain('profile');
    expect(paths).toContain('items');
  });
});
