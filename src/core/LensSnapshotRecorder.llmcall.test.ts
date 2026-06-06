import { describe, it, expect } from 'vitest';
import { LLMCall, MockProvider } from 'agentfootprint';
import { lensSnapshotRecorder } from './LensSnapshotRecorder.js';
import { LensRecorder } from './LensRecorder.js';

describe('LensSnapshotRecorder — atomic LLMCall (reproduces playground bug)', () => {
  it('direct attach: emits a primitive-bearing subflow node for sf-llm-call', async () => {
    const runner = LLMCall.create({
      provider: new MockProvider({ reply: 'hello' }),
      model: 'mock',
    })
      .system('You are helpful.')
      .build();

    const rec = lensSnapshotRecorder();
    runner.attach(rec);
    await runner.run({ message: 'hi' });

    const g = rec.getStepGraph();
    console.log('[direct] Nodes:', g.nodes.map((n) => ({
      kind: n.kind, label: n.label, primitiveKind: n.primitiveKind,
      runtimeStageId: n.runtimeStageId,
    })));
    const llmCallNode = g.nodes.find((n) => n.primitiveKind === 'LLMCall');
    expect(llmCallNode).toBeDefined();
    expect(llmCallNode?.runtimeStageId).toMatch(/^sf-llm-call#/);
  });

  it('via LensRecorder.observe (full playground path) — should also emit node', async () => {
    const runner = LLMCall.create({
      provider: new MockProvider({ reply: 'hello' }),
      model: 'mock',
    })
      .system('You are helpful.')
      .build();

    const lensRec = new LensRecorder();
    const off = lensRec.observe(runner);
    await runner.run({ message: 'hi' });
    off();

    const g = lensRec.snapshot.getStepGraph();
    console.log('[via LensRecorder] Nodes:', g.nodes.map((n) => ({
      kind: n.kind, label: n.label, primitiveKind: n.primitiveKind,
      runtimeStageId: n.runtimeStageId,
    })));
    const llmCallNode = g.nodes.find((n) => n.primitiveKind === 'LLMCall');
    expect(llmCallNode).toBeDefined();
  });
});
