import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeCandidate, sha256 } from './contract.mjs';
import { assertNativeSourceMetadata, verifyStageIdentity } from './stage-proof.mjs';

const label = 'candidate pack from main bc0b9301 via route stage; not published RC';
const digest = 'a'.repeat(64);
const tree = 'b'.repeat(40);
const file = (text, mode = 0o644) => ({ kind: 'file', mode, gitMode: '100644', indexOid: 'c'.repeat(40), size: Buffer.byteLength(text), sha256: sha256(text) });
const payload = (text, mode = 0o644) => ({ mode, diskMode: mode, size: Buffer.byteLength(text), sha256: sha256(text) });

function images() {
  const manifest = { name: 'agentfootprint', version: nativeCandidate.sourceVersion, scripts: { build: 'tsc' }, dependencies: { foottrace: '^1.11.0' } };
  const staged = { ...structuredClone(manifest), version: nativeCandidate.version };
  const image = (value) => ({
    schema: 1, source: '/synthetic/af', sourceCommit: nativeCandidate.sourceCommit,
    sourceTree: tree, trackedStatus: '', npmVersion: '11.19.0', manifest: value,
    tracked: { 'package.json': file(JSON.stringify(value)), 'package-lock.json': file('source lock'), 'src/agent.ts': file('unchanged'), link: { kind: 'symlink', mode: 0o777, gitMode: '120000', indexOid: 'd'.repeat(40), targetBase64: Buffer.from('src/agent.ts').toString('base64'), sha256: sha256('src/agent.ts'), size: 12 } },
    payload: { 'package.json': payload(JSON.stringify(value)), 'dist/index.js': payload('built once'), 'bin/cli.js': payload('executable', 0o755) },
  });
  const before = image(manifest);
  const after = image(staged);
  after.trackedStatus = ' M package.json';
  const archive = {
    filename: `agentfootprint-${nativeCandidate.version}.tgz`, sha256: digest, manifest: staged,
    files: Object.fromEntries(Object.entries(after.payload).map(([name, data]) => [name, { sha256: data.sha256, mode: data.mode }])),
  };
  return { before, after, archive };
}

function metadata() {
  return { schema: 1, profile: nativeCandidate.profile, sourceCommit: nativeCandidate.sourceCommit,
    sourceTree: tree, sourceVersion: nativeCandidate.sourceVersion, version: nativeCandidate.version,
    sha256: digest, filename: `agentfootprint-${nativeCandidate.version}.tgz`, label };
}

test('pure validators accept only the labelled version-only staged image without changing inputs', () => {
  const { before, after, archive } = images();
  const original = JSON.stringify({ before, after, archive });
  assert.deepEqual(verifyStageIdentity(before, after, archive), metadata());
  const data = metadata();
  assert.equal(assertNativeSourceMetadata(data, digest), data);
  assert.equal(JSON.stringify({ before, after, archive }), original);
});

for (const [field, value] of [
  ['schema', 2], ['profile', 'historical'], ['sourceCommit', '0'.repeat(40)],
  ['sourceTree', 'not-a-tree'], ['sourceVersion', '14.0.0'], ['version', '13.0.0'],
  ['sha256', 'f'.repeat(64)], ['filename', 'agentfootprint-13.0.0.tgz'], ['label', 'published RC'],
]) test(`source metadata refuses changed ${field}`, () => {
  assert.throws(() => assertNativeSourceMetadata({ ...metadata(), [field]: value }, digest));
});

for (const [name, change] of [
  ['source commit', ({ after }) => { after.sourceCommit = '0'.repeat(40); }],
  ['source tree', ({ after }) => { after.sourceTree = '0'.repeat(40); }],
  ['dirty baseline', ({ before }) => { before.trackedStatus = ' M src/agent.ts'; }],
  ['manifest dependency', ({ after }) => { after.manifest.dependencies.foottrace = '*'; }],
  ['added manifest key', ({ after }) => { after.manifest.extra = true; }],
  ['removed manifest key', ({ after }) => { delete after.manifest.scripts; }],
  ['tracked lock bytes', ({ after }) => { after.tracked['package-lock.json'].sha256 = digest; }],
  ['tracked source mode', ({ after }) => { after.tracked['src/agent.ts'].mode = 0o755; }],
  ['tracked symlink target', ({ after }) => { after.tracked.link.targetBase64 = Buffer.from('../outside').toString('base64'); }],
  ['tracked key set', ({ after }) => { delete after.tracked['src/agent.ts']; }],
  ['built payload bytes', ({ after }) => { after.payload['dist/index.js'].sha256 = digest; }],
  ['packed payload mode', ({ after }) => { after.payload['bin/cli.js'].mode = 0o644; }],
  ['payload key set', ({ after }) => { after.payload.extra = payload('extra'); }],
  ['archive key set', ({ archive }) => { delete archive.files['dist/index.js']; }],
  ['archive bytes', ({ archive }) => { archive.files['dist/index.js'].sha256 = digest; }],
  ['archive mode', ({ archive }) => { archive.files['bin/cli.js'].mode = 0o644; }],
  ['archive manifest', ({ archive }) => { archive.manifest = { ...archive.manifest, version: '13.0.0' }; }],
]) test(`version-only staging refuses changed ${name}`, () => {
  const input = images();
  change(input);
  assert.throws(() => verifyStageIdentity(input.before, input.after, input.archive));
});
