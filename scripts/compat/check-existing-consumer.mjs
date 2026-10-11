// Retains the prior extraction source-build lanes while checking that their
// consumer probes use the same archive as every other compatibility lane.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assertInstalled, parseFlags } from './contract.mjs';
import { inspectArchive, writeJson } from './process.mjs';

const flags = parseFlags(process.argv.slice(2), ['artifacts', 'consumer', 'evidence', 'phase']);
assert.ok(flags.artifacts && flags.consumer && flags.evidence && ['before', 'after'].includes(flags.phase));
const evidence = resolve(flags.evidence);
mkdirSync(evidence, { recursive: true });
const contract = JSON.parse(readFileSync(join(flags.artifacts, 'contract.json'), 'utf8'));
assert.equal(contract.why.path, 'agentfootprint-lens-0.76.0.tgz');
if (process.env.GITHUB_RUN_ID) {
  assert.equal(contract.source.workflowRun, process.env.GITHUB_RUN_ID);
  assert.equal(contract.source.workflowAttempt, process.env.GITHUB_RUN_ATTEMPT);
  assert.equal(contract.source.whyCommit, process.env.GITHUB_SHA);
}
const why = inspectArchive(join(flags.artifacts, contract.why.path), evidence,
  { name: 'agentfootprint-lens', version: '0.76.0', expectedSha: contract.why.sha256 });
assert.deepEqual(why.files, contract.why.files);
const count = assertInstalled(join(flags.consumer, 'node_modules/agentfootprint-lens'), why.files, 'extraction consumer Why');
writeJson(join(evidence, `${flags.phase}.json`), { source: contract.source, sha256: why.sha256, count, files: why.files });
