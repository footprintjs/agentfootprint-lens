import { describe, expect, it } from 'vitest';
import { commentaryEventSequences, hopEventSequences, readRunIO } from './replayEventSequences.js';

const logEvent = (seq: number, runtimeStageId?: string, type = 'agentfootprint.tool.return') =>
  ({ seq, event: { type, meta: { runtimeStageId } } });
const position = (runtimeStageId: string, kind: 'commit' | 'group-start' | 'group-end' = 'commit') =>
  ({ runtimeStageId, kind });

type Stop = Parameters<typeof commentaryEventSequences>[0][number];
type Row = Parameters<typeof commentaryEventSequences>[1][number];
type Hop = Parameters<typeof hopEventSequences>[0][number];

// These two direct scans preserve the pre-optimization Lens.tsx behavior independently of the selector.
function referenceHops(hops: readonly Hop[], log: readonly Row[]): number[] {
  if (!log.length || !hops.length) return [];
  const seqs: number[] = [];
  let previous = log[0].seq;
  for (const hop of hops) {
    const id = hop.anchorStep?.runtimeStageId;
    let resolved = -1;
    if (id !== undefined) {
      if (hop.kind === 'llm->user' || hop.kind === 'answers') {
        for (let i = log.length - 1; i >= 0; i--) {
          if (log[i].event.meta?.runtimeStageId === id) {
            resolved = log[i].seq;
            break;
          }
        }
      } else {
        for (const row of log) {
          if (row.event.meta?.runtimeStageId === id) {
            resolved = row.seq;
            break;
          }
        }
      }
    }
    if (resolved === -1) resolved = previous;
    seqs.push(resolved);
    previous = resolved;
  }
  return seqs;
}

const plumbingTypes = [
  'run.entry', 'run.exit', 'subflow.entry', 'subflow.exit',
  'context.injected', 'context.slot_composed', 'stream.token', 'stream.thinking_delta',
];

function referenceCommentary(stops: readonly Stop[], log: readonly Row[]): number[] {
  const seqs = new Array<number>(stops.length).fill(-1);
  if (!log.length) return seqs;
  function matches(row: Row, id: string): boolean {
    const type = row.event.type?.replace(/^agentfootprint\./, '');
    if (type && plumbingTypes.includes(type)) return false;
    const stage = row.event.meta?.runtimeStageId;
    const base = id.split('#')[0];
    return !!stage && (stage === id || stage === base || stage.startsWith(base + '/'));
  }
  let searchFrom = 0;
  let previous = -1;
  for (const [step, stop] of stops.entries()) {
    const id = stop.runtimeStageId;
    if (id.startsWith('__root__')) {
      if (stop.kind === 'group-end') {
        previous = log[log.length - 1].seq;
        seqs[step] = previous;
      }
      continue;
    }
    let found = -1;
    if (stop.kind === 'group-end') {
      for (let i = log.length - 1; i >= searchFrom; i--) {
        if (matches(log[i], id)) {
          found = i;
          break;
        }
      }
    } else {
      for (let i = searchFrom; i < log.length; i++) {
        if (matches(log[i], id)) {
          found = i;
          break;
        }
      }
    }
    if (found >= 0) {
      previous = log[found].seq;
      searchFrom = found + 1;
    }
    seqs[step] = previous;
  }
  return seqs;
}

describe('run boundary evidence', () => {
  it('reads the first defined entry payload and the final exit in the boundary channel', () => {
    const events = [
      { type: 'agentfootprint.run.entry', payload: 'ignored' }, { type: 'run.entry' },
      { type: 'run.entry', payload: null }, { type: 'run.entry', payload: 'later' },
      { type: 'run.exit', payload: 0 }, { type: 'run.exit', payload: false },
    ];
    expect(readRunIO({ getEvents: () => events })).toEqual({ runInput: null, runOutput: false });
    expect(readRunIO({})).toEqual({ runInput: undefined, runOutput: undefined });
    expect(readRunIO({ getEvents() { throw new Error('not ready'); } })).toEqual({ runInput: undefined, runOutput: undefined });
  });
});

