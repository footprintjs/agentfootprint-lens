import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { assertSourceClone, bootstrap, trackedSource } from './materialize.mjs';

test('an unrelated tracked source byte cannot be hidden by the temporary lock projection', t => {
  const root = mkdtempSync(join(tmpdir(), 'lens-native-source-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', root]);
  for (const [name, raw] of Object.entries({ 'package.json': '{}', 'package-lock.json': '{}', 'source.js': 'inert' }))
    writeFileSync(join(root, name), raw);
  execFileSync('git', ['add', '.'], { cwd: root });
  const expected = trackedSource(root);
  writeFileSync(join(root, 'package-lock.json'), 'temporary lock');
  assertSourceClone(root, expected);
  writeFileSync(join(root, 'source.js'), 'unrelated mutation');
  assert.throws(() => assertSourceClone(root, expected), /source changed during CONTROL proof/);
});

test('a desktop command refuses before using credentials or creating an input directory', t => {
  const root = mkdtempSync(join(tmpdir(), 'lens-native-desktop-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const facade = fileURLToPath(new URL('../source-inputs.mjs', import.meta.url));
  assert.throws(() => execFileSync(process.execPath, [facade, 'gates', '--evidence', join(root, 'input')],
    { env: { ...process.env, GITHUB_ACTIONS: 'false' }, stdio: 'pipe' }), error => {
    assert.match(error.stderr.toString(), /effectful source proof is hosted-only/); return true;
  });
  assert.equal(existsSync(join(root, 'input')), false);
});

test('the retired renderer download is an unknown action, even on a hosted runner', t => {
  const root = mkdtempSync(join(tmpdir(), 'lens-native-retired-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const facade = fileURLToPath(new URL('../source-inputs.mjs', import.meta.url));
  const env = { ...process.env, GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'footprintjs/agentfootprint-lens' };
  delete env.GH_TOKEN;
  assert.throws(() => execFileSync(process.execPath, [facade, 'fetch-renderer', '--out', join(root, 'input')],
    { env, stdio: 'pipe' }), error => {
    assert.match(error.stderr.toString(), /unknown source input action/); return true;
  });
  assert.equal(existsSync(join(root, 'input')), false);
});

test('the published CONTROL refuses the retired bootstrap target', () => {
  assert.throws(() => bootstrap({ mode: 'target' }), /closed bootstrap role/);
});

test('the packed consumer refuses the retired candidate input flag', () => {
  const runner = fileURLToPath(new URL('../run-lane.mjs', import.meta.url));
  assert.throws(() => execFileSync(process.execPath, [runner, '--source-inputs', 'unused'], { stdio: 'pipe' }),
    error => {
      assert.match(error.stderr.toString(), /unknown flag: --source-inputs/); return true;
    });
});
