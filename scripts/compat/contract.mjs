import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export const candidate = Object.freeze({
  repository: 'footprintjs/explainable-ui',
  commit: 'e3681ab46e01a2a03adf97a27d58df987fef4db8',
  tree: '1edfffcb88751fcea32992d2200e171fc9686499',
  version: '1.0.0',
  sha256: 'd5bcc09551a77cab1c8ec98a0a521b129b0db37597094e86a90a5a4170603a83',
});

// The compiler's supported declaration floor is independent of the runtime
// being exercised. @types/node 26 requires TS >=5.6; using it with TS 5.4
// creates an unrelated empty-consumer failure, not a Lens compatibility test.
export const tooling = Object.freeze({
  typescript: '5.4.5', '@types/node': '22.12.0',
  vite: '8.3.4', playwright: '1.63.0',
});

// Offline candidate produced by the reviewed route's stage step, not an npm RC.
export const nativeCandidate = Object.freeze({
  profile: 'fp11-af-main',
  sourceCommit: 'bc0b93015ba6b927c1d02528fe76e36da1873b25',
  sourceVersion: '13.0.0',
  version: '14.0.0-rc.0',
  engines: Object.freeze({ footprintjs: '11.0.0-rc.1', foottrace: '1.11.0' }),
});

export function laneContract({ kind, flow, react, node }) {
  assert.equal(kind, 'native', `unknown lane kind: ${kind}`);
  assert.ok(['0.34.0', '0.38.0', 'candidate'].includes(flow), `unknown Flow: ${flow}`);
  assert.ok(['18', '19'].includes(String(react)), `unknown React: ${react}`);
  assert.ok(['22', '24'].includes(String(node)), `unknown Node: ${node}`);
  const react18 = String(react) === '18';
  return {
    id: `${kind}-flow-${flow}-react-${react}-node-${node}`,
    kind, flow, react: String(react), node: String(node),
    peers: {
      react: react18 ? '18.3.1' : '19.0.0',
      'react-dom': react18 ? '18.3.1' : '19.0.0',
      '@xyflow/react': '12.10.2',
      dagre: '0.8.5',
      agentfootprint: nativeCandidate.version,
      ...nativeCandidate.engines,
    },
    types: {
      '@types/react': react18 ? '18.3.3' : '19.0.0',
      '@types/react-dom': react18 ? '18.3.0' : '19.0.0',
    },
  };
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function assertEvidenceOutsideRepository(repository, evidence) {
  const location = resolve(evidence);
  const displacement = relative(resolve(repository), location);
  assert.ok(displacement === '..' || displacement.startsWith(`..${sep}`) || isAbsolute(displacement),
    'compatibility evidence must be outside the repository');
  return location;
}

export function hashFiles(directory, { excludeModules = false } = {}) {
  const entries = {};
  function visit(current) {
    for (const name of readdirSync(current).sort()) {
      if (excludeModules && name === 'node_modules') continue;
      const absolute = join(current, name);
      const stat = lstatSync(absolute);
      assert.equal(stat.isSymbolicLink(), false, `unexpected symlink: ${absolute}`);
      if (stat.isDirectory()) visit(absolute);
      else {
        assert.ok(stat.isFile(), `not a regular file: ${absolute}`);
        entries[relative(directory, absolute).replaceAll('\\', '/')] = sha256(readFileSync(absolute));
      }
    }
  }
  visit(directory);
  return entries;
}

export function assertInstalled(directory, expected, label) {
  assert.deepEqual(hashFiles(directory, { excludeModules: true }), expected,
    `${label}: installed files must exactly match the reviewed archive`);
  return Object.keys(expected).length;
}

export function publishedSourceFiles(root) {
  const result = {};
  for (const filename of ['package.json', 'README.md', 'LICENSE']) {
    result[filename] = sha256(readFileSync(join(root, filename)));
  }
  for (const [filename, digest] of Object.entries(hashFiles(join(root, 'dist')))) {
    result[`dist/${filename}`] = digest;
  }
  return result;
}

export function safeArchiveNames(output) {
  const names = output.trim().split('\n');
  assert.ok(names.length > 0 && names[0], 'archive must not be empty');
  for (const name of names) {
    assert.ok(name.startsWith('package/'), `unexpected archive prefix: ${name}`);
    assert.ok(!name.includes('\\') && !name.includes('\0'), `unsafe archive name: ${name}`);
    assert.ok(name.split('/').every((part) => part !== '..' && part !== '.'), `unsafe path: ${name}`);
  }
  assert.equal(new Set(names).size, names.length, 'duplicate archive names');
  return names;
}

// npm's list is not sufficient proof of isolation: inspect every real installed
// package, including nested packages; forbid file links as well as extra names.
export function installedPackageNames(modules) {
  const names = [];
  function scan(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const absolute = join(directory, entry.name);
      assert.equal(lstatSync(absolute).isSymbolicLink(), false, `linked package: ${absolute}`);
      if (entry.name.startsWith('@')) scan(absolute);
      else {
        const manifest = JSON.parse(readFileSync(join(absolute, 'package.json'), 'utf8'));
        names.push(manifest.name);
        const nested = join(absolute, 'node_modules');
        if (existsSync(nested)) scan(nested);
      }
    }
  }
  scan(modules);
  return names.sort();
}

export function assertSingleFoottrace(modules, expectedVersion) {
  assert.ok(typeof expectedVersion === 'string' && expectedVersion.length > 0,
    'expected Foottrace version must be explicit');
  const copies = installedPackageNames(modules).filter((name) => name === 'foottrace').length;
  assert.equal(copies, 1, 'exactly one physical Foottrace package must be installed');
  const path = realpathSync(join(modules, 'foottrace'));
  const manifest = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'));
  assert.equal(manifest.name, 'foottrace', 'the root Foottrace directory must own the package');
  assert.equal(manifest.version, expectedVersion, 'Foottrace version must match the native cohort');
  return { copies, version: manifest.version, path };
}

export function assertRecordIsolation(names, reactMajor) {
  assert.ok(['18', '19'].includes(String(reactMajor)), 'record isolation requires the declared React major');
  const expected = ['@types/react', 'csstype', 'footprint-explainable-ui', 'foottrace', 'react'];
  // Exact declared transitive closure, not an open-ended exception. React
  // 18.3.1 -> loose-envify -> js-tokens; @types/react18.3.3 -> @types/prop-types.
  // React19.0.0 and its matching types require none of those three packages.
  if (String(reactMajor) === '18') expected.push('@types/prop-types', 'js-tokens', 'loose-envify');
  assert.deepEqual(names, expected.sort(),
    'record-only installation must contain only the viewer, React/types, and Foottrace');
}

export function assertOwner(resolveFrom, participants) {
  const expected = realpathSync(resolveFrom('foottrace'));
  const owners = {};
  for (const [name, resolver] of Object.entries(participants)) {
    owners[name] = realpathSync(resolver('foottrace'));
    assert.equal(owners[name], expected, `${name} resolves a second Foottrace owner`);
  }
  return { canonical: expected, participants: owners };
}

export function parseFlags(argv, allowed) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    assert.ok(argv[i]?.startsWith('--') && allowed.includes(key), `unknown flag: ${argv[i]}`);
    assert.ok(argv[i + 1] && !argv[i + 1].startsWith('--'), `missing value: ${argv[i]}`);
    assert.equal(result[key], undefined, `duplicate flag: ${argv[i]}`);
    result[key] = argv[i + 1];
  }
  return result;
}
