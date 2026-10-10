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
    const runtime = [...retained].filter((id) =>
      /\/agentfootprint\/dist\/esm\/(?:core\/(?:Agent|RunnerBase)\.js|core\/agent\/|core-flow\/|patterns\/)/.test(id)
      || /\/footprintjs\/dist\/esm\/lib\/(?:runner|engine)\//.test(id));
    const bytes = chunks.reduce((total, chunk) => total + Buffer.byteLength(chunk.code), 0);

    // Before/after evidence is useful, but the invariant is ownership, not a
    // brittle byte threshold that grows stale when the time library evolves.
    console.info(`datasetTimeAxisOf browser: ${bytes} JS bytes; ${retained.size} retained modules; ${runtime.length} execution modules`);
    expect(chunks.some((chunk) => chunk.code.includes('datasetTimeAxisOf'))).toBe(true);
    expect([...retained].some((id) => id.endsWith('/agentfootprint/dist/esm/core/time/axis.js')),
      'the real library axis judges must still be present').toBe(true);
    expect(runtime, 'a pure dataset reader must not ship the agent execution engine').toEqual([]);
  }, 120_000);
});
