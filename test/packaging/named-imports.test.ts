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
 * The lens has no ESLint, so this file is the check. Anywhere under src/,
 * tests included, it refuses the three ways to hold a door as a namespace
 * object: `import * as x from 'footprintjs…'` (and `import type * as`), a value
 * `import('footprintjs…')`, and `require('footprintjs…')`. A type query
 * `import('footprintjs').Name` is a named read and stays allowed.
 * agentfootprint's `.eslintrc.js` holds the same rule.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** `footprintjs` or `footprintjs/<subpath>` — never `footprintjs-<other>`. */
const DOOR = /^footprintjs(\/|$)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Each place one source file holds a footprintjs door as a namespace object. */
function namespaceReads(fileName: string, text: string): string[] {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, kind);
  const reads: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const bindings = node.importClause?.namedBindings;
      if (DOOR.test(node.moduleSpecifier.text) && bindings !== undefined && ts.isNamespaceImport(bindings))
        reads.push(`import * as … from '${node.moduleSpecifier.text}'`);
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const how =
        callee.kind === ts.SyntaxKind.ImportKeyword
          ? 'import'
          : ts.isIdentifier(callee) && callee.text === 'require'
            ? 'require'
            : undefined;
      const door = node.arguments[0];
      if (how !== undefined && door !== undefined && ts.isStringLiteralLike(door) && DOOR.test(door.text))
        reads.push(`${how}('${door.text}')`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return reads;
}

describe('architecture: no footprintjs door is read off a namespace', () => {
  it('src/ holds no footprintjs door as a namespace object', () => {
    const offenders = walk(join(ROOT, 'src')).flatMap((file) =>
      namespaceReads(file, readFileSync(file, 'utf8')).map((read) => `${relative(ROOT, file)}: ${read}`),
    );
    expect(offenders).toEqual([]);
  });

  it('bites: each namespace form of any door; never a named import, a type query or another package', () => {
    expect(namespaceReads('a.ts', `import * as trace from 'footprintjs/trace';`)).toEqual([
      `import * as … from 'footprintjs/trace'`,
    ]);
    expect(namespaceReads('b.tsx', `import type * as fp from 'footprintjs';`)).toEqual([`import * as … from 'footprintjs'`]);
    expect(
      namespaceReads('c.ts', `async function f() { return [await import('footprintjs/trace'), require('footprintjs')]; }`),
    ).toEqual([`import('footprintjs/trace')`, `require('footprintjs')`]);
    expect(
      namespaceReads(
        'd.ts',
        [
          `import { tagStops } from 'footprintjs/trace';`,
          `import * as af from 'agentfootprint';`,
          `import * as other from 'footprintjs-x';`,
          `type Chart = import('footprintjs').FlowChart;`,
        ].join('\n'),
      ),
    ).toEqual([]);
  });
});
