import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as contracts from './contract.mjs';
import { assertInstalled, assertOwner, assertRecordIsolation, hashFiles,
  installedPackageNames, laneContract, parseFlags, publishedSourceFiles, safeArchiveNames,
  sha256 } from './contract.mjs';

test('the twelve native lanes retain renderer and React coverage on both Nodes', () => {
  assert.equal(typeof contracts.readActiveCohort, 'function');
  // Lane enumeration is pure and accepts an explicit cohort. Registry-root
  // admission is tested independently and must still refuse a stale draft lock.
  const cohort = { pins: { agentfootprint: '90.1.2-fixture.3', footprintjs: '91.2.3', foottrace: '92.3.4' } };
  const ids = [];
  for (const flow of ['0.34.0', '0.38.0', 'candidate']) for (const react of ['18', '19']) {
    for (const node of ['22', '24']) {
      const lane = laneContract({ kind: 'native', flow, react, node }, cohort);
      ids.push(lane.id);
      assert.equal(lane.kind, 'native');
      for (const [name, version] of Object.entries(cohort.pins)) assert.equal(lane.peers[name], version);
      assert.equal(lane.peers.react, react === '18' ? '18.3.1' : '19.0.0');
      assert.equal(lane.peers['react-dom'], lane.peers.react);
      assert.equal(lane.types['@types/react'], react === '18' ? '18.3.3' : '19.0.0');
      assert.equal(lane.types['@types/react-dom'], react === '18' ? '18.3.0' : '19.0.0');
    }
  }
  assert.equal(new Set(ids).size, 12);
});

test('four published lazy-source lanes extend the existing matrix and run the packed feature probes', () => {
  const ids = [];
  for (const react of ['18', '19']) for (const node of ['22', '24']) {
    const lane = laneContract({ kind: 'native', flow: '1.0.1', react, node });
    ids.push(lane.id);
    assert.equal(lane.flow, '1.0.1');
    assert.equal(lane.peers.react, react === '18' ? '18.3.1' : '19.0.0');
  }
  assert.equal(new Set(ids).size, 4);
  const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.deepEqual(JSON.parse(workflow.match(/flow:\s*(\[[^\]]+\])/)?.[1] ?? '[]'),
    ['0.34.0', '0.38.0', 'candidate', '1.0.1']);
  const runner = readFileSync(new URL('./run-lane.mjs', import.meta.url), 'utf8');
  assert.ok(runner.includes('check-lazy-recording.mjs'));
  assert.ok(runner.includes('check-lazy-recording-types'));
});

test('lane peers use the supplied cohort instead of a built-in release identity', () => {
  const pins = { agentfootprint: '90.1.2-fixture.3', footprintjs: '91.2.3', foottrace: '92.3.4' };
  const lane = laneContract({ kind: 'native', flow: 'candidate', react: '19', node: '24' }, { pins });
  for (const [name, version] of Object.entries(pins)) assert.equal(lane.peers[name], version);
});

test('invalid and retired historical runtime combinations fail closed', () => {
  for (const input of [
    { kind: 'floor', flow: '0.34.0', react: '18', node: '22' },
    { kind: 'modern', flow: '0.38.0', react: '19', node: '24' },
    { kind: 'historical', flow: '0.38.0', react: '18', node: '22' },
    { kind: 'other', flow: '0.38.0', react: '18', node: '22' },
    { kind: 'native', flow: 'latest', react: '18', node: '22' },
    { kind: 'native', flow: 'candidate', react: '17', node: '22' },
    { kind: 'native', flow: 'candidate', react: '18', node: '20' },
  ]) assert.throws(() => laneContract(input));
});

test('archives reject traversal, duplicate names and foreign prefixes', () => {
  assert.deepEqual(safeArchiveNames('package/a\npackage/dist/b\n'), ['package/a', 'package/dist/b']);
  for (const names of ['', '/tmp/a', '../x', 'package/../x', 'package/./x',
    'package\\x', 'package/a\npackage/a', 'package/a\0']) {
    assert.throws(() => safeArchiveNames(names));
  }
});

