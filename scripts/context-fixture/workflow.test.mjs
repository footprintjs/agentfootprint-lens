import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const source = readFileSync(new URL('../../.github/workflows/context-producer.yml', import.meta.url), 'utf8');
test('the producer proof is isolated from the registry-selected compatibility cohort', () => {
  const registry = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(registry, /repository: footprintjs\/(?:agentfootprint|foottrace)(?:\s|$)/);
  assert.equal((registry.match(/run: npm ci --strict-peer-deps/g) ?? []).length, 3);
  assert.equal((source.match(/^  context-producer:/gm) ?? []).length, 1);
  assert.match(source, /runs-on: ubuntu-24\.04/);
  assert.match(source, /timeout-minutes: 30/);
  assert.match(source, /contents: read/);
  assert.doesNotMatch(source, /contents: write|workflow_dispatch|npm (?:publish|version)|--force|--legacy-peer-deps/);
});
test('fresh proof uses reviewed immutable source doors and retained output', () => {
  assert.match(source, /repository: footprintjs\/agentfootprint\n\s+ref: d507ab890fd705dddd2cef3aa73dd8859e14e2f2/);
  assert.match(source, /repository: footprintjs\/foottrace\n\s+ref: 1b23607453bea28d0a8d846d0bac4029c6ea8f99/);
  assert.equal((source.match(/persist-credentials: false/g) ?? []).length, 3);
  assert.match(source, /scripts\/context-fixture\/generate\.mjs/);
  assert.match(source, /LENS_CONTEXT_FIXTURE="\$RUNNER_TEMP\/context-producer\.json"/);
  assert.match(source, /if: always\(\)/);
  assert.match(source, /context-producer-\*\.log/);
});
