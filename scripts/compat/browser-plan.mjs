import assert from 'node:assert/strict';
import { assertRendererVersion, candidate } from './contract.mjs';
import { narrativeRenderer } from './narrative-renderers.mjs';

/** The source candidate owns the literal Flow/HCI record corpus; other lanes retain replay. */
export function requireRecordBrowser({ version, sha256, recordConsumer }) {
  assertRendererVersion(version);
  const published = narrativeRenderer(version);
  if (published) assert.equal(sha256, published.sha256, 'record browser published renderer archive');
  if (version === candidate.version) {
    assert.equal(sha256, candidate.sha256, 'record browser candidate archive');
    assert.ok(recordConsumer, 'Every candidate lane requires its separate /record browser host');
    return true;
  }
  assert.ok(!recordConsumer, 'The separate /record browser host belongs to the admitted source candidate');
  return false;
}
