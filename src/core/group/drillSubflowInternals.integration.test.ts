/**
 * Drilled subflow internals — end-to-end against a REAL agent run.
 *
 * The unit tests in cursorPositionsAtDrill.test.ts prove the overlay-derived
 * drill stops with synthetic execution orders. THIS proves it against a real
 * dynamic agent: drilling into the Injection Engine produces a scrub stop per
 * internal stage (Gather/Evaluate/Route/Delta), and — the load-bearing part —
 * each stop's runtimeStageId is actually present in the runtime overlay's
 * executionOrder, so LensFlow's `findIndex` resolves a scrubIndex and TracedFlow
 * lights the node. (A subflow's internal commits are NOT in the parent commit
 * log, so without the overlay path these stops could never exist — that's the
 * bug this fixes.)
 */
import { describe, it, expect } from 'vitest';
import { Agent, defineTool, defineInstruction, mock, milestoneFor } from 'agentfootprint';
import { LensRecorder } from '../LensRecorder.js';
import { buildGroups } from './buildGroups.js';
import { buildCommitSyncMap } from './buildCommitSyncMap.js';
import { resolveDrillChain } from './drillResolve.js';
import { cursorPositionsAtDrill } from './cursorPositionsAtDrill.js';

const localOf = (id: string): string => id.split('#')[0]!.split('/').pop()!;

describe('drilled subflow internals — integration (real dynamic agent)', () => {
  it('drilling into the Injection Engine lights Gather/Evaluate/Route/Delta on scrub', async () => {
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
      .instruction(defineInstruction({ id: 'sp', prompt: 'cite sources' }))
      .tool(echo)
      .build();

    const rec = new LensRecorder();
    const off = rec.observe(agent as never);
    await agent.run({ message: 'go' });
    // Read WHILE observing — the overlay/commit log reach through the live runner
    // (off() clears it). Mirrors the lens render path.
    const groups = buildGroups(rec.boundary.boundaryIndex);
    const commits = buildCommitSyncMap(rec);
    const overlay = rec.runtime.getOverlay();

    // Resolve the drill the same way a node click does (the IE box id).
    const drillPath = resolveDrillChain(groups, 'sf-injection-engine');
    expect(drillPath).not.toBeNull();

    // Pass the REAL milestone classifier — exactly what useCursorPositions does in
    // production. (An earlier version of this test passed `undefined` here and so
    // missed that the classifier turns the IE's own boundary mount commits into
    // bogus "Iteration" stops, masking the internals.)
    const positions = cursorPositionsAtDrill(
      groups,
      commits,
      drillPath!,
      milestoneFor,
      overlay.executionOrder,
    );
    off();

    // The drill produces a boundary anchor + one stop per internal stage —
    // NOT the IE's own boundary re-surfaced as "Iteration" stops.
    expect(positions.some((p) => /Iteration/.test(p.label))).toBe(false);
    const internals = positions.filter((p) => p.kind === 'commit');
    const internalLocals = internals.map((p) => localOf(p.runtimeStageId));
    expect(internalLocals).toEqual(['gather', 'evaluate', 'route', 'delta']);
    // Labels are clean (path prefix stripped): Gather/Evaluate/Route/Delta.
    expect(internals.map((p) => p.label)).toEqual(['Gather', 'Evaluate', 'Route', 'Delta']);

    // LOAD-BEARING: every internal stop id must exist in executionOrder, else
    // LensFlow's findIndex returns -1 and the node never lights.
    const execIds = new Set(overlay.executionOrder.map((e) => e.runtimeStageId));
    for (const p of internals) {
      expect(execIds.has(p.runtimeStageId)).toBe(true);
    }

    // And each is scoped to the injection-engine subflow path.
    for (const p of internals) {
      expect(p.runtimeStageId.startsWith('sf-injection-engine/')).toBe(true);
    }
  });
});
