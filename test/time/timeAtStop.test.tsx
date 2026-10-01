/** @vitest-environment jsdom */
/**
 * The Time view at a stop holds only what the record held AT that stop — over a REAL resumed
 * leg (generated here from agentfootprint, no model called): an armed agent pauses on the
 * library's time ask, the person confirms, and the resumed leg's FIRST commit is the paused
 * call's stand-in — it binds the answer and dispatches the call. "Run · start" shares that
 * commit index (the root group OPENS at it) but stands BEFORE it, so the fold there is the leg's
 * base: the state at the pause — the call's window not filled yet, no dispatch, no answer.
 *
 * Found in the 2026-10-01 demo video: every stop of the resumed leg already showed the call
 * dispatched, because each fold site folded the position's `commitIdx` (0) inclusively.
 *
 * Test types: UNIT (`foldCommitIdxOf`, the reading's `foldCommitIdx`, `foldCursorOf`) ·
 * SCENARIO (`contextAt` + `foldTimeRows` at each stop of the real leg) · COMPONENT
 * (`<ContextView recorder>` moves the Time band with the cursor from the first stop).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Agent, defineTool, englishTimeReader, isInputPause } from 'agentfootprint';
import { recordRun } from 'agentfootprint/observe';

import { contextAt } from '../../src/core/context/contextAt.js';
import { foldCommitIdxOf, foldCursorOf } from '../../src/core/cursor/foldAt.js';
import { lensCursorFrom } from '../../src/core/cursor/lensCursor.js';
import { scrubAxisFor } from '../../src/core/group/scrubAxisFor.js';
import type { CursorPosition } from '../../src/core/group/cursorPositionsAtDrill.js';
import { observeRecording } from '../../src/core/observeRecording.js';
import { foldTimeRows } from '../../src/core/time/timeRows.js';
import { ContextView } from '../../src/react/components/ContextView.js';

afterEach(cleanup);

const NOW = '2026-10-09T15:40:00Z';
const LA = 'America/Los_Angeles';

type Reply = { content?: string; toolCalls?: { id: string; name: string; args: object }[] };

function scripted(script: readonly Reply[]) {
  let i = 0;
  return {
    name: 'time-at-stop',
    complete: async () => {
      const r = script[Math.min(i, script.length - 1)]!;
      i += 1;
      return { content: r.content ?? '', toolCalls: r.toolCalls ?? [], usage: { input: 0, output: 0 } };
    },
  };
}

function clientActivity() {
  return defineTool({
    name: 'client_activity',
    description: 'Client operations over a window.',
    inputSchema: {
      type: 'object',
      properties: { start_time: { type: 'integer' }, end_time: { type: 'integer' } },
    },
    askOrAssume: { start_time: { ask: 'From when?' }, end_time: { ask: 'Until when?' } },
    period: {
      forms: [
        {
          kind: 'bounds',
          from: { argument: 'start_time', as: 'epoch-ms' },
          to: { argument: 'end_time', as: 'epoch-ms', edge: 'exclusive' },
        },
      ],
    } as never,
    execute: () => '{"ops":42}',
  });
}

interface Leg {
  readonly recording: unknown;
  readonly runner: unknown;
  readonly recorder: Parameters<typeof scrubAxisFor>[0];
  readonly snapshot: unknown;
  readonly positions: readonly CursorPosition[];
}

function legOf(recording: unknown): Leg {
  const { runner, recorder } = observeRecording(recording as never) as unknown as {
    runner: { getLastSnapshot?: () => unknown };
    recorder: Parameters<typeof scrubAxisFor>[0];
  };
  const snapshot = runner.getLastSnapshot?.() ?? (recording as { snapshot: unknown }).snapshot;
  return { recording, runner, recorder, snapshot, positions: scrubAxisFor(recorder, 'group') };
}

let paused: Leg;
let resumed: Leg;

beforeAll(async () => {
  const realNow = Date.now;
  Date.now = () => Date.parse(NOW) + 5_000;
  try {
    const agent = Agent.create({
      provider: scripted([
        { toolCalls: [{ id: 'c1', name: 'client_activity', args: {} }] },
        { content: '42 operations.' },
      ]) as never,
      model: 'mock',
      maxIterations: 6,
    })
      .tools([clientActivity()])
      .time({ zone: LA, reader: englishTimeReader() })
      .build();
    const first = recordRun(agent);
    const out = await agent.run({ message: 'Show client activity yesterday', time: { now: NOW } });
    if (!isInputPause(out)) throw new Error('expected the time ask');
    paused = legOf(JSON.parse(JSON.stringify(first.toRecording())));
    first.stop();
    const second = recordRun(agent);
    const ask = (out as unknown as { checkpoint: never; awaitingInput: { requestId: string; fields: { id: string; enum: string[] }[] } })
      .awaitingInput;
    await agent.resume((out as unknown as { checkpoint: never }).checkpoint, {
      requestId: ask.requestId,
      values: { [ask.fields[0]!.id]: ask.fields[0]!.enum[0]! },
    });
    resumed = legOf(JSON.parse(JSON.stringify(second.toRecording())));
    second.stop();
  } finally {
    Date.now = realNow;
  }
});

/** The time fold at step `i` of a leg's grouped axis, read the way a host must read it. */
function timeAt(leg: Leg, i: number) {
  const at = lensCursorFrom(leg.positions, i, () => undefined).at;
  const ledger = contextAt(leg.snapshot, foldCursorOf(at), {}).keys.find((k) => k.path === 'findingsLedger')
    ?.value as unknown[] | undefined;
  return foldTimeRows(ledger);
}

