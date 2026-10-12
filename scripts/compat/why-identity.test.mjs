import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { assertWhyIdentity, readWhyIdentity, whyArchivePath } from './why-identity.mjs';

const sourceManifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

function fixture(manifest = sourceManifest) {
  const root = mkdtempSync(join(tmpdir(), 'why-compat-identity-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify(manifest));
  return root;
}

function contractFor(identity) {
  return { schema: 1, whyIdentity: identity,
    why: { name: identity.name, version: identity.version, path: identity.filename } };
}

test('a metadata-only future release derives and consumes its own archive identity', () => {
  const root = fixture();
  const current = readWhyIdentity(root);
  const nextVersion = `${Number(current.version.split('.')[0]) + 1}.0.0`;
  const nextManifest = { ...sourceManifest, version: nextVersion };
  writeFileSync(join(root, 'package.json'), JSON.stringify(nextManifest));
  assert.deepEqual({ ...nextManifest, version: sourceManifest.version }, sourceManifest,
    'the positive control changes release metadata only');
  const next = readWhyIdentity(root);
  assert.deepEqual(next, { name: sourceManifest.name, version: nextVersion,
    filename: `${sourceManifest.name}-${nextVersion}.tgz` });
  assert.notEqual(next.filename, current.filename);
  const contract = contractFor(next);
  assert.deepEqual(assertWhyIdentity(contract, root), next);
  writeFileSync(join(root, 'contract.json'), JSON.stringify(contract));
  assert.equal(whyArchivePath(root, root), resolve(root, next.filename));
  assert.throws(() => assertWhyIdentity(contractFor(current), root), /checked Why source/);
});

test('checked source rejects another package and unsafe or malformed versions', () => {
  assert.throws(() => readWhyIdentity(fixture({ ...sourceManifest, name: 'another-package' })), /Why Lens package/);
  for (const version of [undefined, 77, '', 'latest', '01.2.3', '1.2.3-01',
    '../1.2.3', '1.2.3/extra', '1.2.3\\extra', '1.2.3\n', '1.2.3;echo injected']) {
    assert.throws(() => readWhyIdentity(fixture({ ...sourceManifest, version })), /Why version/);
  }
  const prerelease = readWhyIdentity(fixture({ ...sourceManifest, version: '1.2.3-next.1+build.2' }));
  assert.equal(prerelease.filename, `${sourceManifest.name}-1.2.3-next.1+build.2.tgz`);
});

test('contract identity, archive name, version and exact basename must all agree with checked source', () => {
  const root = fixture();
  const identity = readWhyIdentity(root);
  const contract = contractFor(identity);
  assert.deepEqual(assertWhyIdentity(contract, root), identity);
  for (const identityPatch of [
    { name: 'another-package' }, { version: '123.0.0' }, { filename: 'arbitrary.tgz' },
  ]) {
    assert.throws(() => assertWhyIdentity({ ...contract,
      whyIdentity: { ...identity, ...identityPatch } }, root), /checked Why source/);
  }
  for (const archivePatch of [
    { name: 'another-package' }, { version: '123.0.0' },
    ...['arbitrary.tgz', `../${identity.filename}`, `subdir/${identity.filename}`,
      `subdir\\${identity.filename}`, `/${identity.filename}`, `${identity.filename}\n`]
      .map((path) => ({ path })),
  ]) {
    const mismatch = { ...contract, why: { ...contract.why, ...archivePatch } };
    assert.throws(() => assertWhyIdentity(mismatch, root), /Why archive/);
    writeFileSync(join(root, 'contract.json'), JSON.stringify(mismatch));
    assert.throws(() => whyArchivePath(root, root), /Why archive/);
  }
  assert.throws(() => assertWhyIdentity({ ...contract, whyIdentity: undefined }, root));
});
