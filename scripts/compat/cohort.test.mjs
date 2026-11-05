import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as contracts from './contract.mjs';

const names = ['agentfootprint', 'footprintjs', 'foottrace'];

function fixture() {
  const pins = { agentfootprint: '90.1.2-fixture.3', footprintjs: '91.2.3', foottrace: '92.3.4+fixture.5' };
  const manifest = { name: 'synthetic-consumer', devDependencies: { ...pins } };
  const lock = { lockfileVersion: 3, packages: { '': { devDependencies: { ...pins } } } };
  for (const [name, version] of Object.entries(pins)) {
    lock.packages[`node_modules/${name}`] = { version,
      resolved: `https://registry.example.test/${name}/-/${name}-${version}.tgz`,
      integrity: `sha512-${createHash('sha512').update(`synthetic bytes for ${name}`).digest('base64')}` };
  }
  return { pins, manifest, lock };
}

function derive(manifest, lock) {
  assert.equal(typeof contracts.deriveCohort, 'function');
  return contracts.deriveCohort(manifest, lock);
}

test('the cohort derives every identity field from exact dev pins and matching lock entries', () => {
  const { pins, manifest, lock } = fixture();
  const before = structuredClone({ manifest, lock });
  const cohort = derive(manifest, lock);
  const packages = Object.fromEntries(names.map((name) => [name, { name, version: pins[name],
    tarball: lock.packages[`node_modules/${name}`].resolved,
    integrity: lock.packages[`node_modules/${name}`].integrity,
    filename: `${name}-${pins[name]}.tgz` }]));
  assert.deepEqual(cohort, { pins, packages });
  for (const value of [cohort, cohort.pins, cohort.packages, ...Object.values(cohort.packages)]) {
    assert.ok(Object.isFrozen(value), 'cohort identity must be immutable');
  }
  assert.deepEqual({ manifest, lock }, before, 'derivation must not rewrite its inputs');
});

for (const name of names) {
  test(`${name}: ranges, tags, file inputs and malformed versions refuse`, () => {
    assert.equal(typeof contracts.deriveCohort, 'function');
    for (const pin of ['^90.1.2', '~90.1.2', 'latest', 'file:../synthetic.tgz', '90',
      'v90.1.2', '090.1.2', '90.01.2', '90.1.02', '90.1.2-01', '90.1.2-', '90.1.2+']) {
      const { manifest, lock } = fixture();
      manifest.devDependencies[name] = pin;
      lock.packages[''].devDependencies[name] = pin;
      lock.packages[`node_modules/${name}`].version = pin;
      assert.throws(() => derive(manifest, lock), { code: 'ERR_ASSERTION' }, pin);
    }
  });

  const invalid = [
    ['missing manifest pin', ({ manifest }) => { delete manifest.devDependencies[name]; }],
    ['missing root lock pin', ({ lock }) => { delete lock.packages[''].devDependencies[name]; }],
    ['changed pin without a matching root lock pin', ({ manifest, lock }) => {
      const changed = '95.6.7-fixture.8';
      manifest.devDependencies[name] = changed;
      lock.packages[`node_modules/${name}`].version = changed;
      lock.packages[`node_modules/${name}`].resolved = `https://registry.example.test/${name}/-/${name}-${changed}.tgz`;
    }],
    ['missing installed package entry', ({ lock }) => { delete lock.packages[`node_modules/${name}`]; }],
    ['different installed package version', ({ lock }) => { lock.packages[`node_modules/${name}`].version = '95.6.7-fixture.8'; }],
    ['missing archive URL', ({ lock }) => { delete lock.packages[`node_modules/${name}`].resolved; }],
    ['non-HTTPS archive URL', ({ lock }) => { lock.packages[`node_modules/${name}`].resolved = 'http://registry.example.test/synthetic.tgz'; }],
    ['local archive URL', ({ lock }) => { lock.packages[`node_modules/${name}`].resolved = 'file:../synthetic.tgz'; }],
    ['missing integrity', ({ lock }) => { delete lock.packages[`node_modules/${name}`].integrity; }],
    ['wrong integrity algorithm', ({ lock }) => { lock.packages[`node_modules/${name}`].integrity = `sha1-${createHash('sha1').update('synthetic').digest('base64')}`; }],
    ['malformed SHA512 integrity', ({ lock }) => { lock.packages[`node_modules/${name}`].integrity = 'sha512-not-a-digest'; }],
    ['linked package', ({ lock }) => { lock.packages[`node_modules/${name}`].link = true; }],
  ];
  for (const [label, mutate] of invalid) test(`${name}: ${label} refuses`, () => {
    assert.equal(typeof contracts.deriveCohort, 'function');
    const input = fixture();
    mutate(input);
    assert.throws(() => derive(input.manifest, input.lock), { code: 'ERR_ASSERTION' });
  });
}

test('an explicit source directory reads its manifest and lock without a built package', (t) => {
  assert.equal(typeof contracts.readActiveCohort, 'function');
  const directory = mkdtempSync(join(tmpdir(), 'lens-synthetic-cohort-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const { manifest, lock } = fixture();
  writeFileSync(join(directory, 'package.json'), JSON.stringify(manifest));
  writeFileSync(join(directory, 'package-lock.json'), JSON.stringify(lock));
  assert.deepEqual(contracts.readActiveCohort(directory), derive(manifest, lock));
  manifest.devDependencies.foottrace = '96.7.8-fixture.9';
  writeFileSync(join(directory, 'package.json'), JSON.stringify(manifest));
  assert.throws(() => contracts.readActiveCohort(directory), { code: 'ERR_ASSERTION' });
});

test('the default source root derives current checked-in identity independently of cwd', (t) => {
  assert.equal(typeof contracts.readActiveCohort, 'function');
  const source = fileURLToPath(new URL('../../', import.meta.url));
  const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(join(source, 'package-lock.json'), 'utf8'));
  const directory = mkdtempSync(join(tmpdir(), 'lens-unrelated-cwd-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const previous = process.cwd();
  try {
    process.chdir(directory);
    assert.deepEqual(contracts.readActiveCohort(), derive(manifest, lock));
  } finally { process.chdir(previous); }
});
