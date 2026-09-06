/**
 * THE ZERO-BEHAVIOUR-CHANGE PROOF for routing the Why Lens's cursor movement
 * through footprintjs 9.17's `timeTravel()` port.
 *
 * The claim under test is not "the port works" — footprintjs tests that. It is
 * that SWAPPING THE ARITHMETIC CHANGED NOTHING: for a real recorded run, on
 * BOTH axes, any sequence of moves lands the cursor on exactly the same stop
 * whether it was walked by the step arithmetic the lens shipped or by the
 * library's cursor. Both are driven here, side by side, and compared at EVERY
 * step by the two units that matter to a panel — `runtimeStageId` and
 * `commitIdx`.
 *
 * `oldArithmetic` below is the shipped code, copied verbatim from where it
 * lived: `Math.min(max, Math.max(0, focusSeq + delta))` (`<TimeTravel>`'s step
 * buttons), `onFocusChange(0)` / `onFocusChange(max)` (Home / End), and
 * `jumpToRuntimeStageId`'s exact-then-`#`-stripped find (`Lens.tsx`). It is
 * kept HERE, in the test, and nowhere else — the shipped paths call the port
 * now, so a second live copy would be the drift this port exists to end.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { Agent, defineTool } from 'agentfootprint';
import { mock } from 'agentfootprint/providers';

import { LensRecorder } from '../LensRecorder.js';
import { observeRecording, type Recording } from '../observeRecording.js';
import { scrubAxisFor } from '../group/scrubAxisFor.js';
import type { CursorPosition } from '../group/cursorPositionsAtDrill.js';
import { openLensCursor } from './lensCursorPort.js';
import { lensStopsStrategy } from './lensStops.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');

async function runRealAgent(): Promise<LensRecorder> {
  const echo = defineTool({
    name: 'echo',
    description: 'echo',
    inputSchema: { type: 'object', properties: { m: { type: 'string' } } },
    execute: async ({ m }: { m: string }) => `echoed ${m}`,
  });
  const agent = Agent.create({
    provider: mock({
      replies: [{ toolCalls: [{ id: 'c1', name: 'echo', args: { m: 'a' } }] }, { content: 'done' }],
    }),
    model: 'mock',
    maxIterations: 4,
    reactMode: 'dynamic',
  })
    .system('be terse')
    .tool(echo)
    .build();
  const recorder = new LensRecorder();
  recorder.observe(agent as never);
  await agent.run({ message: 'go' });
  return recorder;
}

// ── The shipped arithmetic, preserved for the comparison ───────────────────

type Op =
  | { readonly kind: 'prev' }
  | { readonly kind: 'next' }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' }
  | { readonly kind: 'step'; readonly to: number }
  | { readonly kind: 'address'; readonly id: string };

function oldArithmetic(positions: readonly CursorPosition[], from: number, op: Op): number {
  const max = Math.max(0, Math.max(1, positions.length) - 1);
  switch (op.kind) {
    case 'prev':
      return Math.min(max, Math.max(0, from - 1));
    case 'next':
      return Math.min(max, Math.max(0, from + 1));
    case 'first':
      return 0;
    case 'last':
      return max;
    case 'step':
      // `<TimeTravel>`'s jumps (strip tick, band, drag track) hand the funnel a
      // step that is on the axis by construction.
      return op.to;
    case 'address': {
      const exact = positions.findIndex((p) => p.runtimeStageId === op.id);
      if (exact >= 0) return exact;
      const stagePart = op.id.split('#')[0];
      const byStage = positions.findIndex((p) => p.runtimeStageId.split('#')[0] === stagePart);
      return byStage >= 0 ? byStage : from; // a miss never moved
    }
  }
}

function throughPort(
  port: ReturnType<typeof openLensCursor>,
  from: number,
  op: Op,
): number {
  switch (op.kind) {
    case 'prev':
      return port.prev(from).step;
    case 'next':
      return port.next(from).step;
    case 'first':
      return port.first(from).step;
    case 'last':
      return port.last(from).step;
    case 'step':
      return port.toStep(from, op.to).step;
    case 'address': {
      const to = port.toAddress(from, op.id);
      return to.ok && to.step !== undefined ? to.step : from;
    }
  }
}

/** Where a step is, in the only two units a panel reads. */
function placeOf(positions: readonly CursorPosition[], step: number): string {
  const p = positions[step];
  return `${step}|${p?.runtimeStageId ?? ''}|${p?.commitIdx ?? -1}`;
}

