import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, it } from 'vitest';
import type { SourcePosition } from '../../core/cursor/sourcePosition.js';
import type { SharedCursorTarget } from '../../core/cursor/sharedCursor.js';
import { projectHonestyTurn, type HonestyTurn } from '../../core/honesty/projectHonestyTurn.js';
import { useSharedCursor, type SourceAwareSharedCursor } from '../useSharedCursor.js';
import { HonestyLensRoundTrip } from './HonestyLensRoundTrip.js';

const position = { engineRunId: 'run', logRunId: 'child', drillPath: ['mount'], committedThroughIdx: 3 };
const selected: HonestyTurn = {
  trust: { state: 'not-sure', title: 'Not sure', sentence: 'A limit was recorded.' },
  sentences: [{ text: 'It may be available.', mark: 'unlinked', evidenceNote: 'No sentence link.' }],
  reasons: [{ text: 'Coverage is partial.', evidence: { address: { eventIndex: 8, sourcePosition: position }, reasonIndex: 0 } }],
  steps: [
    { id: 'N', headline: 'How far to trust it', rows: [], remaining: 0 },
    { id: 'A', headline: 'What was checked', rows: [{ text: 'Coverage evidence', address: { eventIndex: 8, sourcePosition: position } }], remaining: 0 },
  ],
};

function Host({ turnKey = 'one', turn = selected, reject = false, scroller }: {
  turnKey?: string; turn?: HonestyTurn; reject?: boolean; scroller?: HTMLElement;
}) {
  const [target, setTarget] = useState<SharedCursorTarget>();
  // The production hook owns resolution. The host fixture controls its result and a deliberate move.
  const cursor: Pick<SourceAwareSharedCursor, 'target' | 'selectSourcePrefix'> = {
    target,
    selectSourcePrefix(input) {
      if (reject) return { status: 'unavailable', reason: 'missing-log' };
      const admitted = input as SourcePosition;
      setTarget({ kind: 'source-prefix', position: admitted });
      return { status: 'available', position: admitted, state: { status: 'unavailable', reason: 'damaged-values' } };
    },
  };
  return <>
    <p>Current position: {target?.kind === 'source-prefix' ? target.position.committedThroughIdx : 'none'}</p>
    <HonestyLensRoundTrip turnKey={turnKey} turn={turn} cursor={cursor} getAnswerScroller={scroller === undefined ? undefined : () => scroller} renderEvidence={() => (
      <button onClick={() => setTarget({ kind: 'source-prefix', position: { ...position, committedThroughIdx: 5 } })}>
        Move to another step
      </button>
    )} />
  </>;
}

it('restores the selected sentence, its step and invoking focus after inspecting', () => {
  const scroller = document.createElement('div');
  document.body.append(scroller);
  scroller.scrollTop = 120;
  scroller.scrollLeft = 15;
  render(<Host scroller={scroller} />);
  fireEvent.click(screen.getByRole('button', { name: /It may be available/ }));
  const inspect = screen.getByRole('button', { name: 'Inspect this step' });
  fireEvent.click(inspect);
  expect(screen.getByRole('button', { name: 'Back to answer' })).toHaveFocus();
  expect(screen.getByText('Current position: 3')).toBeVisible();
  scroller.scrollTop = 0;
  scroller.scrollLeft = 0;
  fireEvent.click(screen.getByRole('button', { name: 'Back to answer' }));
  expect(screen.getByRole('heading', { name: 'What was checked' })).toBeVisible();
  expect(screen.getByText('No sentence link.')).toBeVisible();
  expect(inspect).toHaveFocus();
  expect(scroller.scrollTop).toBe(120);
  expect(scroller.scrollLeft).toBe(15);
  scroller.remove();
  expect(screen.queryByRole('button', { name: 'Return to original step' })).toBeNull();
});

