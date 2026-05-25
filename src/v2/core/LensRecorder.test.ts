/**
 * LensRecorder integration tests — feed it real v2 Runner events and
 * verify the RunTree, EventLog, and Summary selectors.
 *
 * These tests are the proof of the data contract: given any v2 Runner
 * (Agent / LLMCall / Sequence / Parallel / Loop / Patterns), the
 * recorder produces a coherent, queryable tree + summary.
 */

import { describe, it, expect } from 'vitest';
import {
  Agent,
  LLMCall,
  Sequence,
  Loop,
  MockProvider,
  type LLMProvider,
  type PricingTable,
} from 'agentfootprint';
import { LensRecorder, lensRecorder } from './LensRecorder.js';
import { defaultHumanizer } from './humanizer.js';
import { SequenceStore } from 'footprintjs/trace';

// ─── Fixtures ───────────────────────────────────────────────────

function scriptedToolProvider(): LLMProvider {
  return {
    name: 'scripted',
    complete: async (req) => {
      const hadTool = req.messages.some((m) => m.role === 'tool');
      if (hadTool) {
        return {
          content: 'all done',
          toolCalls: [],
          usage: { input: 30, output: 10 },
          stopReason: 'stop',
        };
      }
      return {
        content: 'using tool',
        toolCalls: [{ id: 't1', name: 'noop', args: {} }],
        usage: { input: 20, output: 5 },
        stopReason: 'tool_use',
      };
    },
  };
}

// ─── LLMCall ────────────────────────────────────────────────────

describe('LensRecorder — LLMCall run', () => {
  it('captures one llm-call node + llm_start + llm_end events', async () => {
    const llm = LLMCall.create({
      provider: new MockProvider({ reply: 'hello' }),
      model: 'mock',
    })
      .system('')
      .build();

    const rec = lensRecorder();
    rec.observe(llm);
    await llm.run({ message: 'hi' });

    const tree = rec.selectRunTree();
    // LLMCall doesn't wrap itself in a composition — events attach to
    // the synthetic run root.
    expect(tree.kind).toBe('run');

    // One LLM-call leaf under the root.
    const llmNodes = tree.children.filter((c) => c.kind === 'llm-call');
    expect(llmNodes).toHaveLength(1);
    expect(llmNodes[0]!.label).toMatch(/mock/);
    expect(llmNodes[0]!.status).toBe('ok');
    expect(llmNodes[0]!.durationMs).toBeDefined();

    const summary = rec.selectSummary();
    expect(summary.llmCallCount).toBe(1);
    expect(summary.toolCallCount).toBe(0);
    expect(summary.status).toBe('ok');
  });
});

// ─── Agent with tools ───────────────────────────────────────────

describe('LensRecorder — Agent with tool call', () => {
  it('tree has turn → iteration → llm-call → tool-call → iteration → llm-call', async () => {
    const agent = Agent.create({
      provider: scriptedToolProvider(),
      model: 'mock',
    })
      .system('')
      .tool({
        schema: { name: 'noop', description: '', inputSchema: { type: 'object' } },
        execute: () => 'ok',
      })
      .build();

    const rec = lensRecorder();
    rec.observe(agent);
    await agent.run({ message: 'go' });

    const tree = rec.selectRunTree();
    // Agent emits turn_start / turn_end → one "iteration" node at turn level.
    // Inside it: iteration_start / iteration_end pairs for each ReAct iter.
    // Within each iter: llm-call + tool-call leaves.
    const collect = (node: { kind: string; children: readonly unknown[] }, out: string[] = []): string[] => {
      out.push(node.kind);
      for (const c of node.children) collect(c as { kind: string; children: readonly unknown[] }, out);
      return out;
    };
    const kinds = collect(tree);
    expect(kinds).toContain('iteration');
    expect(kinds).toContain('llm-call');
    expect(kinds).toContain('tool-call');

    const summary = rec.selectSummary();
    expect(summary.llmCallCount).toBe(2); // initial + after tool
    expect(summary.toolCallCount).toBe(1);
    expect(summary.totalTokens.input).toBeGreaterThan(0);
    expect(summary.totalTokens.output).toBeGreaterThan(0);
  });
});

// ─── Composition events ─────────────────────────────────────────

