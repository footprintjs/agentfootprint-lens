/**
 * Reading `present` calls out of history + the placeholder copy.
 *
 * The laws pinned here: the walkers branch on the TYPED shapes history keeps
 * (`presented: true` on the tool result; the `artifacts.presented` event) —
 * never a regex over prose; malformed shapes are skipped, not invented; and
 * the placeholder line is built from the speak-time snapshot ALONE, because
 * an expired artifact can no longer be described by the store.
 */
import { describe, expect, it } from 'vitest';
import {
  artifactPlaceholder,
  describePresented,
  presentedFromEvents,
  readPresentedResult,
} from './presented.js';

const RESULT = {
  presented: true as const,
  ref: 'art_h7Kq2v',
  as: 'bar-chart',
  snapshot: {
    kind: 'chart/spec',
    mediaType: 'application/json',
    bytes: 41984,
    label: 'Q3 sales by region',
  },
};

describe('readPresentedResult — the transcript walk', () => {
  it('reads the tool-result JSON string exactly as history stores it', () => {
    expect(readPresentedResult(JSON.stringify(RESULT))).toEqual({
      ref: 'art_h7Kq2v',
      as: 'bar-chart',
      snapshot: RESULT.snapshot,
    });
  });

  it('reads an already-parsed object, keeping toolCallId when it rides along', () => {
    expect(readPresentedResult({ ...RESULT, toolCallId: 't1' })).toEqual({
      ref: RESULT.ref,
      as: RESULT.as,
      snapshot: RESULT.snapshot,
      toolCallId: 't1',
    });
  });

  it('answers undefined for everything that is not a present result', () => {
    expect(readPresentedResult('stored art_h7Kq2v [chart/spec · 41984 bytes]')).toBeUndefined();
    expect(readPresentedResult('{"weather":"sunny"}')).toBeUndefined();
    expect(readPresentedResult({ ...RESULT, presented: false })).toBeUndefined();
    expect(readPresentedResult(null)).toBeUndefined();
    expect(readPresentedResult(42)).toBeUndefined();
  });

  it('skips a presented:true shape whose snapshot is malformed — never invents one', () => {
    expect(
      readPresentedResult({ presented: true, ref: 'art_x', as: 'table', snapshot: { kind: 'k' } }),
    ).toBeUndefined();
    expect(readPresentedResult({ presented: true, ref: 'art_x', as: 'table' })).toBeUndefined();
  });
});

describe('presentedFromEvents — the recording walk', () => {
  const presentedEvent = {
    type: 'agentfootprint.artifacts.presented',
    payload: { ...RESULT, presented: undefined, toolCallId: 't1', iteration: 2 },
  };

  it('collects presented calls from raw events AND LensRecorder entries, skipping holes and foreign shapes', () => {
    const events = [
      null,
      { type: 'agentfootprint.cost.tick', payload: {} },
      presentedEvent, // a Recording.events row
      { seq: 9, event: presentedEvent }, // a LensRecorder EventLogEntry row
      { type: 'agentfootprint.artifacts.presented', payload: { ref: 'art_bad' } }, // malformed → skipped
      'not an event',
    ];
    const found = presentedFromEvents(events);
    expect(found).toHaveLength(2);
    expect(found[0]).toEqual({
      ref: RESULT.ref,
      as: RESULT.as,
      snapshot: RESULT.snapshot,
      toolCallId: 't1',
      iteration: 2,
    });
    expect(found[1]!.ref).toBe(RESULT.ref);
  });

  it('answers [] for an absent or empty log', () => {
    expect(presentedFromEvents(undefined)).toEqual([]);
    expect(presentedFromEvents(null)).toEqual([]);
    expect(presentedFromEvents([])).toEqual([]);
  });
});

describe('the placeholder — built from the snapshot alone', () => {
  const call = readPresentedResult(RESULT)!;

  it('renders the canonical stated absence', () => {
    expect(artifactPlaceholder(call)).toBe(
      'Chart — "Q3 sales by region" (bar-chart, 41.0 KB) — expired; re-run to regenerate.',
    );
  });

  it('names the ref when the snapshot carried no label — a fact, never an invented title', () => {
    const unlabeled = {
      ...call,
      snapshot: { kind: 'dataset/rows', mediaType: 'text/csv', bytes: 512 },
      as: 'table',
    };
    expect(describePresented(unlabeled)).toBe('Dataset — art_h7Kq2v (table, 512 bytes)');
  });

  it('falls back to the Artifact noun for a kind with no family segment', () => {
    const odd = { ...call, snapshot: { ...call.snapshot, kind: '' } };
    expect(artifactPlaceholder(odd)).toContain('Artifact — "Q3 sales by region"');
  });
});
