// Build Why normally before calling this. All compatibility consumers receive
// this ONE archive; none repack it for their selected renderer or React version.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { candidate, parseFlags, publishedSourceFiles } from './contract.mjs';
import { command, inspectArchive, writeJson } from './process.mjs';
import { readWhyIdentity } from './why-identity.mjs';
import { inspectInputs, verifyRestored } from './source-inputs.mjs';

const flags = parseFlags(process.argv.slice(2), ['why-tar', 'flow-source', 'out', 'source-inputs', 'bootstrap-evidence']);
assert.ok(flags['why-tar'] && flags['flow-source'] && flags.out && flags['source-inputs'] && flags['bootstrap-evidence'],
  'usage: --why-tar <original> --flow-source <exact fixture checkout> --source-inputs <originals> --bootstrap-evidence <proof> --out <directory>');
const native = inspectInputs(resolve(flags['source-inputs']));
verifyRestored(flags['bootstrap-evidence']);
const cohort = native.cohort;
const agentIdentity = cohort.packages.agentfootprint;
const out = resolve(flags.out);
const source = resolve(flags['flow-source']);
mkdirSync(out, { recursive: true });
assert.equal(command('git', ['rev-parse', 'HEAD'], { cwd: source }).trim(), candidate.commit);
assert.equal(command('git', ['rev-parse', 'HEAD^{tree}'], { cwd: source }).trim(), candidate.tree);
assert.equal(command('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: source }).trim(), '',
  'candidate source must retain its reviewed tracked tree');
// The source checkout supplies only immutable fixtures. Consume the producer's
// original archive without rebuilding or packing any upstream source.
const flowFile = join(out, `footprint-explainable-ui-${candidate.version}.tgz`);
if (resolve(native.renderer.path) !== flowFile) copyFileSync(native.renderer.path, flowFile);
const flow = inspectArchive(flowFile, out, {
  name: 'footprint-explainable-ui', version: candidate.version, expectedSha: candidate.sha256,
});
const whyIdentity = readWhyIdentity();
assert.equal(basename(flags['why-tar']), whyIdentity.filename, 'Why input archive must use its source-derived basename');
const whyFile = join(out, whyIdentity.filename);
if (resolve(flags['why-tar']) !== whyFile) copyFileSync(flags['why-tar'], whyFile);
const why = inspectArchive(whyFile, out, whyIdentity);
assert.deepEqual(Object.keys(why.manifest.exports).sort(),
  ['.', './context', './core', './recording', './recording/react', './skillgraph', './why']);
assert.equal(why.manifest.peerDependencies['footprint-explainable-ui'], '>=0.34.0 <1.0.0 || ^1.0.0');
assert.deepEqual(why.files, publishedSourceFiles(process.cwd()),
  'Why archive must contain exactly this checkout’s package metadata, built dist, README and LICENSE');
const dirtyTracked = command('git', ['status', '--porcelain', '--untracked-files=no']).trim();
const agentFile = join(out, agentIdentity.filename);
const agentInput = native.archives.agentfootprint.path;
if (resolve(agentInput) !== agentFile) copyFileSync(agentInput, agentFile);
const agent = inspectArchive(agentFile, out, agentIdentity);
const sourceReceipt = native.receipt;
const agentSource = { kind: cohort.kind, qualification: sourceReceipt.qualification,
  source: sourceReceipt.candidate.source, archiveSha256: agent.sha256,
  independentReviewSha256: sourceReceipt.independentReviewSha256 };
{
  for (const [name, archive] of Object.entries(native.archives)) {
    const filename = `${name}-${archive.version}.tgz`;
    const original = archive.path;
    if (resolve(original) !== join(out, filename)) copyFileSync(original, join(out, filename));
  }
  copyFileSync(join(flags['source-inputs'], 'input.json'), join(out, 'input.json'));
  inspectInputs(out);
}
writeJson(join(out, 'agent-source.json'), agentSource);
const report = {
  schema: 1, cohort, agentSource, agent: { ...agent, path: basename(agent.path) }, whyIdentity, why: { ...why, path: basename(why.path) }, flow: { ...flow, path: basename(flow.path) },
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
