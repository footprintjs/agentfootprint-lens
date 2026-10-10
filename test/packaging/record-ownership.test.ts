/** The published Foottrace declarations own record names; FootPrint owns the engine. */
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = require.resolve('foottrace/package.json');
const doors = Object.values(JSON.parse(readFileSync(manifest, 'utf8')).exports) as Array<
  string | { require?: { types?: string } }
>;
const entries = doors.flatMap((door) =>
  typeof door !== 'string' && door.require?.types
    ? [resolve(dirname(manifest), door.require.types)] : [],
);
const program = ts.createProgram(entries, { skipLibCheck: true });
const checker = program.getTypeChecker();
const recordNames = new Set(entries.flatMap((entry) =>
  checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(entry)!)!)
    .map((symbol) => symbol.name),
));

function misplaced(text: string): string[] {
  const source = ts.createSourceFile('input.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const inspect = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) &&
        /^footprintjs(?:\/|$)/.test(node.moduleSpecifier.text)) {
      const bindings = ts.isImportDeclaration(node) ? node.importClause?.namedBindings : node.exportClause;
      if (bindings && (ts.isNamedImports(bindings) || ts.isNamedExports(bindings))) {
        for (const item of bindings.elements) {
          const name = (item.propertyName ?? item.name).text;
          if (recordNames.has(name)) found.push(name);
        }
      }
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal) && /^footprintjs(?:\/|$)/.test(node.argument.literal.text) &&
        node.qualifier && ts.isIdentifier(node.qualifier) && recordNames.has(node.qualifier.text)) {
      found.push(node.qualifier.text);
    }
    ts.forEachChild(node, inspect);
  };
  inspect(source);
  return found;
}

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sources(path) : /\.(?:tsx?|mjs)$/.test(path) ? [path] : [];
  });
}

describe('canonical record import ownership', () => {
  it('derives values and types from all three published Foottrace doors', () => {
    expect(entries).toHaveLength(3);
    for (const name of ['CommitRangeIndex', 'RangeToken', 'FoldSource', 'timeTravel', 'SharedMemory', 'pathSegments']) {
      expect(recordNames.has(name), name).toBe(true);
    }
    for (const name of ['KeyedStore', 'SequenceStore', 'Topology', 'TopologyEdge', 'TopologyNode', 'walkSubflowSpec', 'WalkerItem']) {
      expect(recordNames.has(name), name).toBe(false);
    }
  });

  it('bites on aliases, re-exports, path helpers and inline type imports', () => {
    expect(misplaced(`
      import { stateAt as fold, SequenceStore } from 'footprintjs/trace';
      export type { FoldSource as Input } from 'footprintjs/trace';
      type Token = import('footprintjs/trace').RangeToken;
      import { pathSegments } from 'footprintjs/trace';
      import { SharedMemory } from 'footprintjs/write';
      import { stateAt } from 'foottrace';
      import { pathSegments } from 'foottrace/paths';
    `)).toEqual(['stateAt', 'FoldSource', 'RangeToken', 'pathSegments', 'SharedMemory']);
  });

  it('source, tests, demos and packaging probes import records only from their owner', () => {
    const files = ['src', 'test', 'demo', 'scripts'].flatMap((dir) => sources(join(root, dir)));
    expect(files.length).toBeGreaterThan(100);
    expect(files.flatMap((file) => misplaced(readFileSync(file, 'utf8'))
      .map((name) => `${relative(root, file)}: ${name}`))).toEqual([]);
  }, 30_000);
});

describe.skipIf(!existsSync(join(root, 'dist', 'core.js')))('built record ownership', () => {
  it('keeps Foottrace external in both module formats instead of bundling another owner', () => {
    const maps = readdirSync(join(root, 'dist')).filter((file) => /\.(?:js|cjs)\.map$/.test(file));
    expect(maps.length).toBeGreaterThan(1);
    const bundled = maps.flatMap((file) => {
      const map = JSON.parse(readFileSync(join(root, 'dist', file), 'utf8')) as { sources: string[] };
      return map.sources.filter((source) => /(?:^|\/)node_modules\/foottrace\//.test(source.replace(/\\/g, '/')));
    });
    expect(bundled).toEqual([]);
    for (const suffix of ['js', 'cjs']) {
      const code = readdirSync(join(root, 'dist')).filter((file) => file.endsWith(`.${suffix}`))
        .map((file) => readFileSync(join(root, 'dist', file), 'utf8')).join('\n');
      expect(code).toMatch(/(?:from\s*|require\()['"]foottrace['"]/);
      expect(code).toMatch(/(?:from\s*|require\()['"]foottrace\/paths['"]/);
    }
  });
});
