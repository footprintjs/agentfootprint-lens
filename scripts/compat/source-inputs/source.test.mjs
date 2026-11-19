import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { trackedSource } from './materialize.mjs';
import { assertSourceClone } from '../source-inputs.mjs';

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
  assert.throws(() => assertSourceClone(root, expected), /source changed during native proof/);
});

test('a desktop command refuses before using credentials or creating an input directory', t => {
  const root = mkdtempSync(join(tmpdir(), 'lens-native-desktop-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const facade = fileURLToPath(new URL('../source-inputs.mjs', import.meta.url));
  assert.throws(() => execFileSync(process.execPath, [facade, 'fetch', '--out', join(root, 'input')],
    { env: { ...process.env, GITHUB_ACTIONS: 'false' }, stdio: 'pipe' }), error => {
    assert.match(error.stderr.toString(), /effectful source proof is hosted-only/); return true;
  });
  assert.equal(existsSync(join(root, 'input')), false);
});
