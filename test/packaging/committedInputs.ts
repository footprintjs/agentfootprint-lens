/**
 * The package cohort Lens COMMITTED — read from git, never from the working tree.
 *
 * Lens's CI selects its cohort (agentfootprint, footprintjs, foottrace) from
 * the committed manifest and lock: `npm ci --strict-peer-deps` installs the
 * lock, and the published proof reads it. Those committed files are what the
 * packaging tests guard.
 *
 * A downstream audit may rewrite the working-tree manifest on purpose, to run
 * this suite against newer family packages. The footprintjs consumer audit does
 * exactly that: it saves the exact candidate and registry versions in the
 * manifest and installs them with `npm install --no-save`, so the lock still
 * names the committed cohort. Reading the working tree turns that intended
 * rewrite into a false "manifest and lock disagree" after every family
 * release. An honest audit lock could not pass either: it would record the
 * candidate as a local `file:` archive, which the committed-lock rules refuse.
 *
 * In Lens's own CI the checkout IS the commit, so this reads the same bytes
 * there. It refuses loudly: no git, no HEAD, or a file missing at HEAD throws.
 * There is no fallback to the working tree.
 */

import { execFileSync } from 'node:child_process';

/** The packages whose versions move together as one selected cohort. */
export const COHORT = ['agentfootprint', 'footprintjs', 'foottrace'] as const;

export interface Manifest {
  devDependencies?: Record<string, string>;
}

export interface Lock {
  packages?: Record<
    string,
    { version?: string; resolved?: string; integrity?: string; devDependencies?: Record<string, string> }
  >;
}

/** One JSON file as committed at HEAD of the repository at `cwd`. */
export function committedJson<T>(path: string, cwd: string = process.cwd()): T {
  const text = execFileSync('git', ['show', `HEAD:${path}`], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(text) as T;
}

/**
 * Every way the lock disagrees with the manifest about a cohort package: the
 * lock's root request and its installed version must both equal the exact
 * version the manifest declares. Empty means the committed cohort is one.
 */
export function cohortMismatches(manifest: Manifest, lock: Lock, names: readonly string[] = COHORT): string[] {
  const problems: string[] = [];
  for (const name of names) {
    const declared = manifest.devDependencies?.[name];
    const requested = lock.packages?.['']?.devDependencies?.[name];
    const installed = lock.packages?.[`node_modules/${name}`]?.version;
    if (typeof declared !== 'string') {
      problems.push(`${name}: not declared in devDependencies`);
      continue;
    }
    if (requested !== declared) problems.push(`${name}: lock requests ${requested}, manifest declares ${declared}`);
    if (installed !== declared) problems.push(`${name}: lock installs ${installed}, manifest declares ${declared}`);
  }
  return problems;
}
