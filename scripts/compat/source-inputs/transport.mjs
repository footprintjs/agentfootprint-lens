import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { sha256 } from '../contract.mjs';
import { archiveData, inspectRendererInputs } from './archives.mjs';
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
  assert.equal(sha256(rendererZip), rendererPins.sourceArtifact.digest.slice(7));
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
