/**
 * cursorProvenance — the "where did this come from?" query behind
 * <WhereFrom>. Pinned against a REAL agentfootprint runner (the same
 * fixture pattern as buildStepGraphFromSnapshot): the frames must name the
 * actual dependency chain, honesty states must pass through, and the
 * duck-check must make bad runners a non-event.
 */

import { describe, expect, it } from 'vitest';
import { Sequence, LLMCall } from 'agentfootprint';
import { MockProvider } from 'agentfootprint/providers';

import { cursorProvenance } from './cursorProvenance.js';

function llm(reply: string) {
  return LLMCall.create({ provider: new MockProvider({ reply }), model: 'mock' })
    .system('hi')
    .build();
}

describe('cursorProvenance — real runner', () => {
  it('lists the cursor stage written keys and slices one transitively', async () => {
    const seq = Sequence.create({ name: 'pipeline' })
      .step('draft', llm('a draft'))
      .step('polish', llm('polished'))
      .build();
    await seq.run({ message: 'go' });

    // Find a commit-bearing step to anchor on: the LAST writer in the log.
    const snap = seq.getLastSnapshot() as { commitLog: Array<{ runtimeStageId: string; trace: Array<{ path: string }> }> };
    const lastWriting = [...snap.commitLog].reverse().find((b) => b.trace.length > 0)!;

    const prov = cursorProvenance(seq, lastWriting.runtimeStageId);
    expect(prov).toBeDefined();
    expect(prov!.writtenKeys.length).toBeGreaterThan(0);

    const key = prov!.writtenKeys[0];
    const slice = prov!.sliceFor(key);
    expect(slice.missing).toBeUndefined();
    expect(slice.frames.length).toBeGreaterThanOrEqual(1);
    // Frame 0 is the writer (the anchor), depth 0, linkedBy ''.
    expect(slice.frames[0].depth).toBe(0);
    expect(slice.frames[0].linkedBy).toBe('');
    expect(slice.frames[0].runtimeStageId).toBe(lastWriting.runtimeStageId);
    // Deeper frames (when present) carry the linking read key.
    for (const f of slice.frames.slice(1)) {
      expect(f.depth).toBeGreaterThan(0);
      expect(f.linkedBy).not.toBe('');
    }
  });

  it('honest absence: slicing a key nobody wrote', async () => {
    const seq = Sequence.create({ name: 'p2' }).step('one', llm('x')).build();
    await seq.run({ message: 'go' });
    const snap = seq.getLastSnapshot() as { commitLog: Array<{ runtimeStageId: string; trace: Array<{ path: string }> }> };
    const anchor = [...snap.commitLog].reverse().find((b) => b.trace.length > 0)!;
    const prov = cursorProvenance(seq, anchor.runtimeStageId)!;
    const ghost = prov.sliceFor('definitely-not-a-key');
    expect(ghost.missing).toBe('never-written');
    expect(ghost.frames).toHaveLength(0);
  });

  it('duck-check: runners without getLastSnapshot (or no run) are a non-event', async () => {
    expect(cursorProvenance({}, 'a#0')).toBeUndefined();
    expect(cursorProvenance(undefined, 'a#0')).toBeUndefined();
    const fresh = Sequence.create({ name: 'p3' }).step('one', llm('x')).build();
    expect(cursorProvenance(fresh, 'a#0')).toBeUndefined(); // no run yet
  });

  it('unknown / synthetic cursor ids return undefined (panel simply hides)', async () => {
    const seq = Sequence.create({ name: 'p4' }).step('one', llm('x')).build();
    await seq.run({ message: 'go' });
    expect(cursorProvenance(seq, 'ghost#99')).toBeUndefined();
    expect(cursorProvenance(seq, '')).toBeUndefined();
  });

  it('frames carry commitIdx (reverse-time sortable) and story is the fp formatSlice parity string', async () => {
    const seq = Sequence.create({ name: 'p5' })
      .step('draft', llm('a draft'))
      .step('polish', llm('polished'))
      .build();
    await seq.run({ message: 'go' });
    const snap = seq.getLastSnapshot() as { commitLog: Array<{ runtimeStageId: string; trace: Array<{ path: string }> }> };
    const anchor = [...snap.commitLog].reverse().find((b) => b.trace.length > 0)!;
    const prov = cursorProvenance(seq, anchor.runtimeStageId)!;
    const key = prov.writtenKeys[0];
    const slice = prov.sliceFor(key);
    // Every frame has its timeline position; the newest is the anchor —
    // sorting by commitIdx DESC is exactly the Same-Rail walk order.
    for (const f of slice.frames) expect(f.commitIdx).toBeGreaterThanOrEqual(0);
    const sorted = [...slice.frames].sort((a, b) => b.commitIdx - a.commitIdx);
    expect(sorted[0].runtimeStageId).toBe(anchor.runtimeStageId);
    expect(slice.story).toContain(key); // formatSlice names the traced key
  });

  it('story renders the honesty envelope even for a missing slice', async () => {
    const seq = Sequence.create({ name: 'p6' }).step('one', llm('x')).build();
    await seq.run({ message: 'go' });
    const snap = seq.getLastSnapshot() as { commitLog: Array<{ runtimeStageId: string; trace: Array<{ path: string }> }> };
    const anchor = [...snap.commitLog].reverse().find((b) => b.trace.length > 0)!;
    const prov = cursorProvenance(seq, anchor.runtimeStageId)!;
    const ghost = prov.sliceFor('definitely-not-a-key');
    expect(ghost.missing).toBe('never-written');
    expect(typeof ghost.story).toBe('string');
    expect(ghost.story.length).toBeGreaterThan(0); // absence is an ANSWER, not an empty string
  });
});