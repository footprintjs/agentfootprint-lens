import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { validateRendererProvider } from './renderer.mjs';
import { candidate } from '../contract.mjs';

const pins = JSON.parse(readFileSync(new URL('./renderer-pins.json', import.meta.url)));
test('matrix identity equals the original renderer profile, never a registry version substitute', () => {
  assert.deepEqual(candidate, { repository: pins.repository, commit: pins.source.head,
    tree: pins.source.tree, version: pins.archive.version, sha256: pins.archive.sha256 });
  const prepare = readFileSync(new URL('../prepare-artifacts.mjs', import.meta.url), 'utf8');
  assert.ok(prepare.includes('inspectRendererInputs('));
  assert.ok(prepare.includes('copyFileSync(renderer.path, flowFile)'));
  assert.ok(!/command\('npm'|\['pack'|\['build'/.test(prepare), 'no upstream renderer rebuild or repack');
});
function fixture() {
  return { run: { ...pins.run, repository: { id: pins.repositoryId, full_name: pins.repository },
    head_commit: { id: pins.source.head, tree_id: pins.source.tree } },
    jobs: pins.jobs.map(j => ({ ...j, run_id: pins.run.id, run_attempt: 1,
      head_sha: pins.source.head, status: 'completed', conclusion: 'success' })),
    artifact: { ...pins.sourceArtifact, workflow_run: { id: pins.run.id,
      repository_id: pins.repositoryId, head_repository_id: pins.repositoryId,
      head_branch: pins.run.head_branch, head_sha: pins.source.head } },
    tested: { sha: pins.tested.head, tree: { sha: pins.tested.tree },
      parents: pins.tested.parents.map(sha => ({ sha })) } };
}

test('the original public renderer needs its exact successful run, four jobs and tested parents', () => {
  assert.equal(validateRendererProvider(fixture()), 'NATIVE_SOURCE_READY');
});

for (const [label, change] of [
  ['failed source job', d => { d.jobs[0].conclusion = 'failure'; }],
  ['unfinished job', d => { d.jobs[1].status = 'in_progress'; }],
  ['missing graph floor', d => { d.jobs.pop(); }],
  ['unrelated extra job', d => { d.jobs.push({ id: 1 }); }],
  ['duplicate job', d => { d.jobs[1] = d.jobs[0]; }],
  ['source shift', d => { d.run.head_sha = '0'.repeat(40); }],
  ['attempt shift', d => { d.run.run_attempt = 2; }],
  ['wrong repository', d => { d.run.repository.id = 1; }],
  ['archive substitution', d => { d.artifact.digest = 'sha256:'+'0'.repeat(64); }],
  ['expired original', d => { d.artifact.expired = true; }],
  ['cross-run archive', d => { d.artifact.workflow_run.id++; }],
  ['tested tree shift', d => { d.tested.tree.sha = '0'.repeat(40); }],
  ['parent substitution', d => { d.tested.parents[0].sha = pins.source.head; }],
]) test(`${label} refuses before any download or install`, () => {
  const data = fixture(); change(data);
  assert.throws(() => validateRendererProvider(data), { code: 'ERR_ASSERTION' });
});
