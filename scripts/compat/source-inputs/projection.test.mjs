import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as input from '../source-inputs.mjs';

const manifest = { name: 'agentfootprint-lens', version: '0.82.0',
  peerDependencies: { foottrace: '^2.0.0-rc.0' }, dependencies: { dagre: '^0.8.5' },
  devDependencies: { agentfootprint: '15.0.0-rc.0', footprintjs: '13.0.0-rc.0', foottrace: '2.0.0-rc.0',
    typescript: '~5.4.5' } };
const inputs = { agentfootprint: '/in/agentfootprint-15.0.0-rc.0.tgz',
  footprintjs: '/in/footprintjs-13.0.0.tgz', foottrace: '/in/foottrace-2.0.0.tgz' };

test('the native projection changes exactly three dev slots without mutating authored data', () => {
  assert.equal(typeof input.projectManifest, 'function');
  const before = structuredClone(manifest);
  const projected = input.projectManifest(manifest, inputs);
  for (const n of Object.keys(inputs)) assert.equal(projected.devDependencies[n], 'file:' + inputs[n]);
  for (const n of Object.keys(inputs)) projected.devDependencies[n] = manifest.devDependencies[n];
  assert.deepEqual(projected, manifest); assert.deepEqual(manifest, before);
  assert.throws(() => input.projectManifest(manifest, { ...inputs, unknown: '/other' }));
});

test('hidden aliased nested record owners are counted and package links refuse', t => {
  assert.equal(typeof input.scanInstalledPackages, 'function');
  const root = mkdtempSync(join(tmpdir(), 'lens-native-physical-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const p of ['node_modules/foottrace', 'node_modules/outer/node_modules/.alias']) {
    mkdirSync(join(root, p), { recursive: true });
    writeFileSync(join(root, p, 'package.json'), JSON.stringify({ name: 'foottrace', version: '2.0.0' }));
  }
  // The outer package must be a real package, too.
  writeFileSync(join(root, 'node_modules/outer/package.json'), JSON.stringify({ name: 'outer', version: '1.0.0' }));
  const found = input.scanInstalledPackages(root).filter(p => p.manifest.name === 'foottrace');
  assert.equal(found.length, 2);
});
