import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyNativeLock } from '../source-inputs.mjs';
import * as entry from '../source-inputs.mjs';
import { cohortIdentity, names, pins } from './admission.mjs';
import { assertPublishedReceipt } from '../published-proof.mjs';
import { candidate } from '../contract.mjs';

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
  assert.equal(result.pins.foottrace, '2.1.0');
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

const workflow = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const matrixFlows = JSON.parse(workflow.match(/flow:\s*(\[[^\]]+\])/)?.[1] ?? '[]');
assert.ok(matrixFlows.length > 0);
for (const flow of matrixFlows) test(`packed matrix role ${flow} requires exact Lens and renderer archive locators`, t => {
  const flowVersion = flow === 'candidate' ? candidate.version : flow;
  assert.equal(typeof entry.verifyPackedNativeLock, 'function');
  const f = fixture(t);
  const manifest = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url)));
  const packed = {};
  for (const [role, pkg] of [['why', manifest], ['flow', { name: 'footprint-explainable-ui', version: flowVersion }]]) {
    const bytes = Buffer.from(`inert pre-inspected ${role} archive locator fixture`);
    const path = join(f.root, `${pkg.name}-${pkg.version}.tgz`); writeFileSync(path, bytes);
    packed[role] = { path, manifest: pkg, name: pkg.name, version: pkg.version,
      sha256: createHash('sha256').update(bytes).digest('hex') };
    f.manifest.devDependencies[pkg.name] = `file:${path}`;
    f.lock.packages[`node_modules/${pkg.name}`] = { version: pkg.version, resolved: `file:${path}`,
      integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}` };
  }
  f.write();
  assert.throws(() => verifyNativeLock(f.root, f.manifest, f.input), /unknown file lock input/);
  if (flow === 'candidate') {
    assert.throws(() => entry.verifyPackedNativeLock(f.root, f.manifest, f.input, packed), { code: 'ERR_ASSERTION' });
    // Correct declared identity alone must not bless the deliberately inert bytes.
    // A separate bounded probe also exercises this same guard with the actual qualified original.
    packed.flow.sha256 = candidate.sha256;
    assert.throws(() => entry.verifyPackedNativeLock(f.root, f.manifest, f.input, packed), /packed archive digest/);
    return;
  }
  assert.equal(entry.verifyPackedNativeLock(f.root, f.manifest, f.input, packed).pins.foottrace, '2.1.0');
  for (const unknown of ['0.39.0', '1.0.0', '1.1.2', 'latest']) {
    packed.flow.version = unknown;
    assert.throws(() => entry.verifyPackedNativeLock(f.root, f.manifest, f.input, packed), /Unknown renderer version/);
  }
  packed.flow.version = flowVersion;
  const rendererLock = f.lock.packages['node_modules/footprint-explainable-ui'];
  const integrity = rendererLock.integrity;
  rendererLock.integrity = 'sha512-forged'; f.write();
  assert.throws(() => entry.verifyPackedNativeLock(f.root, f.manifest, f.input, packed), { code: 'ERR_ASSERTION' });
  rendererLock.integrity = integrity; f.write();
  f.lock.packages['node_modules/unknown'] = { resolved: `file:${packed.why.path}` };
  f.write();
  assert.throws(() => entry.verifyPackedNativeLock(f.root, f.manifest, f.input, packed), /unknown file lock input/);
  delete f.lock.packages['node_modules/unknown']; f.write();
  writeFileSync(packed.why.path, 'changed bytes');
  assert.throws(() => entry.verifyPackedNativeLock(f.root, f.manifest, f.input, packed), /packed archive digest/);
});
