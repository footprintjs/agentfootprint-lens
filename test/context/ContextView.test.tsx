/**
 * <ContextView> — standalone and slotted, on a recorded fixture.
 *
 * Test types: Render (keys, writers, served badge) · Functional (its own
 * cursor walks next/prev; the JSON mode shows the fold) · Contract (handed
 * the ONE cursor it moves nothing itself — no prev/next buttons, position
 * read off `cursor.at`) · Law (every printed literal is a label — the
 * own-claims walker covers the file; here: unattributed shown as such).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { lensCursorFrom } from '../../src/core/cursor/lensCursor.js';
import { tagAxisPositions } from '../../src/core/tags/tagAxis.js';
import { ContextView, LABELS, MILESTONE_AXIS } from '../../src/react/components/ContextView.js';
import { load, loadTampered, stopsOf } from '../served/helpers.js';

afterEach(cleanup);

describe('<ContextView> standalone', () => {
  it('renders the fold at its own first stop and walks the milestone axis with next / previous', () => {
    const fixture = load('flat-dynamic-tools');
    render(<ContextView runner={fixture.runner} events={fixture.recorder.getEntries()} />);
    const view = screen.getByTestId('context-view');
    expect(view.getAttribute('data-step')).toBe('0');
    const prev = screen.getByTestId('context-prev') as HTMLButtonElement;
    const next = screen.getByTestId('context-next') as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    fireEvent.click(next);
    expect(screen.getByTestId('context-view').getAttribute('data-step')).toBe('1');
    fireEvent.click(screen.getByTestId('context-prev'));
    expect(screen.getByTestId('context-view').getAttribute('data-step')).toBe('0');
  });

  it('at a model-call stop it lists keys with their writers and shows the served badge for that epoch', () => {
    const fixture = load('flat-dynamic-tools');
    const positions = tagAxisPositions(fixture.snapshot, MILESTONE_AXIS, [])!;
    const turnStep = positions.findIndex((p) => p.label.startsWith('LLM turn'));
    expect(turnStep).toBeGreaterThan(0);
    render(<ContextView runner={fixture.runner} />);
    for (let i = 0; i < turnStep; i++) fireEvent.click(screen.getByTestId('context-next'));
    const rows = screen.getAllByTestId('context-key');
    expect(rows.length).toBeGreaterThan(3);
    expect(
      screen.getAllByTestId('context-wrote-by').some((el) => el.textContent?.includes(LABELS.wroteBy)),
    ).toBe(true);
    const served = screen.getByTestId('context-served');
    expect(served.getAttribute('data-epoch')).toBe('1');
  });

  it('the JSON mode shows the same keys as an object', () => {
    const fixture = load('flat-dynamic-tools');
    render(<ContextView runner={fixture.runner} initialMode="json" />);
    const json = screen.getByTestId('context-json');
    expect(() => JSON.parse(json.textContent ?? '')).not.toThrow();
    fireEvent.click(screen.getByTestId('context-mode-keys'));
    expect(screen.queryByTestId('context-json')).toBeNull();
  });
});

describe('<ContextView> handed the ONE cursor', () => {
  it('reads its position off cursor.at, marks the delta since the previous position, and offers no mover of its own', () => {
    const fixture = load('flat-dynamic-tools');
    const turns = stopsOf(fixture, 'llm-turn');
    const positions = fixture.positions;
    const step = positions.findIndex((p) => p.runtimeStageId === turns[1]!.runtimeStageId);
    expect(step).toBeGreaterThan(0);
    const moved: number[] = [];
    const cursor = lensCursorFrom(positions, step, (n) => moved.push(n));
    render(<ContextView runner={fixture.runner} cursor={cursor} />);
    expect(screen.getByTestId('context-view').getAttribute('data-commit')).toBe(String(turns[1]!.commitIdx));
    expect(screen.queryByTestId('context-prev')).toBeNull();
    expect(screen.queryByTestId('context-next')).toBeNull();
    // No `previous` was handed with the cursor: nothing claims a direction.
    const rows = screen.getAllByTestId('context-key');
    expect(rows.every((r) => r.getAttribute('data-since') === '')).toBe(true);
    expect(moved).toEqual([]);
  });
});

describe('<ContextView> handed the ONE cursor and the previous stop', () => {
  it('measures entered / changed / unchanged against the previous stop the host names (0.53.3)', () => {
    const fixture = load('flat-dynamic-tools');
    const turns = stopsOf(fixture, 'llm-turn');
    const positions = fixture.positions;
    const step = positions.findIndex((p) => p.runtimeStageId === turns[1]!.runtimeStageId);
    const before = positions[step - 1]!;
    const cursor = lensCursorFrom(positions, step, () => undefined);
    render(
      <ContextView
        runner={fixture.runner}
        cursor={cursor}
        previous={{ runtimeStageId: before.runtimeStageId, commitIdx: before.commitIdx }}
      />,
    );
    const rows = screen.getAllByTestId('context-key');
    const since = rows.map((r) => r.getAttribute('data-since'));
    expect(since.every((s) => s === 'entered' || s === 'changed' || s === 'unchanged')).toBe(true);
    expect(since.some((s) => s !== 'unchanged')).toBe(true);
  });
});

describe('<ContextView> two layers (0.54.0)', () => {
  it('at a model-call stop the served document is on top — the Served tab itself, at that epoch — and the record beneath', () => {
    const fixture = load('flat-dynamic-tools');
    const positions = tagAxisPositions(fixture.snapshot, MILESTONE_AXIS, [])!;
    const turnStep = positions.findIndex((p) => p.label.startsWith('LLM turn'));
    render(<ContextView runner={fixture.runner} />);
    for (let i = 0; i < turnStep; i++) fireEvent.click(screen.getByTestId('context-next'));
    const served = screen.getByTestId('context-served');
    expect(served.getAttribute('data-epoch')).toBe('1');
    expect(within(served).getByTestId('served-tab')).toBeInTheDocument();
    expect(
      within(served).queryAllByTestId('served-piece').length + within(served).queryAllByTestId('served-message').length,
    ).toBeGreaterThan(0);
    // The record is still there, BENEATH — the served layer precedes the seam
    // and the key table in document order.
    const seam = screen.getByTestId('context-built-from');
    expect(seam.textContent).toContain(LABELS.builtFrom);
    expect(seam.textContent).toContain(String(screen.getAllByTestId('context-key').length));
    expect(served.compareDocumentPosition(seam) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      served.compareDocumentPosition(screen.getByTestId('context-keys')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getAllByTestId('context-key').length).toBeGreaterThan(3);
  });

  it('before any model call nothing is served and nothing claims to be', () => {
    const fixture = load('flat-dynamic-tools');
    render(<ContextView runner={fixture.runner} />);
    expect(screen.getByTestId('context-view').getAttribute('data-step')).toBe('0');
    expect(screen.queryByTestId('context-served')).toBeNull();
  });

  it('a long value opens in place and closes again', () => {
    const fixture = load('flat-dynamic-tools');
    const positions = tagAxisPositions(fixture.snapshot, MILESTONE_AXIS, [])!;
    const turnStep = positions.findIndex((p) => p.label.startsWith('LLM turn'));
    render(<ContextView runner={fixture.runner} />);
    for (let i = 0; i < turnStep; i++) fireEvent.click(screen.getByTestId('context-next'));
    const toggles = screen.getAllByTestId('context-value-toggle');
    expect(toggles.length).toBeGreaterThan(0);
    expect(screen.queryByTestId('context-value-full')).toBeNull();
    expect(toggles[0]!.textContent).toBe(LABELS.more);
    fireEvent.click(toggles[0]!);
    const full = screen.getByTestId('context-value-full');
    expect(full.textContent!.length).toBeGreaterThan(160);
    expect(() => JSON.parse(full.textContent!)).not.toThrow();
    fireEvent.click(screen.getAllByTestId('context-value-toggle')[0]!);
    expect(screen.queryByTestId('context-value-full')).toBeNull();
  });
});

describe('<ContextView> laws', () => {
  it('a key the log never attributes is shown UNATTRIBUTED — no owner invented', () => {
    const fixture = loadTampered('flat-dynamic-tools', (r) => {
      const snap = r.snapshot as { initialState?: Record<string, unknown> };
      snap.initialState = { ...(snap.initialState ?? {}), seededByBase: 42 };
    });
    const [turn] = stopsOf(fixture, 'llm-turn');
    const step = fixture.positions.findIndex((p) => p.runtimeStageId === turn!.runtimeStageId);
    const cursor = lensCursorFrom(fixture.positions, step, () => undefined);
    render(<ContextView runner={fixture.runner} cursor={cursor} />);
    const row = screen
      .getAllByTestId('context-key')
      .find((r) => r.getAttribute('data-path') === 'seededByBase');
    expect(row).toBeDefined();
    expect(within(row!).getByText(LABELS.unattributed)).toBeInTheDocument();
    expect(within(row!).queryByText(LABELS.wroteBy)).toBeNull();
  });
});