/** A deterministic walk that touches every mover and both ends of the axis. */
function walkOf(positions: readonly CursorPosition[]): Op[] {
  const last = positions.length - 1;
  const ops: Op[] = [
    { kind: 'first' },
    { kind: 'prev' }, // clamp at the low end
    { kind: 'next' },
    { kind: 'next' },
    { kind: 'prev' },
    { kind: 'last' },
    { kind: 'next' }, // clamp at the high end
    { kind: 'last' }, // already there
    { kind: 'first' },
  ];
  for (let i = 0; i <= last; i += 1) ops.push({ kind: 'step', to: i });
  for (const p of positions) ops.push({ kind: 'address', id: p.runtimeStageId });
  // Addresses the axis does NOT hold: a different iteration of a real stage,
  // and a stage that never ran.
  if (positions[1]) ops.push({ kind: 'address', id: `${positions[1].runtimeStageId.split('#')[0]}#999` });
  ops.push({ kind: 'address', id: 'no-such-stage#3' });
  ops.push({ kind: 'next' }, { kind: 'prev' }, { kind: 'first' }, { kind: 'last' });
  return ops;
}

describe('the port lands where the shipped arithmetic landed', () => {
  it.each(['step', 'group'] as const)(
    'every move over a real run agrees, step for step (granularity=%s)',
    async (granularity) => {
      const recorder = await runRealAgent();
      const positions = scrubAxisFor(recorder, granularity);
      expect(positions.length).toBeGreaterThan(5); // a real axis, not a stub

      const port = openLensCursor(positions);
      let oldStep = 0;
      let portStep = 0;
      const seen: string[] = [];

      for (const op of walkOf(positions)) {
        oldStep = oldArithmetic(positions, oldStep, op);
        portStep = throughPort(port, portStep, op);
        // Compared at EVERY step, in the units a panel reads — not just at the
        // end, so a divergence cannot cancel itself out along the way.
        expect(placeOf(positions, portStep)).toBe(placeOf(positions, oldStep));
        seen.push(placeOf(positions, portStep));
      }

      // The walk really did move (a proof that agrees on "never moved" is no
      // proof at all).
      expect(new Set(seen).size).toBeGreaterThan(3);
    },
  );

  it('the two cursors stay together when the ONE cursor is driven at random', async () => {
    const recorder = await runRealAgent();
    const positions = scrubAxisFor(recorder, 'group');
    const port = openLensCursor(positions);

    // A deterministic pseudo-random walk — same sequence every run, no seed
    // library, and long enough to interleave the movers in orders the scripted
    // walk above never produces.
    let seed = 20260906;
    const rand = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const kinds: Op['kind'][] = ['prev', 'next', 'first', 'last', 'step', 'address'];
    let oldStep = 0;
    let portStep = 0;
    for (let i = 0; i < 500; i += 1) {
      const kind = kinds[rand(kinds.length)]!;
      const op: Op =
        kind === 'step'
          ? { kind: 'step', to: rand(positions.length) }
          : kind === 'address'
            ? { kind: 'address', id: positions[rand(positions.length)]!.runtimeStageId }
            : ({ kind } as Op);
      oldStep = oldArithmetic(positions, oldStep, op);
      portStep = throughPort(port, portStep, op);
      expect(placeOf(positions, portStep)).toBe(placeOf(positions, oldStep));
    }
  });
});

