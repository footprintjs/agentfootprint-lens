// The hermetic rule: a check reads only this commit, the npm registry by
// locked integrity, and other repositories' Git objects by full commit SHA.
// Actions artifacts expire and can be deleted. A check may download only an
// artifact that an earlier job of its own workflow run uploaded.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const self = fileURLToPath(import.meta.url);

/** Split a workflow into its steps: each starts at a `- key:` list item. */
export function workflowSteps(source) {
  return source.split(/\n(?=[ \t]+- [A-Za-z][\w-]*:)/);
}

/** Every reason a workflow reads something that can expire or vanish. */
export function workflowViolations(source) {
  const found = [];
  for (const step of workflowSteps(source)) {
    if (/uses:\s*[^\s#]*download-artifact/.test(step)) {
      if (!/uses:\s*actions\/download-artifact@/.test(step)) found.push('third-party artifact download action');
      for (const input of ['repository', 'run-id', 'github-token']) {
        if (new RegExp(`^\\s+${input}:`, 'm').test(step)) found.push(`download-artifact reads ${input}`);
      }
    }
    if (/uses:\s*actions\/checkout@/.test(step) && /^\s+repository:/m.test(step)) {
      const ref = /^\s+ref:\s*['"]?([^\s'"]+)/m.exec(step)?.[1];
      if (!/^[0-9a-f]{40}$/.test(ref ?? '')) found.push('another repository checked out without a full commit SHA');
    }
  }
  found.push(...sourceViolations(source));
  if (/\bactions:\s*read\b/.test(source)) found.push('job asks to read Actions data');
  return found;
}

/** Every reason a script reads another repository's CI output. */
export function sourceViolations(source) {
  const found = [];
  if (/actions\/artifacts/.test(source)) found.push('Actions artifacts API');
  if (/actions\/runs\//.test(source)) found.push('Actions runs API');
  if (/archive_download_url/.test(source)) found.push('artifact download URL');
  if (/\bgh['",[\s]+run['",[\s]+download\b/.test(source)) found.push('gh run download');
  if (/releases\/download\/|\/releases\/assets\//.test(source)) found.push('release asset');
  return found;
}

function scriptFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...scriptFiles(path));
    else if (/\.(?:[cm]?js|[cm]?ts|py|sh)$/.test(entry.name) && path !== self) files.push(path);
  }
  return files;
}

test('no workflow downloads an artifact from another run or repository', () => {
  const directory = join(root, '.github/workflows');
  const workflows = readdirSync(directory).filter(name => /\.ya?ml$/.test(name));
  assert.ok(workflows.includes('ci.yml'));
  for (const name of workflows) {
    assert.deepEqual(workflowViolations(readFileSync(join(directory, name), 'utf8')), [], name);
  }
});

test('no check script reads the Actions artifacts API, a run download or a release asset', () => {
  const files = [...scriptFiles(join(root, 'scripts')), ...scriptFiles(join(root, 'contract'))];
  assert.ok(files.some(file => basename(file) === 'run-lane.mjs'));
  for (const file of files) {
    assert.deepEqual(sourceViolations(readFileSync(file, 'utf8')), [], relative(root, file));
  }
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.deepEqual(sourceViolations(JSON.stringify(manifest.scripts)), [], 'package.json scripts');
});

test('the guard refuses each way an expiring input could come back', () => {
  const step = body => `    steps:\n      - uses: actions/checkout@v4\n${body}`;
  for (const [label, workflow] of [
    ['cross-repository download', step('      - uses: actions/download-artifact@v4\n        with:\n          name: x\n          repository: footprintjs/explainable-ui\n')],
    ['cross-run download', step('      - uses: actions/download-artifact@v4\n        with:\n          run-id: 44204836529\n          github-token: ${{ github.token }}\n')],
    ['third-party download action', step('      - uses: dawidd6/action-download-artifact@v6\n')],
    ['artifact API from a run step', step('      - run: gh api repos/footprintjs/explainable-ui/actions/artifacts/1/zip\n')],
    ['gh run download', step('      - run: gh run download 44204836529 -R footprintjs/explainable-ui\n')],
    ['Actions read permission', `    permissions:\n      actions: read\n${step('')}`],
    ['checkout by branch', step('      - uses: actions/checkout@v4\n        with:\n          repository: footprintjs/explainable-ui\n          ref: main\n')],
    ['checkout by tag name', step('      - uses: actions/checkout@v4\n        with:\n          repository: footprintjs/explainable-ui\n          ref: v2.0.0\n')],
  ]) assert.notDeepEqual(workflowViolations(workflow), [], label);
  for (const [label, script] of [
    ['artifacts API path', "get(`repos/${repo}/actions/artifacts/${id}/zip`)"],
    ['runs API path', "uiApi(`actions/runs/${id}`)"],
    ['spawned gh run download', "spawnSync('gh', ['run', 'download', id])"],
    ['release asset URL', "fetch('https://github.com/o/r/releases/download/v1/a.tgz')"],
  ]) assert.notDeepEqual(sourceViolations(script), [], label);
});

test('the guard admits a same-run download and a checkout pinned by full commit SHA', () => {
  const workflow = `    steps:
      - uses: actions/download-artifact@v4
        with:
          name: compatibility-archives
          path: compat-artifacts
      - uses: actions/checkout@v4
        with:
          repository: footprintjs/foottrace
          ref: 1b23607453bea28d0a8d846d0bac4029c6ea8f99
          persist-credentials: false
`;
  assert.deepEqual(workflowViolations(workflow), []);
});
