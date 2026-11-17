import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const source = readFileSync(new URL('../../.github/workflows/context-producer.yml', import.meta.url), 'utf8');
test('the historical producer proof is isolated from the admitted native compatibility cohort', () => {
  const registry = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(registry, /repository: footprintjs\/(?:agentfootprint|foottrace)(?:\s|$)/);
  // Native targets consume admitted originals, never these historical source
  // checkouts. Their temporary strict lock is explicit; CONTROL is independent.
  assert.match(registry, /source-inputs.mjs fetch/);
  assert.equal((registry.match(/bootstrap --mode target/g) ?? []).length, 2);
  assert.match(registry, /^  published-commentary-control:/m);
  assert.match(registry, /bootstrap --mode CONTROL/);
  const control = readFileSync(new URL('../compat/commentary-control.mjs', import.meta.url), 'utf8');
  assert.match(control, /agentfootprint: '14\.7\.2', footprintjs: '12\.3\.0', foottrace: '1\.11\.1'/);
  assert.doesNotMatch(registry, /--package-lock=false/);
  assert.equal((source.match(/^  context-producer:/gm) ?? []).length, 1);
  assert.match(source, /runs-on: ubuntu-24\.04/);
  assert.match(source, /timeout-minutes: 30/);
  assert.match(source, /contents: read/);
  assert.match(source, /source-inputs.mjs bootstrap --mode target/);
  assert.match(source, /working-directory: \$\{\{ runner.temp \}\}\/native-target/);
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
