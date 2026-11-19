import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pins, names, versions, validateProvider, validateArtifact } from './admission.mjs';
import { archiveData, expectedSource, inspectInputs, inspectRendererInputs, sha, sri } from './archives.mjs';
import { rendererPins, validateRendererProvider, expectedRenderer } from './renderer.mjs';

const save = (path, data) => writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
function existingJobApi(config) {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'workflow-only; desktop credentials are not used');
  assert.equal(process.env.GITHUB_REPOSITORY, 'footprintjs/agentfootprint-lens');
  assert.ok(process.env.GH_TOKEN, 'the current workflow read token is required');
  const env = Object.fromEntries(['HOME', 'PATH', 'LANG', 'LC_ALL'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
  Object.assign(env, { GH_TOKEN: process.env.GH_TOKEN, GH_HOST: 'github.com', GH_CONFIG_DIR: config,
    GH_PROMPT_DISABLED: '1', GH_PAGER: 'cat' });
  return (path, limit = 2 * 1024 * 1024) => {
    const result = spawnSync('gh', ['api', '--hostname', 'github.com', '--method', 'GET', path],
      { env, timeout: 45_000, maxBuffer: limit });
    // Never echo provider/authentication output or request headers.
    if (result.error || result.status !== 0) {
      const code = /\bHTTP\s*([45]\d\d)\b/.exec(String(result.stderr))?.[1];
      throw new Error(code ? `native-input-api-http-${code}` : 'native-input-api-read-refused');
    }
    assert.ok(result.stdout.length > 0 && result.stdout.length <= limit, 'bounded API response');
    return result.stdout;
  };
}

function fetchRenderer(get, temporary, out) {
  const uiApi = path => JSON.parse(get(`repos/${rendererPins.repository}/${path}`));
  const rendererProvider = { run: uiApi(`actions/runs/${rendererPins.run.id}`),
    jobs: uiApi(`actions/runs/${rendererPins.run.id}/attempts/${rendererPins.run.run_attempt}/jobs?per_page=100`).jobs,
    artifact: uiApi(`actions/artifacts/${rendererPins.sourceArtifact.id}`),
    tested: uiApi(`git/commits/${rendererPins.tested.head}`) };
  validateRendererProvider(rendererProvider);
  const rendererZip = get(`repos/${rendererPins.repository}/actions/artifacts/${rendererPins.sourceArtifact.id}/zip`,
    8 * 1024 * 1024);
  assert.equal(rendererZip.length, rendererPins.sourceArtifact.size_in_bytes);
  assert.equal(sha(rendererZip), rendererPins.sourceArtifact.digest.slice(7));
  const rendererZipPath = join(temporary, 'RENDERER.zip');
  writeFileSync(rendererZipPath, rendererZip, { mode: 0o600, flag: 'wx' });
  const rendererExpectedPath = join(temporary, 'renderer-expected.json');
  save(rendererExpectedPath, expectedRenderer());
  const rendererArchive = archiveData(['renderer', rendererZipPath, rendererExpectedPath,
    join(out, rendererPins.archive.filename)]);
  return { independentReviewSha256: rendererPins.reviewSha256,
    provider: rendererProvider, archive: rendererArchive };
}

export function fetchRendererInputs(destination) {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'workflow-only');
  assert.equal(process.env.GITHUB_REPOSITORY, 'footprintjs/agentfootprint-lens');
  const out = resolve(destination);
  const temporary = mkdtempSync(join(tmpdir(), 'lens-renderer-read-'));
  try {
    mkdirSync(join(temporary, 'config'), { mode: 0o700 });
    const get = existingJobApi(join(temporary, 'config'));
    mkdirSync(out);
    save(join(out, 'renderer.json'), fetchRenderer(get, temporary, out));
    const renderer = inspectRendererInputs(out);
    return { version: rendererPins.archive.version, sha256: renderer.sha256 };
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

export function fetchInputs(destination) {
  const out = resolve(destination);
  // Refuse before even creating an output if invoked outside this workflow.
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'workflow-only');
  assert.equal(process.env.GITHUB_REPOSITORY, 'footprintjs/agentfootprint-lens');
  const temporary = mkdtempSync(join(tmpdir(), 'lens-input-read-'));
  try {
    mkdirSync(join(temporary, 'config'), { mode: 0o700 });
    const get = existingJobApi(join(temporary, 'config'));
    const api = path => JSON.parse(get(`repos/${pins.agent.repository}/${path}`));
    const provider = { run: api(`actions/runs/${pins.agent.run.id}`),
      jobs: api(`actions/runs/${pins.agent.run.id}/attempts/${pins.agent.run.run_attempt}/jobs?per_page=100`).jobs,
      artifact: api(`actions/artifacts/${pins.agent.sourceArtifact.id}`),
      tested: api(`git/commits/${pins.agent.tested.head}`) };
    validateProvider(provider);
    const nativeArtifacts = pins.agent.nativeEvidence.artifacts.map(a => {
      const actual = api(`actions/artifacts/${a.id}`); validateArtifact(actual, a); return actual;
    });
    const zip = get(`repos/${pins.agent.repository}/actions/artifacts/${pins.agent.sourceArtifact.id}/zip`, 64 * 1024 * 1024);
    assert.equal(zip.length, pins.agent.sourceArtifact.size_in_bytes);
    assert.equal(sha(zip), pins.agent.sourceArtifact.digest.slice(7));
    mkdirSync(out); // One attempt; never overwrite a previous failed observation.
    const zipPath = join(temporary, 'SOURCE.zip'); writeFileSync(zipPath, zip, { mode: 0o600 });
    const expected = join(temporary, 'expected.json'); save(expected, expectedSource());
    const source = archiveData(['source', zipPath, expected, join(out, pins.agent.archive.filename)]);
    const renderer = fetchRenderer(get, temporary, out);
    const archives = { agentfootprint: source.archive }, registry = {};
    for (const [name, identity] of Object.entries({ ...pins.published, ...pins.closure })) {
      const version = identity.version;
      const metadata = spawnSync('npm', ['view', `${name}@${version}`, '--json', '--registry=https://registry.npmjs.org'],
        { encoding: 'utf8', timeout: 40_000, maxBuffer: 2 * 1024 * 1024 });
      assert.equal(metadata.error, undefined, 'registry metadata unavailable');
      assert.equal(metadata.status, 0, 'registry metadata refused');
      registry[name] = JSON.parse(metadata.stdout);
      const dist = registry[name].dist;
      const url = `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`;
      assert.equal(registry[name].name, name); assert.equal(registry[name].version, version);
      assert.equal(dist.integrity, identity.integrity); assert.equal(dist.tarball, url);
      const download = spawnSync('curl', ['--fail', '--silent', '--show-error', '--location', '--proto', '=https',
        '--proto-redir', '=https', '--max-time', '40', url], { timeout: 45_000, maxBuffer: 32 * 1024 * 1024 });
      assert.equal(download.error, undefined, 'registry archive unavailable');
      assert.equal(download.status, 0, 'registry archive refused');
      assert.equal(sri(download.stdout), dist.integrity);
      if (identity.sha256) assert.equal(sha(download.stdout), identity.sha256);
      const archive = join(out, `${name}-${version}.tgz`); writeFileSync(archive, download.stdout, { flag: 'wx' });
      archives[name] = archiveData(['tar', archive, name, version]);
    }
    save(join(out, 'input.json'), { kind: pins.kind, qualification: 'NATIVE_SOURCE_READY',
      independentReviewSha256: pins.agent.review.sha256, provider, nativeArtifacts,
      candidate: source.candidate, registry, archives,
      renderer,
      deferred: 'Only AF-docs/Lens bootstrap; not final whole-AF or registry acceptance' });
    inspectInputs(out); // Reopen the original bytes before returning admission.
    return { qualification: 'NATIVE_SOURCE_READY', source: pins.agent.source,
      artifact: pins.agent.sourceArtifact, registryGitHeads: Object.fromEntries(
        Object.entries(registry).map(([n, m]) => [n, m.gitHead ?? null])) };
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
