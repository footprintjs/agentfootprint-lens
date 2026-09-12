/**
 * `sideEffects: false` — a claim about the BUILT package, checked against it.
 *
 * A bundler reads that flag as "no module here needs to be kept for what it
 * does at load; keep a module only for the exports of it you use". A false
 * `false` breaks consumers silently — a registration that never runs, a sheet
 * that never installs — so this file walks every ESM module the four entries
 * reach and requires each top-level statement to be one of:
 *
 *   · a declaration (function, class, `export … from`),
 *   · a variable whose initializer calls nothing, or calls only a known-pure
 *     constructor, or a call the source annotated `/* @__PURE__ *\/` (the four
 *     load-time factories — `createContext`, `forwardRef`, `memo`,
 *     `makeTeachingHumanizer` — carry the annotation at source, so every
 *     bundler may drop them with the module),
 *   · a bare import of one of OUR chunks (`import "./chunk-…"`) — esbuild's
 *     evaluation-order import, harmless to drop precisely because that chunk
 *     is walked here too and has no effect of its own, or
 *   · the ONE audited effect: `import "@xyflow/react/dist/style.css"`, the
 *     peer's stylesheet, in a module that itself value-imports `@xyflow/react`
 *     — the chart that needs the sheet is in the same module as the import, so
 *     a bundler that drops the module (no chart used) drops nothing a kept
 *     chart needs, and one that keeps it keeps the sheet (the peer marks
 *     `*.css` as sideful). That co-location is the whole reason `false` is
 *     true here, and it is asserted, not assumed.
 *
 * Audited at source (2026-09-12, every non-test module under src/): no
 * `document` / `window` / `globalThis` at load, no registrations, no globals;
 * `ensureLensStyles()` installs the Lens sheet on first RENDER, not at import.
 * The one load-time read that WAS there — `readDoor(afObserve)` on the
 * `/observe` namespace in `BugReportButton` — is what kept the whole door in
 * every consumer's bundle; it is a click-time `import()` since 0.52.2, and the
 * last block below proves the door is out of the sync closure.
 *
 * Runs against the built dist. Skips when dist isn't built, so a bare
 * `vitest` false-fails nothing; CI and the release pipeline build first
 * (the agentfootprint repo's `esm-packaging.test.ts` is the precedent).
 */

/** @vitest-environment node */
// esbuild refuses to start under jsdom (its TextEncoder is not the platform's).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = resolve(repoRoot, 'dist');
const ENTRIES = ['index.js', 'core.js', 'why.js', 'skillgraph.js'] as const;
const built = ENTRIES.every((e) => existsSync(join(dist, e)));

const XYFLOW_SHEET = '@xyflow/react/dist/style.css';
const XYFLOW = '@xyflow/react';

/** Constructors that only build a value. Anything else at load must carry `@__PURE__`. */
const PURE_CALLEES = new Set([
  'Object.freeze',
  'Object.assign',
  'Object.keys',
  'Object.values',
  'Object.entries',
  'Object.fromEntries',
  'Object.create',
  'Symbol',
  'Symbol.for',
  'Array.from',
  'new Set',
  'new Map',
  'new WeakMap',
  'new WeakSet',
  'new RegExp',
  'Number',
  'String',
  'Boolean',
  'Math.max',
  'Math.min',
  'JSON.stringify',
  'parseInt',
  'parseFloat',
]);

/** The ESM modules reachable from the four entries, by following `./chunk-…` imports. */
function reachableModules(): string[] {
  const seen = new Set<string>();
  const queue: string[] = [...ENTRIES];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(join(dist, file), 'utf8');
    for (const m of text.matchAll(/from\s*"\.\/([^"]+)"|^import\s*"\.\/([^"]+)"/gm)) {
      queue.push((m[1] ?? m[2])!);
    }
  }
  return [...seen];
}

interface Effect {
  readonly file: string;
  readonly line: number;
  readonly what: string;
}

