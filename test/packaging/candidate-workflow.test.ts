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

  it('uses only the published candidate in the default workflow and retains optional staging proof', () => {
    expect(workflow).toContain('node scripts/compat/published-proof.mjs');
    expect(workflow).toContain('--agent-profile published');
    expect(workflow).not.toMatch(/repository: footprintjs\/agentfootprint|stage-proof|source-install|SOURCE_MANIFEST|jq --arg version/);
    expect(workflow).not.toMatch(/npm (?:publish|version)|workflow_dispatch|--legacy-peer-deps|--force/);
    expect(read('scripts/compat/stage-proof.mjs')).toContain('export function verifyStageIdentity');
    expect(read('scripts/compat/stage-proof.test.mjs')).toContain('verifyStageIdentity');
    expect(read('scripts/compat/README.md')).toContain('--agent-profile offline');
  });

  it('runs every source gate on the committed strict lock, without a local archive dev input', () => {
    const lock = JSON.parse(read('package-lock.json'));
    const candidate = lock.packages['node_modules/agentfootprint'];
    expect(candidate.version).toBe('14.0.0-rc.0');
    expect(candidate.resolved).toBe('https://registry.npmjs.org/agentfootprint/-/agentfootprint-14.0.0-rc.0.tgz');
    expect(candidate.integrity).toBe('sha512-82LEqg8hSsheVPZ1p9JCqxV2qGMf28+f9XQnuO2n7BqXkI+frRg9ARrnfa5dTfbfqjNgr5p0UQxaRo8dtnHCRg==');
    expect(JSON.stringify(lock)).not.toContain('file:');
    expect(workflow.match(/run: npm ci --strict-peer-deps/g)).toHaveLength(3);
    expect(workflow).not.toMatch(/npm install --strict-peer-deps|bootstrap-lock/);
    expect(workflow.match(/run: npm test/g)).toHaveLength(2);
    expect(workflow.match(/run: npm run typecheck/g)).toHaveLength(2);
  });

  it('uses one archive set for public runtime, strict declarations, browser replay and native recording', () => {
    const runner = read('scripts/compat/run-lane.mjs');
    expect(workflow).toContain('--agent-source published-evidence-22/published-agent.json');
    expect(workflow).toContain('--install-browser yes');
    expect(runner).toContain('assertPublishedReceipt(contract.agentSource, readFileSync(agent.path))');
    expect(runner).toContain("agentProfile === 'published' ? publishedCandidate.version");
    expect(runner).toContain('assertRegistryLock');
    expect(runner).toContain('assertSingleFoottrace');
    expect(runner).toContain('assertEvidenceOutsideRepository(root, evidence)');
    expect(workflow).toContain('--evidence "$RUNNER_TEMP/compat-evidence"');
    expect(workflow).toContain('${{ runner.temp }}/compat-evidence/consumer/package*.json');
    expect(runner).toContain('check-native-recording.mjs');
    expect(runner).toContain("'--skipLibCheck', 'false'");
    expect(runner).toContain("['ci', '--strict-peer-deps'");
    expect(runner).toContain('all installed bytes and archives still equal after every probe');
  });
});
