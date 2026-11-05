// The default cohort uses the registry RC. Join metadata, actual archive bytes,
// the committed source lock and installed files; the offline proof stays optional.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertInstalled, assertSingleFoottrace, nativeCandidate, parseFlags, sha256 } from './contract.mjs';
import { command, inspectArchive, writeJson } from './process.mjs';

export const publishedCandidate = Object.freeze({
  name: 'agentfootprint', version: '14.0.0-rc.0',
  tarball: 'https://registry.npmjs.org/agentfootprint/-/agentfootprint-14.0.0-rc.0.tgz',
  sha256: '0cabda7905ac5342c57e5741e7f7c48f788114dd6504b92138e9a609f76e7cfc',
  integrity: 'sha512-82LEqg8hSsheVPZ1p9JCqxV2qGMf28+f9XQnuO2n7BqXkI+frRg9ARrnfa5dTfbfqjNgr5p0UQxaRo8dtnHCRg==',
  shasum: 'f6c95ad41e2be583e94c8210e5039f491e353634', bytes: 9672362,
});

export function verifyPublishedArchive(metadata, bytes, expected = publishedCandidate) {
  assert.equal(metadata.name, expected.name, 'registry package name');
  assert.equal(metadata.version, expected.version, 'registry package version');
  assert.equal(metadata.dist.tarball, expected.tarball, 'registry tarball URL');
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  const shasum = createHash('sha1').update(bytes).digest('hex');
  assert.equal(metadata.dist.integrity, integrity, 'actual bytes must match registry SHA512 integrity');
  assert.equal(metadata.dist.shasum, shasum, 'actual bytes must match registry SHA1');
  assert.equal(integrity, expected.integrity, 'registry integrity changed for the reviewed version');
  assert.equal(shasum, expected.shasum, 'registry SHA1 changed for the reviewed version');
  assert.equal(sha256(bytes), expected.sha256,
    'published archive differs from the offline proof: classify as a publish-route finding');
  if (expected.bytes !== undefined) assert.equal(bytes.length, expected.bytes, 'published archive size');
  return { schema: 1, kind: 'published-registry-candidate', ...expected, bytes: bytes.length };
}

export function assertPublishedReceipt(receipt, bytes, expected = publishedCandidate) {
  const actual = verifyPublishedArchive({ name: receipt.name, version: receipt.version,
    dist: { tarball: receipt.tarball, integrity: receipt.integrity, shasum: receipt.shasum } }, bytes, expected);
  assert.deepEqual(receipt, actual, 'published receipt must retain the complete verified identity');
  return receipt;
}

export function assertRegistryLock(lock, expected = publishedCandidate) {
  assert.equal(lock.lockfileVersion, 3, 'committed lock format');
  const root = lock.packages[''];
  assert.equal(root.devDependencies?.agentfootprint ?? root.dependencies?.agentfootprint,
    expected.version, 'the root must select the exact registry candidate');
  const entry = lock.packages['node_modules/agentfootprint'];
  assert.ok(entry, 'lock must contain the registry candidate');
  assert.equal(entry.version, expected.version, 'locked candidate version');
  assert.equal(entry.resolved, expected.tarball, 'locked candidate registry URL');
  assert.equal(entry.integrity, expected.integrity, 'locked candidate integrity');
  assert.ok(!entry.link, 'locked candidate cannot be a link');
  return entry;
}

function main() {
  const flags = parseFlags(process.argv.slice(2), ['out', 'lock']);
  assert.ok(flags.out && flags.lock, 'usage: --out <fresh directory> --lock <source lock>');
  const out = resolve(flags.out);
  mkdirSync(out);
  const lockBytes = readFileSync(flags.lock);
  const lock = JSON.parse(lockBytes);
  assertRegistryLock(lock);
  assert.ok(!JSON.stringify(lock).includes('file:'), 'committed source lock must contain no local file inputs');
  const metadata = JSON.parse(command('npm', ['view', `agentfootprint@${publishedCandidate.version}`,
    'name', 'version', 'dist', '--json'], { log: join(out, 'registry-metadata.json') }));
  const packed = JSON.parse(command('npm', ['pack', `agentfootprint@${publishedCandidate.version}`,
    '--ignore-scripts', '--json', '--pack-destination', out], { log: join(out, 'registry-pack.json') }));
  assert.equal(packed.length, 1);
  assert.equal(packed[0].filename, `agentfootprint-${publishedCandidate.version}.tgz`);
  const archive = join(out, packed[0].filename);
  const receipt = verifyPublishedArchive(metadata, readFileSync(archive));
  const inspected = inspectArchive(archive, out, { ...publishedCandidate, expectedSha: publishedCandidate.sha256 });
  assertInstalled(resolve('node_modules/agentfootprint'), inspected.files, 'installed registry candidate');
  const recordOwner = assertSingleFoottrace(resolve('node_modules'), nativeCandidate.engines.foottrace);
  command('npm', ['ls', 'foottrace'], { log: join(out, 'foottrace.log') });
  command('npm', ['ls', '--all', '--json'], { log: join(out, 'tree.json') });
  writeJson(join(out, 'published-agent.json'), receipt);
  writeJson(join(out, 'source-verification.json'), { schema: 1, node: process.version,
    npm: command('npm', ['--version']).trim(), policy: 'lock + installed-registry verification',
    lockSha256: sha256(lockBytes), publishedAgent: receipt, recordOwner });
  console.log(JSON.stringify(receipt));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
}