describe('replay event sequences', () => {
  it('matches the original Lens scans on generated replay logs, stops and hops', () => {
    const ids = ['a', 'a#1', 'a#2', 'a/b', 'a/b#1', 'a/b/c#1', 'a#1/b', 'ab', 'b', ''];
    const visibleTypes = [undefined, 'tool.return', 'agentfootprint.tool.return'];
    const plumbing = [...plumbingTypes, ...plumbingTypes.map(type => 'agentfootprint.' + type)];
    const stopIds = [...ids, '__root__#0', 'absent'];
    const stopKinds = ['commit', 'group-start', 'group-end'] as const;
    const hopKinds = ['asks', 'forwards', 'answers', 'user->llm', 'llm->user', 'tool->llm', 'llm->tool'] as const;
    let seed = 12345;
    function integer(limit: number) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return (seed >>> 8) % limit;
    }
    function pick<T>(pool: readonly T[]): T {
      return pool[integer(pool.length)];
    }

    for (let example = 0; example < 512; example++) {
      const log: Row[] = Array.from({ length: integer(48) }, (_, i) => ({
        seq: i * 3 - 1,
        event: {
          type: integer(3) === 0 ? pick(plumbing) : pick(visibleTypes),
          meta: integer(4) === 0 ? pick([undefined, {}]) : { runtimeStageId: pick(ids) },
        },
      }));
      const stops = Array.from({ length: integer(18) }, () => position(pick(stopIds), pick(stopKinds)));
      // Force the same generated stops through the index, even on runs that only have nearby matches.
      const afterMiss = [position('always-missing'), ...stops];
      const hops: Hop[] = Array.from({ length: integer(14) }, () => ({
        kind: pick(hopKinds),
        anchorStep: integer(4) === 0 ? pick([undefined, {}]) : { runtimeStageId: pick(stopIds) },
      }));
      expect(commentaryEventSequences(stops, log), 'stops, case ' + example).toEqual(referenceCommentary(stops, log));
      expect(commentaryEventSequences(afterMiss, log), 'after miss, case ' + example).toEqual(referenceCommentary(afterMiss, log));
      expect(hopEventSequences(hops, log), 'hops, case ' + example).toEqual(referenceHops(hops, log));
    }
  });

  it('inherits a preceding hop when its exact anchor has sequence -1', () => {
    const log = [logEvent(-1, 'first'), logEvent(2, 'next')];
    const hops = [
      { kind: 'asks', anchorStep: { runtimeStageId: 'next' } },
      { kind: 'asks', anchorStep: { runtimeStageId: 'first' } },
      { kind: 'answers', anchorStep: { runtimeStageId: 'first' } },
    ] as const;
    expect(referenceHops(hops, log)).toEqual([2, 2, 2]);
    expect(hopEventSequences(hops, log)).toEqual(referenceHops(hops, log));
  });

  it('anchors dispatch to the first exact event, delivery and answers to the last, and missing hops to the preceding value', () => {
    const log = [logEvent(4), logEvent(7, 'outer/a#1'), logEvent(9, 'a#1'), logEvent(12, 'a#1')];
    const anchorStep = { runtimeStageId: 'a#1' };
    const hops = [
      { kind: 'asks' }, { kind: 'user->llm', anchorStep }, { kind: 'llm->user', anchorStep },
      { kind: 'forwards', anchorStep: { runtimeStageId: 'missing' } }, { kind: 'answers', anchorStep },
    ] as const;
    expect(hopEventSequences(hops, log)).toEqual([4, 9, 12, 12, 12]);
    expect(hopEventSequences(hops, [])).toEqual([]);
    expect(hopEventSequences([], log)).toEqual([]);
    expect(hopEventSequences(hops, [...log, logEvent(18, 'a#1')])).toEqual([4, 9, 18, 18, 18]);
  });

  it('advances within exact and nested scopes, skips plumbing, and takes the last remaining event at group end', () => {
    const log = [
      logEvent(2, 'work#2'), logEvent(3, 'other/work/child'), logEvent(5, 'work-else'),
      logEvent(6, 'work#1/child'), logEvent(7, 'work', 'context.injected'),
      logEvent(9, 'work/sub/leaf#3'), logEvent(11, 'work#1'), logEvent(12, 'work'),
      logEvent(15, 'work/nested'), logEvent(17, 'work#1', 'agentfootprint.stream.token'),
    ];
    const positions = [
      position('__root__#0', 'group-start'), position('sibling#2'), position('work#1'),
      position('work#1'), position('work#1', 'group-end'), position('work#1'),
      position('__root__#0', 'group-end'),
    ];
    expect(commentaryEventSequences(positions, [])).toEqual(positions.map(() => -1));
    expect(commentaryEventSequences(positions, log.slice(0, 6))).toEqual([-1, -1, 9, 9, 9, 9, 9]);
    expect(commentaryEventSequences(positions, log)).toEqual([-1, -1, 9, 11, 15, 15, 17]);
    expect(commentaryEventSequences([position('work#2'), position('work#1')], log)).toEqual([2, 9]);
    expect(commentaryEventSequences([position('work#1/child')], log)).toEqual([6]);
    expect(commentaryEventSequences([position('work')], log)).toEqual([9]);
  });

  it('bounds repeated misses to two passes and repeated same-side hop lookups to one', () => {
    let reads = 0;
    const log = Array.from({ length: 500 }, (_, seq) => ({
      seq, event: { type: 'agentfootprint.tool.return', get meta() { reads++; return { runtimeStageId: 'call' }; } },
    }));
    const stops = Array.from({ length: 100 }, (_, i) => position(`missing-${i}`));
    expect(commentaryEventSequences(stops, log)).toEqual(stops.map(() => -1));
    expect(reads).toBeLessThanOrEqual(2 * log.length);
    reads = 0;
    const hops = stops.map(({ runtimeStageId }) => ({ kind: 'answers' as const, anchorStep: { runtimeStageId } }));
    expect(hopEventSequences(hops, log)).toEqual(stops.map(() => 0));
    expect(reads).toBeLessThanOrEqual(log.length);
  });

  it('stops reading after a nearby match without inspecting unrelated rows', () => {
    const at = { runtimeStageId: 'work#0' };
    const untouched = { seq: 20, event: { get meta(): never { throw new Error('unrelated row read'); } } };
    const log = [logEvent(1, 'intro'), logEvent(3, 'work#0'), logEvent(4, 'work/child'), untouched, logEvent(9, 'work#0')];
    expect(commentaryEventSequences([position('work#0'), position('work#0'), position('work#0', 'group-end')], log))
      .toEqual([3, 4, 9]);
    expect(hopEventSequences([{ kind: 'asks', anchorStep: at }, { kind: 'answers', anchorStep: at }], log))
      .toEqual([3, 9]);
  });

  it.each([false, true])('orders exact and descendant events before and after a miss (indexed: %s)', indexed => {
    const log = [
      logEvent(2, 'scope#1'), logEvent(4, 'scope/child/grandchild#0'), logEvent(5, 'scope'),
      logEvent(6, 'scope#1'), logEvent(7, 'scope#2'), logEvent(8, 'scope#9/wrong'),
      logEvent(11, 'scope/child', 'agentfootprint.stream.token'),
    ];
    // The miss scans the whole log. Every following lookup then takes the indexed path.
    const leading = indexed ? [position('absent')] : [];
    const project = (stops: ReturnType<typeof position>[]) =>
      commentaryEventSequences([...leading, ...stops], log).slice(leading.length);
    expect(project([position('scope#1'), position('scope#1', 'group-end')])).toEqual([2, 6]);
    expect(project([position('scope/child#3'), position('scope#1'), position('scope')])).toEqual([4, 5, 5]);
    // Opening the root clears only its row. It does not rewind the consumed prefix.
    expect(project([position('scope#1'), position('__root__'), position('absent'), position('scope#1')]))
      .toEqual([2, -1, 2, 4]);
  });
});
