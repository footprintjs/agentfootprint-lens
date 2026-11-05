import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import * as contracts from './contract.mjs';

const repository = resolve('fixture-root/repository');
const rejected = [
  ['the repository itself', repository],
  ['its trailing separator', `${repository}/`],
  ['a direct child', join(repository, 'compat-evidence')],
  ['a deep child', join(repository, 'compat-evidence/record-only')],
  ['a dot-normalized repository', `${repository}/elsewhere/..`],
  ['a dot-normalized descendant', `${repository}/elsewhere/../compat-evidence`],
];
for (const [label, evidence] of rejected) test(`evidence rejects ${label}`, () => {
  assert.equal(typeof contracts.assertEvidenceOutsideRepository, 'function');
  assert.throws(() => contracts.assertEvidenceOutsideRepository(repository, evidence),
    /compatibility evidence must be outside the repository/);
});

const accepted = [
  ['a sibling', join(repository, '../compat-evidence')],
  ['the parent', join(repository, '..')],
  ['an outside path', join(repository, '../../other/compat-evidence')],
  ['a sibling sharing the repository name prefix', `${repository}-evidence`],
];
for (const [label, evidence] of accepted) test(`evidence accepts ${label}`, () => {
  assert.equal(typeof contracts.assertEvidenceOutsideRepository, 'function');
  assert.equal(contracts.assertEvidenceOutsideRepository(repository, evidence), resolve(evidence));
});

test('nested record fixtures inherit repository engines; outside siblings do not', (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'lens-evidence-location-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, 'repository');
  const fakeEngine = join(repo, 'node_modules/footprintjs');
  const nested = join(repo, 'compat-evidence/record-only');
  const outside = join(root, 'compat-evidence/record-only');
  for (const directory of [fakeEngine, nested, outside]) mkdirSync(directory, { recursive: true });
  writeFileSync(join(fakeEngine, 'package.json'), JSON.stringify({ name: 'footprintjs', main: 'index.cjs' }));
  writeFileSync(join(fakeEngine, 'index.cjs'), 'throw new Error("resolution fixture must never execute");\n');
  const nestedRequire = createRequire(join(nested, 'runtime-fixtures.cjs'));
  const outsideRequire = createRequire(join(outside, 'runtime-fixtures.cjs'));
  assert.equal(nestedRequire.resolve('footprintjs'), join(fakeEngine, 'index.cjs'));
  assert.throws(() => outsideRequire.resolve('footprintjs'), { code: 'MODULE_NOT_FOUND' });
  assert.equal(typeof contracts.assertEvidenceOutsideRepository, 'function');
  assert.throws(() => contracts.assertEvidenceOutsideRepository(repo, nested),
    /compatibility evidence must be outside the repository/);
  assert.equal(contracts.assertEvidenceOutsideRepository(repo, outside), outside);
});
