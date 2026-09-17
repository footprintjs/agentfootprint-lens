/**
 * The findings ledger on the Served tab (0.61.0, agentfootprint 9.101.0).
 *
 * Test types: Render (the answer call's epoch shows the `findings` system
 * piece line with the check's own verdict, the collapsed tickets on the wire
 * with each ticket's id and standing, and the fold's ledger rows by kind) ·
 * Honesty (epoch 1 — armed, nothing declared yet — shows none of the three;
 * an unarmed recording shows none at any call; nothing is ever rendered as
 * "no findings") · Cursor (the fold line moves with the stop: the rows the
 * record holds THERE, not the run's final ledger).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { LABELS, ServedTab } from '../../src/react/components/ServedTab.js';
import { load, stopsOf, type LoadedFixture } from './helpers.js';

afterEach(cleanup);

const renderAt = (f: LoadedFixture, stop: { runtimeStageId: string; commitIdx: number }) =>
  render(<ServedTab runner={f.runner} cursorRuntimeStageId={stop.runtimeStageId} commitIdx={stop.commitIdx} />);

describe('<ServedTab> the findings ledger', () => {
  it('the answer call (epoch 3): the piece named by its source with the check’s verdict, two tickets with their own ids and standings, the ledger rows by kind', () => {
    const f = load('findings-ledger');
    const turns = stopsOf(f, 'llm-turn');
    expect(turns.length).toBe(3);
    renderAt(f, turns[2]!);
    expect(screen.getByTestId('served-tab').dataset.epoch).toBe('3');

    // The piece is rendered among the pieces under the record's own source
    // name, and the line beside them counts it and carries THAT piece's badge.
    const pieces = screen.getAllByTestId('served-piece').map((p) => p.textContent ?? '');
    expect(pieces.some((s) => s.includes('findings'))).toBe(true);
    const piece = screen.getByTestId('served-findings-piece');
    expect(piece).toHaveTextContent(LABELS.findingsPiece);
    expect(piece).toHaveTextContent('1');
    const badge = piece.querySelector<HTMLElement>('[data-testid="served-badge"]');
    expect(badge?.dataset.status).toBe('verified');

    // The noise and the ruled-out results went out as tickets; the line
    // counts them and prints each ticket's `toolCallId · standing` as the
    // wire carries it — no word of the tab's own.
    const tickets = screen.getByTestId('served-collapsed-tickets');
    expect(tickets).toHaveTextContent(LABELS.collapsedTickets);
    expect(tickets).toHaveTextContent('2');
    const chips = screen.getAllByTestId('served-collapsed-ticket');
    expect(chips.map((c) => [c.textContent, c.dataset.standing])).toEqual([
      ['c2 · noise', 'noise'],
      ['c3 · ruled-out', 'ruled-out'],
    ]);

    // The fold at the CALL's stop: six basis rows (c1..c6) and the four
    // standings batch 2 declared; the answer's standing and the conflict are
    // written after this stop, so they are not here.
    const ledger = screen.getByTestId('served-findings-ledger');
    expect(ledger).toHaveTextContent(LABELS.findingsLedger);
    expect(ledger).toHaveTextContent('10');
    expect(ledger).toHaveTextContent('basis 6 · standing 4');
    expect(ledger).not.toHaveTextContent('conflict');
  });

  it('epoch 1 — armed, nothing declared yet: no piece line, no ticket line, no ledger on the fold; nothing rendered in their place', () => {
    const f = load('findings-ledger');
    const [first] = stopsOf(f, 'llm-turn');
    renderAt(f, first!);
    expect(screen.getByTestId('served-tab').dataset.epoch).toBe('1');
    expect(screen.queryByTestId('served-findings-piece')).toBeNull();
    expect(screen.queryByTestId('served-collapsed-tickets')).toBeNull();
    expect(screen.queryByTestId('served-findings-ledger')).toBeNull();
  });

  it('the fold line moves with the cursor: batch 1’s basis rows at the first tool-calls stop, the standings at the second', () => {
    const f = load('findings-ledger');
    const [first, second] = stopsOf(f, 'tool-call');
    const { unmount } = renderAt(f, first!);
    const atFirst = screen.getByTestId('served-findings-ledger');
    expect(atFirst).toHaveTextContent('basis 4');
    expect(atFirst).not.toHaveTextContent('standing');
    unmount();
    renderAt(f, second!);
    expect(screen.getByTestId('served-findings-ledger')).toHaveTextContent('basis 6 · standing 4');
  });

  it('the run’s last stop: the answer’s standing and the one conflict row are on the fold', () => {
    const f = load('findings-ledger');
    const last = f.positions[f.positions.length - 1]!;
    renderAt(f, last);
    expect(screen.getByTestId('served-findings-ledger')).toHaveTextContent('basis 6 · standing 5 · conflict 1');
  });

  it('an unarmed recording: none of the three lines at any call — absent, never "no findings"', () => {
    const f = load('flat-dynamic-tools');
    for (const stop of stopsOf(f, 'llm-turn')) {
      renderAt(f, stop);
      expect(screen.queryByTestId('served-findings-piece')).toBeNull();
      expect(screen.queryByTestId('served-collapsed-tickets')).toBeNull();
      expect(screen.queryByTestId('served-findings-ledger')).toBeNull();
      cleanup();
    }
  });
});
