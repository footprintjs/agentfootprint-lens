import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { agentCandidateContract, assertInstalled, assertOwner, assertRecordIsolation, hashFiles,
  installedPackageNames, laneContract, parseFlags, publishedSourceFiles, safeArchiveNames,
  sha256 } from './contract.mjs';

test('the four floor lanes require FootPrint 10 and preserve renderer/React floors', () => {
  const ids = [];
  for (const flow of ['0.34.0', '0.38.0']) for (const react of ['18', '19']) {
    const lane = laneContract({ kind: 'floor', flow, react, node: '22' });
    ids.push(lane.id);
    assert.equal(lane.peers.agentfootprint, '10.0.0');
    assert.equal(lane.peers.footprintjs, '10.0.0');
    assert.equal(lane.peers.foottrace, '1.0.0');
  }
  assert.equal(new Set(ids).size, 4);
});

test('the twelve modern lanes include both old renderers and the real candidate', () => {
  const ids = [];
  for (const flow of ['0.34.0', '0.38.0', 'candidate']) for (const react of ['18', '19']) {
    for (const node of ['22', '24']) {
      const lane = laneContract({ kind: 'modern', flow, react, node });
      ids.push(lane.id);
      assert.equal(lane.peers.agentfootprint, '10.1.0');
      assert.equal(lane.peers.footprintjs, '10.0.0');
      assert.equal(lane.peers.foottrace, '1.0.3');
    }
  }
  assert.equal(new Set(ids).size, 12);
});

test('invalid and removed historical runtime combinations fail closed', () => {
  for (const input of [
    { kind: 'historical', flow: '0.38.0', react: '18', node: '22' },
    { kind: 'other', flow: '0.38.0', react: '18', node: '22' },
    { kind: 'modern', flow: 'latest', react: '18', node: '22' },
    { kind: 'modern', flow: 'candidate', react: '17', node: '22' },
    { kind: 'modern', flow: 'candidate', react: '18', node: '20' },
    { kind: 'floor', flow: 'candidate', react: '18', node: '22' },
    { kind: 'floor', flow: '0.38.0', react: '18', node: '24' },
  ]) assert.throws(() => laneContract(input));
});

test('the AgentFootprint 11 candidate lane keeps the engine pins it was reviewed with', () => {
  const lane = agentCandidateContract('11.0.0');
  assert.equal(lane.version, '11.0.0');
  assert.equal(lane.consumer, 'lens-agentfootprint-11-consumer');
  assert.deepEqual(lane.engines, { footprintjs: '10.0.0', foottrace: '1.7.0' });
});

test('the AgentFootprint 12 candidate lane pins the engine floors its manifest declares', () => {
  const lane = agentCandidateContract('12.0.0');
  assert.equal(lane.version, '12.0.0');
  assert.equal(lane.consumer, 'lens-agentfootprint-12-consumer');
  assert.deepEqual(lane.engines, { footprintjs: '10.6.0', foottrace: '1.8.0' });
  assert.ok(Object.isFrozen(lane) && Object.isFrozen(lane.engines));
});

test('candidate versions that are inexact or have no reviewed pins fail closed', () => {
  for (const version of [undefined, 12, '', '12', '12.0', 'v12.0.0', '12.0.0-rc.1', ' 12.0.0',
    '012.0.0', '0.1.0', '10.1.0', '13.0.0', '__proto__']) {
    assert.throws(() => agentCandidateContract(version));
  }
});

test('archives reject traversal, duplicate names and foreign prefixes', () => {
  assert.deepEqual(safeArchiveNames('package/a\npackage/dist/b\n'), ['package/a', 'package/dist/b']);
  for (const names of ['', '/tmp/a', '../x', 'package/../x', 'package/./x',
    'package\\x', 'package/a\npackage/a', 'package/a\0']) {
    assert.throws(() => safeArchiveNames(names));
  }
});

test('installed byte guard rejects mutation, addition and removal', () => {
  const directory = mkdtempSync(join(tmpdir(), 'why-compat-bytes-'));
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

test('archive source binding includes metadata, docs, licence and every build file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'why-compat-source-'));
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

test('physical package inspection finds nested leaks and rejects links', () => {
  const directory = mkdtempSync(join(tmpdir(), 'why-compat-tree-'));
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

test('malformed nested package is not mistaken for an absent node_modules', () => {
  const directory = mkdtempSync(join(tmpdir(), 'why-compat-malformed-'));
  mkdirSync(join(directory, 'outer/node_modules/broken'), { recursive: true });
  writeFileSync(join(directory, 'outer/package.json'), JSON.stringify({ name: 'outer' }));
  assert.throws(() => installedPackageNames(directory), /ENOENT/);
});

test('record ownership checks real paths, not merely versions', () => {
  const directory = mkdtempSync(join(tmpdir(), 'why-compat-owner-'));
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
