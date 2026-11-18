// One reviewed renderer producer. Its archive is data, never an upstream build.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const rendererPins = JSON.parse(readFileSync(new URL('./renderer-pins.json', import.meta.url)));

export function validateRendererProvider({ run, jobs, artifact, tested }) {
  const p = rendererPins;
  for (const [key, value] of Object.entries(p.run)) assert.deepEqual(run?.[key], value, `renderer run ${key}`);
  assert.equal(run.repository?.id, p.repositoryId);
  assert.equal(run.repository?.full_name, p.repository);
  assert.equal(run.head_commit?.id, p.source.head);
  assert.equal(run.head_commit?.tree_id, p.source.tree);
  assert.equal(jobs?.length, p.jobs.length, 'complete renderer job inventory');
  assert.equal(new Set(jobs.map(j => j.id)).size, jobs.length, 'duplicate renderer job');
  for (const expected of p.jobs) {
    const job = jobs.find(j => j.id === expected.id);
    assert.ok(job, `missing renderer gate ${expected.name}`);
    assert.equal(job.name, expected.name);
    assert.equal(job.run_id, p.run.id);
    assert.equal(job.run_attempt, p.run.run_attempt);
    assert.equal(job.head_sha, p.source.head);
    assert.equal(job.status, 'completed');
    assert.equal(job.conclusion, 'success');
  }
  for (const [key, value] of Object.entries(p.sourceArtifact))
    assert.deepEqual(artifact?.[key], value, `renderer artifact ${key}`);
  for (const [key, value] of Object.entries({ id: p.run.id, repository_id: p.repositoryId,
    head_repository_id: p.repositoryId, head_sha: p.source.head, head_branch: p.run.head_branch }))
    assert.deepEqual(artifact.workflow_run?.[key], value, `renderer artifact run ${key}`);
  assert.equal(tested?.sha, p.tested.head);
  assert.equal(tested?.tree?.sha, p.source.tree);
  assert.deepEqual(tested?.parents?.map(p => p.sha), p.tested.parents);
  return 'NATIVE_SOURCE_READY';
}

export function expectedRenderer() {
  const p = rendererPins;
  return { outerSha256: p.sourceArtifact.digest.slice(7), source: p.source,
    tested: { head: p.tested.head, tree: p.tested.tree }, archive: p.archive };
}

export function inspectRenderer(directory, receipt, readArchive) {
  const p = rendererPins;
  assert.ok(receipt, 'reviewed renderer original is required');
  assert.equal(receipt.independentReviewSha256, p.reviewSha256);
  validateRendererProvider(receipt.provider);
  const path = join(directory, p.archive.filename);
  const archive = readArchive(['tar', path, p.archive.package, p.archive.version]);
  for (const key of ['sha256', 'integrity', 'memberCount', 'memberBytes'])
    assert.equal(archive[key], p.archive[key], `renderer original ${key}`);
  assert.equal(archive.files['package.json'], p.source.manifestSha256, 'renderer original source manifest');
  assert.deepEqual(archive, receipt.archive, 'renderer original member inventory changed');
  return { ...archive, path };
}
