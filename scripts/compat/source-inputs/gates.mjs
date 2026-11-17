import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { command, writeJson } from '../process.mjs';
import { publishedSourceFiles } from '../contract.mjs';
import { archiveData, inspectInputs, readJson } from './archives.mjs';
import { assertSourceClone, restoreManifest, trackedSource, verifyBootstrap } from './materialize.mjs';
import { verifyNativeInstalled, verifyNativeLock } from './installed.mjs';

export function runGates(evidence) {
  const data = readJson(join(evidence, 'bootstrap.json'));
  const gates = data.mode === 'target'
    ? [['contract', ['run', 'test:contract:foottrace']], ['types', ['run', 'typecheck']],
      ['build', ['run', 'build']], ['unit', ['test']], ['time-fixtures', ['run', 'fixtures:time:check']],
      ['publint', ['exec', '--no', '--', 'publint']]]
    : [['commentary', null],
      ['build', ['run', 'build']], ['unit', ['test']]];
  const completed = [];
  for (const [name, args] of gates) {
    verifyBootstrap(evidence);
    command(args ? 'npm' : process.execPath, args ?? ['scripts/compat/commentary-control.mjs'],
      { cwd: data.target, log: join(evidence, `${name}.log`), timeout: 1_200_000 });
    verifyBootstrap(evidence);
    completed.push(name); writeJson(join(evidence, 'gates.json'), { mode: data.mode, completed });
  }
  return { mode: data.mode, completed };
}

export function verifyRestored(evidence) {
  const data = readJson(join(evidence, 'bootstrap.json'));
  assert.equal(data.mode, 'target');
  assertSourceClone(data.target, data.original, { restored: true });
  assert.deepEqual(trackedSource(data.source), data.original);
  assert.deepEqual(readJson(join(data.target, 'package-lock.json')), readJson(join(evidence, 'temporary-package-lock.json')));
  const input = inspectInputs(data.inputs);
  verifyNativeLock(data.target, data.projected, input);
  return verifyNativeInstalled(data.target, input);
}

export function packTarget(evidence, output, existing) {
  const data = restoreManifest(evidence);
  mkdirSync(output, { recursive: true });
  const filename = `${data.authored.name}-${data.authored.version}.tgz`;
  const path = existing ? join(existing, filename) : join(output, filename);
  if (!existing) {
    const result = JSON.parse(command('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', output],
      { cwd: data.target, log: join(evidence, 'single-pack.log') }));
    assert.equal(result.length, 1); assert.equal(result[0].filename, filename);
  }
  const packed = archiveData(['tar', path, data.authored.name, data.authored.version]);
  assert.deepEqual(packed.manifest, data.authored, 'temporary development spec must not leak into the archive');
  assert.deepEqual(packed.files, publishedSourceFiles(data.target), 'single tested build/source member binding');
  command('npm', ['exec', '--no', '--', 'attw', path],
    { cwd: data.target, log: join(evidence, 'attw-original-archive.log'), timeout: 180_000 });
  writeJson(join(evidence, 'installed-after.json'), verifyRestored(evidence));
  writeJson(join(evidence, 'packed.json'), { path, sha256: packed.sha256, files: packed.files,
    manifest: packed.manifest, sourceCommit: data.commit, sourceTree: data.tree,
    onePack: !existing, comparedToNode22Original: Boolean(existing) });
  return { path, sha256: packed.sha256, sourceCommit: data.commit, sourceTree: data.tree };
}