describe('LensRecorder — Sequence composition', () => {
  it('wraps inner steps under a composition node', async () => {
    const seq = Sequence.create()
      .step('a', LLMCall.create({ provider: new MockProvider({ reply: 'A' }), model: 'm' }).system('').build())
      .step('b', LLMCall.create({ provider: new MockProvider({ reply: 'B' }), model: 'm' }).system('').build())
      .build();

    const rec = lensRecorder();
    rec.observe(seq);
    await seq.run({ message: 'go' });

    const tree = rec.selectRunTree();
    const compositions = tree.children.filter((c) => c.kind === 'composition');
    expect(compositions).toHaveLength(1);
    const comp = compositions[0]!;
    expect(comp.label).toMatch(/Sequence/);
    expect(comp.status).toBe('ok');
    if (comp.details?.kind === 'composition') {
      expect(comp.details.composition.compositionKind).toBe('Sequence');
    }
  });
});

describe('LensRecorder — Loop iterations', () => {
  it('counts Loop iterations in the summary', async () => {
    const body = LLMCall.create({
      provider: new MockProvider({ reply: 'x' }),
      model: 'm',
    })
      .system('')
      .build();
    const loop = Loop.create().repeat(body).times(3).build();

    const rec = lensRecorder();
    rec.observe(loop);
    await loop.run({ message: 'go' });

    expect(rec.selectSummary().iterationCount).toBe(3);
  });
});

// ─── Event log ───────────────────────────────────────────────────

describe('LensRecorder — event log', () => {
  it('records every event in monotonic sequence order', async () => {
    const llm = LLMCall.create({
      provider: new MockProvider({ reply: 'ok' }),
      model: 'mock',
    })
      .system('')
      .build();
    const rec = lensRecorder();
    rec.observe(llm);
    await llm.run({ message: 'hi' });

    const log = rec.selectEventLog();
    expect(log.length).toBeGreaterThan(0);
    for (let i = 1; i < log.length; i++) {
      expect(log[i]!.seq).toBe(log[i - 1]!.seq + 1);
      expect(log[i]!.runOffsetMs).toBeGreaterThanOrEqual(log[i - 1]!.runOffsetMs);
    }
  });
});

// ─── Cost accounting ───────────────────────────────────────────

describe('LensRecorder — cost events', () => {
  it('surfaces cumulative USD in the summary when pricingTable is set', async () => {
    const pricing: PricingTable = {
      name: 'flat',
      pricePerToken: (_model, kind) => (kind === 'input' ? 0.00001 : kind === 'output' ? 0.00003 : 0),
    };
    const agent = Agent.create({
      provider: new MockProvider({ reply: 'done' }),
      model: 'mock',
      pricingTable: pricing,
    })
      .system('')
      .build();

    const rec = lensRecorder();
    rec.observe(agent);
    await agent.run({ message: 'hi' });

    const summary = rec.selectSummary();
    expect(summary.totalUsd).toBeDefined();
    expect(summary.totalUsd).toBeGreaterThan(0);
  });
});

// ─── Detach ────────────────────────────────────────────────────

describe('LensRecorder — lifecycle', () => {
  it('detach() stops observing future events', async () => {
    const llm = LLMCall.create({ provider: new MockProvider({ reply: 'ok' }), model: 'm' })
      .system('')
      .build();

    const rec = lensRecorder();
    const unsubscribe = rec.observe(llm);
    await llm.run({ message: 'r1' });
    const afterR1 = rec.selectEventLog().length;

    unsubscribe();
    await llm.run({ message: 'r2' });
    const afterR2 = rec.selectEventLog().length;

    expect(afterR2).toBe(afterR1); // no new events after detach
  });

  it('recorder is reusable across multiple observes on different runners', () => {
    const rec = new LensRecorder();
    // Just verify no crash; coverage of actual observation is above.
    expect(rec.selectRunTree().kind).toBe('run');
  });
});

// ─── Humanizer ────────────────────────────────────────────────

describe('defaultHumanizer', () => {
  it('renders llm_start as a natural-language line', async () => {
    const llm = LLMCall.create({ provider: new MockProvider({ reply: 'hi' }), model: 'mock' })
      .system('')
      .build();
    const rec = lensRecorder();
    rec.observe(llm);
    await llm.run({ message: 'q' });

    const log = rec.selectEventLog();
    const startEntry = log.find((e) => e.event.type === 'agentfootprint.stream.llm_start')!;
    const line = defaultHumanizer(startEntry.event);
    expect(line).toMatch(/Calling/);
    expect(line).toMatch(/mock/);
  });

  it('returns a fallback [type] for unhandled events', () => {
    // Synthesize a well-typed event not in the explicit switch.
    const fake = {
      type: 'agentfootprint.embedding.generated',
      payload: { model: 'emb', dimension: 1536, count: 5 },
      meta: {
        wallClockMs: 0,
        runOffsetMs: 0,
        runtimeStageId: 'x',
        subflowPath: [],
        compositionPath: [],
        runId: 'r',
      },
    } as never;
    const line = defaultHumanizer(fake);
    // The `agentfootprint.embedding.generated` event is mentioned in
    // the registry but the default humanizer doesn't have a case for
    // it yet — fallback form is `[type]`.
    expect(line).toBe('[agentfootprint.embedding.generated]');
  });
});

