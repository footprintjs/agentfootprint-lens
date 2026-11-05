// Capture identity around the reviewed route's stage/pack, without performing either.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync,
  realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeCandidate, parseFlags, sha256 } from './contract.mjs';
import { command, inspectArchive } from './process.mjs';

const LABEL = 'candidate pack from main bc0b9301 via route stage; not published RC';
const FILENAME = `agentfootprint-${nativeCandidate.version}.tgz`;
const gitEnv = { GIT_NO_REPLACE_OBJECTS: '1', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
const keys = (value) => Object.keys(value).sort();

export function assertNativeSourceMetadata(metadata, archiveSha) {
  assert.ok(metadata && typeof metadata === 'object', 'native source metadata is required');
  assert.deepEqual(keys(metadata), ['schema', 'profile', 'sourceCommit', 'sourceTree', 'sourceVersion',
    'version', 'sha256', 'filename', 'label'].sort(), 'native source metadata keys');
  assert.equal(metadata.schema, 1);
  for (const key of ['profile', 'sourceCommit', 'sourceVersion', 'version']) {
    assert.equal(metadata[key], nativeCandidate[key], `native source ${key}`);
  }
  assert.match(metadata.sourceTree, /^[a-f0-9]{40}$/, 'native source tree');
  assert.match(archiveSha, /^[a-f0-9]{64}$/, 'actual archive SHA256');
  assert.equal(metadata.sha256, archiveSha, 'native source archive digest');
  assert.equal(metadata.filename, FILENAME, 'native candidate filename');
  assert.equal(metadata.label, LABEL, 'offline candidate label');
  return metadata;
}

function sameFiles(before, after, label) {
  assert.deepEqual(keys(after), keys(before), `${label} key set changed`);
  for (const name of keys(before)) {
    if (name !== 'package.json') {
      assert.deepEqual(after[name], before[name], `${label} changed: ${name}`);
    } else {
      const { sha256: oldHash, size: oldSize, ...oldMode } = before[name];
      const { sha256: newHash, size: newSize, ...newMode } = after[name];
      assert.ok(oldHash && newHash && oldSize > 0 && newSize > 0, `${label} manifest bytes missing`);
      assert.deepEqual(newMode, oldMode, `${label} manifest mode/index changed`);
    }
  }
}

export function verifyStageIdentity(before, after, archive) {
  assert.equal(before.schema, 1);
  assert.equal(after.schema, 1);
  assert.equal(before.sourceCommit, nativeCandidate.sourceCommit, 'before source commit');
  assert.equal(after.sourceCommit, before.sourceCommit, 'source commit changed');
  assert.match(before.sourceTree, /^[a-f0-9]{40}$/);
  assert.equal(after.sourceTree, before.sourceTree, 'source tree changed');
  assert.equal(after.source, before.source, 'source checkout changed');
  assert.equal(before.trackedStatus, '', 'before source must be tracked-clean');
  assert.equal(before.npmVersion, '11.19.0', 'reviewed route npm version');
  assert.equal(after.npmVersion, before.npmVersion, 'npm version changed');
  assert.equal(before.manifest.name, 'agentfootprint');
  assert.equal(before.manifest.version, nativeCandidate.sourceVersion, 'source manifest version');
  assert.deepEqual(after.manifest, { ...before.manifest, version: nativeCandidate.version },
    'the complete manifest may change only its version');
  assert.equal(before.tracked['package.json']?.kind, 'file', 'tracked manifest must be a regular file');
  sameFiles(before.tracked, after.tracked, 'tracked source');
  sameFiles(before.payload, after.payload, 'built payload');
  for (const image of [before, after]) {
    assert.equal(image.payload['package.json']?.sha256, image.tracked['package.json'].sha256,
      'packed manifest must be the source manifest bytes');
  }
  assert.equal(archive.filename, FILENAME, 'archive filename');
  assert.deepEqual(archive.manifest, after.manifest, 'archive manifest differs from staged source');
  assert.deepEqual(archive.files, Object.fromEntries(Object.entries(after.payload).map(([name, data]) =>
    [name, { sha256: data.sha256, mode: data.mode }])), 'archive payload bytes/modes/key set changed');
  return assertNativeSourceMetadata({
    schema: 1, profile: nativeCandidate.profile, sourceCommit: before.sourceCommit,
    sourceTree: before.sourceTree, sourceVersion: nativeCandidate.sourceVersion,
    version: nativeCandidate.version, sha256: archive.sha256, filename: archive.filename, label: LABEL,
  }, archive.sha256);
}

function localPath(root, name) {
  assert.ok(typeof name === 'string' && name.length > 0 && !/[\\\0\r\n]/.test(name), 'unsafe file name');
  assert.ok(!name.startsWith('/') && name.split('/').every((p) => p && p !== '.' && p !== '..'), 'unsafe file path');
  const absolute = resolve(root, name);
  assert.ok(absolute.startsWith(root + sep), 'file escaped the source directory');
  for (let parent = dirname(absolute); parent !== root; parent = dirname(parent)) {
    const stat = lstatSync(parent);
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'file has a non-directory ancestor');
  }
  return absolute;
}

