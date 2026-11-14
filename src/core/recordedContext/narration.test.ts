import { describe, expect, it } from 'vitest';
import type { EventLogEntry } from '../types.js';
import { compactNarration } from './narration.js';

const log = [1, 2, 3].map((seq) => ({ seq, runOffsetMs: seq * 10,
  event: { type: 'custom.recorded', payload: {}, meta: {} } })) as unknown as EventLogEntry[];

describe('compact recorded narration', () => {
  it('retains the count, time range and all source event coordinates for a repeated sentence', () => {
    expect(compactNarration(log, () => 'A rule was added.', 'App')).toEqual([
      '+10ms A rule was added. [3 occurrences; through +30ms; events 1, 2, 3]',
    ]);
  });
  it('never uses a bare event label when no sentence formatter is available', () => {
    for (const humanizer of [undefined, () => '[custom.recorded]']) {
      const lines = compactNarration(log, humanizer, 'App');
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('Recorded event custom.recorded.');
      expect(lines[0]).not.toContain('[custom.recorded]');
    }
  });
  it('preserves an explicit formatter exclusion', () => {
    expect(compactNarration(log, () => null, 'App')).toEqual([]);
  });
  it('keeps A/B/A chronology instead of moving the last A before B', () => {
    const lines = compactNarration(log, (event) => event === log[1].event ? 'B happened.' : 'A happened.', 'App');
    expect(lines.map((line) => line.includes('A happened.') ? 'A' : 'B')).toEqual(['A', 'B', 'A']);
  });
  it('does not combine equal prose from sibling owners or different event kinds', () => {
    const entries = log.map((entry, i) => ({ ...entry, event: { ...entry.event,
      type: i === 2 ? 'custom.other' : entry.event.type,
      meta: { ...entry.event.meta, runId: 'run', compositionPath: [i === 0 ? 'left' : 'right'] },
    } })) as unknown as EventLogEntry[];
    expect(compactNarration(entries, () => 'Same words.', 'App')).toHaveLength(3);
  });
});