test('installed byte guard rejects mutation, addition and removal', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'why-compat-bytes-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, 'a'), 'unchanged');
  const expected = hashFiles(directory);
  assert.equal(assertInstalled(directory, expected, 'control'), 1);
  writeFileSync(join(directory, 'a'), 'changed');
  assert.throws(() => assertInstalled(directory, expected, 'mutation'));
  writeFileSync(join(directory, 'a'), 'unchanged');
  writeFileSync(join(directory, 'b'), 'extra');
  assert.throws(() => assertInstalled(directory, expected, 'addition'));
  assert.throws(() => assertInstalled(directory, { ...hashFiles(directory), missing: sha256('missing') }, 'removal'));
});

test('archive source binding includes metadata, docs, licence and every build file', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'why-compat-source-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'dist'));
  for (const filename of ['package.json', 'README.md', 'LICENSE', 'dist/index.js', 'dist/index.d.ts']) {
    writeFileSync(join(directory, filename), filename);
  }
  const expected = publishedSourceFiles(directory);
  assert.equal(Object.keys(expected).length, 5);
  for (const filename of Object.keys(expected)) {
    writeFileSync(join(directory, filename), 'stale archive would miss this');
    assert.notDeepEqual(publishedSourceFiles(directory), expected, filename);
    writeFileSync(join(directory, filename), filename);
  }
  writeFileSync(join(directory, 'dist/addition.js'), 'new public file');
  assert.notDeepEqual(publishedSourceFiles(directory), expected);
});

test('physical package inspection finds nested leaks and rejects links', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'why-compat-tree-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  function pkg(path, name) {
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, 'package.json'), JSON.stringify({ name }));
  }
  pkg(join(directory, 'outer'), 'outer');
  pkg(join(directory, 'outer/node_modules/inner'), 'inner');
  pkg(join(directory, '@scope/leaf'), '@scope/leaf');
  assert.deepEqual(installedPackageNames(directory), ['@scope/leaf', 'inner', 'outer']);
  symlinkSync(join(directory, 'outer'), join(directory, 'linked'));
  assert.throws(() => installedPackageNames(directory), /linked package/);
});

test('record-only allowlist rejects a graph, engine, agent or duplicate record owner', () => {
  for (const major of ['18', '19']) {
    const names = ['@types/react', 'csstype', 'footprint-explainable-ui', 'foottrace', 'react',
      ...(major === '18' ? ['@types/prop-types', 'js-tokens', 'loose-envify'] : [])].sort();
    assertRecordIsolation(names, major);
    for (const extra of ['@xyflow/react', 'dagre', 'react-dom', 'footprintjs', 'agentfootprint', 'foottrace', 'unknown-package']) {
      assert.throws(() => assertRecordIsolation([...names, extra].sort(), major));
    }
    assert.throws(() => assertRecordIsolation(names.slice(1), major));
  }
});

test('record-only closures are React-major-specific, never a shared superset', () => {
  const react19 = ['@types/react', 'csstype', 'footprint-explainable-ui', 'foottrace', 'react'];
  const react18 = [...react19, '@types/prop-types', 'js-tokens', 'loose-envify'].sort();
  assert.throws(() => assertRecordIsolation(react18, '19'));
  assert.throws(() => assertRecordIsolation(react19, '18'));
  assert.throws(() => assertRecordIsolation(react19, '20'));
  assert.throws(() => assertRecordIsolation(react19));
});

test('malformed nested package is not mistaken for an absent node_modules', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'why-compat-malformed-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'outer/node_modules/broken'), { recursive: true });
  writeFileSync(join(directory, 'outer/package.json'), JSON.stringify({ name: 'outer' }));
  assert.throws(() => installedPackageNames(directory), /ENOENT/);
});

test('record ownership checks real paths, not merely versions', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'why-compat-owner-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const first = join(directory, 'first');
  const second = join(directory, 'second');
  writeFileSync(first, 'same bytes');
  writeFileSync(second, 'same bytes');
  assertOwner(() => first, { lens: () => first, flow: () => first });
  assert.throws(() => assertOwner(() => first, { flow: () => second }), /second Foottrace/);
});

test('CLI rejects duplicate, unknown and incomplete flags', () => {
  assert.deepEqual(parseFlags(['--flow', 'candidate'], ['flow']), { flow: 'candidate' });
  for (const argv of [['--flow'], ['flow', 'candidate'], ['--unknown', 'x'], ['--flow', 'a', '--flow', 'b']]) {
    assert.throws(() => parseFlags(argv, ['flow']));
  }
});
