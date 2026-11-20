import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { inspectRenderer } from './renderer.mjs';

export const readJson = file => JSON.parse(readFileSync(file, 'utf8'));

export function archiveData(args) {
  const result = spawnSync('python3', ['-B', fileURLToPath(new URL('./archive-data.py', import.meta.url)), ...args],
    { encoding: 'utf8', timeout: 40_000, maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.error, undefined, 'bounded archive reader failed');
  assert.equal(result.status, 0, `bounded archive data refused: ${result.stdout?.slice(0, 300)}`);
  return JSON.parse(result.stdout);
}

/** Read the original renderer and bind it to the reviewed producer. */
export function inspectRendererInputs(directory) {
  return inspectRenderer(directory, readJson(join(directory, 'renderer.json')), archiveData);
}
