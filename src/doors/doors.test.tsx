/**
 * The two doors' mount-time validation — branded inputs, teaching refusals.
 *
 * The refusal COPY is pinned VERBATIM here, deliberately: the sentences are
 * the product (a wrong input must be told what it is and where to go), so a
 * reworded refusal is a change this file must witness.
 *
 * The happy paths ride the same REAL fixtures the rest of the suite replays
 * (`recorded-turn.json` — a plain ReAct turn; `skill-route-refusal.json` — a
 * skill-routed run), so "the door mounts the real thing" is asserted against
 * a real recording, not a hand-built log.
 */

/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { observeRecording, type Recording } from '../core/observeRecording.js';
import { SkillGraphDebugger } from '../react/skillgraph/SkillGraphDebugger.js';
import { WhyLens } from './WhyLens.js';
import { describeReceived, isAgentRecording, readAgentRecording } from './recordingInput.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'core', '__fixtures__');

function fixture(file: string): Recording {
  return JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as Recording;
}

/** A convincing bare commit log — the wrong input the refusal example names. */
const BARE_COMMIT_LOG = [
  { idx: 0, runtimeStageId: 'plan#0', patch: { goal: 'x' }, trace: [] },
  { idx: 1, runtimeStageId: 'act#1', patch: { result: 'y' }, trace: [] },
];

describe('the doors’ shared gate (readAgentRecording)', () => {
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

describe('<WhyLens> — the why door refuses what it cannot read', () => {
  it('refuses a bare commit log with the full teaching card, verbatim', () => {
    render(<WhyLens recording={BARE_COMMIT_LOG as never} />);
    const card = screen.getByTestId('door-refusal');
    expect(card.textContent).toContain(
      'This lens reads an agent’s recording — the { snapshot, events, structure } that recordRun() froze, or the envelope persistRecording() wrote.',
    );
    expect(screen.getByTestId('door-refusal-received').textContent).toBe(
      'a bare commit log (an array of commit bundles)',
    );
    expect(screen.getByTestId('door-refusal-go-to').textContent).toBe(
      'The commit-trace lens is footprint-explainable-ui — mount its ExplainableShell over the run’s snapshot for that reading.',
    );
  });

  it('refuses an empty object by naming the missing parts and how to record a run', () => {
    render(<WhyLens recording={{} as never} />);
    expect(screen.getByTestId('door-refusal-received').textContent).toBe(
      'an object with none of a recording’s parts (no events, no snapshot)',
    );
    expect(screen.getByTestId('door-refusal-go-to').textContent).toBe(
      'To get a recording, record the run: recordRun(agent) from agentfootprint/observe captures exactly what this lens replays.',
    );
  });

  it('mounts the real <Lens> shell over a real recording (no refusal card)', () => {
    render(<WhyLens recording={fixture('recorded-turn.json')} />);
    expect(screen.queryByTestId('door-refusal')).toBeNull();
    // The shipped transport is the shell's own — its presence is the mount.
    expect(screen.getByLabelText('Next step')).toBeTruthy();
  });

  it('mounts through the envelope too', () => {
    render(
      <WhyLens
        recording={{ format: 'agentfootprint.recording.v1', recording: fixture('recorded-turn.json') }}
      />,
    );
    expect(screen.queryByTestId('door-refusal')).toBeNull();
    expect(screen.getByLabelText('Next step')).toBeTruthy();
  });
});

describe('<SkillGraphDebugger> — the skillgraph door refuses a non-recorder', () => {
  it('refuses a bare commit log passed as `recorder`, verbatim, and does not crash', () => {
    render(
      <SkillGraphDebugger recorder={BARE_COMMIT_LOG as never} cursorRuntimeStageId="" height={400} />,
    );
    const card = screen.getByTestId('door-refusal');
    expect(card.textContent).toContain(
      'This lens reads a replayed recording — the recorder that observeRecording(recording) returns, or a live lensRecorder().',
    );
    expect(screen.getByTestId('door-refusal-received').textContent).toBe(
      'a bare commit log (an array of commit bundles)',
    );
    expect(screen.getByTestId('door-refusal-go-to').textContent).toBe(
      'The commit-trace lens is footprint-explainable-ui — mount its ExplainableShell over the run’s snapshot for that reading.',
    );
  });

  it('points a run WITHOUT skill routing at the why door (honest empty state)', () => {
    const { recorder } = observeRecording(fixture('recorded-turn.json'));
    render(<SkillGraphDebugger recorder={recorder} cursorRuntimeStageId="" height={400} />);
    expect(screen.getByText(/No skill graph ran here/i)).toBeTruthy();
    expect(screen.getByText(/agentfootprint-lens\/why/)).toBeTruthy();
  });

  it('still mounts the real debugger for a skill-routed recording', () => {
    const { recorder } = observeRecording(fixture('skill-route-refusal.json'));
    render(
      <SkillGraphDebugger
        recorder={recorder}
        cursorRuntimeStageId="sf-injection-engine/evaluate#3"
        height={600}
      />,
    );
    expect(screen.queryByTestId('door-refusal')).toBeNull();
    expect(screen.getByTestId('skill-node-triage')).toBeTruthy();
  });
});
