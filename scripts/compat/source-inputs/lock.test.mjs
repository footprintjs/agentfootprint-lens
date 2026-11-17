import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyNativeLock } from '../source-inputs.mjs';
import { cohortIdentity, names, pins } from './admission.mjs';
import { assertPublishedReceipt } from '../published-proof.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'lens-native-lock-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = { cohort: cohortIdentity(), archives: {} };
  const manifest = { name: 'agentfootprint-lens', devDependencies: {} };
  const packages = { '': manifest };
  for (const name of names) {
    const p = input.cohort.packages[name]; const path = join(root, p.filename);
    writeFileSync(path, 'inert locator fixture');
    input.archives[name] = { path };
    manifest.devDependencies[name] = `file:${path}`;
    packages[`node_modules/${name}`] = { version: p.version, integrity: p.integrity, resolved: `file:${path}` };
  }
  for (const [name, p] of Object.entries(pins.closure)) packages[`node_modules/${name}`] = {
    version: p.version, integrity: p.integrity, resolved: `https://registry.npmjs.org/${name}/-/${name}-${p.version}.tgz` };
  const lock = { lockfileVersion: 3, packages };
  const write = () => writeFileSync(join(root, 'package-lock.json'), JSON.stringify(lock));
  write(); return { root, input, manifest, lock, write };
}

test('the temporary strict lock must join the actual original locators and all native owners', t => {
  const f = fixture(t);
  const result = verifyNativeLock(f.root, f.manifest, f.input);
  assert.equal(result.pins.foottrace, '2.0.0');
  assert.equal(result.packages.agentfootprint.tarball, f.manifest.devDependencies.agentfootprint);
  assert.throws(() => assertPublishedReceipt({ kind: result.kind }, Buffer.from('inert'),
    result.packages.agentfootprint), { code: 'ERR_ASSERTION' });
});

for (const [label, change] of [
  ['stale root', f => { f.lock.packages[''] = { ...f.manifest, devDependencies: {} }; }],
  ['wrong version', f => { f.lock.packages['node_modules/foottrace'].version = '1.11.1'; }],
  ['wrong integrity', f => { f.lock.packages['node_modules/foottrace'].integrity = 'sha512-forged'; }],
  ['registry substitute', f => { f.lock.packages['node_modules/agentfootprint'].resolved = 'https://example.invalid/af.tgz'; }],
  ['unknown file', f => { f.lock.packages['node_modules/other'] = { resolved: 'file:/unknown' }; }],
  ['linked input', f => { f.lock.packages['node_modules/foottrace'].link = true; }],
  ['duplicate context', f => { f.lock.packages['node_modules/other/node_modules/contextfootprint'] = f.lock.packages['node_modules/contextfootprint']; }],
  ['changed context', f => { f.lock.packages['node_modules/contextfootprint'].version = '0.1.2'; }],
  ['CONTROL role', f => { f.input.cohort.kind = 'CONTROL'; }],
]) test(`${label} cannot qualify a native temporary lock`, t => {
  const f = fixture(t); change(f); f.write();
  assert.throws(() => verifyNativeLock(f.root, f.manifest, f.input), { code: 'ERR_ASSERTION' });
});
