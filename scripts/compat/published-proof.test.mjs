import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as proof from './published-proof.mjs';

const bytes = Buffer.from('synthetic published package');
const digest = (algorithm) => createHash(algorithm).update(bytes).digest(algorithm === 'sha512' ? 'base64' : 'hex');
const expected = { name: 'agentfootprint', version: '14.0.0-rc.0',
  tarball: 'https://registry.npmjs.org/agentfootprint/-/agentfootprint-14.0.0-rc.0.tgz',
  sha256: digest('sha256'), integrity: `sha512-${digest('sha512')}`, shasum: digest('sha1') };
const metadata = () => ({ name: expected.name, version: expected.version,
  dist: { tarball: expected.tarball, integrity: expected.integrity, shasum: expected.shasum } });
const receipt = () => ({ schema: 1, kind: 'published-registry-candidate', ...expected, bytes: bytes.length });
const lock = () => ({ lockfileVersion: 3, packages: {
  '': { devDependencies: { agentfootprint: expected.version } },
  'node_modules/agentfootprint': { version: expected.version, resolved: expected.tarball, integrity: expected.integrity },
} });

test('the published version is pinned to the independently proved offline digest and registry identity', () => {
  assert.equal(proof.publishedCandidate?.version, '14.0.0-rc.0');
  assert.equal(proof.publishedCandidate?.sha256, '0cabda7905ac5342c57e5741e7f7c48f788114dd6504b92138e9a609f76e7cfc');
  assert.equal(proof.publishedCandidate?.integrity,
    'sha512-82LEqg8hSsheVPZ1p9JCqxV2qGMf28+f9XQnuO2n7BqXkI+frRg9ARrnfa5dTfbfqjNgr5p0UQxaRo8dtnHCRg==');
});
test('a complete registry metadata and actual-byte join creates the published receipt', () => {
  assert.deepEqual(proof.verifyPublishedArchive(metadata(), bytes, expected), receipt());
  assert.deepEqual(proof.assertPublishedReceipt(receipt(), bytes, expected), receipt());
});
for (const [field, value] of [['name', 'other'], ['version', '13.0.0']]) {
  test(`registry ${field} mismatch refuses`, () => {
    assert.throws(() => proof.verifyPublishedArchive({ ...metadata(), [field]: value }, bytes, expected));
  });
}
for (const field of ['tarball', 'integrity', 'shasum']) {
  test(`registry ${field} mismatch refuses`, () => {
    const value = metadata(); value.dist[field] += '-changed';
    assert.throws(() => proof.verifyPublishedArchive(value, bytes, expected));
  });
}
for (const [field, algorithm, encoding, prefix] of [
  ['integrity', 'sha512', 'base64', 'sha512-'],
  ['shasum', 'sha1', 'hex', ''],
]) {
  test(`matching forged metadata and expected ${field} still refuse the actual bytes`, () => {
    // All OTHER digests remain correct for `bytes`. Agreement between two
    // supplied values cannot stand in for hashing the archive itself.
    const forged = prefix + createHash(algorithm).update('different published package').digest(encoding);
    const expectedWithForgery = { ...expected, [field]: forged };
    const metadataWithForgery = metadata();
    metadataWithForgery.dist[field] = forged;
    assert.throws(() => proof.verifyPublishedArchive(metadataWithForgery, bytes, expectedWithForgery),
      { code: 'ERR_ASSERTION' });
  });
}
test('both byte mutation and a different offline proof refuse', () => {
  assert.throws(() => proof.verifyPublishedArchive(metadata(), Buffer.from('changed'), expected));
  assert.throws(() => proof.verifyPublishedArchive(metadata(), bytes, { ...expected, sha256: 'f'.repeat(64) }));
});
for (const field of ['kind', 'schema', 'version', 'sha256', 'integrity', 'bytes']) {
  test(`forged receipt ${field} refuses`, () => {
    assert.throws(() => proof.assertPublishedReceipt({ ...receipt(), [field]: 'forged' }, bytes, expected));
  });
}
test('a normal committed registry lock joins the exact package identity', () => {
  assert.deepEqual(proof.assertRegistryLock(lock(), expected), lock().packages['node_modules/agentfootprint']);
});
for (const [field, value] of [['version', '13.0.0'], ['resolved', 'file:/tmp/agentfootprint.tgz'], ['integrity', 'sha512-forged'], ['link', true]]) {
  test(`lock ${field} cannot disguise a local or different installed candidate`, () => {
    const valueLock = lock(); valueLock.packages['node_modules/agentfootprint'][field] = value;
    assert.throws(() => proof.assertRegistryLock(valueLock, expected));
  });
}
test('a root file dev input and a missing candidate entry refuse', () => {
  const value = lock(); value.packages[''].devDependencies.agentfootprint = 'file:/tmp/agent.tgz';
  assert.throws(() => proof.assertRegistryLock(value, expected));
  delete value.packages['node_modules/agentfootprint'];
  assert.throws(() => proof.assertRegistryLock(value, expected));
});
