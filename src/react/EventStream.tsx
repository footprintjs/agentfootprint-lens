/**
 * EventStream — renders the raw event log as a scrolling list,
 * optionally filtered by domain.
 *
 * Pattern: list-of-lines, each row is one event.
 * Role:    Engineer view's firehose. The RunTree shows the STRUCTURE;
 *          this shows every single event in chronological order.
 */

import React, { useMemo } from 'react';
import type { EventLogEntry } from '../core/types.js';
import type { Humanizer } from '../core/humanizer.js';
import { defaultHumanizer } from '../core/humanizer.js';
import { T } from './theme/index.js';

interface EventStreamProps {
  readonly log: readonly EventLogEntry[];
  /** Optional humanizer for a natural-language column alongside the event type. */
  readonly humanizer?: Humanizer;
  /** Filter: only events whose type starts with any of these prefixes. */
  readonly domainFilter?: readonly string[];
  /** Callback for row click. */
  readonly onSelect?: (entry: EventLogEntry) => void;
}

export const EventStream: React.FC<EventStreamProps> = ({
  log,
  humanizer = defaultHumanizer,
  domainFilter,
  onSelect,
}) => {
  const filtered = useMemo(() => {
    if (!domainFilter || domainFilter.length === 0) return log;
    return log.filter((entry) =>
      domainFilter.some((prefix) => entry.event.type.startsWith(prefix)),
    );
  }, [log, domainFilter]);

  return (
    <div
      style={{
        fontFamily: T.fontMono,
        fontSize: 12,
        lineHeight: 1.4,
        maxHeight: 400,
        overflowY: 'auto',
      }}
    >
      {filtered.length === 0 ? (
        <div style={{ opacity: 0.5, padding: 8 }}>No events yet.</div>
      ) : (
        filtered.map((entry) => (
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
            }}
          >
            <span style={{ opacity: 0.5 }}>+{Math.round(entry.runOffsetMs)}ms</span>
            <span style={{ color: T.textSecondary }}>{shortType(entry.event.type)}</span>
            <span>{humanizer(entry.event) ?? ''}</span>
          </div>
        ))
      )}
    </div>
  );
};

/** Strip the `agentfootprint.` prefix so type columns stay narrow. */
function shortType(type: string): string {
  return type.replace(/^agentfootprint\./, '');
}
