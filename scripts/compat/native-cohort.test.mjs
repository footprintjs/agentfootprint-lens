import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as contracts from './contract.mjs';

const expectedCandidate = {
  profile: 'fp11-af-main',
  sourceCommit: 'bc0b93015ba6b927c1d02528fe76e36da1873b25',
  sourceVersion: '13.0.0',
  version: '14.0.0-rc.0',
  engines: { footprintjs: '11.0.0-rc.1', foottrace: '1.11.0' },
};

test('the native descriptor binds the offline route-staged candidate to exact main source', () => {
  assert.deepEqual(contracts.nativeCandidate, expectedCandidate);
  assert.ok(Object.isFrozen(contracts.nativeCandidate));
  assert.ok(Object.isFrozen(contracts.nativeCandidate.engines));
});

function packageAt(directory, name, version) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name, version }));
}

function modulesFor(t) {
  const modules = mkdtempSync(join(tmpdir(), 'lens-native-owner-'));
  t.after(() => rmSync(modules, { recursive: true, force: true }));
  return modules;
}

test('one physical record owner returns the actual version and canonical package directory', (t) => {
  assert.equal(typeof contracts.assertSingleFoottrace, 'function');
  const modules = modulesFor(t);
  packageAt(join(modules, 'foottrace'), 'foottrace', '1.11.0');
  packageAt(join(modules, 'agentfootprint'), 'agentfootprint', '14.0.0-rc.0');
  assert.deepEqual(contracts.assertSingleFoottrace(modules, '1.11.0'), {
    copies: 1, version: '1.11.0', path: realpathSync(join(modules, 'foottrace')),
  });
});

test('a nested copy refuses even when its version agrees with the root', (t) => {
  assert.equal(typeof contracts.assertSingleFoottrace, 'function');
  const modules = modulesFor(t);
  packageAt(join(modules, 'foottrace'), 'foottrace', '1.11.0');
  packageAt(join(modules, 'agentfootprint'), 'agentfootprint', '14.0.0-rc.0');
  packageAt(join(modules, 'agentfootprint/node_modules/foottrace'), 'foottrace', '1.11.0');
  assert.throws(() => contracts.assertSingleFoottrace(modules, '1.11.0'), /exactly one physical Foottrace/);
});

test('a single wrong version and a missing root record owner refuse', (t) => {
  assert.equal(typeof contracts.assertSingleFoottrace, 'function');
  const modules = modulesFor(t);
  packageAt(join(modules, 'foottrace'), 'foottrace', '1.8.0');
  assert.throws(() => contracts.assertSingleFoottrace(modules, '1.11.0'), /Foottrace version/);
  rmSync(join(modules, 'foottrace'), { recursive: true });
  assert.throws(() => contracts.assertSingleFoottrace(modules, '1.11.0'), /exactly one physical Foottrace/);
});
