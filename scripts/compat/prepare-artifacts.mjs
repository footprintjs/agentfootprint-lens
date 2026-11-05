// Build Why normally before calling this. All compatibility consumers receive
// this ONE archive; none repack it for their selected renderer or React version.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { candidate, nativeCandidate, parseFlags, publishedSourceFiles } from './contract.mjs';
import { command, inspectArchive, writeJson } from './process.mjs';
import { assertNativeSourceMetadata } from './stage-proof.mjs';
import { assertPublishedReceipt } from './published-proof.mjs';
import { readWhyIdentity } from './why-identity.mjs';

const flags = parseFlags(process.argv.slice(2), ['why-tar', 'flow-source', 'out', 'agent-tar', 'agent-source', 'agent-profile']);
assert.ok(flags['why-tar'] && flags['flow-source'] && flags.out && flags['agent-tar'] && flags['agent-source'],
  'usage: --why-tar <archive> --flow-source <exact M6 checkout> --agent-tar <archive> --agent-source <metadata> --out <directory>');
const agentProfile = flags['agent-profile'] ?? 'published';
assert.ok(['published', 'offline'].includes(agentProfile), 'explicit supported agent profile required');
const out = resolve(flags.out);
const source = resolve(flags['flow-source']);
mkdirSync(out, { recursive: true });
assert.equal(command('git', ['rev-parse', 'HEAD'], { cwd: source }).trim(), candidate.commit);
assert.equal(command('git', ['rev-parse', 'HEAD^{tree}'], { cwd: source }).trim(), candidate.tree);
assert.equal(command('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: source }).trim(), '',
  'candidate source must retain its reviewed tracked tree');
// The M6 dist is already tracked and reviewed. Rebuilding it here would make a
// different, unreviewed candidate. npm 11.21 is the archive-format control.
assert.equal(command('npm', ['--version']).trim(), '11.21.0');
const packed = JSON.parse(command('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', out],
  { cwd: source, log: join(out, 'flow-pack.log') }));
assert.equal(packed.length, 1);
const flowFile = join(out, packed[0].filename);
const flow = inspectArchive(flowFile, out, {
  name: 'footprint-explainable-ui', version: candidate.version, expectedSha: candidate.sha256,
});
const whyIdentity = readWhyIdentity();
assert.equal(basename(flags['why-tar']), whyIdentity.filename, 'Why input archive must use its source-derived basename');
const whyFile = join(out, whyIdentity.filename);
if (resolve(flags['why-tar']) !== whyFile) copyFileSync(flags['why-tar'], whyFile);
const why = inspectArchive(whyFile, out, whyIdentity);
assert.deepEqual(Object.keys(why.manifest.exports).sort(), ['.', './context', './core', './skillgraph', './why']);
assert.equal(why.manifest.peerDependencies['footprint-explainable-ui'], '>=0.34.0 <1.0.0 || ^1.0.0');
assert.deepEqual(why.files, publishedSourceFiles(process.cwd()),
  'Why archive must contain exactly this checkout’s package metadata, built dist, README and LICENSE');
const dirtyTracked = command('git', ['status', '--porcelain', '--untracked-files=no']).trim();
if (process.env.GITHUB_RUN_ID) assert.equal(dirtyTracked, '', 'hosted archive source must be the checked clean commit');
const agentFile = join(out, `agentfootprint-${nativeCandidate.version}.tgz`);
if (resolve(flags['agent-tar']) !== agentFile) copyFileSync(flags['agent-tar'], agentFile);
const agent = inspectArchive(agentFile, out, { name: 'agentfootprint', version: nativeCandidate.version });
const sourceReceipt = JSON.parse(readFileSync(flags['agent-source'], 'utf8'));
const agentSource = agentProfile === 'offline'
  ? assertNativeSourceMetadata(sourceReceipt, agent.sha256)
  : assertPublishedReceipt(sourceReceipt, readFileSync(agentFile));
writeJson(join(out, 'agent-source.json'), agentSource);
const report = {
  schema: 1, agentProfile, agentSource, agent: { ...agent, path: basename(agent.path) }, whyIdentity, why: { ...why, path: basename(why.path) }, flow: { ...flow, path: basename(flow.path) },
  candidate, source: {
    whyCommit: command('git', ['rev-parse', 'HEAD']).trim(),
    whyTree: command('git', ['rev-parse', 'HEAD^{tree}']).trim(),
    dirtyTracked,
    workflowRun: process.env.GITHUB_RUN_ID ?? null,
    workflowAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
  },
};
writeJson(join(out, 'contract.json'), report);
console.log(JSON.stringify({ why: { sha256: why.sha256, files: Object.keys(why.files).length },
  flow: { sha256: flow.sha256, files: Object.keys(flow.files).length }, source: report.source }, null, 2));
