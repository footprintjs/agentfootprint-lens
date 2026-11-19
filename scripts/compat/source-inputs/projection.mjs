import assert from 'node:assert/strict';
import { isAbsolute, resolve } from 'node:path';
import { names } from './admission.mjs';

export function projectManifest(authored, paths) {
  assert.equal(authored.name, 'agentfootprint-lens');
  assert.deepEqual(Object.keys(paths).sort(), [...names].sort(), 'closed three-name projection');
  const projected = structuredClone(authored);
  for (const name of names) {
    assert.ok(isAbsolute(paths[name]) && paths[name].endsWith('.tgz'), 'original absolute archive path');
    assert.ok(typeof authored.devDependencies?.[name] === 'string', 'authored cohort pin');
    projected.devDependencies[name] = `file:${resolve(paths[name])}`;
  }
  return projected;
}

export function assertProjection(authored, projected, paths) {
  assert.deepEqual(projected, projectManifest(authored, paths), 'unrelated manifest projection forbidden');
}