/** What a module could do at load, statement by statement. */
function loadTimeEffects(file: string): { effects: Effect[]; importsXyflowValue: boolean } {
  const text = readFileSync(join(dist, file), 'utf8');
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const effects: Effect[] = [];
  let importsXyflowValue = false;
  const at = (node: ts.Node): number => src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1;

  const callee = (node: ts.Node): string | undefined => {
    if (ts.isCallExpression(node)) return node.expression.getText(src);
    if (ts.isNewExpression(node)) return `new ${node.expression.getText(src)}`;
    return undefined;
  };
  // `= /* @__PURE__ */ f()` — on one line the comment is the `=` token's
  // TRAILING trivia, so both range readers are asked.
  const pureAnnotated = (node: ts.Node): boolean =>
    [
      ...(ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []),
      ...(ts.getTrailingCommentRanges(text, node.getFullStart()) ?? []),
    ].some((c) => /@__PURE__/.test(text.slice(c.pos, c.end)));
  /** Calls that run at load: not inside a function or class body (those run later). */
  const callsAtLoad = (node: ts.Node | undefined, out: string[]): string[] => {
    if (!node) return out;
    if (
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isClassExpression(node) ||
      ts.isClassDeclaration(node) ||
      ts.isMethodDeclaration(node)
    ) {
      return out;
    }
    const c = callee(node);
    if (c !== undefined && !PURE_CALLEES.has(c) && !pureAnnotated(node)) out.push(c);
    ts.forEachChild(node, (child) => callsAtLoad(child, out));
    return out;
  };

  for (const st of src.statements) {
    if (ts.isImportDeclaration(st)) {
      const spec = (st.moduleSpecifier as ts.StringLiteral).text;
      if (st.importClause) {
        if (spec === XYFLOW) importsXyflowValue = true;
        continue;
      }
      effects.push({ file, line: at(st), what: `import "${spec}"` });
      continue;
    }
    if (ts.isExportDeclaration(st) || ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) {
      continue;
    }
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        const calls = [...new Set(callsAtLoad(d.initializer, []))];
        if (calls.length > 0) {
          effects.push({ file, line: at(d), what: `${d.name.getText(src)} = … ${calls.join(', ')}` });
        }
      }
      continue;
    }
    effects.push({ file, line: at(st), what: st.getText(src).slice(0, 100) });
  }
  return { effects, importsXyflowValue };
}

const describeEffects = (list: readonly Effect[]): string =>
  list.map((e) => `${e.file}:${e.line}  ${e.what}`).join('\n');

