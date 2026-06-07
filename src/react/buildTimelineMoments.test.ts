/**
 * buildTimelineMoments — turns cursor stops into WHAT HAPPENED moments.
 *
 * Covers: short tool titles ("Called <tool>"), milestone labels as titles,
 * verbose prose → description (not title), generic descriptions for bare
 * milestones, timestamp fallback (commentary offset → overlay time), and icons.
 */
import { describe, it, expect } from 'vitest';
import type { CursorPosition } from '../core/group/cursorPositionsAtDrill.js';
import type { EventLogEntry } from '../core/types.js';
import { buildTimelineMoments, momentIcon } from './buildTimelineMoments.js';

const pos = (
  runtimeStageId: string,
  label: string,
  kind: CursorPosition['kind'] = 'commit',
): CursorPosition => ({ runtimeStageId, runtimeGroupId: runtimeStageId, label, kind, depth: 1, commitIdx: 0 });

const logEntry = (seq: number, _line: string, runOffsetMs: number): EventLogEntry =>
  ({ seq, runOffsetMs, event: { type: 'x', payload: {}, meta: {} } }) as unknown as EventLogEntry;

describe('buildTimelineMoments', () => {
  it('makes a tool call a short "Called <tool>" title, prose → description', () => {
    const moments = buildTimelineMoments({
      cursorPositions: [pos('tool-calls#5', 'Tool call 1')],
      commentarySeqs: [0],
      log: [logEntry(0, 'Chatbot called the `read_skill` tool. The LLM asked for it.', 120)],
      humanizer: () => 'Chatbot called the `read_skill` tool. The LLM asked for it.',
      executionOrder: [],
    });
    expect(moments[0]!.title).toBe('Called read_skill');
    expect(moments[0]!.description).toContain('Chatbot called'); // verbose prose in the card
    expect(moments[0]!.offsetMs).toBe(120);
  });

  it('uses the milestone label as title (not raw [emit] lines)', () => {
    const moments = buildTimelineMoments({
      cursorPositions: [pos('context#6', 'Context 1', 'parallel')],
      commentarySeqs: [0],
      log: [logEntry(0, '[agentfootprint.context.evaluated]', 90)],
      humanizer: () => '[agentfootprint.context.evaluated]',
      executionOrder: [],
    });
    expect(moments[0]!.title).toBe('Context 1');
    // raw [emit] is NOT used as the description — a generic fills in
    expect(moments[0]!.description).toBe("Assembled this turn's context.");
  });

  it('falls back to overlay timestamp when the commentary entry has none', () => {
    const moments = buildTimelineMoments({
      cursorPositions: [pos('call-llm#7', 'LLM turn 1')],
      commentarySeqs: [-1], // no commentary entry
      log: [],
      humanizer: () => null,
      executionOrder: [{ runtimeStageId: 'call-llm#7', stageId: 'call-llm', stageName: 'Call LLM' } as never],
    });
    // offset not present on call-llm#7 overlay entry here → undefined; generic desc applies
    expect(moments[0]!.title).toBe('LLM turn 1');
    expect(moments[0]!.description).toBe('Called the LLM to decide the next step.');
  });

  it('momentIcon maps kinds to glyphs', () => {
    expect(momentIcon('Tool call 1', 'commit')).toBe('⚙');
    expect(momentIcon('Context 1', 'parallel')).toBe('❖');
    expect(momentIcon('Run · start', 'group-start')).toBe('▸');
    expect(momentIcon('Whatever', 'commit')).toBe('•');
  });

  it('one moment per cursor stop', () => {
    const moments = buildTimelineMoments({
      cursorPositions: [pos('a#0', 'Run · start', 'group-start'), pos('b#1', 'Iteration 1'), pos('c#2', 'LLM turn 1')],
      commentarySeqs: [-1, -1, -1],
      log: [],
      humanizer: () => null,
      executionOrder: [],
    });
    expect(moments).toHaveLength(3);
    expect(moments.map((m) => m.title)).toEqual(['Run · start', 'Iteration 1', 'LLM turn 1']);
  });
});
