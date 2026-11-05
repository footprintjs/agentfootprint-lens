import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { deriveCohort, readActiveCohort } from './contract.mjs';
import * as proof from './published-proof.mjs';

// Synthetic bytes/identities only. Current release identities come from files.
const bytes = Buffer.from('synthetic registry archive');
const digest = (algorithm, encoding) => createHash(algorithm).update(bytes).digest(encoding);
function fixture() {
  const names = ['agentfootprint', 'footprintjs', 'foottrace'];
  const pins = Object.fromEntries(names.map((name, i) => [name, `${70 + i}.2.3-example.4`]));
  const lock = { lockfileVersion: 3, packages: { '': { devDependencies: { ...pins } } } };
  for (const name of names) lock.packages[`node_modules/${name}`] = { version: pins[name],
    resolved: `https://registry.npmjs.org/${name}/-/${name}-${pins[name]}.tgz`,
    integrity: `sha512-${digest('sha512', 'base64')}` };
  const cohort = deriveCohort({ devDependencies: pins }, lock);
  const expected = cohort.packages.agentfootprint;
  const metadata = { name: expected.name, version: expected.version, dist: {
    tarball: expected.tarball, integrity: expected.integrity, shasum: digest('sha1', 'hex') } };
  const receipt = { schema: 1, kind: 'published-registry-package', ...expected,
    sha256: digest('sha256', 'hex'), shasum: metadata.dist.shasum, bytes: bytes.length };
  return { cohort, expected, metadata, receipt, lock };
}

test('the default published agent is derived from the current manifest and committed lock', () => {
  assert.equal(typeof proof.readPublishedAgent, 'function');
  assert.deepEqual(proof.readPublishedAgent(), readActiveCohort().packages.agentfootprint);
});
test('registry metadata, actual bytes and locked integrity join without an offline digest', () => {
  const { expected, metadata, receipt } = fixture();
  assert.equal('sha256' in expected, false);
  assert.deepEqual(proof.verifyPublishedArchive(metadata, bytes, expected), receipt);
  assert.deepEqual(proof.assertPublishedReceipt(receipt, bytes, expected), receipt);
});
for (const field of ['name', 'version']) test(`different registry ${field} refuses`, () => {
  const { expected, metadata } = fixture(); metadata[field] += '-different';
  assert.throws(() => proof.verifyPublishedArchive(metadata, bytes, expected), { code: 'ERR_ASSERTION' });
});
for (const field of ['tarball', 'integrity', 'shasum']) test(`different registry ${field} refuses`, () => {
  const { expected, metadata } = fixture(); metadata.dist[field] += '-different';
  assert.throws(() => proof.verifyPublishedArchive(metadata, bytes, expected), { code: 'ERR_ASSERTION' });
});
test('lock integrity different from actual bytes refuses even when metadata matches the bytes', () => {
  const { expected, metadata } = fixture();
  const forged = `sha512-${createHash('sha512').update('other archive').digest('base64')}`;
  assert.throws(() => proof.verifyPublishedArchive(metadata, bytes, { ...expected, integrity: forged }),
    { code: 'ERR_ASSERTION' });
});
test('metadata and lock agreement cannot replace hashing the actual archive', () => {
  const { expected, metadata } = fixture();
  const forged = `sha512-${createHash('sha512').update('other archive').digest('base64')}`;
  metadata.dist.integrity = forged;
  assert.throws(() => proof.verifyPublishedArchive(metadata, bytes, { ...expected, integrity: forged }),
    { code: 'ERR_ASSERTION' });
});
test('byte mutation refuses', () => {
  const { expected, metadata } = fixture();
  assert.throws(() => proof.verifyPublishedArchive(metadata, Buffer.from('changed'), expected), { code: 'ERR_ASSERTION' });
});
for (const field of ['kind', 'schema', 'version', 'sha256', 'integrity', 'shasum', 'bytes', 'filename']) {
  test(`forged receipt ${field} refuses`, () => {
    const { expected, receipt } = fixture();
    assert.throws(() => proof.assertPublishedReceipt({ ...receipt, [field]: 'forged' }, bytes, expected),
      { code: 'ERR_ASSERTION' });
  });
}
test('an installed consumer lock joins the source-derived registry identity', () => {
  const { expected, lock } = fixture();
  assert.deepEqual(proof.assertRegistryLock(lock, expected), lock.packages['node_modules/agentfootprint']);
});
for (const [field, value] of [['version', 'different'], ['resolved', 'file:/synthetic.tgz'], ['integrity', 'forged'], ['link', true]]) {
  test(`consumer lock ${field} mismatch refuses`, () => {
    const { expected, lock } = fixture(); lock.packages['node_modules/agentfootprint'][field] = value;
    assert.throws(() => proof.assertRegistryLock(lock, expected), { code: 'ERR_ASSERTION' });
  });
}


test('consumer lock root cannot select a file input instead of the source pin', () => {
  const { expected, lock } = fixture();
  lock.packages[''].devDependencies.agentfootprint = 'file:/synthetic-agent.tgz';
  assert.throws(() => proof.assertRegistryLock(lock, expected), { code: 'ERR_ASSERTION' });
});

test('consumer lock must contain the selected package entry', () => {
  const { expected, lock } = fixture();
  delete lock.packages['node_modules/agentfootprint'];
  assert.throws(() => proof.assertRegistryLock(lock, expected), { code: 'ERR_ASSERTION' });
});