function trackedFiles(source, listing, requireIndexBytes) {
  const entries = [];
  for (const row of listing.split('\0').filter(Boolean)) {
    const match = /^(100644|100755|120000) ([a-f0-9]{40}) 0\t([\s\S]+)$/.exec(row);
    assert.ok(match, 'tracked input must be a stage-zero regular file or symlink');
    const [, gitMode, indexOid, name] = match;
    const absolute = localPath(source, name);
    const stat = lstatSync(absolute);
    const link = stat.isSymbolicLink();
    assert.ok(link || stat.isFile(), 'tracked input is not a regular file or symlink');
    assert.equal(gitMode, link ? '120000' : (stat.mode & 0o111) ? '100755' : '100644', 'tracked file mode');
    const bytes = link ? readlinkSync(absolute, { encoding: 'buffer' }) : readFileSync(absolute);
    if (requireIndexBytes) {
      const oid = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      assert.equal(oid, indexOid, `tracked bytes differ from the clean index: ${name}`);
    }
    entries.push([name, { kind: link ? 'symlink' : 'file', mode: stat.mode & 0o7777,
      gitMode, indexOid, size: bytes.length, sha256: sha256(bytes),
      ...(link ? { targetBase64: bytes.toString('base64') } : {}) }]);
  }
  assert.equal(new Set(entries.map(([name]) => name)).size, entries.length, 'duplicate tracked paths');
  return Object.fromEntries(entries);
}

function packRecord(value, version) {
  assert.ok(Array.isArray(value) && value.length === 1, 'npm pack must report exactly one archive');
  const record = value[0];
  assert.equal(record.name, 'agentfootprint');
  assert.equal(record.version, version);
  assert.equal(record.filename, `agentfootprint-${version}.tgz`);
  assert.ok(Array.isArray(record.files) && record.files.length > 0, 'npm pack file list is required');
  return record;
}

function payloadFiles(source, record) {
  const entries = record.files.map((item) => {
    const absolute = localPath(source, item.path);
    const stat = lstatSync(absolute);
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'packed payload must be regular data');
    assert.ok(item.mode === 0o644 || item.mode === 0o755, 'npm pack mode must be regular or executable');
    assert.equal(item.size, stat.size, `npm pack size differs: ${item.path}`);
    return [item.path, { mode: item.mode, diskMode: stat.mode & 0o7777,
      size: stat.size, sha256: sha256(readFileSync(absolute)) }];
  });
  assert.equal(new Set(entries.map(([name]) => name)).size, entries.length, 'duplicate packed paths');
  return Object.fromEntries(entries);
}

