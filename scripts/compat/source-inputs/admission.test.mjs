import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as input from '../source-inputs.mjs';

const pins = JSON.parse(readFileSync(new URL('./pins.json', import.meta.url)));
function fixture() {
  const a = pins.agent;
  return { run: { ...a.run, head_sha: a.source.head,
    repository: { id: a.repositoryId, full_name: a.repository },
    head_commit: { id: a.source.head, tree_id: a.source.tree } },
  jobs: pins.jobs.map(j => ({ ...j, run_id: a.run.id, run_attempt: a.run.run_attempt,
    head_sha: a.source.head, status: 'completed' })),
  artifact: { ...a.sourceArtifact, workflow_run: { id: a.run.id,
    repository_id: a.repositoryId, head_repository_id: a.repositoryId, head_sha: a.source.head,
    head_branch: a.run.head_branch } },
  tested: { sha: a.tested.head, tree: { sha: a.tested.tree }, parents: [
    { sha: '34e7a95763370c4fa5bbf376e8afaedf142b583d' }, { sha: a.source.head }] } };
}

test('the fixed exact tuple permits only the named docs bootstrap hold', () => {
  assert.equal(typeof input.validateProvider, 'function');
  const data = fixture();
  assert.equal(input.validateProvider(data), 'NATIVE_SOURCE_READY');
  assert.equal(data.run.conclusion, 'failure');
});

test('wrong source, attempt, job, artifact or unknown/failed required gate refuses', () => {
  assert.equal(typeof input.validateProvider, 'function');
  for (const change of [
    d => { d.run.head_sha = '0'.repeat(40); },
    d => { d.run.run_attempt += 1; },
    d => { d.jobs[0].conclusion = 'failure'; },
    d => { d.jobs[0].status = 'in_progress'; },
    d => { d.jobs[0].head_sha = '0'.repeat(40); },
    d => { d.jobs.pop(); }, d => { d.jobs.push({ id: 1 }); },
    d => { d.artifact.digest = 'sha256:' + '0'.repeat(64); },
    d => { d.artifact.expired = true; },
    d => { d.tested.tree.sha = '0'.repeat(40); },
  ]) {
    const data = fixture(); change(data);
    assert.throws(() => input.validateProvider(data), { code: 'ERR_ASSERTION' });
  }
});

test('native receipt and published control cannot substitute for target source admission', () => {
  assert.equal(typeof input.validateInputKind, 'function');
  for (const kind of ['registry', 'CONTROL', 'DATA_ONLY', 'lens.native-source-input.v1', undefined])
    assert.throws(() => input.validateInputKind({ kind }), { code: 'ERR_ASSERTION' });
  assert.equal(input.validateInputKind({ kind: 'lens.native-source-input.v2' }), undefined);
});
