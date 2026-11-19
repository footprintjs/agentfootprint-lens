/** @vitest-environment node */
import { expect, it, vi } from 'vitest';
import { foldOntology, layoutOntology, ontologyAt, ontologyRecordOf, type ContextAt } from '../index.js';

vi.mock('react', () => {
  throw new Error('The Ontology reader and layout must load without React');
});

function reading(keys: ContextAt['keys']): ContextAt {
  return { cursor: { runtimeStageId: 'inspect', commitIdx: 0 }, keys, rows: [], left: [], redacted: false, why: [] };
}

const declaration = {
  id: 'network', version: '1', hash: 'network-hash',
  spec: {
    sources: { inventory: { meaning: 'Devices' } },
    nodes: { device: { meaning: 'A device', sources: [{ source: 'inventory', via: ['lookup'] }] } },
  },
};

it('reads the first ontology declaration at the stop and lays out its recorded source', () => {
  const fold = ontologyAt(reading([
    { path: 'ontology', value: declaration },
    { path: 'ontology', value: { ...declaration, id: 'later' } },
  ]));
  expect(fold).toEqual(foldOntology(ontologyRecordOf(declaration)!));
  expect(fold?.id).toBe('network');
  expect(layoutOntology(fold!).edges.map(({ kind, from, to, label }) => [kind, from, to, label]))
    .toEqual([['held', 'inventory', 'device', 'lookup']]);
});

it('distinguishes an absent or malformed declaration from a declared empty map', () => {
  expect(ontologyAt(reading([]))).toBeUndefined();
  expect(ontologyAt(reading([
    { path: 'ontology', value: { id: 'partial' } },
    { path: 'ontology', value: declaration },
  ]))).toBeUndefined();
  const empty = ontologyAt(reading([{ path: 'ontology', value: { ...declaration, spec: { nodes: {}, sources: {} } } }]));
  expect(empty?.id).toBe('network');
  expect(layoutOntology(empty!).nodes).toEqual([]);
});
