import { describe, expect, it } from 'vitest';
import { readTrustBoundaries } from './read.js';

export function trustSnapshot() {
  const kinds = [
    {
      eventType: 'agentfootprint.middleware.decision',
      middleware: 'argument-policy',
      moment: 'before-tool',
      outcome: 'allow',
      changed: false,
      iteration: 0,
    },
    {
      eventType: 'agentfootprint.permission.check',
      capability: 'tool_call',
      result: 'allow',
      target: 'calculate',
    },
    { eventType: 'agentfootprint.permission.halt', target: 'calculate', iteration: 0 },
    { eventType: 'agentfootprint.credential.requested', service: 'prices', mode: 'machine' },
    { eventType: 'agentfootprint.credential.acquired', service: 'prices', kind: 'bearer' },
    { eventType: 'agentfootprint.credential.authorization_required', service: 'prices' },
    { eventType: 'agentfootprint.credential.failed', service: 'prices', errorClass: 'Unavailable' },
  ];
  return {
    recorders: [
      {
        id: 'trust-one',
        name: 'TrustBoundaries',
        meta: { version: 1 },
        data: {
          captureId: 'capture-one',
          facts: kinds.map((fields, index) => ({
            seq: index + 1,
            runId: 'agent-run',
            runtimeStageId: 'policy#0',
            wallClockMs: 10,
            sourcePosition: {
              engineRunId: 'engine-run',
              logRunId: 'engine-run',
              drillPath: [] as string[],
              committedThroughIdx: -1,
            },
            toolCallId: 'call-one',
            ...fields,
          })),
          counters: { observed: 7, retained: 7, evicted: 0, invalid: 0, oversized: 0, pending: 0 },
          firstObservedSeq: 1,
          lastObservedSeq: 7,
          firstRetainedSeq: 1,
          lastRetainedSeq: 7,
        },
      },
    ],
  };
}

describe('strict TrustBoundaries v1 reader', () => {
  it('reads all seven kinds, freezes detached facts and does not read extra content', () => {
    const snapshot = trustSnapshot();
    Object.defineProperty(snapshot.recorders[0]!.data.facts[0], 'content', {
      get: () => {
        throw Error('secret getter');
      },
    });
    const read = readTrustBoundaries(snapshot);
    expect(read.status).toBe('available');
    if (read.status !== 'available') throw Error('capture missing');
    const capture = read.captures[0]!;
    expect(capture.facts).toHaveLength(7);
    expect(Object.isFrozen(capture)).toBe(true);
    expect(Object.isFrozen(capture.counters)).toBe(true);
    expect(Object.isFrozen(capture.facts[0]!.sourcePosition!.drillPath)).toBe(true);
    snapshot.recorders[0]!.data.facts[0]!.runId = 'changed';
    expect(capture.facts[0]!.runId).toBe('agent-run');
    expect(JSON.stringify(read)).not.toContain('content');
  });

  it('refuses future version instead of interpreting it as v1', () => {
    const snapshot = trustSnapshot();
    snapshot.recorders[0]!.meta.version = 2;
    expect(readTrustBoundaries(snapshot).status).toBe('unsupported');
  });

  it('validates and retains the same single read of a stateful descriptor', () => {
    const snapshot = trustSnapshot();
    const original = snapshot.recorders[0]!.data.facts[0]!;
    let reads = 0;
    snapshot.recorders[0]!.data.facts[0] = new Proxy(original, {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'changed') {
          reads++;
          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value: reads === 1 ? false : { content: 'STATEFUL_DESCRIPTOR_CANARY' },
          };
        }
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    const read = readTrustBoundaries(snapshot);
    expect(read.status).toBe('available');
    expect(reads).toBe(1);
    expect(JSON.stringify(read)).not.toContain('STATEFUL_DESCRIPTOR_CANARY');
    if (read.status === 'available')
      expect(read.captures[0]!.facts[0]).toMatchObject({ changed: false });
  });

  it.each([
    [
      'counter mismatch',
      (s: ReturnType<typeof trustSnapshot>) => {
        s.recorders[0]!.data.counters.retained = 8;
      },
    ],
    [
      'sequence duplicate',
      (s: ReturnType<typeof trustSnapshot>) => {
        s.recorders[0]!.data.facts[1]!.seq = 1;
      },
    ],
    [
      'source below base',
      (s: ReturnType<typeof trustSnapshot>) => {
        s.recorders[0]!.data.facts[0]!.sourcePosition.committedThroughIdx = -2;
      },
    ],
    [
      'invalid upper bound',
      (s: ReturnType<typeof trustSnapshot>) => {
        s.recorders[0]!.data.lastRetainedSeq = 8;
      },
    ],
    [
      'unknown outcome',
      (s: ReturnType<typeof trustSnapshot>) => {
        s.recorders[0]!.data.facts[0]!.eventType = 'not-recorded';
      },
    ],
    [
      'nonfinite time',
      (s: ReturnType<typeof trustSnapshot>) => {
        s.recorders[0]!.data.facts[0]!.wallClockMs = Infinity;
      },
    ],
    [
      'getter counter',
      (s: ReturnType<typeof trustSnapshot>) => {
        Object.defineProperty(s.recorders[0]!.data.counters, 'observed', { get: () => 7 });
      },
    ],
  ])('refuses %s', (_label, alter) => {
    const snapshot = trustSnapshot();
    alter(snapshot);
    expect(readTrustBoundaries(snapshot).status).toBe('invalid');
  });

  it('keeps loss and pending accounting rather than filling missing facts', () => {
    const snapshot = trustSnapshot();
    const data = snapshot.recorders[0]!.data;
    data.facts = data.facts.slice(3);
    data.counters = { observed: 7, retained: 4, evicted: 1, invalid: 1, oversized: 0, pending: 1 };
    data.firstRetainedSeq = 4;
    const read = readTrustBoundaries(snapshot);
    expect(read.status).toBe('available');
    if (read.status === 'available') expect(read.captures[0]!.counters).toEqual(data.counters);
  });

  it('keeps separate captures and refuses duplicate recorder identity', () => {
    const snapshot = trustSnapshot();
    snapshot.recorders.push({ ...snapshot.recorders[0]!, id: 'trust-two' });
    const read = readTrustBoundaries(snapshot);
    expect(read.status === 'available' && read.captures.length).toBe(2);
    snapshot.recorders[1]!.id = 'trust-one';
    expect(readTrustBoundaries(snapshot).status).toBe('invalid');
  });

  it('reports absence without scanning raw event history', () => {
    expect(
      readTrustBoundaries({ events: [{ type: 'agentfootprint.permission.check' }] }).status,
    ).toBe('missing');
    expect(readTrustBoundaries(undefined).status).toBe('missing');
  });
});
