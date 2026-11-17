import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COHORT, cohortMismatches, committedJson, type Lock, type Manifest } from './committedInputs';

const read = (path: string) => readFileSync(resolve(path), 'utf8');
const workflow = read('.github/workflows/ci.yml');
// The committed cohort, not the working tree: an audit may rewrite the working-tree manifest on purpose.
const manifest = committedJson<Manifest>('package.json');
const lock = committedJson<Lock>('package-lock.json');

describe('source-selected native compatibility workflow', () => {
  it('pins every hosted CI job to the reviewed Ubuntu image', () => {
    const runners = workflow.match(/^[ \t]*runs-on:.*$/gm) ?? [];
    expect(runners.map((line) => line.trim())).toEqual([
      'runs-on: ubuntu-24.04', 'runs-on: ubuntu-24.04', 'runs-on: ubuntu-24.04',
      'runs-on: ubuntu-24.04',
    ]);
  });

  it('keeps stale lock refusal explicit while retaining renderer/React/Node coverage', () => {
    expect(cohortMismatches(manifest, lock)).not.toEqual([]); // Preparation lock is explicitly unaccepted.
    expect(workflow).toContain('flow: ["0.34.0", "0.38.0", "candidate"]');
    expect(workflow).toContain('react: ["18", "19"]');
    expect(workflow).toContain('node: [22, 24]');
    expect(workflow).toContain('--kind native');
    expect(workflow).not.toMatch(/agentfootprint-(?:11|12|13):|extracted-peers:|--kind (?:floor|modern)/);
  });

  it('uses explicit reviewed native inputs while keeping ordinary registry proof closed', () => {
    expect(workflow).toContain('source-inputs.mjs fetch');
    expect(workflow).toContain('GH_TOKEN: ${{ github.token }}');
    expect(workflow).toContain('--mode target');
    expect(workflow).not.toMatch(/npm (?:publish|version)|workflow_dispatch|--legacy-peer-deps|--force/);
    const registry = read('scripts/compat/contract.mjs');
    expect(registry).toContain('canonical registry archive URL required');
    expect(registry).toContain('source lock root pin');
    expect(registry).not.toContain('source-inputs');
    const native = read('scripts/compat/source-inputs/materialize.mjs');
    expect(native).toContain("'--package-lock-only', '--strict-peer-deps', '--ignore-scripts'");
    expect(native).toContain("['ci', '--strict-peer-deps'");
    expect(native).toContain('committedLockAccepted: false');
  });

  it('does not turn a stale portable lock into an accepted registry input', () => {
    for (const name of COHORT) {
      const entry = lock.packages?.[`node_modules/${name}`];
      expect(entry?.resolved).toMatch(/^https:\/\//);
      expect(entry?.integrity).toMatch(/^sha512-/);
    }
    expect(JSON.stringify(lock)).not.toContain('file:');
    expect(workflow).not.toContain('run: npm ci --strict-peer-deps');
    expect(workflow).toContain('source-inputs.mjs gates');
    expect(read('scripts/compat/source-inputs/gates.mjs')).toContain("['contract', ['run', 'test:contract:foottrace']]");
    expect(read('scripts/compat/source-inputs/gates.mjs')).toContain("['unit', ['test']]");
  });

  it('bootstraps the published commentary CONTROL independently of unavailable target AF15', () => {
    const published = workflow.split('  published-commentary-control:')[1]!.split('  peer-matrix:')[0]!;
    expect(published).toContain('--mode CONTROL');
    expect(published).toContain('source-inputs.mjs gates');
    expect(published).not.toMatch(/source-inputs.mjs fetch|--inputs |--kind native|source-inputs.mjs pack/);
    const control = read('scripts/compat/commentary-control.mjs');
    expect(control).toContain("agentfootprint: '14.7.2', footprintjs: '12.3.0', foottrace: '1.11.1'");
    expect(control).toContain("assertSingleFoottrace(resolve('node_modules'), '1.11.1')");
    expect(read('scripts/compat/source-inputs/gates.mjs')).toContain("['unit', ['test']]");
    expect(workflow).not.toMatch(/--package-lock=false|LENS_COMMENTARY_AGENT_VERSION/);
  });

  it('uses the same selected cohort in the archive, isolated consumer and native probe', () => {
    const runner = read('scripts/compat/run-lane.mjs');
    const probe = read('scripts/check-native-recording.mjs');
    expect(workflow).toContain('--source-inputs compat-artifacts');
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
