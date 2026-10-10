import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(resolve('.github/workflows/ci.yml'), 'utf8');
const candidateStep = workflow.split('      - name: Build the exact extracted FootPrint 10 candidate (never publish)\n')[1]
  ?.split('\n      - name:')[0];

describe('extracted engine compatibility workflow', () => {
  it('uses the producer fresh-install policy without weakening peer resolution', () => {
    // FootPrint intentionally has no committed lock: its platform-native build
    // dependencies are freshly resolved by npm 11 in its own CI and publisher.
    expect(candidateStep).toBeDefined();
    expect(candidateStep).toContain('npm install --strict-peer-deps');
    expect(candidateStep).not.toMatch(/^\s*npm ci(?:\s|$)/m);
    expect(candidateStep).not.toMatch(/--(?:legacy-peer-deps|force)/);
  });

  it('retains exact-source, actual-version and canonical-owner checks before packing', () => {
    expect(candidateStep).toContain('working-directory: engine-candidate');
    expect(candidateStep).toContain('test "$(git rev-parse HEAD)" = 8ee851119ad7b6e9d4195fc9f53526c506fe153e');
    expect(candidateStep).toContain("require('./package.json').version !== '10.0.0'");
    expect(candidateStep).toContain('git diff --exit-code HEAD -- src');
    expect(candidateStep).toContain('npm run build');
    expect(candidateStep).toContain('assert.equal(name in root, false');
    expect(candidateStep).toContain('assert.equal(name in trace, false');
    expect(candidateStep).toContain('npm pack --ignore-scripts');
    expect(candidateStep).not.toContain('npm publish');
  });
});
