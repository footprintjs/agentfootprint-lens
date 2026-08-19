/**
 * Door packaging guards — the two subpath doors RESOLVE and export what they
 * promise, from the BUILT dist (the bytes a consumer installs, not the
 * source the suite happens to sit next to).
 *
 * Follows the footprintjs house pattern (test/esm-packaging.test.ts there):
 * skips when dist isn't built so a bare `vitest` doesn't false-fail; the
 * release pipeline builds first and publint + attw gate the exports map.
 */

import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = (file: string): string => resolve(repoRoot, 'dist', file);
const built = existsSync(dist('why.js')) && existsSync(dist('skillgraph.js'));

/** What each door PROMISES — the names the README's Doors section sells. */
const WHY_EXPORTS = [
  'WhyLens',
  'Lens',
  'observeRecording',
  'isAgentRecording',
  'readAgentRecording',
  'describeReceived',
  'scrubAxisFor',
  'commitAxisPositions',
  'cursorPositionsAtDrill',
  'stepForCommitIdx',
  'stepForRuntimeStageId',
  'stepBands',
  'bandIndexOf',
] as const;

const SKILLGRAPH_EXPORTS = [
  'SkillGraphDebugger',
  'selectSkillRoute',
  'selectSkillBeats',
  'selectSkillBeatAt',
  'selectSkillTopology',
  'selectSkillFrameContext',
  'stepForRuntimeStageId',
] as const;

describe('package.json exports map (no build needed)', () => {
  it('declares ./why and ./skillgraph with import/require/types each', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
      exports: Record<string, { import: Record<string, string>; require: Record<string, string> }>;
      typesVersions: Record<string, Record<string, string[]>>;
    };
    for (const door of ['./why', './skillgraph']) {
      const entry = pkg.exports[door];
      expect(entry, `${door} missing from exports`).toBeTruthy();
      expect(entry.import.types).toMatch(/\.d\.ts$/);
      expect(entry.import.default).toMatch(/\.js$/);
      expect(entry.require.types).toMatch(/\.d\.cts$/);
      expect(entry.require.default).toMatch(/\.cjs$/);
    }
    // typesVersions carries older TS resolvers to the same types.
    expect(pkg.typesVersions['*']['why']).toEqual(['./dist/why.d.ts']);
    expect(pkg.typesVersions['*']['skillgraph']).toEqual(['./dist/skillgraph.d.ts']);
  });
});

describe.skipIf(!built)('built doors (dist)', () => {
  it('ESM: dist/why.js exports the door surface', async () => {
    const mod = (await import(dist('why.js'))) as Record<string, unknown>;
    for (const name of WHY_EXPORTS) {
      expect(mod[name], `why door is missing ${name}`).toBeDefined();
    }
  });

  it('ESM: dist/skillgraph.js exports the door surface', async () => {
    const mod = (await import(dist('skillgraph.js'))) as Record<string, unknown>;
    for (const name of SKILLGRAPH_EXPORTS) {
      expect(mod[name], `skillgraph door is missing ${name}`).toBeDefined();
    }
  });

  it('CJS: both doors load through require()', () => {
    const req = createRequire(import.meta.url);
    const why = req(dist('why.cjs')) as Record<string, unknown>;
    const skillgraph = req(dist('skillgraph.cjs')) as Record<string, unknown>;
    expect(typeof why['WhyLens']).toBe('function');
    expect(typeof skillgraph['SkillGraphDebugger']).toBe('function');
  });

  it('types: both doors ship .d.ts and .d.cts', () => {
    for (const file of ['why.d.ts', 'why.d.cts', 'skillgraph.d.ts', 'skillgraph.d.cts']) {
      expect(existsSync(dist(file)), `dist/${file} missing`).toBe(true);
    }
  });
});
