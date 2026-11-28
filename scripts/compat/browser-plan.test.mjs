import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertLazyRendererIntegrity, lazyRenderer } from './contract.mjs';
import { requireRecordBrowser } from './browser-plan.mjs';
import { narrativeRenderer } from './narrative-renderers.mjs';
import { recordRenderer } from './record-renderer.mjs';

test('every renderer declared by the actual matrix has an explicit browser capability plan', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const flows = JSON.parse(workflow.match(/flow:\s*(\[[^\]]+\])/)?.[1] ?? '[]');
  assert.ok(flows.length > 0);
  assert.ok(flows.includes(recordRenderer.version), 'the matrix runs the record renderer lane');
  for (const flow of flows) {
    const record = flow === recordRenderer.version;
    assert.equal(requireRecordBrowser({ version: flow, sha256: narrativeRenderer(flow)?.sha256,
      recordConsumer: record ? '/inert/record-host' : undefined }), record);
  }
});

test('the published record renderer requires its exact registry archive and separate record browser', () => {
  const input = { version: recordRenderer.version, sha256: narrativeRenderer(recordRenderer.version).sha256,
    recordConsumer: '/inert/record-host' };
  assert.equal(requireRecordBrowser(input), true);
  assert.throws(() => requireRecordBrowser({ ...input, sha256: 'f'.repeat(64) }), /published renderer archive/);
  assert.throws(() => requireRecordBrowser({ ...input, recordConsumer: undefined }), /separate.*record/);
});

test('the other matrix renderers retain replay without borrowing the record host', () => {
  for (const version of ['0.34.0', '0.38.0', lazyRenderer.version, '2.1.0', '2.2.0', '3.0.0']) {
    const sha256 = narrativeRenderer(version)?.sha256;
    assert.equal(requireRecordBrowser({ version, sha256 }), false);
    assert.throws(() => requireRecordBrowser({ version, sha256, recordConsumer: '/inert/record-host' }),
      /published record renderer/);
    if (sha256) assert.throws(() => requireRecordBrowser({ version, sha256: 'f'.repeat(64) }), /published renderer archive/);
  }
});

test('retired, unreviewed and ranged renderer identities cannot select a browser plan', () => {
  // 1.1.1 was the retired unpublished CI build; 'candidate' was its lane name.
  for (const version of ['1.0.0', '1.1.1', '1.1.2', '^1.1.1', 'candidate', 'latest', undefined]) {
    assert.throws(() => requireRecordBrowser({ version }), /Unknown renderer version/);
  }
});

test('published lazy renderer requires both pack receipt and actual byte SRI', () => {
  assertLazyRendererIntegrity(lazyRenderer.integrity, lazyRenderer.integrity);
  assert.throws(() => assertLazyRendererIntegrity('sha512-forged', lazyRenderer.integrity), /pack identity/);
  assert.throws(() => assertLazyRendererIntegrity(lazyRenderer.integrity, 'sha512-forged'), /actual renderer bytes/);
});
