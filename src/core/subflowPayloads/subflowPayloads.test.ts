import { describe, expect, it } from 'vitest';
import { recordedTurn, withPayloadsMoved } from '../../../test/fixtures/payloadsWithInvocation.js';
import { isWithheld, payloadNotice, readPayloadMarks, ROW_ONLY_PAYLOADS, stepPayloadReader } from './index.js';

const row = (data: unknown[], name = 'BoundaryEvents') => ({ recorders: [{ name, data }] });
const moved = (type: string, runtimeStageId: string, extra: Record<string, unknown> = {}) => ({ type, runtimeStageId, ...extra, payloadWith: 'invocation' });

describe('readPayloadMarks — the base row says which payloads moved', () => {
  it('reads nothing from a recording whose payloads stay in the row', () => {
    expect(readPayloadMarks(recordedTurn().snapshot).size).toBe(0);
    expect(readPayloadMarks(undefined).size).toBe(0);
    expect(readPayloadMarks({ recorders: 'not rows' }).size).toBe(0);
  });

  it('marks every moved sub-flow payload of the moved recording, by invocation', () => {
    const { recording, moved: values } = withPayloadsMoved(recordedTurn());
    const marks = readPayloadMarks(recording.snapshot);
    expect(marks.size).toBe(25);
    for (const [id, sides] of values) expect(marks.get(id)).toEqual({ entry: 'entry' in sides, exit: 'exit' in sides });
  });

  it('counts only the exact mark on sub-flow entry and exit events without their own payload', () => {
    const marks = readPayloadMarks(row([
      moved('subflow.entry', 'a#1'), moved('subflow.exit', 'a#1'),
      moved('subflow.entry', 'b#2', { payload: { still: 'here' } }),
      moved('run.entry', '__root__#0'), moved('llm.start', 'c#3'),
      { type: 'subflow.exit', runtimeStageId: 'd#4', payloadWith: 'Invocation' },
      { type: 'subflow.exit', runtimeStageId: 'e#5', payloadWith: true },
      { type: 'subflow.entry', payloadWith: 'invocation' }, null, 'x',
    ]));
    expect([...marks]).toEqual([['a#1', { entry: true, exit: true }]]);
    expect(readPayloadMarks(row([moved('subflow.entry', 'a#1')], 'Other')).size).toBe(0);
  });
});

