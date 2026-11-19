import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export const pins = JSON.parse(readFileSync(new URL('./pins.json', import.meta.url), 'utf8'));
export const names = Object.freeze(['agentfootprint', 'footprintjs', 'foottrace']);
export const versions = Object.freeze({ agentfootprint: pins.agent.archive.version,
  ...Object.fromEntries(Object.entries(pins.published).map(([name, entry]) => [name, entry.version])) });

export function validateInputKind(value) {
  assert.equal(value?.kind, pins.kind, 'explicit native source input required');
}

export function validateProvider({ run, jobs, artifact, tested }) {
  const a = pins.agent;
  for (const [key, value] of Object.entries(a.run)) assert.deepEqual(run?.[key], value, `producer run ${key}`);
  assert.equal(run.head_sha, a.source.head, 'producer head');
  assert.equal(run.repository?.id, a.repositoryId);
  assert.equal(run.repository?.full_name, a.repository);
  assert.equal(run.head_commit?.id, a.source.head);
  assert.equal(run.head_commit?.tree_id, a.source.tree);
  assert.ok(Array.isArray(jobs) && jobs.length === pins.jobs.length, 'complete required job inventory');
  assert.equal(new Set(jobs.map(j => j.id)).size, jobs.length, 'duplicate producer jobs');
  for (const expected of pins.jobs) {
    const job = jobs.find(j => j.id === expected.id);
    assert.ok(job, `missing producer job ${expected.name}`);
    assert.equal(job.name, expected.name);
    assert.equal(job.run_id, a.run.id);
    assert.equal(job.run_attempt, a.run.run_attempt);
    assert.equal(job.head_sha, a.source.head);
    assert.equal(job.status, 'completed');
    if (expected.id === pins.deferredJob) {
      assert.equal(expected.name, 'docs');
      assert.ok(['failure', 'success'].includes(job.conclusion), 'named docs bootstrap hold only');
    } else assert.equal(job.conclusion, 'success', `required producer gate ${job.name}`);
  }
  validateArtifact(artifact, a.sourceArtifact);
  assert.equal(tested?.sha, a.tested.head);
  assert.equal(tested?.tree?.sha, a.source.tree, 'tested/source tree');
  assert.deepEqual(tested?.parents?.map(p => p.sha),
    ['34e7a95763370c4fa5bbf376e8afaedf142b583d', a.source.head]);
  return 'NATIVE_SOURCE_READY';
}

export function validateArtifact(actual, expected) {
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(actual?.[key], value, `artifact ${key}`);
  const run = actual.workflow_run;
  for (const [key, value] of Object.entries({ id: pins.agent.run.id,
    repository_id: pins.agent.repositoryId, head_repository_id: pins.agent.repositoryId,
    head_sha: pins.agent.source.head, head_branch: pins.agent.run.head_branch }))
    assert.deepEqual(run?.[key], value, `artifact run ${key}`);
}

export function cohortIdentity() {
  return { kind: pins.kind, pins: versions, packages: Object.fromEntries(names.map(name => {
    const data = name === 'agentfootprint' ? pins.agent.archive : pins.published[name];
    return [name, { name, version: versions[name], filename: `${name}-${versions[name]}.tgz`,
      integrity: data.integrity, origin: name === 'agentfootprint' ? 'native-source' : 'registry',
      ...(name === 'agentfootprint' ? { source: pins.agent.source } : {
        tarball: `https://registry.npmjs.org/${name}/-/${name}-${versions[name]}.tgz`, gitHead: null }) }];
  })) };
}
