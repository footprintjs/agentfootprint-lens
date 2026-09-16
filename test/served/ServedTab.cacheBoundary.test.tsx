/**
 * The cache boundary, drawn where it fell (0.59.0).
 *
 * Test types: Render (a receipt whose `cache.markersApplied` names a place
 * gets a boundary line right after that element, in each list it names) ·
 * Honesty (a receipt with no marker draws none — the untampered fixture) ·
 * Data (the line carries the marker's own field, index and ttl).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { LABELS, ServedTab } from '../../src/react/components/ServedTab.js';
import { load, loadTampered, stopsOf } from './helpers.js';

afterEach(cleanup);

type Marker = { field: string; boundaryIndex: number; ttl: string };

/** Put markers on every receipt the record carries — the fold at any epoch then sees them. */
function withMarkers(markers: Marker[]) {
  return loadTampered('flat-dynamic-tools', (r) => {
    const snap = r.snapshot as { commitLog?: { overwrite?: { receipt?: { cache?: { markersApplied?: unknown } } } }[]; sharedState?: { receipt?: { cache?: { markersApplied?: unknown } } } };
    for (const b of snap.commitLog ?? []) {
      const cache = b.overwrite?.receipt?.cache;
      if (cache !== undefined) cache.markersApplied = markers;
    }
    const top = snap.sharedState?.receipt?.cache;
    if (top !== undefined) top.markersApplied = markers;
  });
}

describe('<ServedTab> cache boundary', () => {
  it('draws the line right after the element the receipt names, in each list it names', () => {
    const f = withMarkers([
      { field: 'system', boundaryIndex: 0, ttl: 'long' },
      { field: 'messages', boundaryIndex: 0, ttl: 'short' },
    ]);
    const stop = stopsOf(f, 'llm-turn')[0]!;
    render(<ServedTab runner={f.runner} cursorRuntimeStageId={stop.runtimeStageId} commitIdx={stop.commitIdx} />);
    const lines = screen.getAllByTestId('served-cache-boundary');
    expect(lines.map((l) => `${l.getAttribute('data-field')}[${l.getAttribute('data-index')}]`)).toEqual([
      'system[0]',
      'messages[0]',
    ]);
    expect(lines[0]!.textContent).toContain(LABELS.cacheBoundary);
    expect(lines[0]!.textContent).toContain('long');
    // Placed AFTER the first system piece, before the second (when there is one).
    const firstPiece = screen.getAllByTestId('served-piece')[0]!;
    expect(firstPiece.compareDocumentPosition(lines[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const pieces = screen.getAllByTestId('served-piece');
    if (pieces.length > 1) {
      expect(lines[0]!.compareDocumentPosition(pieces[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('a receipt with no marker applied draws no line', () => {
    const f = load('flat-dynamic-tools');
    const stop = stopsOf(f, 'llm-turn')[0]!;
    render(<ServedTab runner={f.runner} cursorRuntimeStageId={stop.runtimeStageId} commitIdx={stop.commitIdx} />);
    expect(screen.queryByTestId('served-cache-boundary')).toBeNull();
  });
});