it('keeps the deliberate move on Back and reselects the origin only on request', () => {
  render(<Host />);
  fireEvent.click(screen.getByRole('button', { name: /Inspect this step/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Move to another step' }));
  fireEvent.click(screen.getByRole('button', { name: 'Back to answer' }));
  expect(screen.getByText('Current position: 5')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Return to original step' }));
  expect(screen.getByText('Current position: 3')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Back to answer' })).toHaveFocus();
});

it('keeps an unavailable position on the answer without moving the cursor', () => {
  render(<Host reject />);
  const inspect = screen.getByRole('button', { name: /Inspect this step/ });
  fireEvent.click(inspect);
  expect(inspect).toBeVisible();
  expect(screen.getByRole('status', { name: 'Evidence position' })).toHaveTextContent('unavailable');
  expect(screen.getByText('Current position: none')).toBeVisible();
});

it('discards the previous return context when the host selects another turn', () => {
  const { rerender } = render(<Host />);
  fireEvent.click(screen.getByRole('button', { name: /Inspect this step/ }));
  rerender(<Host turnKey="two" />);
  expect(screen.getByRole('button', { name: /Inspect this step/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Back to answer' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Return to original step' })).toBeNull();
});

const bytes = readFileSync(resolve('src/core/honesty/__fixtures__/inventory-17.json.gz'));
const fixture = JSON.parse(gunzipSync(bytes).toString('utf8')).recording;
const turnStart = fixture.events.findIndex((event: { type: string }) =>
  event.type === 'agentfootprint.agent.turn_start');
const recorded = projectHonestyTurn(fixture, { startEventIndex: turnStart });

function RecordedHost({ turn }: { turn: HonestyTurn }) {
  const cursor = useSharedCursor(undefined, fixture.snapshot);
  return <HonestyLensRoundTrip turnKey="saved" turn={turn} cursor={cursor} renderEvidence={address => (
    <p>Inspecting {address.eventIndex} from {
      cursor.target?.kind === 'source-prefix' ? cursor.target.position.drillPath.join('/') || 'root' : 'unplaced'
    }</p>
  )} />;
}

it('opens an admitted mounted position using the real shared cursor and saved recording', () => {
  const row = recorded.reasons[0];
  expect(row.evidence.address.sourcePosition?.drillPath.length).toBeGreaterThan(0);
  render(<RecordedHost turn={{ ...recorded, reasons: [row] }} />);
  fireEvent.click(screen.getByRole('button', { name: /Inspect this step/ }));
  expect(screen.getByText(
    `Inspecting ${row.evidence.address.eventIndex} from ${row.evidence.address.sourcePosition?.drillPath.join('/')}`,
  )).toBeVisible();
});

it('opens the root only when its address explicitly names the root', () => {
  const root: SourcePosition = {
    engineRunId: fixture.snapshot.runId, logRunId: fixture.snapshot.logAddress.logRunId,
    drillPath: [], committedThroughIdx: 0,
  };
  const [reason] = selected.reasons;
  render(<RecordedHost turn={{ ...selected, reasons: [{
    ...reason, evidence: { ...reason.evidence, address: { eventIndex: 1, sourcePosition: root } },
  }] }} />);
  fireEvent.click(screen.getByRole('button', { name: /Inspect this step/ }));
  expect(screen.getByText('Inspecting 1 from root')).toBeVisible();
});

it('does not select an approximate step for an event-only address', () => {
  const [reason] = selected.reasons;
  render(<Host turn={{ ...selected, reasons: [{
    ...reason, evidence: { ...reason.evidence, address: { eventIndex: 8, runtimeStageId: 'repeated' } },
  }] }} />);
  fireEvent.click(screen.getByRole('button', { name: /Inspect this step/ }));
  expect(screen.getByText('Current position: none')).toBeVisible();
  expect(screen.getByRole('status', { name: 'Evidence position' })).toBeVisible();
});

it('restores focus to disclosure when the invoking reason disappears', () => {
  const { rerender } = render(<Host />);
  fireEvent.click(screen.getByRole('button', { name: /Inspect this step/ }));
  rerender(<Host turn={{ ...selected, reasons: [] }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Back to answer' }));
  expect(screen.getByRole('button', { name: 'Check this answer' })).toHaveFocus();
});
