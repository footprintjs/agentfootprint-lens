/** @vitest-environment node */
import { expect, it, vi } from 'vitest';
import { storyMarks, type StoryRecord, type StoryTraceShape } from '../index.js';

vi.mock('react', () => {
  throw new Error('Story marks must load without React');
});

it('joins marked beats by recorded call ID and reads the standing at the supplied stop', () => {
  const trace: StoryTraceShape = { steps: [
    { kind: 'ask', toolCallId: 'call-1' },
    { kind: 'return', toolCallId: 'call-2' },
    { kind: 'return' },
    { kind: 'return', toolCallId: 'call-1' },
    { kind: 'answer' },
  ] };
  const basis = { kind: 'basis', toolCallId: 'call-1', toolName: 'lookup', basis: 'direct', iteration: 1 };
  const standing = {
    kind: 'standing', toolCallId: 'call-1', standing: 'fact',
    declaredOn: 'answer', assertions: [], iteration: 2,
  };
  const stop: StoryRecord = [{ path: 'findingsLedger', value: [basis] }];
  const end: StoryRecord = { findingsLedger: [basis, standing] };
  const direct = [{ label: 'direct', tone: 'neutral' }];
  const undeclared = [{ label: 'undeclared', tone: 'muted' }];

  expect(storyMarks(trace, end)).toEqual([
    direct, undeclared, undefined, [{ label: 'fact', tone: 'good' }], [{ label: 'stood on 1', tone: 'good' }],
  ]);
  expect(storyMarks(trace, stop)).toEqual([direct, undeclared, undefined, undeclared, undefined]);
});
