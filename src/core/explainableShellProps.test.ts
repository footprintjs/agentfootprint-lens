/**
 * explainableShellPropsFromRunner — 5-pattern tests.
 *
 * Locks the consumer-facing contract: ONE typed call returns the full,
 * cast-free `<ExplainableShell>` prop bundle (no `spec`), so a consumer cannot
 * mis-wire the data→UI seam (the silent-blank-chart class of bug).
 */
import { describe, it, expect } from 'vitest';
import { Agent } from 'agentfootprint';
import { MockProvider } from 'agentfootprint/llm-providers';

import type { CombinedNarrativeEntry } from 'footprintjs';

import { lensRecorder } from './LensRecorder.js';
import {
  explainableShellPropsFromRunner,
  toShellNarrativeEntries,
  type ExplainableShellInputs,
} from './explainableShellProps.js';

/** Every entry type `<ExplainableShell>` declares it understands. Anything
 *  footprintjs emits outside this set must be folded, not leaked. */
const SHELL_KNOWN_TYPES = [
  'stage', 'step', 'condition', 'fork', 'selector', 'subflow',
  'loop', 'break', 'error', 'pause', 'resume', 'emit',
] as const;

async function runAgent(opts: { withTool?: boolean } = {}) {
  let b = Agent.create({ provider: new MockProvider({ reply: 'done' }), model: 'mock' }).system('be helpful');
  if (opts.withTool) {
    b = b.tool({
      schema: { name: 'noop', description: '', inputSchema: { type: 'object' } },
      execute: () => 'ok',
    });
  }
  const agent = b.build();
  const rec = lensRecorder();
  rec.observe(agent);
  await agent.run({ message: 'go' });
  return { agent, rec };
}

describe('explainableShellPropsFromRunner — bundle completeness (UNIT)', () => {
  it('returns all four ExplainableShell inputs, none undefined', async () => {
    const { agent, rec } = await runAgent();
    const props = explainableShellPropsFromRunner(agent, rec);
    expect(props.runtimeSnapshot).toBeTruthy();
    expect(Array.isArray(props.narrativeEntries)).toBe(true);
    expect(props.traceGraph).toBeTruthy();
    expect(props.runtimeOverlay).toBeTruthy();
  });
});

describe('explainableShellPropsFromRunner — populated from a real run (FUNCTIONAL)', () => {
  it('traceGraph has nodes and narrativeEntries are non-empty', async () => {
    const { agent, rec } = await runAgent();
    const props = explainableShellPropsFromRunner(agent, rec);
    expect(props.traceGraph!.nodes.length).toBeGreaterThan(0);
    expect(props.narrativeEntries!.length).toBeGreaterThan(0);
  });
});

describe('explainableShellPropsFromRunner — spreadable as ExplainableShell props (INTEGRATION)', () => {
  it('the bundle is EXACTLY the four input props (spreadable, no extras)', async () => {
    const { agent, rec } = await runAgent();
    const props = explainableShellPropsFromRunner(agent, rec);
    expect(Object.keys(props).sort()).toEqual([
      'narrativeEntries',
      'runtimeOverlay',
      'runtimeSnapshot',
      'traceGraph',
    ]);
    // Type-level proof: the declared return type IS the eui prop subset.
    const typed: ExplainableShellInputs = props;
    expect(typed).toBe(props);
  });
});

describe('explainableShellPropsFromRunner — any agent shape (PROPERTY)', () => {
  it.each([{ withTool: false }, { withTool: true }])(
    'produces a complete bundle for agent shape %o',
    async (shape) => {
      const { agent, rec } = await runAgent(shape);
      const props = explainableShellPropsFromRunner(agent, rec);
      expect(props.runtimeSnapshot).toBeTruthy();
      expect(props.traceGraph!.nodes.length).toBeGreaterThan(0);
      expect(props.runtimeOverlay).toBeTruthy();
    },
  );
});

describe('toShellNarrativeEntries — footprintjs 9.15 retry entries (REGRESSION)', () => {
  const retry: CombinedNarrativeEntry = {
    type: 'retry',
    text: 'attempt 1 of 3 failed — retrying in 200ms',
    depth: 1,
    stageName: 'CallLLM',
    stageId: 'call-llm',
    runtimeStageId: 'call-llm#0',
  };

  it('renders a retry as a generic step line, keeping its own wording', () => {
    const [out] = toShellNarrativeEntries([retry]);
    expect(out!.type).toBe('step');
    expect(out!.text).toBe('attempt 1 of 3 failed — retrying in 200ms');
  });

  it('keeps every other field (depth, stage ids) so time-travel sync still works', () => {
    const [out] = toShellNarrativeEntries([retry]);
    expect(out!.depth).toBe(1);
    expect(out!.stageName).toBe('CallLLM');
    expect(out!.stageId).toBe('call-llm');
    expect(out!.runtimeStageId).toBe('call-llm#0');
  });

  it('does not drop the entry — count in equals count out, order preserved', () => {
    const entries: CombinedNarrativeEntry[] = [
      { type: 'stage', text: 'CallLLM', depth: 0 },
      retry,
      { type: 'step', text: 'wrote reply', depth: 1 },
    ];
    const out = toShellNarrativeEntries(entries);
    expect(out.map((e) => e.text)).toEqual(entries.map((e) => e.text));
  });
});

describe('toShellNarrativeEntries — eui vocabulary (PROPERTY)', () => {
  it.each(SHELL_KNOWN_TYPES)('passes a %s entry through untouched', (type) => {
    const [out] = toShellNarrativeEntries([{ type, text: 't', depth: 0 }]);
    expect(out!.type).toBe(type);
  });

  it('every emitted type is one eui declares — for any input type', () => {
    const inputs: CombinedNarrativeEntry['type'][] = [...SHELL_KNOWN_TYPES, 'retry'];
    const out = toShellNarrativeEntries(inputs.map((type) => ({ type, text: 't', depth: 0 })));
    for (const e of out) expect(SHELL_KNOWN_TYPES).toContain(e.type);
  });
});

describe('explainableShellPropsFromRunner — narrative vocabulary on a real run (INTEGRATION)', () => {
  it('no entry escapes with a type <ExplainableShell> cannot render', async () => {
    const { agent, rec } = await runAgent({ withTool: true });
    const props = explainableShellPropsFromRunner(agent, rec);
    for (const e of props.narrativeEntries!) expect(SHELL_KNOWN_TYPES).toContain(e.type);
  });
});

describe('explainableShellPropsFromRunner — no `spec` (BOUNDARY/REGRESSION)', () => {
  it('omits the spec prop entirely (the silent-blank-chart source)', async () => {
    const { agent, rec } = await runAgent();
    const props = explainableShellPropsFromRunner(agent, rec);
    expect('spec' in props).toBe(false);
  });
});
