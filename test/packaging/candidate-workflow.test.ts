import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COHORT, cohortMismatches, committedJson, type Lock, type Manifest } from './committedInputs';

const read = (path: string) => readFileSync(resolve(path), 'utf8');
const workflow = read('.github/workflows/ci.yml');
// The committed cohort, not the working tree: an audit may rewrite the working-tree manifest on purpose.
const manifest = committedJson<Manifest>('package.json');
const lock = committedJson<Lock>('package-lock.json');

describe('published cohort compatibility workflow', () => {
  it('pins every hosted CI job to the reviewed Ubuntu image', () => {
    const runners = workflow.match(/^[ \t]*runs-on:.*$/gm) ?? [];
    expect(runners.map((line) => line.trim())).toEqual([
      'runs-on: ubuntu-24.04', 'runs-on: ubuntu-24.04', 'runs-on: ubuntu-24.04',
      'runs-on: ubuntu-24.04', 'runs-on: ubuntu-24.04', 'runs-on: ubuntu-24.04',
    ]);
  });

  it('locks the development cohort and retains renderer/React/Node coverage', () => {
    expect(cohortMismatches(manifest, lock, [...COHORT, 'footprint-explainable-ui'])).toEqual([]);
    const flows = JSON.parse(workflow.match(/flow: (\[[^\n]+\])/u)![1]!) as string[];
    expect(flows).toEqual(['0.34.0', '0.38.0', '1.0.1', '2.0.0', '2.1.0', '2.2.0', '3.0.0']);
    expect(workflow).toContain('react: ["18", "19"]');
    expect(workflow).toContain('node: [22, 24]');
    expect(workflow).toContain('--kind native');
    expect(workflow).not.toMatch(/agentfootprint-(?:11|12|13):|extracted-peers:|--kind (?:floor|modern)/);
  });

  it('reads every renderer from the registry, never from another repository\'s CI', () => {
    expect(workflow).not.toMatch(/fetch-renderer|renderer-inputs|flow-candidate|actions: read|github\.token|GH_TOKEN/);
    expect(workflow).not.toContain('repository: footprintjs/explainable-ui');
    expect(workflow).not.toMatch(/source-inputs\.mjs fetch\s|--mode target|--source-inputs compat-artifacts/);
    expect(workflow).not.toMatch(/npm (?:publish|version)|workflow_dispatch|--legacy-peer-deps|--force/);
    const registry = read('scripts/compat/contract.mjs');
    expect(registry).toContain('canonical registry archive URL required');
    expect(registry).toContain('source lock root pin');
    expect(registry).not.toContain('source-inputs');
  });

  it('runs both hosted source gates on the committed stable registry lock', () => {
    for (const name of [...COHORT, 'footprint-explainable-ui']) {
      const entry = lock.packages?.[`node_modules/${name}`];
      expect(entry?.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(entry?.resolved).toBe(`https://registry.npmjs.org/${name}/-/${name}-${entry?.version}.tgz`);
      expect(entry?.integrity).toMatch(/^sha512-/);
    }
    expect(JSON.stringify(lock)).not.toContain('file:');
    const pack = workflow.split('  compatibility-pack:')[1]!.split('  test-22-suite:')[0]!;
    const suite22 = workflow.split('  test-22-suite:')[1]!.split('  test:')[0]!;
    const node24 = workflow.split('  test-24:')[1]!.split('  published-commentary-control:')[0]!;
    for (const job of [pack, node24]) {
      expect(job).toMatch(/run: npm ci --strict-peer-deps[\s\S]+run: npm run test:contract:foottrace[\s\S]+run: npm run build/);
      expect(job).toContain('published-proof.mjs --out "$RUNNER_TEMP/published-evidence" --lock package-lock.json');
    }
    for (const job of [suite22, node24]) {
      expect(job).toMatch(/run: npm ci --strict-peer-deps[\s\S]+run: npm run build[\s\S]+run: npm test\b[\s\S]+run: npm run fixtures:time:check/);
    }
    expect(pack).toContain('npm pack --ignore-scripts --pack-destination compat-artifacts');
    expect(pack).not.toMatch(/run: npm test\b/);
    expect(suite22).not.toContain('needs:');
    expect(node24).not.toContain('npm pack');
    expect(node24).toContain('assert.deepEqual(archive.files, publishedSourceFiles(process.cwd()))');
  });

  it('starts the archive consumers after packaging and preserves the Node 22 check gate', () => {
    const gate = workflow.split('  test:')[1]!.split('  test-24:')[0]!;
    const node24 = workflow.split('  test-24:')[1]!.split('  published-commentary-control:')[0]!;
    const matrix = workflow.split('  peer-matrix:')[1]!;
    expect(gate).toContain('needs: [compatibility-pack, test-22-suite]');
    expect(gate).toContain('if: always()');
    expect(gate).toContain('PACK_RESULT: ${{ needs.compatibility-pack.result }}');
    expect(gate).toContain('SUITE_RESULT: ${{ needs.test-22-suite.result }}');
    expect(gate).toContain('run: test "$PACK_RESULT" = success && test "$SUITE_RESULT" = success');
    expect(gate).not.toContain('continue-on-error');
    for (const job of [node24, matrix]) {
      expect(job).toContain('needs: compatibility-pack');
      expect(job).toContain('name: compatibility-archives');
    }
  });

  it('bootstraps the published commentary CONTROL independently of unavailable target AF15', () => {
    const published = workflow.split('  published-commentary-control:')[1]!.split('  peer-matrix:')[0]!;
    expect(published).toContain('--mode CONTROL');
    expect(published).toContain('source-inputs.mjs gates');
    expect(published).not.toMatch(/source-inputs.mjs fetch|--inputs |--kind native|source-inputs.mjs pack/);
    const control = read('scripts/compat/commentary-control.mjs');
    const controlBootstrap = read('scripts/compat/source-inputs/materialize.mjs');
    expect(controlBootstrap).toMatch(/agentfootprint: '14\.7\.2',[\s\S]+footprintjs: '12\.3\.0',[\s\S]+foottrace: '1\.11\.1',[\s\S]+'footprint-explainable-ui': lazyRenderer\.version/);
    expect(control).toContain("assertSingleFoottrace(resolve('node_modules'), commentaryControl.foottrace)");
    expect(read('scripts/compat/source-inputs/gates.mjs')).toContain("['unit', ['test']]");
    expect(workflow).not.toMatch(/--package-lock=false|LENS_COMMENTARY_AGENT_VERSION/);
  });

  it('uses the same selected cohort in the archive, isolated consumer and native probe', () => {
    const runner = read('scripts/compat/run-lane.mjs');
    const probe = read('scripts/check-native-recording.mjs');
    expect(workflow).toContain('--published-evidence "$RUNNER_TEMP/published-evidence"');
    expect(workflow).toContain('--install-browser yes');
    expect(runner).toContain('assert.deepEqual(contract.cohort, cohort');
    expect(runner).toContain('assertPublishedReceipt(contract.agentSource, readFileSync(agent.path), agentIdentity)');
    expect(runner).toContain('assertRegistryLock');
    expect(runner).toContain('assertSingleFoottrace');
    expect(runner).toContain('expected-cohort.json');
    expect(runner).toContain("command(process.execPath, ['check-native-recording.mjs'], { cwd: consumer");
    expect(probe).toContain('assert.deepEqual(versions, expectedCohort.pins');
    expect(probe).toContain('assert.equal(entry.integrity, expected.integrity)');
    expect(runner).toContain('assertEvidenceOutsideRepository(root, evidence)');
    expect(workflow).toContain('--evidence "$RUNNER_TEMP/compat-evidence"');
    expect(workflow).toContain('${{ runner.temp }}/compat-evidence/consumer/package*.json');
    expect(runner).toContain("'--skipLibCheck', 'false'");
    expect(runner).toContain("['ci', '--strict-peer-deps'");
    expect(runner).toContain('all installed bytes and archives still equal after every probe');
  });
});