function captureSource(source, before) {
  const git = (args) => command('git', args, { cwd: source, env: gitEnv, timeout: 30_000 });
  const sourceCommit = git(['rev-parse', 'HEAD']).trim();
  assert.equal(sourceCommit, nativeCandidate.sourceCommit, 'source must be the pinned AF main');
  const sourceTree = git(['rev-parse', 'HEAD^{tree}']).trim();
  const trackedStatus = git(['status', '--porcelain', '--untracked-files=no']).trimEnd();
  if (before) assert.equal(trackedStatus, '', 'before source must be tracked-clean');
  const tracked = trackedFiles(source, git(['ls-files', '--stage', '-z']), before);
  assert.equal(tracked['package.json']?.kind, 'file', 'source manifest must be a tracked regular file');
  const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
  const version = before ? nativeCandidate.sourceVersion : nativeCandidate.version;
  assert.equal(manifest.version, version);
  const npmVersion = command('npm', ['--version'], { cwd: source, timeout: 30_000 }).trim();
  assert.equal(npmVersion, '11.19.0', 'reviewed route npm version');
  return { schema: 1, source, sourceCommit, sourceTree, trackedStatus, npmVersion, manifest, tracked };
}

function capture(source, record, before) {
  const image = captureSource(source, before);
  return { ...image, pack: record,
    payload: payloadFiles(source, packRecord(record, before ? nativeCandidate.sourceVersion : nativeCandidate.version)) };
}

function save(filename, value) {
  writeFileSync(filename, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}

function main() {
  const flags = parseFlags(process.argv.slice(2), ['phase', 'source', 'evidence', 'archive', 'pack-json']);
  assert.ok(['before', 'after'].includes(flags.phase) && flags.source && flags.evidence,
    'usage: --phase before|after --source <pinned AF checkout> --evidence <directory>');
  const source = realpathSync(resolve(flags.source));
  const evidence = resolve(flags.evidence);
  assert.ok(evidence !== source && !evidence.startsWith(source + sep), 'evidence must be outside source');
  mkdirSync(evidence, { recursive: true });
  if (flags.phase === 'before') {
    assert.ok(!flags.archive && !flags['pack-json'], 'before does not consume an archive');
    const initial = captureSource(source, true);
    // Dry-run only: no archive, version, build or source mutation is performed here.
    const output = command('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'],
      { cwd: source, log: join(evidence, 'before-pack.log'), timeout: 90_000 });
    save(join(evidence, 'before-pack.json'), JSON.parse(output));
    const image = capture(source, JSON.parse(output), true);
    assert.deepEqual(Object.fromEntries(keys(initial).map((key) => [key, image[key]])), initial,
      'dry-run changed the tracked source identity');
    save(join(evidence, 'before.json'), image);
    return;
  }
  assert.ok(flags.archive && flags['pack-json'], 'after requires --archive and --pack-json');
  const archivePath = realpathSync(resolve(flags.archive));
  assert.ok(!archivePath.startsWith(source + sep), 'archive must be outside source');
  const packBytes = readFileSync(resolve(flags['pack-json']));
  writeFileSync(join(evidence, 'after-pack.json'), packBytes, { flag: 'wx' });
  const after = capture(source, JSON.parse(packBytes), false);
  save(join(evidence, 'after.json'), after);
  const inspectionRoot = mkdtempSync(join(evidence, 'archive-'));
  let inspected;
  // Preserve archive modes instead of letting the caller's umask hide a mode
  // difference. Extraction stays inside the fresh private evidence directory.
  const oldMask = process.umask(0);
  try {
    inspected = inspectArchive(archivePath, inspectionRoot,
      { name: 'agentfootprint', version: nativeCandidate.version });
  } finally { process.umask(oldMask); }
  const unpacked = readdirSync(inspectionRoot);
  assert.equal(unpacked.length, 1, 'archive inspector must create one unpacked directory');
  const packageDir = join(inspectionRoot, unpacked[0], 'package');
  const files = Object.fromEntries(Object.entries(inspected.files).map(([name, hash]) =>
    [name, { sha256: hash, mode: lstatSync(localPath(packageDir, name)).mode & 0o7777 }]));
  const archive = { filename: basename(archivePath), sha256: inspected.sha256,
    manifest: inspected.manifest, files };
  save(join(evidence, 'archive.json'), archive);
  const before = JSON.parse(readFileSync(join(evidence, 'before.json'), 'utf8'));
  save(join(evidence, 'native-source.json'), verifyStageIdentity(before, after, archive));
}

// Importing either validator never executes Git, npm, tar, or the CLI.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
}