describe.skipIf(!built)('sideEffects: false is true of the built package', () => {
  it('package.json declares sideEffects: false', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      sideEffects?: unknown;
    };
    expect(pkg.sideEffects).toBe(false);
  });

  it('every reachable ESM module has no load-time effect but the audited, co-located stylesheet import', () => {
    const modules = reachableModules();
    expect(modules.length).toBeGreaterThanOrEqual(ENTRIES.length + 1);

    const perModule = new Map(modules.map((m) => [m, loadTimeEffects(m)]));
    const chunkHasEffects = (spec: string): boolean =>
      (perModule.get(spec.replace(/^\.\//, ''))?.effects.length ?? 0) > 0;

    const offenders: Effect[] = [];
    const sheetImports: Effect[] = [];
    for (const [file, { effects, importsXyflowValue }] of perModule) {
      for (const effect of effects) {
        const bareChunk = /^import "\.\/chunk-[^"]+"$/.exec(effect.what);
        if (bareChunk) {
          // esbuild's evaluation-order import of our own chunk: droppable only
          // because that chunk is itself effect-free — checked, not assumed.
          if (chunkHasEffects(effect.what.slice('import "'.length, -1))) offenders.push(effect);
          continue;
        }
        if (effect.what === `import "${XYFLOW_SHEET}"`) {
          sheetImports.push(effect);
          if (!importsXyflowValue) offenders.push({ ...effect, what: `${effect.what} in a module with no chart` });
          continue;
        }
        offenders.push(effect);
      }
    }
    expect(offenders, `load-time effects that make sideEffects:false a lie:\n${describeEffects(offenders)}`).toEqual(
      [],
    );
    // The audit is not vacuous: the three chart modules (LensFlow,
    // SkillGraphFlow, SkillTopologyCanvas) each carry the sheet import, and
    // esbuild places every module in exactly one chunk — so the import lands
    // in at least one built module, next to the chart that needs it.
    expect(sheetImports.length).toBeGreaterThanOrEqual(1);
  });

  it('the /observe door is never a namespace import, and is loaded by import() where the button needs it', () => {
    const modules = reachableModules();
    const texts = modules.map((m) => [m, readFileSync(join(dist, m), 'utf8')] as const);
    const namespaceImports = texts.filter(([, t]) => /import \* as \w+ from "agentfootprint\/observe"/.test(t));
    expect(namespaceImports.map(([m]) => m)).toEqual([]);
    const dynamic = texts.filter(([, t]) => /import\(\s*"agentfootprint\/observe"\s*\)/.test(t));
    expect(dynamic.map(([m]) => m)).toHaveLength(1);
  });

  it('tree-shaking (Vite): Lens and SkillGraphFlow carry no /observe door; the button gets the named functions and never the door\'s other families', async () => {
    // Vite — the bundler the documentation site and most consumers use — is
    // installed here through vitest. esbuild alone would be a worse witness:
    // it marks EVERY export of a dynamically imported module live, and folds
    // the door into the static chunk whenever the core also imports it.
    const { build } = await import('vite');
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const scratch = mkdtempSync(join(tmpdir(), 'lens-side-effects-'));

    interface Chunk {
      readonly fileName: string;
      readonly isEntry: boolean;
      readonly imports: readonly string[];
      readonly dynamicImports: readonly string[];
      readonly modules: Record<string, unknown>;
    }
    /** The modules a consumer's page evaluates before first paint for one named import. */
    const syncModulesOf = async (name: string): Promise<string[]> => {
      const entry = join(scratch, `${name}.js`);
      writeFileSync(entry, `import { ${name} } from 'agentfootprint-lens';\nglobalThis.__keep = ${name};\n`);
      const result = (await build({
        configFile: false,
        logLevel: 'silent',
        root: scratch,
        resolve: { alias: { 'agentfootprint-lens': join(dist, 'index.js') } },
        define: { 'process.env.NODE_ENV': '"production"' },
        build: {
          write: false,
          minify: false,
          sourcemap: false,
          reportCompressedSize: false,
          rollupOptions: {
            input: { [name]: entry },
            external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
          },
        },
      })) as { output: readonly { type: string }[] } | { output: readonly { type: string }[] }[];
      const chunks = (Array.isArray(result) ? result : [result])
        .flatMap((r) => r.output)
        .filter((o): o is Chunk & { type: 'chunk' } => o.type === 'chunk');
      const byName = new Map(chunks.map((c) => [c.fileName, c]));
      const sync = new Set<string>();
      const visit = (file: string): void => {
        const chunk = byName.get(file);
        if (!chunk || sync.has(file)) return;
        sync.add(file);
        for (const imp of chunk.imports) visit(imp);
      };
      visit(chunks.find((c) => c.isEntry)!.fileName);
      return [...sync].flatMap((f) => Object.keys(byName.get(f)!.modules));
    };
    const only = (modules: readonly string[], needle: string): string[] => modules.filter((m) => m.includes(needle));

    // Neither shell names the substrate, so neither carries a byte of the door's
    // families. The build is real: a Lens closure is hundreds of modules, of
    // which several are this package's own chunks.
    const lens = await syncModulesOf('Lens');
    expect(lens.length).toBeGreaterThan(100);
    expect(only(lens, 'agentfootprint-lens/dist/').length).toBeGreaterThanOrEqual(3);
    for (const name of ['Lens', 'SkillGraphFlow']) {
      const modules = name === 'Lens' ? lens : await syncModulesOf(name);
      for (const family of ['lib/bug-report/', 'lib/trace-toolpack/', 'lib/context-bisect/']) {
        expect(only(modules, family), `${name} carries ${family}`).toEqual([]);
      }
    }
    // The button names describeBugReport / exportBugReport / githubDeviceSignIn:
    // their modules come (inlined here, because the core's static import of the
    // door puts it in the same graph — a page with no Lens gets them as a
    // chunk of their own), and the families the old NAMESPACE dragged do not.
    const button = await syncModulesOf('BugReportButton');
    expect(only(button, 'lib/bug-report/build.js'), 'describeBugReport rides with the button').toHaveLength(1);
    expect(only(button, 'trace-toolpack/traceToolpack.js')).toEqual([]);
    expect(only(button, 'context-bisect/localize.js')).toEqual([]);
  }, 120_000);
});
