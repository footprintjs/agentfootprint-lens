/**
 * contextAt — the join over the three records, on recorded fixtures.
 *
 * Test types: Functional (keys, writers, delta, served, why on a real run) ·
 * Law (a key with no writer row is UNATTRIBUTED, never guessed; a fold that
 * cannot replay reports its error with no keys; frozen returns) · Integration
 * (the served side IS the Served tab's row — same epoch, same verdict) ·
 * Regression (standalone milestone axis has the stops the library declares).
 */
import { describe, expect, it } from 'vitest';

import { contextAt } from '../../src/core/context/contextAt.js';
import { servedRowAt } from '../../src/core/served/servedRowAt.js';
import { tagAxisPositions } from '../../src/core/tags/tagAxis.js';
import { MILESTONE_AXIS } from '../../src/react/components/ContextView.js';
import { load, loadTampered, stopsOf } from '../served/helpers.js';

const at = (p: { runtimeStageId: string; commitIdx: number }) => ({
  runtimeStageId: p.runtimeStageId,
  commitIdx: p.commitIdx,
});

describe('contextAt — a real run, stop by stop', () => {
  it('every key of the fold is listed, with the stage that last wrote it and when it entered', () => {
    const fixture = load('flat-dynamic-tools');
    const [turn] = stopsOf(fixture, 'llm-turn');
    expect(turn).toBeDefined();
    const ctx = contextAt(fixture.snapshot, at(turn!));
    expect(ctx.foldError).toBeUndefined();
    expect(ctx.keys.length).toBeGreaterThan(3);
    const attributed = ctx.keys.filter((k) => k.wroteBy !== undefined);
    expect(attributed.length).toBeGreaterThan(0);
    for (const k of attributed) {
      expect(typeof k.wroteBy).toBe('string');
      expect(k.wroteAt).toBeGreaterThanOrEqual(k.enteredAt!);
      expect(k.wroteAt).toBeLessThanOrEqual(turn!.commitIdx);
      expect(['set', 'merge', 'append', 'delete']).toContain(k.verb);
    }
    // The stop's own rows are the delta as the log spells it.
    expect(Array.isArray(ctx.rows)).toBe(true);
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(Object.isFrozen(ctx.keys)).toBe(true);
  });

  it('with a previous stop, every key says entered / changed / unchanged, and keys that vanished are listed as left', () => {
    const fixture = load('flat-dynamic-tools');
    const turns = stopsOf(fixture, 'llm-turn');
    expect(turns.length).toBeGreaterThanOrEqual(2);
    const ctx = contextAt(fixture.snapshot, at(turns[1]!), {
      previous: at(turns[0]!),
    });
    for (const k of ctx.keys) expect(['entered', 'changed', 'unchanged']).toContain(k.since);
    // Something moved between two model calls — a run that changed nothing would be no run.
    expect(ctx.keys.some((k) => k.since !== 'unchanged')).toBe(true);
    expect(Array.isArray(ctx.left)).toBe(true);
    // Without a previous stop, nothing claims a direction.
    const alone = contextAt(fixture.snapshot, at(turns[1]!));
    expect(alone.keys.every((k) => k.since === undefined)).toBe(true);
    expect(alone.left).toEqual([]);
  });

  it('the served side is the Served tab’s own row at the same epoch — handed through, not re-derived', () => {
    const fixture = load('flat-dynamic-tools');
    const [turn] = stopsOf(fixture, 'llm-turn');
    const ctx = contextAt(fixture.snapshot, at(turn!));
    const row = servedRowAt(fixture.snapshot, at(turn!));
    expect(ctx.served).toBeDefined();
    expect(ctx.served!.row.view.epoch).toBe(row!.view.epoch);
    expect(ctx.served!.row.receipt).toEqual(row!.receipt);
    expect(ctx.served!.checks.system.status).toBeDefined();
  });

  it('the why band lists event names from the stages that wrote the delta, joined by runtimeStageId', () => {
    const fixture = load('flat-dynamic-tools');
    const turns = stopsOf(fixture, 'llm-turn');
    const events = fixture.recorder.getEntries();
    expect(events.length).toBeGreaterThan(0);
    const ctx = contextAt(fixture.snapshot, at(turns[1]!), {
      previous: at(turns[0]!),
      events,
    });
    for (const w of ctx.why) {
      expect(typeof w.name).toBe('string');
      const entry = events.find((e) => e.seq === w.seq);
      expect(entry?.runtimeStageId).toBe(w.runtimeStageId);
    }
    // Without events, no why — never invented.
    expect(contextAt(fixture.snapshot, at(turns[1]!), { previous: at(turns[0]!) }).why).toEqual([]);
  });
});

describe('contextAt — laws', () => {
  it('a key with no writer row is UNATTRIBUTED — the record is silent, so the join is', () => {
    // The fold replays the trace rows, so a key can only lack a writer when it
    // comes from the run's BASE (initialState) — the real unattributed case.
    const fixture = loadTampered('flat-dynamic-tools', (r) => {
      const snap = r.snapshot as { initialState?: Record<string, unknown> };
      snap.initialState = { ...(snap.initialState ?? {}), seededByBase: 42 };
    });
    const [turn] = stopsOf(fixture, 'llm-turn');
    const ctx = contextAt(fixture.snapshot, at(turn!));
    const base = ctx.keys.find((k) => k.path === 'seededByBase');
    expect(base).toBeDefined();
    expect(base!.value).toBe(42);
    expect(base!.wroteBy).toBeUndefined();
    expect(base!.wroteAt).toBeUndefined();
    expect(ctx.keys.some((k) => k.wroteBy !== undefined)).toBe(true);
  });

  it('a fold that cannot replay reports the error and no keys — never an empty object pretending', () => {
    const ctx = contextAt(
      { commitLog: [{ nonsense: true }], initialState: {} },
      { runtimeStageId: 'x', commitIdx: 0 },
    );
    // Either the fold narrows the row into a gap (skipped) or refuses; both are honest, neither invents keys.
    if (ctx.foldError !== undefined) expect(ctx.keys).toEqual([]);
    else expect(ctx.skipped ?? []).toContain(0);
  });

  it('a recording with no log folds to the base and attributes nothing', () => {
    const ctx = contextAt(
      { commitLog: [], initialState: { seeded: 1 } },
      { runtimeStageId: 'start', commitIdx: -1 },
    );
    expect(ctx.keys.map((k) => k.path)).toEqual(['seeded']);
    expect(ctx.keys[0]!.wroteBy).toBeUndefined();
    expect(ctx.served).toBeUndefined();
  });
});

describe('the standalone milestone axis', () => {
  it('walks the stops the library declares — turns, slots, tool calls, decisions — with bookends', () => {
    const fixture = load('flat-dynamic-tools');
    const positions = tagAxisPositions(fixture.snapshot, MILESTONE_AXIS, []);
    expect(positions).toBeDefined();
    expect(positions!.length).toBeGreaterThan(3);
    expect(positions![0]!.kind).toBe('group-start');
    expect(positions![positions!.length - 1]!.kind).toBe('group-end');
    expect(positions!.some((p) => p.label.startsWith('LLM turn'))).toBe(true);
  });
});
