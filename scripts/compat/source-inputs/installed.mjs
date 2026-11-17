import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { assertInstalled } from '../contract.mjs';
import { names, pins, cohortIdentity } from './admission.mjs';
import { readJson } from './archives.mjs';

export function scanInstalledPackages(root) {
  const found = [], visited = new Set();
  function visit(directory) {
    const physical = realpathSync(directory);
    assert.ok(!visited.has(physical), 'duplicate/linked installed directory');
    visited.add(physical);
    if (existsSync(join(directory, 'package.json'))) {
      const manifest = readJson(join(directory, 'package.json'));
      // Tool caches can carry module-format metadata without being packages.
      // Traverse them fully: a named hidden or aliased package still counts.
      if (typeof manifest.name === 'string' && manifest.name.length > 0)
        found.push({ path: physical, manifest });
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.bin' && directory.endsWith('/node_modules')) continue;
      const path = join(directory, entry.name);
      assert.equal(lstatSync(path).isSymbolicLink(), false, 'linked installed package/file');
      if (!entry.isDirectory()) continue;
      visit(path);
    }
  }
  visit(join(root, 'node_modules'));
  return found;
}

function packageRoot(from, name) {
  const require = createRequire(join(from, 'package.json'));
  let path = dirname(realpathSync(require.resolve(name)));
  while (true) {
    if (existsSync(join(path, 'package.json')) && readJson(join(path, 'package.json')).name === name) return path;
    const parent = dirname(path); assert.notEqual(parent, path, `missing package root ${name}`); path = parent;
  }
}

export function verifyNativeLock(root, manifest, input) {
  assert.deepEqual(input.cohort, cohortIdentity(), 'target cohort role/identity');
  const lock = readJson(join(root, 'package-lock.json'));
  assert.equal(lock.lockfileVersion, 3);
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies'])
    assert.deepEqual(lock.packages[''][field], manifest[field], `generated lock root ${field}`);
  const expectedPaths = Object.fromEntries(names.map(n => [n, realpathSync(input.archives[n].path)]));
  const entries = Object.entries(lock.packages);
  for (const [key, entry] of entries) {
    assert.ok(!entry.link, `unknown linked lock entry ${key}`);
    if (entry.resolved?.startsWith('file:')) {
      const name = names.find(n => key === `node_modules/${n}`);
      assert.ok(name, `unknown file lock input ${key}`);
      assert.equal(realpathSync(resolve(root, entry.resolved.slice(5))), expectedPaths[name]);
    }
  }
  const packages = {};
  for (const name of names) {
    const occurrences = entries.filter(([key, e]) => key === `node_modules/${name}` || key.endsWith(`/node_modules/${name}`) || e.name === name);
    assert.equal(occurrences.length, 1, `one locked ${name}`);
    const entry = lock.packages[`node_modules/${name}`];
    assert.equal(entry.version, input.cohort.pins[name]);
    assert.equal(entry.integrity, input.cohort.packages[name].integrity);
    assert.ok(entry.resolved.startsWith('file:'), 'native source replay uses the admitted originals');
    assert.equal(realpathSync(resolve(root, entry.resolved.slice(5))), expectedPaths[name]);
    packages[name] = { ...input.cohort.packages[name], tarball: entry.resolved };
  }
  for (const [name, expected] of Object.entries(pins.closure)) {
    const found = entries.filter(([key, e]) => key === `node_modules/${name}` || key.endsWith(`/node_modules/${name}`) || e.name === name);
    assert.equal(found.length, 1, `one locked context owner ${name}`);
    assert.equal(found[0][0], `node_modules/${name}`);
    assert.equal(found[0][1].version, expected.version);
    assert.equal(found[0][1].integrity, expected.integrity);
    assert.equal(found[0][1].resolved, `https://registry.npmjs.org/${name}/-/${name}-${expected.version}.tgz`);
  }
  return { ...input.cohort, packages };
}

export function verifyNativeInstalled(root, input, { recordOnly = false } = {}) {
  assert.deepEqual(input.cohort, cohortIdentity(), 'target cohort role/identity');
  const found = scanInstalledPackages(root);
  const selected = recordOnly ? ['foottrace'] : [...names, ...Object.keys(pins.closure)];
  const owners = {};
  for (const name of selected) {
    const copies = found.filter(p => p.manifest.name === name);
    assert.equal(copies.length, 1, `one physical ${name}`);
    assert.equal(copies[0].manifest.version, input.cohort.pins[name] ?? pins.closure[name]?.version);
    assertInstalled(copies[0].path, input.archives[name].files, name);
    owners[name] = copies[0].path;
  }
  const participants = [{ path: root, manifest: readJson(join(root, 'package.json')) }, ...found];
  const resolutions = {};
  for (const participant of participants) {
    for (const name of ['foottrace', 'footprintjs']) {
      if (!owners[name]) continue;
      if (participant.path === root || participant.manifest.dependencies?.[name] || participant.manifest.peerDependencies?.[name]) {
        const actual = packageRoot(participant.path, name);
        assert.equal(actual, owners[name], `${participant.manifest.name}: physical ${name} owner`);
        resolutions[`${participant.manifest.name}:${participant.path}:${name}`] = actual;
      }
    }
  }
  return { owners, resolutions, packages: found.map(p => ({ name: p.manifest.name, version: p.manifest.version, path: p.path })) };
}
