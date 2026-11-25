// Build Why normally before calling this. All compatibility consumers receive
// this ONE archive; none repack it for their selected renderer or React version.
// Every renderer comes from the registry in its own lane (run-lane.mjs), so this
// step reads only this commit and the published evidence of this same job.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseFlags, publishedSourceFiles, readActiveCohort, rendererPeerRange } from './contract.mjs';
import { command, inspectArchive, writeJson } from './process.mjs';
import { readWhyIdentity } from './why-identity.mjs';
import { assertPublishedReceipt, readPublishedAgent } from './published-proof.mjs';

const flags = parseFlags(process.argv.slice(2), ['why-tar', 'out', 'published-evidence']);
assert.ok(flags['why-tar'] && flags.out && flags['published-evidence'],
  'usage: --why-tar <original> --published-evidence <registry archives and receipts> --out <directory>');
const cohort = readActiveCohort();
const agentIdentity = readPublishedAgent(cohort);
const published = resolve(flags['published-evidence']);
const out = resolve(flags.out);
mkdirSync(out, { recursive: true });
const whyIdentity = readWhyIdentity();
assert.equal(basename(flags['why-tar']), whyIdentity.filename, 'Why input archive must use its source-derived basename');
const whyFile = join(out, whyIdentity.filename);
if (resolve(flags['why-tar']) !== whyFile) copyFileSync(flags['why-tar'], whyFile);
const why = inspectArchive(whyFile, out, whyIdentity);
assert.deepEqual(Object.keys(why.manifest.exports).sort(),
  ['.', './context', './core', './recording', './recording/react', './skillgraph', './why']);
assert.equal(why.manifest.peerDependencies['footprint-explainable-ui'], rendererPeerRange);
assert.deepEqual(why.files, publishedSourceFiles(process.cwd()),
  'Why archive must contain exactly this checkout’s package metadata, built dist, README and LICENSE');
const dirtyTracked = command('git', ['status', '--porcelain', '--untracked-files=no']).trim();
if (process.env.GITHUB_RUN_ID) assert.equal(dirtyTracked, '', 'hosted archive source must be the checked clean commit');
const verification = JSON.parse(readFileSync(join(published, 'source-verification.json'), 'utf8'));
assert.deepEqual(verification.cohort, cohort, 'registry evidence must use the current committed cohort');
const packages = {};
const receipts = {};
for (const expected of Object.values(cohort.packages)) {
  const target = join(out, expected.filename);
  const original = join(published, expected.filename);
  const sourceReceipt = verification.published[expected.name];
  const receipt = assertPublishedReceipt(sourceReceipt, readFileSync(original), expected);
  if (resolve(original) !== target) copyFileSync(original, target);
  const archive = inspectArchive(target, out, { ...expected, expectedSha: receipt.sha256 });
  packages[expected.name] = { ...archive, path: basename(archive.path) };
  receipts[expected.name] = receipt;
}
const agent = packages[agentIdentity.name];
const agentSource = receipts[agentIdentity.name];
const publishedPeers = Object.fromEntries(['footprintjs', 'foottrace'].map(name => [
  name, { archive: packages[name], receipt: receipts[name] },
]));
writeJson(join(out, 'agent-source.json'), agentSource);
const report = {
  schema: 1, cohort, agentSource, agent, publishedPeers, whyIdentity, why: { ...why, path: basename(why.path) },
  source: {
    whyCommit: command('git', ['rev-parse', 'HEAD']).trim(),
    whyTree: command('git', ['rev-parse', 'HEAD^{tree}']).trim(),
    dirtyTracked,
    workflowRun: process.env.GITHUB_RUN_ID ?? null,
    workflowAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
  },
};
writeJson(join(out, 'contract.json'), report);
console.log(JSON.stringify({ why: { sha256: why.sha256, files: Object.keys(why.files).length },
  source: report.source }, null, 2));
