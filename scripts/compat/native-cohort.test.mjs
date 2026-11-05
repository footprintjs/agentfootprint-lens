import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as contracts from './contract.mjs';

const version = '93.4.5-fixture.6';
const agentVersion = '94.5.6-fixture.7';

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
  packageAt(join(modules, 'foottrace'), 'foottrace', version);
  packageAt(join(modules, 'agentfootprint'), 'agentfootprint', agentVersion);
  assert.deepEqual(contracts.assertSingleFoottrace(modules, version), {
    copies: 1, version, path: realpathSync(join(modules, 'foottrace')),
  });
});

test('a nested copy refuses even when its version agrees with the root', (t) => {
  assert.equal(typeof contracts.assertSingleFoottrace, 'function');
  const modules = modulesFor(t);
  packageAt(join(modules, 'foottrace'), 'foottrace', version);
  packageAt(join(modules, 'agentfootprint'), 'agentfootprint', agentVersion);
  packageAt(join(modules, 'agentfootprint/node_modules/foottrace'), 'foottrace', version);
  assert.throws(() => contracts.assertSingleFoottrace(modules, version), /exactly one physical Foottrace/);
});

test('a single wrong version and a missing root record owner refuse', (t) => {
  assert.equal(typeof contracts.assertSingleFoottrace, 'function');
  const modules = modulesFor(t);
  packageAt(join(modules, 'foottrace'), 'foottrace', '0.0.0-synthetic-wrong');
  assert.throws(() => contracts.assertSingleFoottrace(modules, version), /Foottrace version/);
  rmSync(join(modules, 'foottrace'), { recursive: true });
  assert.throws(() => contracts.assertSingleFoottrace(modules, version), /exactly one physical Foottrace/);
});
