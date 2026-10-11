import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashFiles, sha256 } from './contract.mjs';

// Call only after the bundler finishes writing. generateBundle metadata can
// precede Vite's final import/preload rewrite and is not a served-byte proof.
export function captureBrowserOutput(directory) {
  const files = hashFiles(directory);
  const forbiddenRuntimeFiles = [];
  assert.ok(Object.keys(files).length, 'A browser build must emit files');
  for (const [file, digest] of Object.entries(files)) {
    if (!/\.(?:js|mjs|cjs)$/.test(file)) continue;
    const bytes = readFileSync(join(directory, file));
    assert.equal(sha256(bytes), digest, `${file} changed while capturing the browser build`);
    if (/(?:node:module|node:fs|createRequire)/.test(bytes.toString('utf8'))) forbiddenRuntimeFiles.push(file);
  }
  return { files, forbiddenRuntimeFiles };
}

export function assertBrowserOutputSafe(snapshot) {
  assert.deepEqual(snapshot.forbiddenRuntimeFiles, [], 'Final emitted JavaScript must not contain Node runtime imports');
}

export function assertBrowserOutputUnchanged(directory, snapshot) {
  const actual = captureBrowserOutput(directory);
  assert.deepEqual(actual.files, snapshot.files, 'Served browser build changed during the browser run');
  assertBrowserOutputSafe(actual);
}
