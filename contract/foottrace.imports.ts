import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

export interface FoottraceImport {
  entry: string;
  name: string;
  kind: 'type' | 'value';
}

/** Read declarations, not text matches; new import forms require explicit coverage. */
export function importsIn(source: string, file: string): FoottraceImport[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const found: FoottraceImport[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) &&
        node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression) &&
        /^foottrace(?:\/|$)/.test(node.moduleReference.expression.text)) {
      throw new Error(`${file}: use named static foottrace imports for contract coverage`);
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal) && /^foottrace(?:\/|$)/.test(node.argument.literal.text)) {
      throw new Error(`${file}: use named static foottrace type imports for contract coverage`);
    }
    if (ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
        node.arguments.some((arg) =>
      ts.isStringLiteral(arg) && /^foottrace(?:\/|$)/.test(arg.text))) {
      throw new Error(`${file}: use named static foottrace imports for contract coverage`);
    }
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) &&
        /^foottrace(?:\/|$)/.test(node.moduleSpecifier.text)) {
      const clause = ts.isImportDeclaration(node) ? node.importClause : undefined;
      if (!clause || clause.name || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) {
        throw new Error(`${file}: unsupported foottrace import/re-export`);
      }
      for (const item of clause.namedBindings.elements) {
        found.push({ entry: node.moduleSpecifier.text, name: (item.propertyName ?? item.name).text,
          kind: clause.isTypeOnly || item.isTypeOnly ? 'type' : 'value' });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

export function productionImports(root: string): FoottraceImport[] {
  const found: FoottraceImport[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (/^(?:__tests__|__contract__|fixtures)$/.test(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name) && !/\.(?:test|spec)\.tsx?$/.test(entry.name)) {
        found.push(...importsIn(readFileSync(path, 'utf8'), relative(root, path)));
      }
    }
  };
  walk(join(root, 'src'));
  return found;
}

export function inventory(imports: FoottraceImport[], kind: FoottraceImport['kind']): string[] {
  return [...new Set(imports.filter((item) => item.kind === kind)
    .map((item) => `${item.entry}#${item.name}`))].sort();
}
