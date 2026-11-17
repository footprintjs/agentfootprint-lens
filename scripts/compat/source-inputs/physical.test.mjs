import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyNativeInstalled } from '../source-inputs.mjs';
import { cohortIdentity, pins } from './admission.mjs';

// Inert physical-graph fixtures only, not admitted producer archive evidence.
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'lens-native-graph-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'agentfootprint-lens' }));
  const input = { cohort: cohortIdentity(), archives: {} };
  const versions = { ...input.cohort.pins, contextfootprint: pins.closure.contextfootprint.version };
  for (const [name, version] of Object.entries(versions)) {
    const path = join(root, 'node_modules', name); mkdirSync(path, { recursive: true });
    const manifest = JSON.stringify({ name, version, main: './index.js',
      dependencies: name === 'foottrace' ? {} : { foottrace: '^2.0.0',
        ...(name === 'footprintjs' ? {} : { footprintjs: '^13.0.0' }) } });
    const files = { 'package.json': manifest, 'index.js': 'throw new Error("fixture must not execute");' };
    input.archives[name] = { files: Object.fromEntries(Object.entries(files).map(([n, raw]) => {
      writeFileSync(join(path, n), raw); return [n, createHash('sha256').update(raw).digest('hex')];
    })) };
  }
  return { root, input };
}

test('each actual context owner resolves the same two physical libraries without executing them', t => {
  const f = fixture(t); const result = verifyNativeInstalled(f.root, f.input);
  assert.equal(result.packages.length, 4);
  assert.ok(Object.keys(result.resolutions).some(k => k.startsWith('contextfootprint:')));
});

test('a hidden alias cannot hide a second Foottrace even with the same version', t => {
  const f = fixture(t); const path = join(f.root, 'node_modules/agentfootprint/node_modules/.alias');
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, 'package.json'), JSON.stringify({ name: 'foottrace', version: '2.0.0' }));
  assert.throws(() => verifyNativeInstalled(f.root, f.input), /one physical foottrace/);
});

test('an installed byte change in the context owner refuses before any runtime probe', t => {
  const f = fixture(t);
  writeFileSync(join(f.root, 'node_modules/contextfootprint/index.js'), 'changed inert bytes');
  assert.throws(() => verifyNativeInstalled(f.root, f.input), /installed files must exactly match/);
});

test('ordinary tool-cache containers remain traversed without inventing package identities', t => {
  const f = fixture(t); const cache = join(f.root, 'node_modules/.vite/deps');
  mkdirSync(cache, { recursive: true });
  writeFileSync(join(cache, 'package.json'), JSON.stringify({ type: 'module' }));
  assert.equal(verifyNativeInstalled(f.root, f.input).packages.length, 4);
  const hidden = join(cache, 'hidden-record'); mkdirSync(hidden);
  writeFileSync(join(hidden, 'package.json'), JSON.stringify({ name: 'foottrace', version: '2.0.0' }));
  assert.throws(() => verifyNativeInstalled(f.root, f.input), /one physical foottrace/);
});