describe('stepPayloadReader — one reading of a boundary payload', () => {
  const marks = readPayloadMarks(row([moved('subflow.entry', 'sf#1'), moved('subflow.exit', 'sf#1'), moved('subflow.exit', 'slot#2')]));
  const step = { runtimeStageId: 'sf#1' };

  it('reads a payload in the row as recorded, mark or not, and nothing else as none', () => {
    expect(ROW_ONLY_PAYLOADS.read({ runtimeStageId: 'sf#1', entryPayload: { a: 1 } }, 'entry')).toEqual({ state: 'recorded', value: { a: 1 } });
    expect(ROW_ONLY_PAYLOADS.read(step, 'entry')).toEqual({ state: 'none' });
    expect(stepPayloadReader({ marks }).read({ runtimeStageId: 'sf#1', exitPayload: 0 }, 'exit')).toEqual({ state: 'recorded', value: 0 });
    expect(stepPayloadReader({ marks }).read({ runtimeStageId: 'other#9' }, 'exit')).toEqual({ state: 'none' });
    expect(stepPayloadReader({ marks }).read(undefined, 'exit')).toEqual({ state: 'none' });
  });

  it('says why a marked payload is not shown, through every load state', () => {
    const read = (load?: object, loadable = true) => stepPayloadReader({
      marks, loadable: new Set(loadable ? ['sf#1'] : []), ...(load && { loads: new Map([['sf#1', load as never]]) }),
    }).read(step, 'entry');
    expect(read(undefined, false)).toEqual({ state: 'not-loaded', invocation: 'sf#1', why: 'no-source' });
    expect(read()).toEqual({ state: 'not-loaded', invocation: 'sf#1', why: 'not-requested' });
    expect(read({ status: 'loading' })).toEqual({ state: 'not-loaded', invocation: 'sf#1', why: 'loading' });
    expect(read({ status: 'preparing' })).toEqual({ state: 'not-loaded', invocation: 'sf#1', why: 'loading' });
    expect(read({ status: 'error' })).toEqual({ state: 'not-loaded', invocation: 'sf#1', why: 'load-failed' });
    expect(read({ status: 'ready', payloads: null })).toEqual({ state: 'not-loaded', invocation: 'sf#1', why: 'not-sent' });
    expect(read({ status: 'ready', payloads: { exit: { status: 'ready', value: 1 } } })).toEqual({ state: 'not-loaded', invocation: 'sf#1', why: 'not-sent' });
    expect(read({ status: 'ready', payloads: { entry: { status: 'ready', value: null } } })).toEqual({ state: 'recorded', value: null });
    expect(read({ status: 'ready', payloads: { entry: { status: 'unavailable', reason: 'part-changed' } } }))
      .toEqual({ state: 'unavailable', invocation: 'sf#1', reason: 'part-changed' });
  });

  it('honours a mark the step graph carried itself', () => {
    const reader = stepPayloadReader({ loadable: new Set(['x#1']) });
    expect(reader.read({ runtimeStageId: 'x#1', exitPayloadWith: 'invocation' }, 'exit')).toEqual({ state: 'not-loaded', invocation: 'x#1', why: 'not-requested' });
    expect(reader.read({ runtimeStageId: 'x#1', exitPayloadWith: 'invocation' }, 'entry')).toEqual({ state: 'none' });
    expect(reader.read({ exitPayloadWith: 'invocation' }, 'exit')).toEqual({ state: 'not-loaded', invocation: '', why: 'no-source' });
  });

  it('names the invocations a view holds: marked payloads on the shown sides, once each, loaded or not', () => {
    const slot = { runtimeStageId: 'slot#2' };
    const reader = stepPayloadReader({ marks, loadable: new Set(['sf#1', 'slot#2']),
      loads: new Map([['slot#2', { status: 'ready' as const, payloads: null }]]) });
    expect(reader.wanted([[step, 'entry'], [step, 'exit'], [step, 'entry'], [slot, 'exit'], [undefined, 'exit']])).toEqual(['sf#1', 'slot#2']);
    expect(reader.wanted([[slot, 'entry']])).toEqual([]);
    expect(reader.wanted([[{ runtimeStageId: 'sf#1', entryPayload: 1, exitPayload: 2 }, 'entry']])).toEqual([]);
    expect(reader.wanted([[{ runtimeStageId: 'other#9' }, 'exit']])).toEqual([]);
  });

  it('holds only the first `limit` marked invocations, whatever their state, so the held set stays bounded', () => {
    const many = readPayloadMarks(row(Array.from({ length: 5 }, (_, i) => moved('subflow.exit', `s#${i}`))));
    const holders = Array.from({ length: 5 }, (_, i) => [{ runtimeStageId: `s#${i}` }, 'exit'] as const);
    const loads = new Map([['s#0', { status: 'ready' as const, payloads: null }], ['s#1', { status: 'loading' as const }]]);
    expect(stepPayloadReader({ marks: many, loads }).wanted(holders, 2)).toEqual(['s#0', 's#1']);
    expect(stepPayloadReader({ marks: many, loads }).wanted(holders, 3)).toEqual(['s#0', 's#1', 's#2']);
    expect(stepPayloadReader({ marks: many }).wanted(holders)).toHaveLength(5);
  });

  it('reads a recorded null as recorded, in the row and from a loaded child', () => {
    expect(ROW_ONLY_PAYLOADS.read({ runtimeStageId: 'sf#1', entryPayload: null }, 'entry')).toEqual({ state: 'recorded', value: null });
    expect(stepPayloadReader({ marks }).read({ runtimeStageId: 'sf#1', exitPayload: null }, 'exit')).toEqual({ state: 'recorded', value: null });
    expect(stepPayloadReader({ marks, loads: new Map([['sf#1', { status: 'ready' as const, payloads: { exit: { status: 'ready' as const, value: null } } }]]) })
      .read(step, 'exit')).toEqual({ state: 'recorded', value: null });
  });

  it('gives each withheld state its own sentence, never an empty or in-progress one', () => {
    const sentences = (['not-requested', 'loading', 'load-failed', 'not-sent', 'no-source'] as const)
      .map(why => payloadNotice({ state: 'not-loaded', invocation: 'sf#1', why }));
    sentences.push(payloadNotice({ state: 'unavailable', invocation: 'sf#1', reason: 'part-changed' }));
    expect(new Set(sentences).size).toBe(6);
    for (const sentence of sentences) expect(sentence).not.toMatch(/no (input|output|data) recorded|none recorded|in progress/i);
    expect(sentences[5]).toContain('part-changed');
    expect(isWithheld({ state: 'none' })).toBe(false);
    expect(isWithheld({ state: 'recorded', value: 1 })).toBe(false);
  });
});
