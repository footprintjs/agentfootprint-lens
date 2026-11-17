import assert from 'node:assert/strict';
import { lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assertEvidenceOutsideRepository, assertSingleFoottrace, sha256 } from '../contract.mjs';
import { command, writeJson } from '../process.mjs';
import { inspectInputs, readJson } from './archives.mjs';
import { names } from './admission.mjs';
import { projectManifest, assertProjection } from './projection.mjs';
import { verifyNativeInstalled, verifyNativeLock } from './installed.mjs';

export function trackedSource(root) {
  const paths = command('git', ['ls-files', '-z'], { cwd: root }).split('\0').filter(Boolean);
  return Object.fromEntries(paths.map(path => {
    assert.ok(lstatSync(join(root, path)).isFile(), 'tracked source must be a regular file');
    return [path, sha256(readFileSync(join(root, path)))];
  }));
}

export function assertSourceClone(root, expected, { restored = false } = {}) {
  const actual = trackedSource(root);
  assert.deepEqual(Object.keys(actual), Object.keys(expected), 'tracked source inventory changed');
  for (const [path, digest] of Object.entries(expected)) {
    if (path === 'package-lock.json' || path === 'package.json' && !restored) continue;
    assert.equal(actual[path], digest, `source changed during native proof: ${path}`);
  }
}

export function bootstrap({ source, target, evidence, inputs, mode }) {
  assert.ok(['target', 'CONTROL'].includes(mode), 'closed bootstrap role');
  source = resolve(source); target = resolve(target); evidence = resolve(evidence);
  assertEvidenceOutsideRepository(source, target); assertEvidenceOutsideRepository(source, evidence);
  assert.equal(command('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: source }).trim(), '',
    'bootstrap source must be the unmodified checked commit');
  const original = trackedSource(source), authoredRaw = readFileSync(join(source, 'package.json'));
  const authored = JSON.parse(authoredRaw);
  const admitted = mode === 'target' ? inspectInputs(resolve(inputs)) : null;
  const paths = admitted && Object.fromEntries(names.map(n => [n, admitted.archives[n].path]));
  const control = { agentfootprint: '14.7.2', footprintjs: '12.3.0', foottrace: '1.11.1' };
  const projected = admitted ? projectManifest(authored, paths) : structuredClone(authored);
  if (!admitted) Object.assign(projected.devDependencies, control);
  mkdirSync(evidence);
  command('git', ['clone', '--shared', '--no-checkout', source, target], { log: join(evidence, 'source-copy.log') });
  const commit = command('git', ['rev-parse', 'HEAD'], { cwd: source }).trim();
  command('git', ['checkout', '--detach', commit], { cwd: target, log: join(evidence, 'source-checkout.log') });
  assert.deepEqual(trackedSource(target), original, 'materialize exact tracked source before projection');
  writeJson(join(evidence, 'authored-manifest.json'), authored);
  writeFileSync(join(evidence, 'authored-package-lock.json'), readFileSync(join(source, 'package-lock.json')));
  writeJson(join(evidence, 'projected-manifest.json'), projected);
  writeJson(join(evidence, 'source-inventory.json'), original);
  writeFileSync(join(target, 'package.json'), JSON.stringify(projected, null, 2) + '\n');
  // The known stale committed lock is not a native replay input. Resolve a real
  // strict temporary lock from the admitted originals, then replay it fresh.
  rmSync(join(target, 'package-lock.json'));
  command('npm', ['install', '--package-lock-only', '--strict-peer-deps', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: target, log: join(evidence, 'resolve.log'), timeout: 300_000 });
  if (admitted) {
    assertProjection(authored, readJson(join(target, 'package.json')), paths);
    verifyNativeLock(target, projected, admitted);
  }
  writeFileSync(join(evidence, 'temporary-package-lock.json'), readFileSync(join(target, 'package-lock.json')));
  if (admitted) inspectInputs(resolve(inputs)); // Rehash before the consuming strict replay.
  command('npm', ['ci', '--strict-peer-deps', '--no-audit', '--no-fund'],
    { cwd: target, log: join(evidence, 'ci.log'), timeout: 300_000 });
  const proof = () => {
    assertSourceClone(target, original);
    assert.deepEqual(readJson(join(target, 'package.json')), projected);
    assert.deepEqual(readJson(join(target, 'package-lock.json')), readJson(join(evidence, 'temporary-package-lock.json')));
    assert.deepEqual(trackedSource(source), original, 'authored checkout must stay unchanged');
    if (admitted) {
      const fresh = inspectInputs(resolve(inputs));
      verifyNativeLock(target, projected, fresh);
      return verifyNativeInstalled(target, fresh);
    }
    for (const [name, version] of Object.entries(control))
      assert.equal(readJson(join(target, 'node_modules', name, 'package.json')).version, version);
    return assertSingleFoottrace(join(target, 'node_modules'), control.foottrace);
  };
  writeJson(join(evidence, 'installed-before.json'), proof());
  writeJson(join(evidence, 'bootstrap.json'), { mode, source, target, evidence, commit,
    tree: command('git', ['rev-parse', 'HEAD^{tree}'], { cwd: source }).trim(),
    inputs: admitted ? resolve(inputs) : null, original, authored, projected,
    committedLockAccepted: false, registryReady: false });
  return { target, evidence, mode };
}

export function verifyBootstrap(evidence) {
  const data = readJson(join(evidence, 'bootstrap.json'));
  assert.ok(['target', 'CONTROL'].includes(data.mode));
  assertSourceClone(data.target, data.original);
  assert.deepEqual(trackedSource(data.source), data.original);
  assert.deepEqual(readJson(join(data.target, 'package.json')), data.projected);
  assert.deepEqual(readJson(join(data.target, 'package-lock.json')), readJson(join(evidence, 'temporary-package-lock.json')));
  if (data.mode === 'target') {
    const input = inspectInputs(data.inputs);
    assertProjection(data.authored, data.projected, Object.fromEntries(names.map(n => [n, input.archives[n].path])));
    verifyNativeLock(data.target, data.projected, input);
    return verifyNativeInstalled(data.target, input);
  }
  for (const [name, version] of Object.entries({ agentfootprint: '14.7.2', footprintjs: '12.3.0', foottrace: '1.11.1' }))
    assert.equal(readJson(join(data.target, 'node_modules', name, 'package.json')).version, version);
  return assertSingleFoottrace(join(data.target, 'node_modules'), '1.11.1');
}

export function restoreManifest(evidence) {
  const data = readJson(join(evidence, 'bootstrap.json'));
  assert.equal(data.mode, 'target', 'CONTROL cannot produce a target archive');
  verifyBootstrap(evidence);
  writeFileSync(join(data.target, 'package.json'), readFileSync(join(data.source, 'package.json')));
  assertSourceClone(data.target, data.original, { restored: true });
  assert.deepEqual(trackedSource(data.source), data.original);
  return data;
}
