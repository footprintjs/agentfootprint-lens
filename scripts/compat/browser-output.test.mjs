import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertBrowserOutputSafe, assertBrowserOutputUnchanged, captureBrowserOutput } from './browser-output.mjs';

function output(t) {
  const directory = mkdtempSync(join(tmpdir(), 'why-browser-output-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'assets'));
  writeFileSync(join(directory, 'index.html'), '<script src="/assets/index.js"></script>');
  writeFileSync(join(directory, 'assets/index.js'), 'console.log("final")');
  return directory;
}

test('hashes the final written entry, not the stale generateBundle code', t => {
  const directory = output(t);
  const preFinalCode = 'import("./chunk.js")';
  const finalCode = 'import("./chunk.js").then(value => value.default)';
  writeFileSync(join(directory, 'assets/index.js'), preFinalCode);
  const beforeRewrite = captureBrowserOutput(directory);
  writeFileSync(join(directory, 'assets/index.js'), finalCode);
  const actual = captureBrowserOutput(directory);
  assert.equal(actual.files['assets/index.js'], createHash('sha256').update(finalCode).digest('hex'));
  assert.notEqual(actual.files['assets/index.js'], beforeRewrite.files['assets/index.js']);
  assert.throws(() => assertBrowserOutputUnchanged(directory, beforeRewrite), /changed during/);
  assertBrowserOutputSafe(actual);
  assertBrowserOutputUnchanged(directory, actual);
});

test('rejects Node runtime text introduced after generateBundle', t => {
  const directory = output(t);
  assertBrowserOutputSafe(captureBrowserOutput(directory));
  for (const forbidden of ['node:module', 'node:fs', 'createRequire']) {
    writeFileSync(join(directory, 'assets/index.js'), `console.log(${JSON.stringify(forbidden)})`);
    const actual = captureBrowserOutput(directory);
    assert.deepEqual(actual.forbiddenRuntimeFiles, ['assets/index.js']);
    assert.throws(() => assertBrowserOutputSafe(actual), /Final emitted JavaScript/);
  }
});

test('rejects mutation, addition and removal of served files after capture', t => {
  const directory = output(t);
  const snapshot = captureBrowserOutput(directory);
  writeFileSync(join(directory, 'assets/index.js'), 'console.log("mutated")');
  assert.throws(() => assertBrowserOutputUnchanged(directory, snapshot), /changed during/);
  writeFileSync(join(directory, 'assets/index.js'), 'console.log("final")');
  writeFileSync(join(directory, 'assets/extra.js'), 'console.log("extra")');
  assert.throws(() => assertBrowserOutputUnchanged(directory, snapshot), /changed during/);
  rmSync(join(directory, 'assets/extra.js'));
  rmSync(join(directory, 'index.html'));
  assert.throws(() => assertBrowserOutputUnchanged(directory, snapshot), /changed during/);
});

test('scans every final JavaScript file, not just chunks known to a hook', t => {
  const directory = output(t);
  writeFileSync(join(directory, 'assets/final-extra.mjs'), 'import "node:fs"');
  assert.throws(() => assertBrowserOutputSafe(captureBrowserOutput(directory)), /Final emitted JavaScript/);
});
