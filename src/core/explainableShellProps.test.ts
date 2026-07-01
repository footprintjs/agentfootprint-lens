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

import { lensRecorder } from './LensRecorder.js';
import {
  explainableShellPropsFromRunner,
  type ExplainableShellInputs,
} from './explainableShellProps.js';

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

describe('explainableShellPropsFromRunner — no `spec` (BOUNDARY/REGRESSION)', () => {
  it('omits the spec prop entirely (the silent-blank-chart source)', async () => {
    const { agent, rec } = await runAgent();
    const props = explainableShellPropsFromRunner(agent, rec);
    expect('spec' in props).toBe(false);
  });
});