const callOf = (fold: ReturnType<typeof foldTimeRows>) => fold?.turns.flatMap((t) => t.calls)[0];

describe('UNIT — the commit a stop folds through', () => {
  it('Run · start folds the base (-1); every other stop folds its own commit', () => {
    const [start, next] = resumed.positions;
    expect(start).toMatchObject({ label: 'Run · start', kind: 'group-start', depth: 0, commitIdx: 0 });
    expect(next!.commitIdx).toBe(0); // the stand-in's commit — the same index Run · start anchors
    expect(foldCommitIdxOf(start!)).toBe(-1);
    expect(foldCommitIdxOf(next!)).toBe(0);
    for (const p of resumed.positions.slice(1)) expect(foldCommitIdxOf(p)).toBe(p.commitIdx);
  });

  it('the cursor reading carries it, and `foldCursorOf` hands it to the fold', () => {
    const at = lensCursorFrom(resumed.positions, 0, () => undefined).at;
    expect(at.commitIdx).toBe(0);
    expect(at.foldCommitIdx).toBe(-1);
    expect(foldCursorOf(at)).toEqual({ runtimeStageId: at.runtimeStageId, commitIdx: -1 });
    // A reading a host built itself, without the field, folds its own commit.
    expect(foldCursorOf({ runtimeStageId: 'x#1', commitIdx: 4 })).toEqual({ runtimeStageId: 'x#1', commitIdx: 4 });
  });
});

describe('SCENARIO — the resumed leg, stop by stop', () => {
  it('Run · start holds the state at the pause: the window not filled, no dispatch, no answer', () => {
    const fold = timeAt(resumed, 0);
    expect(fold).toBeDefined();
    const call = callOf(fold)!;
    expect(call.window?.how).toBe('not-filled');
    expect(call.dispatch).toBeUndefined();
    expect(call.period).toBeUndefined();
    expect(fold!.turns[0]!.answers).toEqual([]);
    expect(fold!.turns[0]!.readings.length).toBe(1); // the reading, filed before the pause
  });

  it('the stand-in’s stop binds the answer and dispatches; the results stop adds the period', () => {
    const tool = resumed.positions.findIndex((p) => p.label.startsWith('Tool call'));
    const results = resumed.positions.findIndex((p) => p.label.startsWith('Results'));
    expect(tool).toBe(1);
    const atTool = timeAt(resumed, tool);
    expect(callOf(atTool)!.window?.how).toBe('filled');
    expect(callOf(atTool)!.dispatch).toBeDefined();
    expect(atTool!.turns[0]!.answers).toHaveLength(1);
    expect(callOf(timeAt(resumed, results))!.period).toBeDefined();
  });

  it('the first leg’s Run · start holds no time row at all', () => {
    expect(paused.positions[0]!.label).toBe('Run · start');
    expect(timeAt(paused, 0)).toBeUndefined();
    expect(timeAt(paused, 1)).toBeDefined(); // the seed's clock and reading
  });
});

describe('COMPONENT — <ContextView recorder> moves the Time band from the first stop', () => {
  it('stop 1 draws the window not filled; stop 2 the filled, dispatched call', () => {
    render(<ContextView runner={resumed.runner as never} recorder={resumed.recorder} />);
    expect(screen.getByTestId('context-view')).toHaveAttribute('data-step', '0');
    expect(screen.getByTestId('time-call')).toHaveAttribute('data-how', 'not-filled');
    expect(screen.queryByTestId('time-dispatched-at')).toBeNull();
    fireEvent.click(screen.getByLabelText('Next step'));
    expect(screen.getByTestId('time-call')).toHaveAttribute('data-how', 'filled');
    expect(screen.getByTestId('time-dispatched-at')).toBeInTheDocument();
  });
});
