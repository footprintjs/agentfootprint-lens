import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import type { Recording } from './observeRecording.js';
import { describeReceived, isAgentRecording, readAgentRecording } from './recordingInput.js';
import { readAgentRecording as readFromWhy } from '../why/index.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');

function fixture(file: string): Recording {
  return JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as Recording;
}

/** A convincing bare commit log — the wrong input the refusal example names. */
const BARE_COMMIT_LOG = [
  { idx: 0, runtimeStageId: 'plan#0', patch: { goal: 'x' }, trace: [] },
  { idx: 1, runtimeStageId: 'act#1', patch: { result: 'y' }, trace: [] },
];

describe('the doors’ shared gate (readAgentRecording)', () => {
  it('keeps the public why entry and the core owner on one gate function', () => {
    expect(readFromWhy).toBe(readAgentRecording);
  });

  it('accepts a { snapshot, events, structure } recording', () => {
    expect(isAgentRecording(fixture('recorded-turn.json'))).toBe(true);
  });

  it('accepts the persistRecording envelope and unwraps it', () => {
    const envelope = {
      format: 'agentfootprint.recording.v1',
      producer: { agentfootprintVersion: 'x', footprintjsVersion: 'y' },
      run: { runId: 'run-1', complete: true },
      privacy: { mode: 'full' },
      recording: fixture('recorded-turn.json'),
    };
    const verdict = readAgentRecording(envelope);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.recording).toBe(envelope.recording);
  });

  it('names a bare commit log as exactly that', () => {
    expect(describeReceived(BARE_COMMIT_LOG)).toBe('a bare commit log (an array of commit bundles)');
  });

  it('names a footprintjs snapshot, a string, and nothing', () => {
    expect(describeReceived({ commitLog: BARE_COMMIT_LOG, sharedState: {} })).toBe(
      'a footprintjs run snapshot (a commit log, with no agent events around it)',
    );
    expect(describeReceived('{"events":[]}')).toBe(
      'a string — if it is the recording’s JSON text, parse it first (JSON.parse) and pass the object',
    );
    expect(describeReceived(undefined)).toBe('nothing (undefined)');
  });
});
