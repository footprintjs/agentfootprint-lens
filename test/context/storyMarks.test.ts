/**
 * `storyMarks` — the story's beats joined to the ledger, as the chips a host
 * hands the AgentThinkingUI player (0.67.0), on hand-built traces and records
 * and on the recorded `story-marks` fixture (agentfootprint 9.111.0, generated
 * alone: both doors armed, an `agentThinkingTrace()` recorder watching, three
 * calls — c1 exploratory with a proposition and `predicts`, later `noise`; c2
 * direct, expect high, `fact` + `sought` on the answer; c3 never named — and a
 * JSON answer quoting a value only c1 carried and a value nothing carried).
 *
 * Test types: Unit (every chip per beat on the fixture at the run's end, in
 * order, with tones and titles; the proposition clipped with the whole in the
 * title; the answer chip's counts; the same fold from `contextAt(...).keys`)
 * · Law (at the last llm-turn stop before the answer c1 is `noise` already,
 * c2 `undeclared`, the answer beat has no marks — the stop's own picture; a
 * trace with no `toolCallId` gets no marks on any beat — never a join by
 * name or order; an unarmed record gets none — zero-cost; a malformed row is
 * passed over; a beat the ledger never named is `undeclared`, never `open`)
 * · Determinism (the same input twice is deep-equal) · Contract (the label
 * set is exactly `STORY_MARK_LABELS`; every chip label on the fixture is a
 * label, a label with a count or a word off the record, or the model's own
 * words).
 */
import { describe, expect, it } from 'vitest';

import { contextAt } from '../../src/core/context/contextAt.js';
import { CLIP, LABELS, storyMarks, type StoryMark, type StoryTraceShape } from '../../src/react/components/storyMarks.js';
import { STORY_MARK_LABELS } from '../../src/context/index.js';
import { STORY_MARK_LABELS as ROOT_STORY_MARK_LABELS } from '../../src/react/index.js';
import { FIXTURES, load, stopsOf } from '../served/helpers.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Hand-built material ───────────────────────────────────────────────────

const LONG = 'the port is down because the optic on the far side was pulled during the window';

const trace: StoryTraceShape = {
  steps: [
    { kind: 'prompt' },
    { kind: 'ask', toolCallId: 'c1' },
    { kind: 'return', toolCallId: 'c1' },
    { kind: 'ask', toolCallId: 'c2' },
    { kind: 'return', toolCallId: 'c2' },
    { kind: 'ask', toolCallId: 'c3' },
    { kind: 'return', toolCallId: 'c3' },
    { kind: 'answer' },
  ],
};

const rows = [
  { kind: 'basis', toolCallId: 'c1', toolName: 'port_state', basis: 'exploratory', expect: 'low', proposition: LONG, predicts: 'state=down', iteration: 1 },
  { kind: 'basis', toolCallId: 'c2', toolName: 'zone_lookup', basis: 'direct', expect: 'high', iteration: 2 },
  { kind: 'standing', toolCallId: 'c1', standing: 'open', assertions: [], declaredOn: { toolCallId: 'c2' }, iteration: 2 },
  { kind: 'basis', toolCallId: 'c3', toolName: 'port_state', basis: 'exploratory', iteration: 3 },
  // The LAST standing row per result wins: c1 is `noise` now, not `open`.
  { kind: 'standing', toolCallId: 'c1', standing: 'noise', assertions: [], declaredOn: { toolCallId: 'c3' }, iteration: 3 },
  {
    kind: 'standing',
    toolCallId: 'c2',
    standing: 'fact',
    sought: true,
    assertions: [{ subject: { kind: 'port', id: 'fc2/9' }, predicate: 'zone', value: 'Z' }],
    declaredOn: 'answer',
    iteration: 4,
  },
  { kind: 'judgment', source: 'judge', toolCallId: 'c2', standing: 'open', confidence: 0.4 },
  { kind: 'contingent', declaredOn: 'answer', value: 'fc1/7', carriers: [{ toolCallId: 'c1', standing: 'noise' }], iteration: 4 },
];

const record = { findingsLedger: rows, unsupportedValues: { values: [{ value: 'fc9/9' }], posture: 'assist' } };

const labelsOf = (marks: readonly StoryMark[] | undefined): string[] | undefined => marks?.map((m) => m.label);
const tonesOf = (marks: readonly StoryMark[] | undefined): string[] | undefined => marks?.map((m) => m.tone);

