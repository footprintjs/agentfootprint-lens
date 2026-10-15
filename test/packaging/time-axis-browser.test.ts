/** @vitest-environment node */
/**
 * A browser using the packed time-axis helper needs the axis judges, not an
 * agent engine. The old escaping namespace retained the entire root barrel.
 * Inspect emitted module lengths: Vite visits unused imports during analysis,
 * so mere presence in its input graph is not evidence of shipped code.
 *
 * Like the other packaging checks, this reads built dist and never rebuilds it.
 * CI builds first; a source-only test invocation skips this packaging check.
 */
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { familyOf, isIn, moduleDefining } from './installedModules.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORE = join(ROOT, 'dist', 'core.js');

interface Chunk {
  readonly type: 'chunk';
  readonly code: string;
  readonly modules: Readonly<Record<string, { readonly renderedLength: number }>>;
}

describe.skipIf(!existsSync(CORE))('packed datasetTimeAxisOf browser closure', () => {
  it('retains the time judges but no agent execution or engine implementation', async () => {
    const { build } = await import('vite');
    const scratch = mkdtempSync(join(tmpdir(), 'lens-time-axis-browser-'));
    const entry = join(scratch, 'entry.js');
    writeFileSync(entry, [
      "import { datasetTimeAxisOf } from 'agentfootprint-lens/core';",
      'globalThis.__datasetTimeAxisOf = datasetTimeAxisOf;',
    ].join('\n'));
    const result = await build({
      configFile: false,
      logLevel: 'silent',
      root: scratch,
      resolve: { alias: { 'agentfootprint-lens/core': CORE } },
      define: { 'process.env.NODE_ENV': '"production"' },
      build: {
        write: false,
        minify: false,
        sourcemap: false,
        reportCompressedSize: false,
        rollupOptions: {
          input: entry,
          external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
        },
      },
    });
    const outputs = (Array.isArray(result) ? result : [result]) as { output: readonly { type: string }[] }[];
    const chunks = outputs.flatMap((output) => output.output)
      .filter((output): output is Chunk => output.type === 'chunk');
    const retained = new Set(chunks.flatMap((chunk) => Object.entries(chunk.modules)
      .filter(([, module]) => module.renderedLength > 0)
      .map(([id]) => id.replace(/\\/g, '/'))));
    // The agent execution engine and footprintjs's runner and traverser,
    // located by what each part defines — a dependency's dist layout is its
    // own and moves (see installedModules.ts). A part that cannot be found
    // throws. The axis check below proves the helper's real paths and the
    // bundler's module ids agree for an installed package; every part here
    // comes from the same resolution, so the absence is real.
    const engine = [
      moduleDefining('Agent'),
      moduleDefining('RunnerBase'),
      familyOf('AgentBuilder').folder, // the agent's chart builders
      familyOf('Sequence').folder, // the core-flow compositions
      familyOf('swarm').folder, // the multi-agent patterns
      familyOf('FlowChartExecutor', 'footprintjs').folder, // the run wiring
      familyOf('traversalContextFor', 'footprintjs').folder, // the traverser
    ];
    const runtime = [...retained].filter((id) => engine.some((part) => isIn(id, part)));
    const bytes = chunks.reduce((total, chunk) => total + Buffer.byteLength(chunk.code), 0);

    // Before/after evidence is useful, but the invariant is ownership, not a
    // brittle byte threshold that grows stale when the time library evolves.
    console.info(`datasetTimeAxisOf browser: ${bytes} JS bytes; ${retained.size} retained modules; ${runtime.length} execution modules`);
    expect(chunks.some((chunk) => chunk.code.includes('datasetTimeAxisOf'))).toBe(true);
    const axis = moduleDefining('readTimeAxis');
    expect([...retained].some((id) => isIn(id, axis)),
      'the real library axis judges must still be present').toBe(true);
    expect(runtime, 'a pure dataset reader must not ship the agent execution engine').toEqual([]);
  }, 120_000);
});
