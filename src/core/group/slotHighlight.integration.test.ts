/**
 * FIX 1 — commit-driven slot highlight, end-to-end against a REAL agent run.
 *
 * The unit tests in cursorPositionsAtDrill.test.ts prove the collapse logic with
 * synthetic commits. THIS proves it against the real commit positions a dynamic
 * agent produces (context-mount commits carrying the changed injection keys) —
 * the fragile part being WHERE those commits land relative to the slot groups.
 *
 * Expectation: turn 1 all 3 slots changed → all light; later turns only Messages
 * changed (system-prompt + tools re-emit identical content → empty commit) →
 * only Messages lights.
 */
import { describe, it, expect } from 'vitest';
import { Agent, defineTool, milestoneFor } from 'agentfootprint'
import { defineInstruction } from 'agentfootprint/injection-engine'
import { mock } from 'agentfootprint/llm-providers';
import { LensRecorder } from '../LensRecorder.js';
import { buildGroups } from './buildGroups.js';
import { buildCommitSyncMap } from './buildCommitSyncMap.js';
import { cursorPositionsAtDrill } from './cursorPositionsAtDrill.js';

const localOf = (id: string): string => id.split('#')[0]!.split('/').pop()!;

describe('slot highlight — integration (real dynamic agent)', () => {
  it('turn 1 lights all 3 slots; later turns light ONLY Messages', async () => {
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
          { toolCalls: [{ id: 'c2', name: 'echo', args: { m: 'b' } }] },
          { content: 'done' },
        ],
      }),
      model: 'mock',
      maxIterations: 5,
      reactMode: 'dynamic',
    })
      .system('be terse')
      .instruction(defineInstruction({ id: 'sp', prompt: 'cite sources' }))
      .tool(echo)
      .build();

    const rec = new LensRecorder();
    const off = rec.observe(agent as never);
    await agent.run({ message: 'go' });
    // Read the commit log WHILE still observing — getCommitLog reaches through
    // the live runner (off() clears it). This mirrors the lens render path.
    const groups = buildGroups(rec.boundary.boundaryIndex);
    const commits = buildCommitSyncMap(rec);
    const positions = cursorPositionsAtDrill(groups, commits, [], milestoneFor);
    off();

    // Context stops are the collapsed parallel slot stops.
    const contextStops = positions.filter((p) => p.kind === 'parallel');
    expect(contextStops.length).toBeGreaterThanOrEqual(2);

    const slotsOf = (p: (typeof contextStops)[number]) =>
      [...new Set((p.coActiveGroupIds ?? []).map(localOf))].sort();

    // Turn 1 — everything is fresh → all three slots light.
    expect(slotsOf(contextStops[0]!)).toEqual(['sf-messages', 'sf-system-prompt', 'sf-tools']);

    // A LATER turn — only Messages changed (history grew); system-prompt + tools
    // re-emitted identical content → empty commit → must NOT light.
    const later = contextStops[contextStops.length - 1]!;
    expect(slotsOf(later)).toEqual(['sf-messages']);
    expect(slotsOf(later)).not.toContain('sf-system-prompt');
    expect(slotsOf(later)).not.toContain('sf-tools');
  });
});