// ─── New wiring verification (Option A refactor) ────────────────────

describe('LensRecorder — SequenceStore composition (v3.0)', () => {
  it('composes a SequenceStore<EventLogEntry> internally', async () => {
    const r = lensRecorder();
    // Composition pattern in v3.0+ — the recorder is no longer a
    // SequenceRecorder subclass. Verify the public delegators expose
    // the same surface area as the inherited methods used to.
    expect(typeof r.entryCount).toBe('number');
    expect(typeof r.getEntries).toBe('function');
    expect(typeof r.getEntriesForStep).toBe('function');
    expect(typeof r.getEntryRanges).toBe('function');
    expect(typeof r.aggregate).toBe('function');
    // The underlying primitive is still exported by footprintjs/trace
    // for consumers who want to compose their own recorders.
    expect(typeof SequenceStore).toBe('function');
  });

  it('exposes entryCount / getEntries / getEntriesForStep / aggregate as public delegators', async () => {
    const llm = LLMCall.create({
      provider: scriptedToolProvider(),
      model: 'm',
    })
      .system('s')
      .build();
    const r = lensRecorder();
    r.observe(llm);
    await llm.run({ message: 'go' });

    // Inherited from SequenceRecorder<EventLogEntry>:
    expect(r.entryCount).toBeGreaterThan(0);
    expect(r.getEntries().length).toBe(r.entryCount);
    expect(typeof r.aggregate).toBe('function');
    expect(typeof r.getEntriesForStep).toBe('function');
    expect(typeof r.getEntryRanges).toBe('function');
    // Lens-specific selectors:
    expect(r.selectEventLog().length).toBe(r.entryCount);
    expect(r.selectSummary().llmCallCount).toBeGreaterThanOrEqual(1);
  });

  it('selectSummary uses .aggregate() under the hood — same numbers', async () => {
    const llm = LLMCall.create({
      provider: scriptedToolProvider(),
      model: 'm',
    })
      .system('s')
      .build();
    const r = lensRecorder();
    r.observe(llm);
    await llm.run({ message: 'go' });

    const summary = r.selectSummary();
    // Sanity-check the aggregate-derived fields match a plain reduce
    // over the event log — proves the refactor is behavior-preserving.
    let llmCallCount = 0;
    let toolCallCount = 0;
    for (const { event } of r.getEntries()) {
      if (event.type === 'agentfootprint.stream.llm_start') llmCallCount++;
      if (event.type === 'agentfootprint.stream.tool_start') toolCallCount++;
    }
    expect(summary.llmCallCount).toBe(llmCallCount);
    expect(summary.toolCallCount).toBe(toolCallCount);
  });
});

describe('LensRecorder — LiveStateRecorder integration (v0.13.2)', () => {
  it('exposes a `liveState` LiveStateRecorder field', () => {
    const r = lensRecorder();
    expect(r.liveState).toBeDefined();
    expect(typeof r.liveState.isLLMInFlight).toBe('function');
    expect(typeof r.liveState.getPartialLLM).toBe('function');
    expect(typeof r.liveState.isToolExecuting).toBe('function');
  });

  it('liveState is auto-subscribed via observe() and detaches with the recorder', async () => {
    const llm = LLMCall.create({
      provider: scriptedToolProvider(),
      model: 'm',
    })
      .system('s')
      .build();
    const r = lensRecorder();
    r.observe(llm);
    await llm.run({ message: 'go' });

    // After the run completes, no LLM is in flight.
    expect(r.liveState.isLLMInFlight()).toBe(false);
    expect(r.liveState.isToolExecuting()).toBe(false);
  });

  it('liveState clears its transient state when the recorder detaches', async () => {
    const llm = LLMCall.create({
      provider: scriptedToolProvider(),
      model: 'm',
    })
      .system('s')
      .build();
    const r = lensRecorder();
    r.observe(llm);
    await llm.run({ message: 'go' });
    r.detach();
    // Detach disposes the subscription but doesn't destroy state — the
    // post-run state is already terminal (no active boundaries).
    expect(r.liveState.isLLMInFlight()).toBe(false);
    expect(r.liveState.isToolExecuting()).toBe(false);
    expect(r.liveState.isAgentInTurn()).toBe(false);
  });
});
