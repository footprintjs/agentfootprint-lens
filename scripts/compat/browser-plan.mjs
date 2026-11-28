import assert from 'node:assert/strict';
import { assertRendererVersion } from './contract.mjs';
import { narrativeRenderer } from './narrative-renderers.mjs';
import { recordRenderer } from './record-renderer.mjs';

/** The published record renderer owns the literal Flow/HCI record corpus; other lanes retain replay. */
export function requireRecordBrowser({ version, sha256, recordConsumer }) {
  assertRendererVersion(version);
  const published = narrativeRenderer(version);
  if (published) assert.equal(sha256, published.sha256, 'record browser published renderer archive');
  if (version === recordRenderer.version) {
    assert.ok(recordConsumer, 'Every record renderer lane requires its separate /record browser host');
    return true;
  }
  assert.ok(!recordConsumer, 'The separate /record browser host belongs to the published record renderer');
  return false;
}
