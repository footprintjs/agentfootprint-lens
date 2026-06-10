/** @vitest-environment jsdom */
/**
 * EventStream — windowed firehose tests (backlog U3).
 *
 * Verifies: small logs render every row exactly as before (threshold
 * contract); large logs render only the scrolled-to window with
 * spacer-preserved scroll geometry; the `droppedCount` eviction notice
 * is explicit (honest cap surfacing); `domainFilter` composes with
 * windowing.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { EventStream } from './EventStream.js';
import type { EventLogEntry } from '../core/types.js';
import type { AgentfootprintEvent } from 'agentfootprint';

function makeLog(n: number, type = 'agentfootprint.cost.tick'): EventLogEntry[] {
  const entries: EventLogEntry[] = [];
  for (let i = 0; i < n; i++) {
    entries.push({
      seq: i,
      wallClockMs: 1000 + i,
      runOffsetMs: i,
      event: { type, payload: {}, meta: {} } as unknown as AgentfootprintEvent,
      runtimeStageId: `s#${i}`,
    });
  }
  return entries;
}

/** Trivial humanizer — these tests assert WINDOWING, not prose. */
const toType = (e: AgentfootprintEvent): string => e.type;

/** Event rows are the only grid-layout divs in the stream. */
function rowCount(container: HTMLElement): number {
  return container.querySelectorAll('div[style*="grid"]').length;
}

describe('EventStream — threshold contract (small logs unchanged)', () => {
  it('renders every row when under the virtualize threshold', () => {
    const { container } = render(<EventStream log={makeLog(50)} humanizer={toType} />);
    expect(rowCount(container)).toBe(50);
  });

  it('renders the empty state with no events', () => {
    const { container } = render(<EventStream log={[]} />);
    expect(container.textContent).toMatch(/no events yet/i);
  });
});

describe('EventStream — windowed rendering (U3)', () => {
  it('renders only the visible window for long logs, with spacers preserving geometry', () => {
    const { container } = render(<EventStream log={makeLog(5000)} rowHeight={24} humanizer={toType} />);
    const rows = rowCount(container);
    expect(rows).toBeGreaterThan(0);
    expect(rows).toBeLessThan(100); // ~one viewport + overscan, not 5000
    // Bottom spacer stands in for the off-screen rows.
    const spacers = [...container.querySelectorAll('div[aria-hidden]')];
    expect(spacers.length).toBeGreaterThan(0);
    const bottomPad = parseInt(
      (spacers[spacers.length - 1] as HTMLElement).style.height,
      10,
    );
    expect(bottomPad).toBe((5000 - rows) * 24);
  });

  it('windows the FILTERED list, not the raw log', () => {
    const log = [
      ...makeLog(100, 'agentfootprint.cost.tick'),
      ...makeLog(50, 'myapp.custom.thing').map((e, i) => ({ ...e, seq: 100 + i })),
    ];
    const { container } = render(
      <EventStream log={log} domainFilter={['myapp.']} virtualizeThreshold={300} humanizer={toType} />,
    );
    // 50 matching rows — under the threshold, so all render.
    expect(rowCount(container)).toBe(50);
  });
});

describe('EventStream — honest eviction notice (U3)', () => {
  it('leads with the eviction notice when droppedCount > 0', () => {
    const { container } = render(<EventStream log={makeLog(5)} droppedCount={1234} humanizer={toType} />);
    expect(container.textContent).toMatch(/1,234 earliest events evicted/i);
    expect(container.textContent).toMatch(/maxEvents/);
  });

  it('shows no notice when nothing was evicted', () => {
    const { container } = render(<EventStream log={makeLog(5)} humanizer={toType} />);
    expect(container.textContent).not.toMatch(/evicted/i);
  });
});
