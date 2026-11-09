import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cohortMismatches, committedJson, type Lock, type Manifest } from './committedInputs';

const repos: string[] = [];
afterEach(() => {
  for (const dir of repos.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=lens-test', '-c', 'user.email=lens-test@example.invalid', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const writeJson = (dir: string, path: string, value: unknown) =>
  writeFileSync(join(dir, path), `${JSON.stringify(value, null, 2)}\n`);

/** A throwaway repository holding one committed manifest and lock. */
function repoWith(manifest: Manifest, lock: Lock): string {
  const dir = mkdtempSync(join(tmpdir(), 'lens-committed-'));
  repos.push(dir);
  git(dir, 'init', '--quiet');
  writeJson(dir, 'package.json', manifest);
  writeJson(dir, 'package-lock.json', lock);
  git(dir, 'add', 'package.json', 'package-lock.json');
  git(dir, 'commit', '--quiet', '-m', 'cohort');
  return dir;
}

const cohort = (agent: string, flow: string, trace: string) => ({ agentfootprint: agent, footprintjs: flow, foottrace: trace });
const manifestOf = (versions: Record<string, string>): Manifest => ({ devDependencies: { ...versions } });
const lockOf = (versions: Record<string, string>): Lock => ({
  packages: {
    '': { devDependencies: { ...versions } },
    ...Object.fromEntries(Object.entries(versions).map(([name, version]) => [`node_modules/${name}`, { version }])),
  },
});

describe('the committed package cohort', () => {
  it('stays the guarded input when an audit rewrites the working-tree manifest', () => {
    // The footprintjs consumer audit saves newer exact versions in the manifest and installs them
    // with `npm install --no-save`; the lock keeps the committed cohort.
    const committed = cohort('14.0.0', '11.0.0', '1.11.1');
    const dir = repoWith(manifestOf(committed), lockOf(committed));
    writeJson(dir, 'package.json', manifestOf(cohort('14.3.1', '11.1.0', '1.11.1')));

    const manifest = committedJson<Manifest>('package.json', dir);
    const lock = committedJson<Lock>('package-lock.json', dir);
    expect(manifest.devDependencies?.agentfootprint).toBe('14.0.0');
    expect(cohortMismatches(manifest, lock)).toEqual([]);
  });

  it('still refuses a committed manifest and lock that name different cohorts', () => {
    const dir = repoWith(manifestOf(cohort('14.3.1', '11.0.0', '1.11.1')), lockOf(cohort('14.0.0', '11.0.0', '1.11.1')));

    expect(cohortMismatches(committedJson<Manifest>('package.json', dir), committedJson<Lock>('package-lock.json', dir))).toEqual([
      'agentfootprint: lock requests 14.0.0, manifest declares 14.3.1',
      'agentfootprint: lock installs 14.0.0, manifest declares 14.3.1',
    ]);
  });

  it('refuses a cohort package the manifest does not declare', () => {
    const versions = cohort('14.0.0', '11.0.0', '1.11.1');
    const { foottrace: _dropped, ...rest } = versions;
    expect(cohortMismatches(manifestOf(rest), lockOf(versions))).toEqual(['foottrace: not declared in devDependencies']);
  });

  it('fails loudly outside a repository instead of reading the working tree', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lens-no-git-'));
    repos.push(dir);
    writeJson(dir, 'package.json', manifestOf(cohort('14.0.0', '11.0.0', '1.11.1')));
    expect(() => committedJson('package.json', dir)).toThrow();
  });
});
