/**
 * EventStream — renders the raw event log as a scrolling list,
 * optionally filtered by domain.
 *
 * Pattern: list-of-lines, each row is one event.
 * Role:    Engineer view's firehose. The RunTree shows the STRUCTURE;
 *          this shows every single event in chronological order.
 *
 * U3 — windowed rendering: past `virtualizeThreshold` rows the list
 * renders only the visible window (spacer-based, `useWindowedList`),
 * so a 100K-event firehose costs ~one viewport of DOM nodes. Below the
 * threshold the DOM is identical to the pre-U3 render. Windowed rows
 * are pinned to `rowHeight` px with ellipsis overflow — full content
 * stays reachable via `onSelect`.
 *
 * Honesty: when the `LensRecorder` `maxEvents` cap has evicted events,
 * pass `droppedCount` (from `recorder.getDiagnostics().droppedEvents`)
 * and the stream leads with an explicit eviction notice — the log
 * starting mid-run is never silent.
 */

import React, { useMemo } from 'react';
import type { EventLogEntry } from '../core/types.js';
import type { Humanizer } from '../core/humanizer.js';
import { defaultHumanizer } from '../core/humanizer.js';
import { useWindowedList } from './hooks/useWindowedList.js';
import { T } from './theme/index.js';

interface EventStreamProps {
  readonly log: readonly EventLogEntry[];
  /** Optional humanizer for a natural-language column alongside the event type. */
  readonly humanizer?: Humanizer;
  /** Filter: only events whose type starts with any of these prefixes. */
  readonly domainFilter?: readonly string[];
  /** Callback for row click. */
  readonly onSelect?: (entry: EventLogEntry) => void;
  /** Number of events evicted by the recorder's `maxEvents` FIFO cap
   *  (U3) — wire `recorder.getDiagnostics().droppedEvents`. When > 0 an
   *  eviction notice renders above the stream so the missing head of
   *  the log is visible, not silent. */
  readonly droppedCount?: number;
  /** Row count past which windowed rendering engages. Default 300. */
  readonly virtualizeThreshold?: number;
  /** Fixed row height (px) used when windowing is active. Default 24. */
  readonly rowHeight?: number;
}

export const EventStream: React.FC<EventStreamProps> = ({
  log,
  humanizer = defaultHumanizer,
  domainFilter,
  onSelect,
  droppedCount = 0,
  virtualizeThreshold = 300,
  rowHeight = 24,
}) => {
  const filtered = useMemo(() => {
    if (!domainFilter || domainFilter.length === 0) return log;
    return log.filter((entry) =>
      domainFilter.some((prefix) => entry.event.type.startsWith(prefix)),
    );
  }, [log, domainFilter]);

  const w = useWindowedList({
    count: filtered.length,
    rowHeight,
    threshold: virtualizeThreshold,
  });

  // When windowing is active rows must be exactly `rowHeight` tall —
  // pin the height and ellipsize overflow so geometry stays exact.
  const windowedRowStyle: React.CSSProperties = w.windowed
    ? { height: rowHeight, boxSizing: 'border-box', overflow: 'hidden' }
    : {};
  const windowedCellStyle: React.CSSProperties = w.windowed
    ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
    : {};

  return (
    <div
      onScroll={w.onScroll}
      style={{
        fontFamily: T.fontMono,
        fontSize: 12,
        lineHeight: 1.4,
        maxHeight: 400,
        overflowY: 'auto',
      }}
    >
      {droppedCount > 0 && (
        <div
          style={{
            padding: '4px 6px',
            color: T.warning,
            borderBottom: `1px solid ${T.border}`,
          }}
        >
          ⚠ {droppedCount.toLocaleString()} earliest events evicted (LensRecorder maxEvents
          cap) — stream starts at the oldest retained event.
        </div>
      )}
      {filtered.length === 0 ? (
        <div style={{ opacity: 0.5, padding: 8 }}>No events yet.</div>
      ) : (
        <>
          {w.topPad > 0 && <div style={{ height: w.topPad }} aria-hidden />}
          {filtered.slice(w.start, w.end).map((entry) => (
            <div
              key={entry.seq}
              onClick={() => onSelect?.(entry)}
              style={{
                display: 'grid',
                gridTemplateColumns: '60px 200px 1fr',
                gap: 8,
                padding: '2px 6px',
                cursor: onSelect ? 'pointer' : 'default',
                borderBottom: `1px solid ${T.border}`,
                ...windowedRowStyle,
              }}
            >
              <span style={{ opacity: 0.5, ...windowedCellStyle }}>
                +{Math.round(entry.runOffsetMs)}ms
              </span>
              <span style={{ color: T.textSecondary, ...windowedCellStyle }}>
                {shortType(entry.event.type)}
              </span>
              <span style={windowedCellStyle}>{humanizer(entry.event) ?? ''}</span>
            </div>
          ))}
          {w.bottomPad > 0 && <div style={{ height: w.bottomPad }} aria-hidden />}
        </>
      )}
    </div>
  );
};

/** Strip the `agentfootprint.` prefix so type columns stay narrow. */
function shortType(type: string): string {
  return type.replace(/^agentfootprint\./, '');
}
