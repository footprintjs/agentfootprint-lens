/**
 * Where a dependency's module lives in the INSTALLED package — found by the
 * symbol it defines, never by a fixed internal path.
 *
 * A dependency's `dist/esm` layout is its own business: agentfootprint's
 * layering clean-up moved `core/time/axis.js` to `time/axis.js` and
 * `lib/bug-report/` to `bug-report/`, with no change to any public door. A
 * packaging test that names those paths breaks on such a move (a positive
 * check) or, worse, keeps passing without looking at anything (a negative
 * one). So the tests ask "which module DEFINES `readTimeAxis`?" and let the
 * installed package answer.
 *
 * Both answers refuse loudly: a symbol no module defines, or one that two
 * modules define, throws — an anchor that moved out of reach fails the test
 * instead of making its absence check vacuous.
 *
 * Paths come back absolute, real (symlinks resolved — what Vite's module ids
 * carry) and `/`-separated.
 */

import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/** The dependencies the packaging tests look inside. */
export type Package = 'agentfootprint' | 'footprintjs';

const posix = (path: string): string => path.replace(/\\/g, '/');

interface Manifest {
  readonly name?: string;
  readonly module?: string;
  readonly exports?: Record<string, { import?: { default?: string } | string } | undefined>;
}

/** The installed package's root: the nearest folder above its entry whose manifest names it. */
function packageRoot(pkg: Package): { root: string; manifest: Manifest } {
  let dir = dirname(createRequire(import.meta.url).resolve(pkg));
  for (;;) {
    const file = join(dir, 'package.json');
    if (existsSync(file)) {
      const manifest = JSON.parse(readFileSync(file, 'utf8')) as Manifest;
      if (manifest.name === pkg) return { root: realpathSync(dir), manifest };
    }
    const up = dirname(dir);
    if (up === dir) throw new Error(`no ${pkg} package.json above its resolved entry`);
    dir = up;
  }
}

/** The ESM tree: the folder of the entry the package's own `import` condition declares. */
function esmRoot(pkg: Package): string {
  const { root, manifest } = packageRoot(pkg);
  const condition = manifest.exports?.['.']?.import;
  const entry = (typeof condition === 'string' ? condition : condition?.default) ?? manifest.module;
  if (!entry) throw new Error(`${pkg}'s manifest declares no ESM entry`);
  return posix(dirname(join(root, entry)));
}

interface Tree {
  readonly root: string;
  /** Every `.js` module under the ESM tree → its text. */
  readonly modules: ReadonlyMap<string, string>;
}

const trees = new Map<Package, Tree>();

/** The package's ESM tree, read once per test file. */
function installed(pkg: Package): Tree {
  const cached = trees.get(pkg);
  if (cached) return cached;
  const root = esmRoot(pkg);
  const modules = new Map<string, string>();
  for (const entry of readdirSync(root, { recursive: true, encoding: 'utf8' })) {
    if (!entry.endsWith('.js')) continue;
    const path = `${root}/${posix(entry)}`;
    modules.set(path, readFileSync(path, 'utf8'));
  }
  const tree = { root, modules };
  trees.set(pkg, tree);
  return tree;
}

/** A top-level exported declaration of `name` — a re-export (`export { x } from`) is not one. */
const declares = (name: string): RegExp =>
  new RegExp(
    `^export\\s+(?:(?:async\\s+)?function\\s*\\*?\\s*|class\\s+|(?:const|let|var)\\s+)${name.replace(/[$]/g, '\\$')}(?![\\w$])`,
    'm',
  );

/** The one ESM module of `pkg` that defines `name`. Throws when none does, or more than one. */
export function moduleDefining(name: string, pkg: Package = 'agentfootprint'): string {
  const { root, modules } = installed(pkg);
  const pattern = declares(name);
  const found = [...modules].filter(([, text]) => text.includes(name) && pattern.test(text)).map(([path]) => path);
  if (found.length !== 1) {
    throw new Error(
      `expected exactly one ${pkg} module under ${root} to define \`${name}\`, found ${found.length}` +
        (found.length > 0 ? `:\n  ${found.join('\n  ')}` : ''),
    );
  }
  return found[0]!;
}

export interface Family {
  /** The folder of the module that defines the anchor, with a trailing `/`. */
  readonly folder: string;
  /** Every ESM module under that folder — the anchor's own module among them. */
  readonly modules: readonly string[];
}

/**
 * The family an anchor symbol belongs to: the folder of the module that defines
 * it. Pick an anchor defined at its family's top level, so the folder is the
 * whole family wherever the layout puts it.
 */
export function familyOf(anchor: string, pkg: Package = 'agentfootprint'): Family {
  const folder = `${dirname(moduleDefining(anchor, pkg))}/`;
  return { folder, modules: [...installed(pkg).modules.keys()].filter((path) => path.startsWith(folder)) };
}

/** Is this bundler module id the given module, or (for a folder ending in `/`) under it? */
export const isIn = (id: string, moduleOrFolder: string): boolean =>
  moduleOrFolder.endsWith('/') ? posix(id).startsWith(moduleOrFolder) : posix(id) === moduleOrFolder;