describe('clamped and miss, exactly as today', () => {
  it('first at the first stop, next at the last: no move, and the cursor is still there', async () => {
    const recorder = await runRealAgent();
    const positions = scrubAxisFor(recorder, 'step');
    const port = openLensCursor(positions);
    const last = positions.length - 1;

    const atFirst = port.first(0);
    expect(atFirst).toEqual({ step: 0, moved: false, reason: 'clamped', clamped: false });
    expect(port.prev(0).step).toBe(0);

    const atLast = port.next(last);
    expect(atLast).toEqual({ step: last, moved: false, reason: 'clamped', clamped: false });
    expect(port.last(last).step).toBe(last);
  });

  it('a jump to an unknown address does NOT move, and offers the nearest stop', async () => {
    const recorder = await runRealAgent();
    const positions = scrubAxisFor(recorder, 'group');
    const port = openLensCursor(positions);

    const miss = port.toAddress(2, 'never-ran-anywhere#4');
    expect(miss.ok).toBe(false);
    expect(miss.reason).toBe('miss');
    // The offer is DATA. Nothing in the lens takes it — the cursor stays at 2,
    // which is why `toAddress` reports no step at all on a miss.
    expect(miss.step).toBeUndefined();
    if (miss.nearest) expect(positions[miss.nearest.step]?.runtimeStageId).toBe(miss.nearest.runtimeStageId);
  });

  it('a step OUTSIDE the axis names the end it hit instead of landing off it', async () => {
    const recorder = await runRealAgent();
    const positions = scrubAxisFor(recorder, 'step');
    const port = openLensCursor(positions);
    const last = positions.length - 1;

    const past = port.toStep(1, 9999);
    expect(past).toEqual({ step: last, moved: true, clamped: true });
    const below = port.toStep(1, -4);
    expect(below).toEqual({ step: 0, moved: true, clamped: true });
    // Already there is not a move — and not a clamp either. The port still
    // names its reason ('clamped' is its word for "that is where you are"),
    // and the funnel still applies the unchanged step, which is what keeps
    // "follow live" re-deriving at the end of the axis.
    expect(port.toStep(1, 1)).toEqual({ step: 1, moved: false, reason: 'clamped', clamped: false });
  });

  it('an EMPTY axis refuses everything and leaves the cursor where it was', () => {
    const port = openLensCursor([]);
    expect(port.stops).toHaveLength(0);
    expect(port.first(0)).toEqual({ step: 0, moved: false, reason: 'empty', clamped: false });
    expect(port.next(0)).toEqual({ step: 0, moved: false, reason: 'empty', clamped: false });
    expect(port.toAddress(0, 'anything#1')).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('the stops themselves are untouched', () => {
  it('one stop per position, same ids, same labels, same order, same commit anchors', async () => {
    const recorder = await runRealAgent();
    for (const granularity of ['step', 'group'] as const) {
      const positions = scrubAxisFor(recorder, granularity);
      const stops = lensStopsStrategy(positions).stopsFor([], undefined);
      expect(stops.map((s) => s.runtimeStageId)).toEqual(positions.map((p) => p.runtimeStageId));
      expect(stops.map((s) => s.label)).toEqual(positions.map((p) => p.label));
      expect(stops.map((s) => s.commitIdx)).toEqual(positions.map((p) => p.commitIdx));
      expect(stops.map((s) => s.step)).toEqual(positions.map((_, i) => i));
    }
  });

  it('what `Stop` cannot carry survives in the side map, not in the stop', async () => {
    const recorder = await runRealAgent();
    const positions = scrubAxisFor(recorder, 'group');
    const port = openLensCursor(positions);
    for (let i = 0; i < positions.length; i += 1) {
      // The panels read the POSITION, and it is the same object it always was.
      expect(port.positionAt(i)).toBe(positions[i]);
    }
    expect(port.positionAt(positions.length)).toBeUndefined();
  });
});

describe('a JSON round-tripped recording drives the port', () => {
  it('the axis, the stops and every move survive JSON.parse(JSON.stringify(recording))', () => {
    const raw = JSON.parse(readFileSync(join(FIXTURES, 'recorded-turn.json'), 'utf8')) as Recording;
    const roundTripped = JSON.parse(JSON.stringify(raw)) as Recording;

    const live = scrubAxisFor(observeRecording(raw).recorder, 'group');
    const replayed = scrubAxisFor(observeRecording(roundTripped).recorder, 'group');
    expect(replayed.length).toBeGreaterThan(2);
    expect(replayed.map((p) => `${p.runtimeStageId}|${p.commitIdx}|${p.label}`)).toEqual(
      live.map((p) => `${p.runtimeStageId}|${p.commitIdx}|${p.label}`),
    );

    // And the port over the round-tripped axis moves the same way. The axis is
    // the whole source of movement — the port reads no log — so a stored trace
    // drives it exactly as a live one does.
    const port = openLensCursor(replayed);
    let oldStep = 0;
    let portStep = 0;
    for (const op of walkOf(replayed)) {
      oldStep = oldArithmetic(replayed, oldStep, op);
      portStep = throughPort(port, portStep, op);
      expect(placeOf(replayed, portStep)).toBe(placeOf(replayed, oldStep));
    }
  });
});

describe('a cursor that is NOT on the axis is seated before it is asked', () => {
  // The axis shrinks as well as grows — a granularity flip on a long run, a
  // drill into a small group — so a step remembered from a longer axis can
  // arrive here as a `from` that is not a position. Whatever else happens, the
  // port may never hand such a step back: `LensStopMove.step` is what the
  // funnel applies and what `positionAt` is then asked about.

  it('every mover answers with a step this axis really holds', async () => {
    const recorder = await runRealAgent();
    const positions = scrubAxisFor(recorder, 'step');
    const port = openLensCursor(positions);
    const last = positions.length - 1;
    const offAxis = [last + 6, -3, 2.7, Number.NaN, Number.POSITIVE_INFINITY];

    for (const from of offAxis) {
      const answers = [
        port.first(from),
        port.last(from),
        port.prev(from),
        port.next(from),
        port.toStep(from, 1),
        port.toStep(from, 9999),
        port.toStep(from, Number.NaN),
      ];
      for (const to of answers) {
        expect(Number.isInteger(to.step)).toBe(true);
        expect(to.step).toBeGreaterThanOrEqual(0);
        expect(to.step).toBeLessThanOrEqual(last);
        // The step is a position, which is the whole point of seating it.
        expect(port.positionAt(to.step)).toBeDefined();
      }
      // An ADDRESS the axis holds is still `ok` — with the step that holds it,
      // never the caller's off-axis `from` dressed up as a hit.
      const hit = port.toAddress(from, positions[1]!.runtimeStageId);
      expect(hit).toEqual({ ok: true, step: 1 });
      // One it does not hold refuses, and offers rather than moves.
      const missed = port.toAddress(from, 'no-such-stage-anywhere#3');
      expect(missed.ok).toBe(false);
      expect(missed.step).toBeUndefined();
    }
  });

  it('the ABSOLUTE movers land exactly where the shipped arithmetic landed', async () => {
    const recorder = await runRealAgent();
    const positions = scrubAxisFor(recorder, 'group');
    const port = openLensCursor(positions);
    const last = positions.length - 1;

    for (const from of [last + 6, -3, 2.7, Number.NaN]) {
      for (const op of [
        { kind: 'first' } as const,
        { kind: 'last' } as const,
        { kind: 'step', to: 1 } as const,
        { kind: 'address', id: positions[2]!.runtimeStageId } as const,
      ]) {
        expect(throughPort(port, from, op)).toBe(oldArithmetic(positions, from, op));
      }
    }
  });

  it('the ONE place the two readings differ is a RELATIVE move from off the axis', async () => {
    const recorder = await runRealAgent();
    const positions = scrubAxisFor(recorder, 'group');
    const port = openLensCursor(positions);
    const last = positions.length - 1;

    // Pinned, not tolerated. The shipped arithmetic clamped the RESULT
    // (`Math.min(max, Math.max(0, from - 1))`), so a ◀ from past the end landed
    // ON the end. The port seats the cursor on the axis first — that seat IS
    // where the cursor is — and then moves one back from it.
    expect(oldArithmetic(positions, last + 6, { kind: 'prev' })).toBe(last);
    expect(port.prev(last + 6).step).toBe(last - 1);
    expect(oldArithmetic(positions, -3, { kind: 'next' })).toBe(0);
    expect(port.next(-3).step).toBe(1);

    // …and it is unreachable from `<Lens>`, because the funnel never presents
    // an off-axis `from`: `useLensCursor` snaps the cursor onto the axis (see
    // `useLensCursor.port.test.tsx`, "the axis shrinks under the cursor").
    // Every IN-RANGE start agrees, which is what the walk above proves.
    for (let from = 0; from <= last; from += 1) {
      expect(port.prev(from).step).toBe(oldArithmetic(positions, from, { kind: 'prev' }));
      expect(port.next(from).step).toBe(oldArithmetic(positions, from, { kind: 'next' }));
    }
  });
});