describe('storyMarks on hand-built traces and records', () => {
  it('decorates every beat in order — basis chips before, the current standing after, the counts on the answer', () => {
    const marks = storyMarks(trace, record);
    expect(marks).toHaveLength(trace.steps.length);
    expect(marks[0]).toBeUndefined(); // prompt
    // c1 ask: exploratory → `hypothesis` (record's word in the title), expect low, the proposition clipped, predicts.
    expect(labelsOf(marks[1])).toEqual([LABELS.hypothesis, 'expect low', `${LONG.slice(0, CLIP - 1)}…`, `${LABELS.predicts} state=down`]);
    expect(tonesOf(marks[1])).toEqual(['muted', 'muted', 'neutral', 'neutral']);
    expect(marks[1]![0]!.title).toBe('exploratory');
    expect(marks[1]![2]!.label).toHaveLength(CLIP);
    expect(marks[1]![2]!.title).toBe(LONG);
    expect(marks[1]![3]!.title).toBe('state=down');
    // c1 return: the LAST standing row wins.
    expect(marks[2]).toEqual([{ label: 'noise', tone: 'warn' }]);
    // c2 ask: direct as the record spells it, expect high.
    expect(marks[3]).toEqual([
      { label: 'direct', tone: 'neutral' },
      { label: 'expect high', tone: 'good' },
    ]);
    // c2 return: fact, sought, the judge's word beside the model's.
    expect(marks[4]).toEqual([
      { label: 'fact', tone: 'good' },
      { label: 'sought', tone: 'muted' },
      { label: 'judged open', tone: 'muted' },
    ]);
    // c3 ask: a basis with nothing else declared.
    expect(marks[5]).toEqual([{ label: 'hypothesis', tone: 'muted', title: 'exploratory' }]);
    // c3 return: no standing row → undeclared, never open.
    expect(marks[6]).toEqual([{ label: 'undeclared', tone: 'muted' }]);
    // answer: only the non-zero buckets, in order; then contingent, then unsupported.
    expect(marks[7]).toEqual([
      { label: 'stood on 1 · noise 1', tone: 'good' },
      { label: 'contingent 1', tone: 'warn' },
      { label: 'unsupported 1', tone: 'bad' },
    ]);
  });

  it('reads the record from `contextAt(...).keys` rows the same as from the object form', () => {
    const asKeys = [
      { path: 'history', value: [] },
      { path: 'findingsLedger', value: rows },
      { path: 'unsupportedValues', value: record.unsupportedValues },
    ];
    expect(storyMarks(trace, asKeys)).toEqual(storyMarks(trace, record));
  });

  it('a beat with no toolCallId gets no marks — never a join by tool name or order', () => {
    const bare: StoryTraceShape = { steps: trace.steps.map((s) => ({ kind: s.kind })) };
    const marks = storyMarks(bare, record);
    expect(marks).toHaveLength(bare.steps.length);
    // The answer beat never carries a toolCallId and keeps its marks; every other beat is bare.
    expect(marks.slice(0, 7).every((m) => m === undefined)).toBe(true);
    expect(labelsOf(marks[7])).toEqual(['stood on 1 · noise 1', 'contingent 1', 'unsupported 1']);
  });

  it('an unarmed record (no ledger) gets no marks on any beat — zero-cost', () => {
    for (const unarmed of [{}, { findingsLedger: undefined }, { findingsLedger: [] }, { unsupportedValues: record.unsupportedValues }, []]) {
      const marks = storyMarks(trace, unarmed as never);
      expect(marks).toHaveLength(trace.steps.length);
      expect(marks.every((m) => m === undefined)).toBe(true);
    }
  });

  it('a ledger with rows but no standing on a result reads `undeclared`; the answer beat waits for the record to name the answer', () => {
    const early = { findingsLedger: [rows[0]] };
    const marks = storyMarks(trace, early);
    expect(labelsOf(marks[1])).toEqual([LABELS.hypothesis, 'expect low', `${LONG.slice(0, CLIP - 1)}…`, `${LABELS.predicts} state=down`]);
    expect(marks[2]).toEqual([{ label: 'undeclared', tone: 'muted' }]);
    // No basis row for c2 yet → its ask has no marks; its return is undeclared.
    expect(marks[3]).toBeUndefined();
    expect(marks[4]).toEqual([{ label: 'undeclared', tone: 'muted' }]);
    expect(marks[7]).toBeUndefined();
  });

  it('the answer beat: buckets only when non-zero; `unsupported` alone when only the gate wrote', () => {
    const onlyGate = { findingsLedger: [rows[0]], unsupportedValues: { values: [{ value: 'x' }, { value: 'y' }] } };
    expect(storyMarks(trace, onlyGate)[7]).toEqual([{ label: 'unsupported 2', tone: 'bad' }]);
    const emptyGate = { findingsLedger: [rows[0], rows[5]], unsupportedValues: { values: [] } };
    expect(storyMarks(trace, emptyGate)[7]).toEqual([{ label: 'stood on 1', tone: 'good' }]);
    const noFact = { findingsLedger: [rows[0], rows[2]], unsupportedValues: { values: [] } };
    expect(storyMarks(trace, noFact)[7]).toEqual([{ label: 'open 1', tone: 'neutral' }]);
  });

  it('a malformed row is passed over, never drawn', () => {
    const malformed = {
      findingsLedger: [
        rows[0],
        { kind: 'standing', toolCallId: 'c1' }, // no standing word
        { kind: 'standing', standing: 'fact' }, // no toolCallId
        { kind: 'basis', toolCallId: 'c2' }, // no basis word
        { kind: 'judgment', source: 'model', toolCallId: 'c1', standing: 'fact' }, // not the judge
        'not a row',
        null,
      ],
    };
    const marks = storyMarks(trace, malformed);
    expect(marks[2]).toEqual([{ label: 'undeclared', tone: 'muted' }]);
    expect(marks[3]).toBeUndefined();
    expect(marks[4]).toEqual([{ label: 'undeclared', tone: 'muted' }]);
  });

  it('expect tones: high good · medium neutral · low muted', () => {
    for (const [expect_, tone] of [
      ['high', 'good'],
      ['medium', 'neutral'],
      ['low', 'muted'],
    ] as const) {
      const one = { findingsLedger: [{ kind: 'basis', toolCallId: 'c1', basis: 'direct', expect: expect_ }] };
      expect(storyMarks(trace, one)[1]).toEqual([
        { label: 'direct', tone: 'neutral' },
        { label: `expect ${expect_}`, tone },
      ]);
    }
  });

  it('standing tones: fact good · open neutral · noise warn · ruled-out bad', () => {
    for (const [standing, tone] of [
      ['fact', 'good'],
      ['open', 'neutral'],
      ['noise', 'warn'],
      ['ruled-out', 'bad'],
    ] as const) {
      const one = { findingsLedger: [{ kind: 'standing', toolCallId: 'c1', standing, assertions: [] }] };
      expect(storyMarks(trace, one)[2]).toEqual([{ label: standing, tone }]);
    }
  });

  it('is deterministic: the same input twice is deep-equal, and the marks are frozen', () => {
    const a = storyMarks(trace, record);
    const b = storyMarks(trace, record);
    expect(a).toEqual(b);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a[1])).toBe(true);
    expect(Object.isFrozen(a[1]![0])).toBe(true);
  });

  it('the label set is exactly STORY_MARK_LABELS, on both barrels', () => {
    expect(STORY_MARK_LABELS).toBe(LABELS);
    expect(ROOT_STORY_MARK_LABELS).toBe(LABELS);
    expect(Object.values(LABELS)).toEqual([
      'direct',
      'hypothesis',
      'expect',
      'predicts:',
      'fact',
      'open',
      'noise',
      'ruled-out',
      'undeclared',
      'sought',
      'judged',
      'stood on',
      'contingent',
      'unsupported',
    ]);
  });
});

