import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { narrativeRenderer } from './narrative-renderers.mjs';
import { readRecordFixtures, recordFixtureDirectory, recordRenderer } from './record-renderer.mjs';

test('the record lanes run on a published renderer pinned by registry integrity', () => {
  const identity = narrativeRenderer(recordRenderer.version);
  assert.equal(recordRenderer.version, '2.0.0');
  assert.match(identity.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/);
  assert.equal(identity.tarball,
    `https://registry.npmjs.org/footprint-explainable-ui/-/footprint-explainable-ui-${recordRenderer.version}.tgz`);
  assert.ok(identity.acceptsNarrative);
});

test('the vendored corpus names its immutable upstream commit and matches every pinned digest', () => {
  assert.match(recordRenderer.fixtureSource.commit, /^[0-9a-f]{40}$/);
  assert.equal(recordRenderer.fixtureSource.tag, `v${recordRenderer.version}`);
  assert.equal(readRecordFixtures(), recordFixtureDirectory);
  // The two saved records keep the digests the retired source lane pinned.
  assert.equal(recordRenderer.fixtures['flow.json'], '6220e9422696028c8ad6f4243bc1c3caa33152a62ca6dcbdf54a17c5bd0259b1');
  assert.equal(recordRenderer.fixtures['hci.json'], 'fc287b4e0c4e955e2d0ec6b1145971e020e829238e0e77bdd0e39d0f614ceee8');
  const readme = readFileSync(join(recordFixtureDirectory, 'README.md'), 'utf8');
  assert.ok(readme.includes(recordRenderer.fixtureSource.commit), 'the README names the source commit');
});

for (const [label, change] of [
  ['an edited saved record', directory => writeFileSync(join(directory, 'flow.json'), '{}\n')],
  ['an edited expectation', directory => writeFileSync(join(directory, 'runtime-fixtures.cjs'), 'module.exports = () => [];\n')],
  ['a missing record', directory => rmSync(join(directory, 'hci.json'))],
  ['an extra file', directory => writeFileSync(join(directory, 'extra.json'), '{}')],
]) test(`${label} is refused before any lane uses the corpus`, t => {
  const directory = mkdtempSync(join(tmpdir(), 'lens-record-fixtures-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  cpSync(recordFixtureDirectory, directory, { recursive: true });
  readRecordFixtures(directory);
  change(directory);
  assert.throws(() => readRecordFixtures(directory), { code: 'ERR_ASSERTION' });
});
