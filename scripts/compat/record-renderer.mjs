// The one published renderer that also runs the separate `/record` viewer
// lanes. Its archive comes from the registry by the integrity pinned in
// narrative-renderers.mjs; its saved Flow/HCI corpus is vendored in this
// commit, so no required check reads another repository's CI output.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './contract.mjs';
import { narrativeRenderer } from './narrative-renderers.mjs';

export const recordFixtureDirectory = fileURLToPath(new URL('./record-fixtures/', import.meta.url));

export const recordRenderer = Object.freeze({
  version: '2.0.0',
  // Where the vendored bytes were copied from: tag v2.0.0 resolves to this
  // commit, and each blob there equals the one at the reviewed reader commit
  // 0af1a2d0d21edb0a86fb447b4c032c1f3d896412. CI never fetches it.
  fixtureSource: Object.freeze({
    repository: 'footprintjs/explainable-ui',
    tag: 'v2.0.0',
    commit: '39166fe66d33d7e522d6729f07808414b3433a9d',
    path: 'pilots/record-lens',
  }),
  fixtures: Object.freeze({
    'flow.json': '6220e9422696028c8ad6f4243bc1c3caa33152a62ca6dcbdf54a17c5bd0259b1',
    'hci.json': 'fc287b4e0c4e955e2d0ec6b1145971e020e829238e0e77bdd0e39d0f614ceee8',
    'runtime-fixtures.cjs': 'c997ab7a1e66c6eba7b3338d48dd4bd2c660d34a787671e1e5c490c652582a97',
  }),
});

assert.ok(narrativeRenderer(recordRenderer.version)?.integrity,
  'the record renderer must be a registry archive pinned by integrity');

/** Check every vendored corpus byte, and that nothing else sits beside it. */
export function readRecordFixtures(directory = recordFixtureDirectory) {
  const names = readdirSync(directory).filter(name => name !== 'README.md').sort();
  assert.deepEqual(names, Object.keys(recordRenderer.fixtures).sort(), 'record fixture inventory');
  for (const [name, expected] of Object.entries(recordRenderer.fixtures)) {
    assert.equal(sha256(readFileSync(join(directory, name))), expected, `immutable ${name} changed`);
  }
  return directory;
}
