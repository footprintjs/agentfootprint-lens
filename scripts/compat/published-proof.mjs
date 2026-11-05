// Join registry metadata, archive bytes, the committed lock and installed files.
// The manifest and lock select the cohort; measured digests are evidence data.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertInstalled, assertSingleFoottrace, parseFlags, readActiveCohort, sha256 } from './contract.mjs';
import { command, inspectArchive, writeJson } from './process.mjs';

export function readPublishedAgent(cohort = readActiveCohort()) {
  return cohort.packages.agentfootprint;
}

export function verifyPublishedArchive(metadata, bytes, expected = readPublishedAgent()) {
  assert.equal(metadata.name, expected.name, 'registry package name');
  assert.equal(metadata.version, expected.version, 'registry package version');
  assert.equal(metadata.dist.tarball, expected.tarball, 'registry tarball URL must match the source lock');
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  const shasum = createHash('sha1').update(bytes).digest('hex');
  assert.equal(metadata.dist.integrity, integrity, 'actual bytes must match registry SHA512 integrity');
  assert.equal(metadata.dist.shasum, shasum, 'actual bytes must match registry SHA1');
  assert.equal(integrity, expected.integrity, 'archive bytes must match committed lock integrity');
  return { schema: 1, kind: 'published-registry-package', ...expected,
    sha256: sha256(bytes), shasum, bytes: bytes.length };
}

export function assertPublishedReceipt(receipt, bytes, expected = readPublishedAgent()) {
  const actual = verifyPublishedArchive({ name: receipt.name, version: receipt.version,
    dist: { tarball: receipt.tarball, integrity: receipt.integrity, shasum: receipt.shasum } }, bytes, expected);
  assert.deepEqual(receipt, actual, 'published receipt must retain the complete measured identity');
  return receipt;
}

export function assertRegistryLock(lock, expected = readPublishedAgent()) {
  assert.equal(lock.lockfileVersion, 3, 'consumer lock format');
  const root = lock.packages[''];
  assert.equal(root.devDependencies?.agentfootprint ?? root.dependencies?.agentfootprint,
    expected.version, 'root must select the source-pinned package');
  const entry = lock.packages['node_modules/agentfootprint'];
  assert.ok(entry, 'lock must contain the source-pinned package');
  assert.equal(entry.version, expected.version, 'locked package version');
  assert.equal(entry.resolved, expected.tarball, 'locked package registry URL');
  assert.equal(entry.integrity, expected.integrity, 'locked package integrity');
  assert.ok(!entry.link, 'locked package cannot be a link');
  return entry;
}

function main() {
  const cohort = readActiveCohort();
  const agent = readPublishedAgent(cohort);
  if (process.argv.length === 3 && process.argv[2] === '--archive-name') {
    console.log(agent.filename);
    return;
  }
  const flags = parseFlags(process.argv.slice(2), ['out', 'lock']);
  assert.ok(flags.out && flags.lock, 'usage: --out <fresh directory> --lock <source lock>');
  const out = resolve(flags.out);
  mkdirSync(out);
  const lockBytes = readFileSync(flags.lock);
  const lock = JSON.parse(lockBytes);
  assertRegistryLock(lock, agent);
  assert.ok(!JSON.stringify(lock).includes('file:'), 'source lock must contain no local file inputs');
  const spec = `${agent.name}@${agent.version}`;
  const metadata = JSON.parse(command('npm', ['view', spec, 'name', 'version', 'dist', '--json'],
    { log: join(out, 'registry-metadata.json') }));
  const packed = JSON.parse(command('npm', ['pack', spec, '--ignore-scripts', '--json', '--pack-destination', out],
    { log: join(out, 'registry-pack.json') }));
  assert.equal(packed.length, 1);
  assert.equal(packed[0].filename, agent.filename);
  const archive = join(out, agent.filename);
  const receipt = verifyPublishedArchive(metadata, readFileSync(archive), agent);
  const inspected = inspectArchive(archive, out, { ...agent, expectedSha: receipt.sha256 });
  assertInstalled(resolve('node_modules/agentfootprint'), inspected.files, 'installed registry package');
  const recordOwner = assertSingleFoottrace(resolve('node_modules'), cohort.pins.foottrace);
  command('npm', ['ls', 'foottrace'], { log: join(out, 'foottrace.log') });
  command('npm', ['ls', '--all', '--json'], { log: join(out, 'tree.json') });
  writeJson(join(out, 'published-agent.json'), receipt);
  writeJson(join(out, 'source-verification.json'), { schema: 1, node: process.version,
    npm: command('npm', ['--version']).trim(), policy: 'lock + installed-registry verification',
    lockSha256: sha256(lockBytes), cohort, publishedAgent: receipt, recordOwner });
  console.log(JSON.stringify(receipt));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
}
