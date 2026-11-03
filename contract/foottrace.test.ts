import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  flattenCausalDAG, formatSlice, keysReadFromExecutionTree, parseRuntimeStageId,
  sliceForKey, splitStageId, stateAt, tagStops, timeTravel,
} from 'foottrace';
import { pathSegments } from 'foottrace/paths';
import { importsIn, inventory, productionImports } from './foottrace.imports.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const log: Parameters<typeof sliceForKey>[0] = [
  { runtimeStageId: 'group/seed#0', stageId: 'group/seed', stage: 'seed', redactedPaths: [], updates: {},
    trace: [{ path: 'input', verb: 'set' }], overwrite: { input: 2 } },
  { runtimeStageId: 'group/derive#1', stageId: 'group/derive', stage: 'derive', redactedPaths: [], updates: {},
    trace: [{ path: 'output', verb: 'set', readKeys: ['input'] }],
    overwrite: { output: 4 }, tags: ['lens:step'] },
  { runtimeStageId: 'group/later#2', stageId: 'group/later', stage: 'later', redactedPaths: [], updates: {},
    trace: [{ path: 'output', verb: 'set' }], overwrite: { output: 99 } },
];
const source = { initialState: { input: 0 }, commitLog: log };

// Each case proves a behavior used by Lens, rather than enumerating upstream exports.
const contracts = [
  { names: ['foottrace#parseRuntimeStageId', 'foottrace#splitStageId'], prove() {
    expect(parseRuntimeStageId('outer/inner/derive#12')).toEqual({
      stageId: 'derive', subflowPath: 'outer/inner', executionIndex: 12,
    });
    expect(splitStageId('outer/inner/derive')).toEqual({
      localStageId: 'derive', subflowPath: 'outer/inner',
    });
  } },
  { names: ['foottrace/paths#pathSegments'], prove() {
    expect(pathSegments('context\u001fanswer')).toEqual(['context', 'answer']);
    expect(pathSegments('literal.dot')).toEqual(['literal.dot']);
  } },
  { names: ['foottrace#stateAt'], prove() {
    const saved = JSON.parse(JSON.stringify(source));
    const before = JSON.stringify(saved);
    const folded = stateAt(saved, 1);
    expect(folded.state).toEqual({ input: 2, output: 4 });
    expect(folded.basis).toBe('initial+log');
    expect(Object.isFrozen(folded.state)).toBe(true);
    expect(JSON.stringify(saved)).toBe(before);
    const damaged = stateAt({ commitLog: [log[0], null, log[1]] }, 2);
    expect(damaged.state).toEqual({ input: 2, output: 4 });
    expect(damaged.skipped?.map((gap) => gap.index)).toEqual([1]);
    expect(damaged.basis).toBe('log-only');
  } },
  { names: ['foottrace#timeTravel', 'foottrace#tagStops'], prove() {
    const cursor = timeTravel(source, { strategy: tagStops(['lens:step']) });
    expect(cursor.stops.map((stop) => stop.kind)).toEqual(['start', 'commit', 'end']);
    expect(cursor.stops[1]).toMatchObject({ runtimeStageId: 'group/derive#1', commitIdx: 1 });
    cursor.jumpTo(1);
    const at = cursor.at();
    expect(cursor.jumpTo('absent#9')).toMatchObject({ moved: false, reason: 'miss' });
    expect(cursor.at()).toBe(at);
    expect(cursor.mark('saved')).toMatchObject({ name: 'saved', runtimeStageId: 'group/derive#1' });
    const reopened = timeTravel(source, { strategy: tagStops(['lens:step']), marks: cursor.marks() });
    expect(reopened.jumpToMark('saved')).toMatchObject({ moved: true, to: { step: 1 } });
    const custom = timeTravel({}, { strategy: { stopsFor: () => [...cursor.stops] } });
    expect(custom.jumpTo(1)).toMatchObject({ moved: true, to: { runtimeStageId: 'group/derive#1' } });
  } },
  { names: ['foottrace#keysReadFromExecutionTree', 'foottrace#sliceForKey',
    'foottrace#flattenCausalDAG', 'foottrace#formatSlice'], prove() {
    const reads = keysReadFromExecutionTree({ runtimeStageId: 'group/derive#1', stageReads: { input: true } });
    const slice = sliceForKey(log, 'output', reads, { before: 2 });
    expect(slice.root?.runtimeStageId).toBe('group/derive#1');
    expect(flattenCausalDAG(slice.root!).map((node) => node.runtimeStageId))
      .toEqual(['group/derive#1', 'group/seed#0']);
    expect(formatSlice(slice)).toContain('derive');
    const missing = sliceForKey(log, 'absent', reads, { before: 2 });
    expect(missing.missing).toBe('never-written');
    expect(formatSlice(missing)).toContain('never written');
    const untracked = log.map((bundle) => ({ ...bundle,
      trace: bundle.trace.map(({ path, verb }) => ({ path, verb })) }));
    const unknown = sliceForKey(untracked, 'output', keysReadFromExecutionTree({ runtimeStageId: 'group/seed#0',
      next: { runtimeStageId: 'group/derive#1' } }), { before: 2 });
    expect(unknown.readsCoverage?.stepsWithReads).toBe(0);
    expect(formatSlice(unknown)).toMatch(/reads were not recorded/i);
  } },
];

describe('Lens imported foottrace contract', () => {
  it('derives the covered runtime and type APIs from production imports', () => {
    const actual = productionImports(root);
    const covered = contracts.flatMap((contract) => contract.names).sort();
    expect(covered).toEqual(inventory(actual, 'value'));
    const types = importsIn(readFileSync(new URL('./foottrace.types.ts', import.meta.url), 'utf8'), 'types');
    expect(inventory(types, 'type')).toEqual(inventory(actual, 'type'));
    const runtime = importsIn(readFileSync(new URL('./foottrace.test.ts', import.meta.url), 'utf8'), 'contract');
    expect(inventory(runtime, 'value')).toEqual(inventory(actual, 'value'));
  });
  it('the source scan sees aliases and inline type imports and refuses hidden imports', () => {
    expect(importsIn("import { stateAt as fold, type Stop } from 'foottrace';", 'probe.ts'))
      .toEqual([{ entry: 'foottrace', name: 'stateAt', kind: 'value' },
        { entry: 'foottrace', name: 'Stop', kind: 'type' }]);
    for (const source of ["import * as ft from 'foottrace';", "export * from 'foottrace';",
      "const ft = await import('foottrace');", "const ft = require('foottrace');",
      "import ft = require('foottrace');", "type Stop = import('foottrace').Stop;"]) {
      expect(() => importsIn(source, 'probe.ts')).toThrow(/foottrace/);
    }
  });
  it('resolves both public module doors for exactly the imported runtime symbols', async () => {
    for (const entry of [...new Set(productionImports(root).map((item) => item.entry))]) {
      const esm = await import(entry);
      const cjs = require(entry);
      for (const symbol of inventory(productionImports(root), 'value')) {
        const [door, name] = symbol.split('#');
        if (door !== entry) continue;
        expect(typeof esm[name], `ESM ${symbol}`).toBe('function');
        expect(typeof cjs[name], `CJS ${symbol}`).toBe('function');
      }
    }
  });
  for (const contract of contracts) it(contract.names.join(', '), contract.prove);
});
