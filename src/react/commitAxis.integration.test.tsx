/** @vitest-environment jsdom */
/**
 * The COMMIT axis, end to end on a REAL agent run — the "nothing skipped" pin.
 *
 * The defect this pins against: the Flow reading ("every step") used to scrub
 * MILESTONE stops, so a 37-stage run got a 17-stop ruler and the stages
 * between milestones (normalize-thinking between an LLM turn and its route)
 * were unreachable by the transport. Since 0.39.0 the per-step reading scrubs
 * the commit log itself.
 *
 * Four claims, each against the same real run (dynamic agent, subflows, a
 * tool call, two LLM turns):
 *
 *   1. AXIS == COMMIT LOG: one stop per executed stage, same ids, same order,
 *      step index == commit index — so the ruler readout and the
 *      "stage N of M" readout are the same number by construction.
 *   2. EVERY STAGE REACHABLE BY ▶ ALONE: walking the mounted <Lens> with the
 *      transport's own ▶ visits every commit's runtimeStageId, in order —
 *      sf-* plumbing stages included, each its own stop.
 *   3. THE RULER COUNTS STAGES: one strip tick per commit in step mode.
 *   4. THE TWO AXES MAP: Why(milestone) → Flow lands on the milestone's own
 *      commit; Flow(commit) → Why lands on the milestone at-or-nearest-before
 *      — the tab-switch contract, in both directions.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Agent, defineTool } from 'agentfootprint';
import { mock } from 'agentfootprint/providers';
import { LensRecorder } from '../core/LensRecorder.js';
import { buildCommitSyncMap } from '../core/group/buildCommitSyncMap.js';
import { stepForCommitIdx } from '../core/group/stepForCommitIdx.js';
import { scrubAxisFor } from './hooks/useCursorPositions.js';
import { Lens, type LensCursorAt } from './index.js';

async function runRealAgent(): Promise<{ recorder: LensRecorder; runner: unknown }> {
  const echo = defineTool({
    name: 'echo',
    description: 'echo',
    inputSchema: { type: 'object', properties: { m: { type: 'string' } } },
    execute: async ({ m }: { m: string }) => `echoed ${m}`,
  });
  const agent = Agent.create({
    provider: mock({
      replies: [
        { toolCalls: [{ id: 'c1', name: 'echo', args: { m: 'a' } }] },
        { content: 'done' },
      ],
    }),
    model: 'mock',
    maxIterations: 4,
    reactMode: 'dynamic',
  })
    .system('be terse')
    .tool(echo)
    .build();

  const recorder = new LensRecorder();
  recorder.observe(agent as never);
  await agent.run({ message: 'go' });
  return { recorder, runner: agent };
}

describe('the commit axis over a real run (subflows included)', () => {
  it('AXIS == THE EXECUTED STAGES: one stop per stage, in execution order, none skipped', async () => {
    const { recorder } = await runRealAgent();
    const commits = buildCommitSyncMap(recorder);
    const flow = scrubAxisFor(recorder, 'step');

    expect(commits.length).toBeGreaterThan(20); // a real multi-iteration run

    // One stop per executed STAGE (a boundary stage's entry+exit bundles
    // collapse to one stop), anchored at the stage's FIRST commit, in
    // execution order. The union of stop addresses IS the commit log's
    // address set — every executed stage present, nothing else invented.
    const firstCommitOf = new Map<string, number>();
    for (const c of commits) {
      if (!firstCommitOf.has(c.runtimeStageId)) firstCommitOf.set(c.runtimeStageId, c.commitIdx);
    }
    expect(flow).toHaveLength(firstCommitOf.size);
    expect(flow.map((p) => p.runtimeStageId)).toEqual([...firstCommitOf.keys()]);
    for (const p of flow) expect(p.commitIdx).toBe(firstCommitOf.get(p.runtimeStageId));

    // This real run HAS double-committing boundary stages — the collapse is
    // exercised, not vacuous.
    expect(commits.length).toBeGreaterThan(flow.length);

    // The plumbing is not folded away: sf-* stages are their own stops.
    expect(flow.some((p) => p.runtimeStageId.startsWith('sf-'))).toBe(true);

    // And this axis is strictly finer than the milestone one it replaced.
    const why = scrubAxisFor(recorder, 'group');
    expect(why.length).toBeGreaterThan(2);
    expect(why.length).toBeLessThan(flow.length);
  });

  it('EVERY STAGE REACHABLE BY ▶ ALONE — the mounted lens, walked with its own transport', async () => {
    const { recorder, runner } = await runRealAgent();
    const flow = scrubAxisFor(recorder, 'step');

    let step = 0;
    /** Step → the runtimeStageId the lens reported there. */
    const seenAt = new Map<number, string>();
    const onStepChange = vi.fn((next: number, at: LensCursorAt) => {
      step = next;
      seenAt.set(next, at.runtimeStageId);
    });
    const { rerender } = render(
      <Lens recorder={recorder} runner={runner as never} step={step} onStepChange={onStepChange} />,
    );
    // A finished run reports its opening live-edge suggestion once; the walk
    // starts from stop 0, so re-pin the start.
    step = 0;
    seenAt.clear();
    rerender(
      <Lens recorder={recorder} runner={runner as never} step={step} onStepChange={onStepChange} />,
    );

    const first = screen
      .getAllByLabelText(/^Go to step /)
      .findIndex((b) => b.getAttribute('aria-current') === 'step');
    expect(first).toBe(0);

    for (let presses = 0; presses < flow.length - 1; presses += 1) {
      fireEvent.click(screen.getByLabelText('Next step'));
      rerender(
        <Lens recorder={recorder} runner={runner as never} step={step} onStepChange={onStepChange} />,
      );
    }

    // ▶ alone visited stop 1..N-1 (stop 0 was the mount position) — and at
    // every stop the lens reported the axis's own stage, which the previous
    // test proved is the commit log's stage set: the union of inspected
    // stages IS the executed run. Nothing skippable.
    for (let s = 1; s < flow.length; s += 1) {
      expect(seenAt.get(s)).toBe(flow[s]!.runtimeStageId);
    }
    expect((screen.getByLabelText('Next step') as HTMLButtonElement).disabled).toBe(true);
  });

  it('THE RULER COUNTS STAGES: one tick per executed stage in step mode', async () => {
    const { recorder, runner } = await runRealAgent();
    const flow = scrubAxisFor(recorder, 'step');

    const { container } = render(<Lens recorder={recorder} runner={runner as never} />);
    expect(screen.getAllByLabelText(/^Go to step /)).toHaveLength(flow.length);
    // Uncontrolled, finished run → live edge: the readout says N / N where N
    // is the STAGE count.
    expect(container.textContent).toContain(`${flow.length} / ${flow.length}`);
  });

  it('THE TWO AXES MAP — the tab-switch contract, both directions', async () => {
    const { recorder } = await runRealAgent();
    const flow = scrubAxisFor(recorder, 'step');
    const why = scrubAxisFor(recorder, 'group');

    // Why → Flow: every milestone lands on the stage at-or-nearest-before its
    // anchor commit — and an ITERATION milestone (anchored at its subflow's
    // entry commit) lands on that subflow's OWN stop exactly.
    for (const m of why) {
      const flowStep = stepForCommitIdx(flow, m.commitIdx);
      expect(flowStep).toBeGreaterThanOrEqual(0);
      const landed = flow[flowStep]!;
      expect(landed.commitIdx).toBeLessThanOrEqual(m.commitIdx);
      expect(flow.some((p) => p.commitIdx > landed.commitIdx && p.commitIdx <= m.commitIdx)).toBe(false);
      if (m.milestone === 'iteration') {
        expect(landed.runtimeStageId).toBe(m.runtimeStageId);
      }
    }

    // Flow → Why: every commit lands on the milestone at-or-nearest-BEFORE it
    // — never after, and no closer milestone exists between the two.
    for (const c of flow) {
      const whyStep = stepForCommitIdx(why, c.commitIdx);
      expect(whyStep).toBeGreaterThanOrEqual(0);
      const landed = why[whyStep]!.commitIdx;
      expect(landed).toBeLessThanOrEqual(c.commitIdx);
      const skippedCloser = why.some((p) => p.commitIdx > landed && p.commitIdx <= c.commitIdx);
      expect(skippedCloser).toBe(false);
    }

    // Round trip: an ITERATION milestone carried to Flow and back is the same
    // milestone — its anchor is its subflow's own mount commit, which exists
    // on both axes verbatim. (Milestones anchored to a boundary-OPEN index
    // that is not their own stage's commit — the collapsed Context stop —
    // round-trip to the enclosing place instead, which the direction laws
    // above already pin; exactness there would be inventing a correspondence
    // the recording does not carry.)
    for (let m = 0; m < why.length; m += 1) {
      if (why[m]!.milestone !== 'iteration') continue;
      const there = stepForCommitIdx(flow, why[m]!.commitIdx);
      const back = stepForCommitIdx(why, flow[there]!.commitIdx);
      expect(why[back]!.runtimeStageId).toBe(why[m]!.runtimeStageId);
    }
  });
});
