import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(path), 'utf8');
const workflow = read('.github/workflows/ci.yml');
const manifest = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const cohortNames = ['agentfootprint', 'footprintjs', 'foottrace'];

describe('source-selected native compatibility workflow', () => {
  it('pins every hosted CI job to the reviewed Ubuntu image', () => {
    const runners = workflow.match(/^[ \t]*runs-on:.*$/gm) ?? [];
    expect(runners.map((line) => line.trim())).toEqual([
      'runs-on: ubuntu-24.04', 'runs-on: ubuntu-24.04', 'runs-on: ubuntu-24.04',
    ]);
  });

  it('derives active package identities from the manifest and lock while retaining renderer/React/Node coverage', () => {
    for (const name of cohortNames) {
      expect(lock.packages[''].devDependencies[name]).toBe(manifest.devDependencies[name]);
      expect(lock.packages[`node_modules/${name}`].version).toBe(manifest.devDependencies[name]);
    }
    expect(workflow).toContain('flow: ["0.34.0", "0.38.0", "candidate"]');
    expect(workflow).toContain('react: ["18", "19"]');
    expect(workflow).toContain('node: [22, 24]');
    expect(workflow).toContain('--kind native');
    expect(workflow).not.toMatch(/agentfootprint-(?:11|12|13):|extracted-peers:|--kind (?:floor|modern)/);
  });

  it('uses one registry-selected cohort and no optional offline staging path', () => {
    expect(workflow).toContain('node scripts/compat/published-proof.mjs');
    expect(workflow).toContain('agent_archive="$(node scripts/compat/published-proof.mjs --archive-name)"');
    expect(workflow).toContain('--agent-tar "published-evidence-22/$agent_archive"');
    expect(workflow).not.toMatch(/agent-profile|repository: footprintjs\/agentfootprint|stage-proof|source-install|SOURCE_MANIFEST|jq --arg version/);
    expect(workflow).not.toMatch(/npm (?:publish|version)|workflow_dispatch|--legacy-peer-deps|--force/);
    for (const name of ['stage-proof.mjs', 'stage-proof.test.mjs', 'source-install.mjs']) {
      expect(existsSync(resolve('scripts/compat', name))).toBe(false);
    }
  });

  it('runs every source gate on the committed strict lock, without a local archive dev input', () => {
    for (const name of cohortNames) {
      const entry = lock.packages[`node_modules/${name}`];
      expect(entry.resolved).toMatch(/^https:\/\//);
      expect(entry.integrity).toMatch(/^sha512-/);
    }
    expect(JSON.stringify(lock)).not.toContain('file:');
    expect(workflow.match(/run: npm ci --strict-peer-deps/g)).toHaveLength(3);
    expect(workflow).not.toMatch(/npm install --strict-peer-deps|bootstrap-lock/);
    expect(workflow.match(/run: npm test/g)).toHaveLength(2);
    expect(workflow.match(/run: npm run typecheck/g)).toHaveLength(2);
  });

  it('uses the same selected cohort in the archive, isolated consumer and native probe', () => {
    const runner = read('scripts/compat/run-lane.mjs');
    const probe = read('scripts/check-native-recording.mjs');
    expect(workflow).toContain('--agent-source published-evidence-22/published-agent.json');
    expect(workflow).toContain('--install-browser yes');
    expect(runner).toContain('assert.deepEqual(contract.cohort, cohort');
    expect(runner).toContain('assertPublishedReceipt(contract.agentSource, readFileSync(agent.path), agentIdentity)');
    expect(runner).toContain('assertRegistryLock');
    expect(runner).toContain('assertSingleFoottrace');
    expect(runner).toContain('expected-cohort.json');
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
