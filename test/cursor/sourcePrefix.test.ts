import { describe, expect, it } from 'vitest';
import { stateAt } from 'foottrace';

import { readSourcePosition, resolveSourcePrefix } from '../../src/core/cursor/sourcePrefix.js';

const position = (idx = 0, drillPath: readonly string[] = []) => ({
  engineRunId: 'emitting-leg', logRunId: 'owning-leg', drillPath, committedThroughIdx: idx,
});
const bundle = (idx: number, value: number) => ({
  idx, runtimeStageId: `stage#${idx}`, stageId: 'stage', stage: 'Stage',
  trace: [{ path: 'value', verb: 'set' }], overwrite: { value }, updates: {},
});
const snapshot = () => ({
  runId: 'later-leg', logAddress: { logRunId: 'owning-leg', drillPath: [] },
  initialState: { value: 10 }, commitLog: [bundle(0, 11), bundle(1, 99)],
});

describe('source-prefix resolution', () => {
  it('folds the exact committed prefix, never the emitting stage future or current state', () => {
    const snap = snapshot();
    const result = resolveSourcePrefix(snap, position());
    expect(result.status).toBe('available');
    if (result.status !== 'available' || result.state.status !== 'available') throw new Error('missing fold');
    expect(result.state.folded).toEqual(stateAt(snap, 0));
    expect(result.state.folded.state).toEqual({ value: 11 });
    expect(result.state.folded.throughCommitIdx).toBe(0);
  });

  it('keeps -1 as the recorded base even on a later run leg', () => {
    const result = resolveSourcePrefix(snapshot(), position(-1));
    if (result.status !== 'available' || result.state.status !== 'available') throw new Error('missing base');
    expect(result.state.folded.state).toEqual({ value: 10 });
    expect(result.state.folded.throughCommitIdx).toBe(-1);
  });

  it('uses the exact nested runtime mount and full address, including seeded history', () => {
    const path = ['outer#1', 'outer/inner#3'];
    const treeContext = { logAddress: { logRunId: 'owning-leg', drillPath: path }, initialState: { seeded: true }, history: [bundle(0, 42)] };
    const snap = { ...snapshot(), subflowResults: {
      'outer/inner#3': { treeContext },
      'outer/inner#9': { treeContext: { ...treeContext, logAddress: { logRunId: 'owning-leg', drillPath: ['outer#7', 'outer/inner#9'] }, history: [bundle(0, 900)] } },
    } };
    const result = resolveSourcePrefix(snap, position(0, path));
    if (result.status !== 'available' || result.state.status !== 'available') throw new Error('missing nested fold');
    expect(result.state.folded.state).toEqual({ seeded: true, value: 42 });
    expect(resolveSourcePrefix(snap, position(0, ['wrong#1', 'outer/inner#3'])).status).toBe('unavailable');
  });

  it.each([
    ['missing snapshot', undefined, position()],
    ['missing address', { commitLog: [], initialState: {} }, position(-1)],
    ['different log', { ...snapshot(), logAddress: { logRunId: 'other', drillPath: [] } }, position()],
    ['missing mount', snapshot(), position(0, ['absent#1'])],
    ['past end', snapshot(), position(2)],
    ['lost head', { ...snapshot(), commitLog: [bundle(1, 99)] }, position()],
    ['gap', { ...snapshot(), commitLog: [bundle(0, 11), undefined] }, position(1)],
  ])('does not infer or clamp: %s', (_label, snap, at) => {
    expect(resolveSourcePrefix(snap, at).status).toBe('unavailable');
  });

  it('keeps an exact withheld coordinate without presenting empty or fabricated state', () => {
    let reads = 0;
    const snap = { ...snapshot(), stateValuesWithheld: true, commitLog: [{ idx: 0, runtimeStageId: 'stage#0' }], get initialState() { reads++; throw new Error('must not fold'); } };
    const result = resolveSourcePrefix(snap, position());
    expect(result).toMatchObject({ status: 'available', state: { status: 'unavailable', reason: 'withheld' } });
    expect(result).not.toHaveProperty('source');
    expect(result).not.toHaveProperty('state.folded');
    expect(reads).toBe(0);
  });

  it('does not claim a complete state when the recorded base or fold values are missing', () => {
    const { initialState: _base, ...missingBase } = snapshot();
    expect(resolveSourcePrefix(missingBase, position())).toMatchObject({ status: 'available', state: { status: 'unavailable' } });
    expect(resolveSourcePrefix({ ...snapshot(), commitLog: [{ idx: 0, runtimeStageId: 'stage#0' }] }, position())).toMatchObject({ status: 'available', state: { status: 'unavailable' } });
  });

  it('propagates root withholding to a nested source and does not read its base getter', () => {
    const drillPath = ['mount#1'];
    let reads = 0;
    const snap = { ...snapshot(), stateValuesWithheld: true, subflowResults: { 'mount#1': { treeContext: {
      logAddress: { logRunId: 'owning-leg', drillPath }, history: [{ idx: 0, runtimeStageId: 'inner#2' }],
      get initialState() { reads++; throw new Error('withheld'); },
    } } } };
    expect(resolveSourcePrefix(snap, position(0, drillPath))).toMatchObject({ status: 'available', state: { status: 'unavailable', reason: 'withheld' } });
    expect(reads).toBe(0);
  });

  it('preserves engine redaction facts and the legitimate id-less root-context commit', () => {
    const snap = { ...snapshot(), commitLog: [{ ...bundle(0, 11), runtimeStageId: '', redactedPaths: ['value'], overwrite: { value: 'REDACTED' } }] };
    const result = resolveSourcePrefix(snap, position());
    if (result.status !== 'available' || result.state.status !== 'available') throw new Error('missing redacted prefix');
    expect(result.state.folded.redacted).toBe(true);
    expect(result.state.folded.state).toEqual({ value: 'REDACTED' });
  });

  it('contains hostile metadata inspection without invoking coordinate or snapshot accessors', () => {
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    expect(readSourcePosition(revoked.proxy)).toBeUndefined();
    expect(resolveSourcePrefix(revoked.proxy, position())).toMatchObject({ status: 'unavailable', reason: 'invalid-log' });
    let reads = 0;
    expect(resolveSourcePrefix({ ...snapshot(), get logAddress() { reads++; return snapshot().logAddress; } }, position()).status).toBe('unavailable');
    expect(reads).toBe(0);
  });

  it('copies and freezes only declared coordinate fields without reading accessors', () => {
    const path = ['mount#1'];
    const raw = { ...position(0, path), extra: 'omit' };
    const read = readSourcePosition(raw);
    expect(read).toEqual(position(0, ['mount#1']));
    path.push('later#2');
    expect(read?.drillPath).toEqual(['mount#1']);
    expect(Object.isFrozen(read)).toBe(true);
    expect(Object.isFrozen(read?.drillPath)).toBe(true);
    let reads = 0;
    expect(readSourcePosition({ ...position(), get logRunId() { reads++; return 'owning-leg'; } })).toBeUndefined();
    expect(reads).toBe(0);
  });

  it.each([undefined, null, [], {}, { ...position(), committedThroughIdx: -2 }, { ...position(), committedThroughIdx: 0.5 }, { ...position(), committedThroughIdx: Infinity }, { ...position(), engineRunId: '' }, { ...position(), drillPath: [''] }, { ...position(), drillPath: Array(33).fill('mount#1') }])('refuses invalid coordinates %#', (value) => {
    expect(readSourcePosition(value)).toBeUndefined();
    expect(resolveSourcePrefix(snapshot(), value).status).toBe('unavailable');
  });
});
