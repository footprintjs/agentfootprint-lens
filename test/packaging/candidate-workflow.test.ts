import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(path), 'utf8');
const workflow = read('.github/workflows/ci.yml');

describe('native footprintjs 11 / agentfootprint 14 compatibility', () => {
  it('supports only the new runtime line while retaining both React majors and every renderer', () => {
    const manifest = JSON.parse(read('package.json'));
    expect(manifest.peerDependencies.agentfootprint).toBe('^14.0.0-rc.0');
    expect(manifest.peerDependencies.footprintjs).toBe('^11.0.0-rc.1');
    expect(manifest.devDependencies.agentfootprint).toBe('14.0.0-rc.0');
    expect(manifest.devDependencies.footprintjs).toBe('11.0.0-rc.1');
    expect(workflow).toContain('flow: ["0.34.0", "0.38.0", "candidate"]');
    expect(workflow).toContain('react: ["18", "19"]');
    expect(workflow).toContain('node: [22, 24]');
    expect(workflow).toContain('--kind native');
    expect(workflow).not.toMatch(/agentfootprint-(?:11|12|13):|extracted-peers:|--kind (?:floor|modern)/);
  });

  it('builds the pinned real source before the reviewed version-only stage and never publishes', () => {
    const build = workflow.indexOf('npm run build', workflow.indexOf('working-directory: agent-candidate'));
    const before = workflow.indexOf('--phase before');
    const stage = workflow.indexOf('jq --arg version');
    const pack = workflow.indexOf('npm pack --ignore-scripts --json --pack-destination');
    expect(workflow).toContain('ref: bc0b93015ba6b927c1d02528fe76e36da1873b25');
    expect(workflow).toContain('npm@11.19.0');
    expect(workflow).toContain("version !== '13.0.0'");
    expect(build).toBeGreaterThan(0);
    expect(before).toBeGreaterThan(build);
    expect(stage).toBeGreaterThan(before);
    expect(pack).toBeGreaterThan(stage);
    expect(workflow).toContain('SOURCE_MANIFEST=');
    expect(workflow).toContain('node scripts/publish-archive/verify.cjs inspect');
    expect(workflow).toContain('--phase after');
    expect(workflow).not.toMatch(/npm (?:publish|version)|workflow_dispatch|--legacy-peer-deps|--force/);
  });

  it('replays each generated strict lock in a fresh copy and restores the public manifest', () => {
    const sourceInstall = read('scripts/compat/source-install.mjs');
    expect(sourceInstall).toContain("['install', '--strict-peer-deps'");
    expect(sourceInstall).toContain("['ci', '--strict-peer-deps'");
    expect(sourceInstall).toContain("'package-lock.json'");
    expect(sourceInstall).toContain('source checkout must have no installed tree');
    expect(sourceInstall).toContain('writeFileSync(manifestFile, original)');
    expect(workflow.match(/node scripts\/compat\/source-install\.mjs/g)).toHaveLength(2);
    expect(workflow.match(/run: npm test/g)).toHaveLength(2);
    expect(workflow.match(/run: npm run typecheck/g)).toHaveLength(2);
  });

  it('uses one archive set for public runtime, strict declarations, browser replay and native recording', () => {
    const runner = read('scripts/compat/run-lane.mjs');
    expect(workflow).toContain('--agent-source "$GITHUB_WORKSPACE/native-evidence/native-source.json"');
    expect(workflow).toContain('--install-browser yes');
    expect(runner).toContain('assertNativeSourceMetadata(contract.nativeSource, agent.sha256)');
    expect(runner).toContain('assertSingleFoottrace');
    expect(runner).toContain('check-native-recording.mjs');
    expect(runner).toContain("'--skipLibCheck', 'false'");
    expect(runner).toContain("['ci', '--strict-peer-deps'");
    expect(runner).toContain('all installed bytes and archives still equal after every probe');
  });
});
