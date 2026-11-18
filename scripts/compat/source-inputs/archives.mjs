import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { pins, names, versions, cohortIdentity, validateInputKind, validateProvider, validateArtifact } from './admission.mjs';
import { inspectRenderer } from './renderer.mjs';

export const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
export const sri = data => `sha512-${createHash('sha512').update(data).digest('base64')}`;
export const sha = data => createHash('sha256').update(data).digest('hex');

export function archiveData(args) {
  const result = spawnSync('python3', ['-B', fileURLToPath(new URL('./archive-data.py', import.meta.url)), ...args],
    { encoding: 'utf8', timeout: 40_000, maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.error, undefined, 'bounded archive reader failed');
  assert.equal(result.status, 0, `bounded archive data refused: ${result.stdout?.slice(0, 300)}`);
  return JSON.parse(result.stdout);
}

export function expectedSource() {
  const a = pins.agent;
  return { outerSha256: a.sourceArtifact.digest.slice(7), source: a.source,
    archive: Object.fromEntries(['filename', 'package', 'version', 'sha256', 'integrity',
      'memberCount', 'memberCensusSha256'].map(key => [key, a.archive[key]])) };
}

export function inspectInputs(directory) {
  const receipt = readJson(join(directory, 'input.json'));
  validateInputKind(receipt);
  validateProvider(receipt.provider);
  assert.equal(receipt.qualification, 'NATIVE_SOURCE_READY');
  assert.equal(receipt.independentReviewSha256, pins.agent.review.sha256);
  assert.equal(receipt.nativeArtifacts.length, pins.agent.nativeEvidence.artifacts.length);
  pins.agent.nativeEvidence.artifacts.forEach((a, i) => validateArtifact(receipt.nativeArtifacts[i], a));
  assert.deepEqual(receipt.candidate.source, pins.agent.source);
  assert.deepEqual(receipt.candidate.tested, pins.agent.tested);
  assert.equal(receipt.candidate.protocol, 'agentfootprint.source-candidate.v1');
  assert.deepEqual(Object.keys(receipt.candidate.archive).sort(),
    ['filename', 'package', 'version', 'sha256', 'shasum', 'integrity', 'bytes', 'files'].sort());
  for (const key of ['filename', 'package', 'version', 'sha256', 'shasum', 'integrity', 'bytes'])
    assert.deepEqual(receipt.candidate.archive[key], pins.agent.archive[key], `native archive receipt ${key}`);
  const cohort = cohortIdentity();
  const archives = {};
  const identities = { ...cohort.packages, ...Object.fromEntries(Object.entries(pins.closure).map(([name, entry]) =>
    [name, { ...entry, name, filename: `${name}-${entry.version}.tgz`,
      tarball: `https://registry.npmjs.org/${name}/-/${name}-${entry.version}.tgz` }])) };
  assert.deepEqual(Object.keys(receipt.archives).sort(), Object.keys(identities).sort(), 'closed actual native owner inventory');
  for (const [name, identity] of Object.entries(identities)) {
    const path = join(directory, identity.filename);
    const bytes = readFileSync(path);
    assert.equal(sri(bytes), identity.integrity, `${name}: original archive SRI`);
    if (name === 'agentfootprint') assert.equal(sha(bytes), pins.agent.archive.sha256);
    else {
      const metadata = receipt.registry[name];
      assert.equal(metadata.name, name); assert.equal(metadata.version, identity.version);
      assert.equal(metadata.dist.tarball, identity.tarball);
      assert.equal(metadata.dist.integrity, identity.integrity);
      assert.equal(metadata.dist.shasum, createHash('sha1').update(bytes).digest('hex'));
    }
    const data = archiveData(['tar', path, name, identity.version]);
    if (pins.closure[name]) assert.equal(data.sha256, pins.closure[name].sha256);
    if (pins.published[name]?.sha256) assert.equal(data.sha256, pins.published[name].sha256);
    assert.deepEqual(data, receipt.archives[name], `${name}: admitted inventory changed`);
    archives[name] = { ...data, path };
  }
  assert.equal(archives.agentfootprint.files['package.json'], pins.agent.source.manifestSha256);
  const canonical = receipt.candidate.archive.files.map(m => ({ path: m.path, size: m.size, sha256: m.sha256 }));
  // Paths in this fixed original are ASCII, so JS/Python canonical JSON agree.
  assert.ok(canonical.every(m => /^[\x20-\x7e]+$/.test(m.path)), 'native census encoding');
  assert.equal(sha(Buffer.from(JSON.stringify(canonical))), pins.agent.archive.memberCensusSha256);
  assert.deepEqual(canonical, archives.agentfootprint.members, 'original complete ordered member census');
  assert.equal(receipt.candidate.archive.sha256, archives.agentfootprint.sha256);
  const renderer = inspectRenderer(directory, receipt.renderer, archiveData);
  return { cohort, archives, receipt, renderer };
}
