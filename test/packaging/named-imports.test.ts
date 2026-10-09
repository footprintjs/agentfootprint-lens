/**
 * ARCHITECTURE (footprintjs extraction plan, step E2): the lens reads every
 * footprintjs door BY NAME, never off a namespace object.
 *
 * A namespace object lets a name be read through a cast —
 * `(trace as { tagStops?: unknown }).tagStops` — and a name read that way can
 * leave its door with no type error and no bundler error. The record's readers
 * leave `footprintjs/trace` for a package of their own in the extraction; a
 * named import of a moved name fails `tsc` and the bundle instead. Named
 * imports are also the only ones `floor-imports.test.ts` can check against the
 * peer floor.
 *
 * The lens has no ESLint, so this file is the check: it refuses
 * `import * as x from 'footprintjs…'` (and `import type * as`) anywhere under
 * src/, tests included. agentfootprint's `.eslintrc.js` holds the same rule.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** The footprintjs doors one source file imports as a namespace. */
function namespaceImports(fileName: string, text: string): string[] {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, kind);
  const doors: string[] = [];
  for (const s of file.statements) {
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier)) continue;
    const bindings = s.importClause?.namedBindings;
    if (/^footprintjs/.test(s.moduleSpecifier.text) && bindings !== undefined && ts.isNamespaceImport(bindings))
      doors.push(s.moduleSpecifier.text);
  }
  return doors;
}

describe('architecture: no footprintjs door is read off a namespace', () => {
  it('src/ has no `import * as … from "footprintjs…"`', () => {
    const offenders = walk(join(ROOT, 'src')).flatMap((file) =>
      namespaceImports(file, readFileSync(file, 'utf8')).map((door) => `${relative(ROOT, file)}: import * as … from '${door}'`),
    );
    expect(offenders).toEqual([]);
  });

  it('bites: a value or type namespace import of any door; never a named import or another package', () => {
    expect(namespaceImports('a.ts', `import * as trace from 'footprintjs/trace';`)).toEqual(['footprintjs/trace']);
    expect(namespaceImports('b.tsx', `import type * as fp from 'footprintjs';`)).toEqual(['footprintjs']);
    expect(
      namespaceImports('c.ts', `import { tagStops } from 'footprintjs/trace';\nimport * as af from 'agentfootprint';`),
    ).toEqual([]);
  });
});
