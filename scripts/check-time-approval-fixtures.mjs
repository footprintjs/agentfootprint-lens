// Execute the actual generator without rewriting its historical recordings or
// leaking its pinned Date.now into the parent test process.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = join(root, 'test/time/fixtures');
const saved = new Map(readdirSync(fixtures).filter((name) => name.endsWith('.json'))
  .map((name) => [name, readFileSync(join(fixtures, name))]));
const cache = join(root, 'node_modules/.cache');
mkdirSync(cache, { recursive: true });
// Under node_modules so the generated module resolves this consumer's installed
// AgentFootprint, not a second package graph. Keep the output for inspection.
const scratch = mkdtempSync(join(cache, 'lens-time-approvals-'));
const source = readFileSync(join(fixtures, 'generate.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  fileName: 'generate.ts',
});
writeFileSync(join(scratch, 'generate.mjs'), outputText);
try {
  const run = spawnSync(process.execPath, [join(scratch, 'generate.mjs')], {
    cwd: scratch, encoding: 'utf8', timeout: 60_000,
  });
  assert.equal(run.error, undefined, run.error?.message);
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const rows = JSON.parse(readFileSync(join(scratch, 'time-rows-9.132.json'), 'utf8'));
  for (const name of ['clockOnResume', 'shifted']) {
    assert.equal(rows[name].ledger.filter((row) => row.kind === 'call' && row.toolCallId === 'c1').length,
      1, `${name}: the approved call must execute exactly once`);
    assert.ok(rows[name].ledger.some((row) => row.kind === 'period'), `${name}: missing period finding`);
  }
  assert.ok(rows.clockOnResume.ledger.some((row) => row.kind === 'clock-on-resume'));
  assert.ok(rows.shifted.ledger.some((row) => row.kind === 'period' && row.shifted?.byMs === 30 * 60_000));
  console.log(`Both approval fixtures resumed and executed once; output retained in ${scratch}`);
} finally {
  for (const [name, bytes] of saved) {
    assert.deepEqual(readFileSync(join(fixtures, name)), bytes, `historical fixture changed: ${name}`);
  }
}
