import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertLazyRendererIntegrity, candidate, lazyRenderer } from './contract.mjs';
import { requireRecordBrowser } from './browser-plan.mjs';

test('every renderer declared by the actual matrix has an explicit browser capability plan', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const flows = JSON.parse(workflow.match(/flow:\s*(\[[^\]]+\])/)?.[1] ?? '[]');
  assert.ok(flows.length > 0);
  for (const flow of flows) {
    const sourceCandidate = flow === 'candidate';
    assert.equal(requireRecordBrowser({ version: sourceCandidate ? candidate.version : flow,
      sha256: sourceCandidate ? candidate.sha256 : undefined,
      recordConsumer: sourceCandidate ? '/inert/record-host' : undefined }), sourceCandidate);
  }
});

test('the admitted source candidate requires its exact archive and separate record browser', () => {
  const input = { version: candidate.version, sha256: candidate.sha256, recordConsumer: '/inert/record-host' };
  assert.equal(requireRecordBrowser(input), true);
  assert.throws(() => requireRecordBrowser({ ...input, sha256: 'f'.repeat(64) }), /candidate archive/);
  assert.throws(() => requireRecordBrowser({ ...input, recordConsumer: undefined }), /separate.*record/);
});

test('the other matrix renderers retain replay without borrowing the source record host', () => {
  for (const version of ['0.34.0', '0.38.0', lazyRenderer.version]) {
    assert.equal(requireRecordBrowser({ version }), false);
    assert.throws(() => requireRecordBrowser({ version, recordConsumer: '/inert/record-host' }), /source candidate/);
  }
});

test('retired, unreviewed and ranged renderer identities cannot select a browser plan', () => {
  for (const version of ['1.0.0', '1.1.2', '^1.1.1', 'latest', undefined]) {
    assert.throws(() => requireRecordBrowser({ version }), /Unknown renderer version/);
  }
});

test('published lazy renderer requires both pack receipt and actual byte SRI', () => {
  assertLazyRendererIntegrity(lazyRenderer.integrity, lazyRenderer.integrity);
  assert.throws(() => assertLazyRendererIntegrity('sha512-forged', lazyRenderer.integrity), /pack identity/);
  assert.throws(() => assertLazyRendererIntegrity(lazyRenderer.integrity, 'sha512-forged'), /actual renderer bytes/);
});
