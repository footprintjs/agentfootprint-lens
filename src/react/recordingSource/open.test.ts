import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLensRecordingSource } from './controller.js';
import { openLensRecordingSource, type LensRecordingReader } from './open.js';

vi.mock('./controller.js', () => ({
  createLensRecordingSource: vi.fn(() => ({})),
}));

const create = vi.mocked(createLensRecordingSource);
const unopened = (): LensRecordingReader => ({
  async readRoot() { return { status: 'ready', coverage: 'whole', value: {} }; },
  async readSubflow() { return { status: 'unavailable' }; },
});

describe('binding an authorized Lens reader', () => {
  beforeEach(() => create.mockClear());

  it('does not enable model input from extra opener options', async () => {
    const readModelInput = vi.fn();
    const prepareSubflow = vi.fn();
    const options = { reader: unopened(), readModelInput, prepareSubflow, maxCachedPayloads: 0, maxCachedSubflows: 2 };
    expect((await openLensRecordingSource(options)).status).toBe('ready');
    const forwarded = create.mock.calls[0]![0];
    expect(forwarded.readModelInput).toBeUndefined();
    expect(forwarded.prepareSubflow).toBe(prepareSubflow);
    expect(forwarded.maxCachedPayloads).toBe(0);
    expect(forwarded.maxCachedSubflows).toBe(2);
    expect(readModelInput).not.toHaveBeenCalled();
  });

  it('binds only the supplied reader method with its original receiver', async () => {
    const denied = { status: 'unavailable', reason: 'test-only' } as const;
    const supplied = vi.fn(async () => denied);
    const extra = vi.fn();
    const reader = { ...unopened(), readModelInput: supplied };
    const options = { reader, readModelInput: extra };
    expect((await openLensRecordingSource(options)).status).toBe('ready');
    const forwarded = create.mock.calls[0]![0];
    const address = {
      engineRunId: 'run', logRunId: 'log', invocationPath: ['child#1'], runtimeStageId: 'call#2', commitIdx: 1,
    };
    const signal = new AbortController().signal;
    await expect(forwarded.readModelInput!(address, { signal })).resolves.toEqual(denied);
    expect(supplied).toHaveBeenCalledExactlyOnceWith(address, { signal });
    expect(supplied.mock.contexts[0]).toBe(reader);
    expect(extra).not.toHaveBeenCalled();
  });
});