// ─── The recorded fixture ──────────────────────────────────────────────────

const PROPOSITION = 'the port fc1/7 is down because the optic on the far side was pulled during the window';
const PREDICTS = 'state=down on fc1/7';

interface Beat {
  readonly kind: string;
  readonly toolCallId?: string;
}

/** The player's trace the fixture carries beside the recording (its fourth key). */
function traceOf(): { steps: readonly Beat[] } {
  const file = JSON.parse(readFileSync(join(FIXTURES, 'story-marks.json'), 'utf8')) as { trace?: { steps: Beat[] } };
  if (file.trace === undefined) throw new Error('story-marks.json carries no trace');
  return file.trace;
}

/** The record's keys at one grouped-axis step — the test's oracle, never a hand-written copy. */
function keysAt(fixture: ReturnType<typeof load>, step: number) {
  const stop = fixture.positions[step]!;
  return contextAt(fixture.snapshot, { runtimeStageId: stop.runtimeStageId, commitIdx: stop.commitIdx }, {}).keys;
}

describe('storyMarks on the story-marks fixture (agentfootprint 9.111.0, generated alone)', () => {
  const fixture = load('story-marks');
  const story = traceOf();

  it('the fixture is the shape the arm promised: eight beats, every ask/return stamped with its toolCallId', () => {
    expect(story.steps.map((s) => s.kind)).toEqual(['prompt', 'ask', 'return', 'ask', 'return', 'ask', 'return', 'answer']);
    expect(story.steps.map((s) => s.toolCallId)).toEqual([undefined, 'c1', 'c1', 'c2', 'c2', 'c3', 'c3', undefined]);
  });

  it("at the run's end: every chip per beat, in order, with tones and titles", () => {
    const end = fixture.positions.length - 1;
    const marks = storyMarks(story, keysAt(fixture, end));
    expect(marks).toHaveLength(8);
    expect(marks[0]).toBeUndefined();
    expect(marks[1]).toEqual([
      { label: 'hypothesis', tone: 'muted', title: 'exploratory' },
      { label: `${PROPOSITION.slice(0, CLIP - 1)}…`, tone: 'neutral', title: PROPOSITION },
      { label: `predicts: ${PREDICTS}`, tone: 'neutral', title: PREDICTS },
    ]);
    expect(marks[1]![1]!.label).toHaveLength(CLIP);
    expect(marks[2]).toEqual([{ label: 'noise', tone: 'warn' }]);
    expect(marks[3]).toEqual([
      { label: 'direct', tone: 'neutral' },
      { label: 'expect high', tone: 'good' },
    ]);
    expect(marks[4]).toEqual([
      { label: 'fact', tone: 'good' },
      { label: 'sought', tone: 'muted' },
    ]);
    expect(marks[5]).toEqual([{ label: 'hypothesis', tone: 'muted', title: 'exploratory' }]);
    expect(marks[6]).toEqual([{ label: 'undeclared', tone: 'muted' }]);
    expect(marks[7]).toEqual([
      { label: 'stood on 1 · noise 1', tone: 'good' },
      { label: 'contingent 1', tone: 'warn' },
      { label: 'unsupported 1', tone: 'bad' },
    ]);
  });

  it("the object form of the run's end (`snapshot.sharedState`) folds the same as the keys", () => {
    const end = fixture.positions.length - 1;
    const state = (fixture.snapshot as { sharedState: { findingsLedger?: unknown; unsupportedValues?: unknown } }).sharedState;
    expect(storyMarks(story, state)).toEqual(storyMarks(story, keysAt(fixture, end)));
  });

  it('at the last llm-turn stop, before the answer: c1 `noise` already, c2 `undeclared`, no answer marks — the stop’s own picture', () => {
    const turns = stopsOf(fixture, 'llm-turn');
    expect(turns.length).toBe(4);
    const step = fixture.positions.indexOf(turns[turns.length - 1]!);
    const marks = storyMarks(story, keysAt(fixture, step));
    expect(marks[1]).toEqual(storyMarks(story, keysAt(fixture, fixture.positions.length - 1))[1]);
    expect(marks[2]).toEqual([{ label: 'noise', tone: 'warn' }]);
    expect(marks[3]).toEqual([
      { label: 'direct', tone: 'neutral' },
      { label: 'expect high', tone: 'good' },
    ]);
    expect(marks[4]).toEqual([{ label: 'undeclared', tone: 'muted' }]);
    expect(marks[6]).toEqual([{ label: 'undeclared', tone: 'muted' }]);
    expect(marks[7]).toBeUndefined();
  });

  it('at the first llm-turn stop, before any row: nothing on any beat', () => {
    const first = fixture.positions.indexOf(stopsOf(fixture, 'llm-turn')[0]!);
    expect(storyMarks(story, keysAt(fixture, first)).every((m) => m === undefined)).toBe(true);
  });

  it('the same trace on the unarmed `flat-dynamic-tools` record gets nothing on any beat', () => {
    const unarmed = load('flat-dynamic-tools');
    const marks = storyMarks(story, keysAt(unarmed, unarmed.positions.length - 1));
    expect(marks).toHaveLength(8);
    expect(marks.every((m) => m === undefined)).toBe(true);
  });

  it('is deterministic on the fixture: the same input twice is deep-equal', () => {
    const end = fixture.positions.length - 1;
    expect(storyMarks(story, keysAt(fixture, end))).toEqual(storyMarks(story, keysAt(fixture, end)));
  });

  it('every chip label on the fixture is a label, a label with a count or a record word, or the model’s own words', () => {
    const end = fixture.positions.length - 1;
    const labels = Object.values(LABELS);
    const own = new Set([`${PROPOSITION.slice(0, CLIP - 1)}…`]);
    /** A label alone, or a label followed by data (a count, a level, a standing word, the model's words). */
    const labelled = (text: string): boolean => labels.some((l) => text === l || text.startsWith(`${l} `));
    const counts = (text: string): boolean => text.split(' · ').every((part) => labels.some((l) => new RegExp(`^${l} \\d+$`).test(part)));
    for (const beat of storyMarks(story, keysAt(fixture, end))) {
      for (const m of beat ?? []) {
        const ok = own.has(m.label) || labelled(m.label) || counts(m.label);
        expect(ok, `"${m.label}" is not a label, a label + data, or the model's words`).toBe(true);
      }
    }
  });
});
