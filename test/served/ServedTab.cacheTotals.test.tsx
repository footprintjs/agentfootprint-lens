/**
 * The cache recorder's run totals on the Served tab (0.60.0).
 *
 * Test types: Render (a recording whose recorder rows carry the cache
 * recorder shows read tokens, fresh tokens and the hit rate, labelled as run
 * totals) · Honesty (a claim the recorder could not make prints its own
 * reason; a recording with no cache recorder prints nothing).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { LABELS, ServedTab } from '../../src/react/components/ServedTab.js';
import { load, loadTampered, stopsOf } from './helpers.js';

afterEach(cleanup);

function withCacheRow(data: Record<string, unknown>) {
  return loadTampered('flat-dynamic-tools', (r) => {
    const snap = r.snapshot as { recorders?: unknown[] };
    snap.recorders = [...(snap.recorders ?? []), { id: 'cache-recorder', name: 'cache-recorder', data }];
  });
}

describe('<ServedTab> cache totals', () => {
  it('shows the recorder’s known totals, as run totals', () => {
    const f = withCacheRow({
      cacheReadTokensTotal: { kind: 'known', value: 1234, evidence: 'usage' },
      freshInputTokensTotal: { kind: 'known', value: 400, evidence: 'usage' },
      hitRate: { kind: 'known', value: 0.755, evidence: 'usage' },
    });
    const stop = stopsOf(f, 'llm-turn')[0]!;
    render(<ServedTab runner={f.runner} cursorRuntimeStageId={stop.runtimeStageId} commitIdx={stop.commitIdx} />);
    expect(screen.getByTestId('served-cache-read-total').textContent).toContain('1234');
    expect(screen.getByTestId('served-cache-read-total').textContent).toContain(LABELS.runTotal);
    expect(screen.getByTestId('served-cache-fresh-total').textContent).toContain('400');
    expect(screen.getByTestId('served-cache-hit-rate').textContent).toContain('75.5%');
  });

  it('a claim the recorder could not make prints its own reason, not a number', () => {
    const f = withCacheRow({ cacheReadTokensTotal: { kind: 'unknown', reason: 'provider reports no cache usage' } });
    const stop = stopsOf(f, 'llm-turn')[0]!;
    render(<ServedTab runner={f.runner} cursorRuntimeStageId={stop.runtimeStageId} commitIdx={stop.commitIdx} />);
    const line = screen.getByTestId('served-cache-read-total');
    expect(line.textContent).toContain(LABELS.unknown);
    expect(line.textContent).toContain('provider reports no cache usage');
    expect(screen.queryByTestId('served-cache-hit-rate')).toBeNull();
  });

  it('no cache recorder on the recording: no totals, nothing claimed', () => {
    const f = load('flat-dynamic-tools');
    const stop = stopsOf(f, 'llm-turn')[0]!;
    render(<ServedTab runner={f.runner} cursorRuntimeStageId={stop.runtimeStageId} commitIdx={stop.commitIdx} />);
    expect(screen.queryByTestId('served-cache-read-total')).toBeNull();
  });
});
