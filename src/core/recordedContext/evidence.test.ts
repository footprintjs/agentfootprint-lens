import { beforeEach, describe, expect, it, vi } from 'vitest';
import { epochLocations } from 'agentfootprint';
import { servedRowForEpoch } from '../served/servedRowAt.js';
import { verify } from '../served/verify.js';
import { withRecordedEvidence, recordedModelInputLabel } from './evidence.js';
import type { RecordedContextView } from './types.js';

vi.mock('agentfootprint', () => ({ epochLocations: vi.fn() }));
vi.mock('../served/servedRowAt.js', () => ({ servedRowForEpoch: vi.fn() }));
vi.mock('../served/verify.js', () => ({ verify: vi.fn() }));
const context = (): RecordedContextView => ({ dictionary: [], calls: [{
  meta: { runId: 'run', compositionPath: ['Agent:test'], subflowPath: [], runtimeStageId: 'call#4',
    sourcePosition: { engineRunId: 'run', logRunId: 'log', drillPath: [], committedThroughIdx: 1 } },
  iteration: 1, call: 1, eventIndex: 8, added: [], removed: [], unchanged: 0, counts: {},
}] });
const recording = () => ({ snapshot: { logAddress: { logRunId: 'log', drillPath: [] }, commitLog: [{}, {}, {}] } });
const location = { epoch: 1, callRuntimeStageId: 'call#4', callIdx: 2 };
const row = () => ({ epoch: 1, callRuntimeStageId: 'call#4', receipt: { basis: { runId: 'run' } },
  view: { messages: { asSent: [{ role: 'tool', toolCallId: 'actual-tool-id', content: 'actual wire text' }] },
    gaps: [{ gap: 'no-fold-base', why: 'declared hole' }] } });
const setLocation = (value: unknown) => vi.mocked(epochLocations).mockReturnValue(value as never);
const setRow = (value: unknown) => vi.mocked(servedRowForEpoch).mockReturnValue(value as never);
const result = (input = context(), record: unknown = recording()) => withRecordedEvidence(record, input).toolInputs![0];

describe('exact native model-input adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setLocation([location]); setRow(row());
    vi.mocked(verify).mockReturnValue({ messages: [{ status: 'verified' }] } as never);
  });
  it('uses the exact call and real toolCallId, retains status/gaps and detaches content', () => {
    const input = row(); input.view.messages.asSent[0]!.content = 'wire ticket'; setRow(input);
    expect(result()).toEqual({ status: 'available', epoch: 1,
      messages: [{ toolCallId: 'actual-tool-id', content: 'wire ticket', ticket: false, status: 'verified' }],
      gaps: ['no-fold-base: declared hole'] });
    expect(servedRowForEpoch).toHaveBeenCalledWith(expect.any(Object), 1);
    expect(verify).toHaveBeenCalledWith(input.view, input.receipt, 'run', undefined);
  });
  it('recognizes a ticket only from the exact served message shape', () => {
    const input = row(); input.view.messages.asSent[0]!.content =
      JSON.stringify({ collapsed: true, standing: 'noise', toolCallId: 'actual-tool-id' });
    setRow(input); const evidence = result();
    expect(evidence.status).toBe('available');
    if (evidence.status === 'available') expect(evidence.messages[0]).toMatchObject({
      ticket: true, toolCallId: 'actual-tool-id', content: input.view.messages.asSent[0]!.content,
    });
  });
  it.each(['reconstructed', 'damaged', 'not-on-record'] as const)('preserves %s rather than upgrading it', status => {
    vi.mocked(verify).mockReturnValue({ messages: [{ status }] } as never);
    const read = result(); expect(read.status).toBe('available');
    if (read.status === 'available') expect(read.messages[0]!.status).toBe(status);
    expect(recordedModelInputLabel(status)).not.toContain('verified receipt');
  });
  it('does not borrow from a different native log or nested mount', () => {
    const wrong = context();
    const meta = wrong.calls[0]!.meta as { sourcePosition: unknown };
    meta.sourcePosition = { engineRunId: 'run', logRunId: 'sibling', drillPath: [], committedThroughIdx: 1 };
    expect(result(wrong).status).toBe('unavailable');
    meta.sourcePosition = { engineRunId: 'run', logRunId: 'log', drillPath: ['nested'], committedThroughIdx: 1 };
    expect(result(wrong).status).toBe('unavailable'); expect(servedRowForEpoch).not.toHaveBeenCalled();
  });
  it('refuses missing source positions, source prefixes beyond the log, and preceding calls', () => {
    const input = context(); (input.calls[0]!.meta as { sourcePosition: unknown }).sourcePosition = undefined;
    expect(result(input).status).toBe('unavailable');
    setLocation([{ ...location, callIdx: 1 }]); expect(result().status).toBe('unavailable');
    expect(result(context(), { snapshot: { ...recording().snapshot, commitLog: [] } }).status).toBe('unavailable');
    expect(servedRowForEpoch).not.toHaveBeenCalled();
  });
  it('refuses ambiguous epochs, duplicate call claims and wrong stages', () => {
    setLocation([location, location]); expect(result().status).toBe('unavailable');
    setLocation([location]); const input = context();
    expect(result({ ...input, calls: [input.calls[0]!, input.calls[0]!] }).status).toBe('unavailable');
    setLocation([{ ...location, callRuntimeStageId: 'sibling#4' }]); expect(result().status).toBe('unavailable');
    expect(servedRowForEpoch).not.toHaveBeenCalled();
  });
  it('refuses grouped epochs and mismatched receipt identity', () => {
    setLocation([{ ...location, subflowScope: 'mounted#4' }]); expect(result().status).toBe('unavailable');
    setLocation([location]); const wrong = row(); wrong.receipt.basis.runId = 'other'; setRow(wrong);
    expect(result().status).toBe('unavailable'); expect(verify).not.toHaveBeenCalled();
  });
  it('respects explicitly withheld state before folding a native log', () => {
    expect(result(context(), { snapshot: { ...recording().snapshot, stateValuesWithheld: true } }).status).toBe('unavailable');
    expect(epochLocations).not.toHaveBeenCalled(); expect(servedRowForEpoch).not.toHaveBeenCalled();
  });
  it('treats two logical owners claiming one physical native call as ambiguous', () => {
    const input = context();
    const other = { ...input.calls[0]!, meta: { ...input.calls[0]!.meta, compositionPath: ['other'] } };
    const results = withRecordedEvidence(recording(), { ...input, calls: [input.calls[0]!, other] }).toolInputs!;
    expect(results.map(item => item.status)).toEqual(['unavailable', 'unavailable']);
    expect(servedRowForEpoch).not.toHaveBeenCalled();
  });
  it('requires the native engine owner even when no receipt is present', () => {
    const input = context(); (input.calls[0]!.meta as { sourcePosition: unknown }).sourcePosition = {
      engineRunId: 'other', logRunId: 'log', drillPath: [], committedThroughIdx: 1,
    };
    setRow({ ...row(), receipt: undefined });
    expect(result(input).status).toBe('unavailable'); expect(servedRowForEpoch).not.toHaveBeenCalled();
  });
  it('keeps unreadable evidence unknown without leaking private exceptions', () => {
    vi.mocked(servedRowForEpoch).mockImplementation(() => { throw new Error('private detail'); });
    expect(result()).toEqual({ status: 'unavailable', reason: 'model-input evidence could not be read safely' });
  });
});
