/** @vitest-environment node */
import { expect, it, vi } from 'vitest';
import { foldProofMap, layoutProofMap, proofMapAt, type ContextAt } from '../index.js';

vi.mock('react', () => {
  throw new Error('The Proof Map reader and layout must load without React');
});

function reading(keys: ContextAt['keys']): ContextAt {
  return { cursor: { runtimeStageId: 'inspect', commitIdx: 0 }, keys, rows: [], left: [], redacted: false, why: [] };
}

it('reads one stop through the headless API, including history, sources and unsupported values', () => {
  const rows = [{ kind: 'basis', toolCallId: 'a', basis: 'direct' }];
  const history = [{ role: 'tool', toolCallId: 'a', toolName: 'lookup' }];
  const toolResults = [{ toolCallId: 'b', toolName: 'retry' }];
  const ontology = {
    id: 'registry', version: '1', hash: 'h',
    spec: { nodes: { host: { meaning: 'Host', sources: [{ source: 'catalog', via: ['lookup'] }] } },
      sources: { catalog: { meaning: 'Catalog' } } },
  };
  const unsupportedValues = { values: [{ value: 'unknown-host' }] };
  const keys = Object.entries({ findingsLedger: rows, history, toolResults, ontology, unsupportedValues })
    .map(([path, value]) => ({ path, value }));
  const proof = proofMapAt(reading(keys));
  expect(proof).toEqual(foldProofMap({ rows, history, toolResults, ontology, unsupportedValues }));
  expect(proof?.answer?.unsupported).toEqual(['unknown-host']);
  expect(layoutProofMap(proof!).edges.map(({ kind, from, to }) => [kind, from, to])).toEqual([
    ['calls', 'call:a', 'tool:lookup'],
    ['calls', 'call:b', 'tool:retry'],
    ['reads', 'tool:lookup', 'source:catalog'],
  ]);
});

it('keeps an absent or malformed ledger distinct from an empty recorded ledger', () => {
  const history = { path: 'history', value: [{ role: 'tool', toolCallId: 'a', toolName: 'lookup' }] };
  expect(proofMapAt(reading([history]))).toBeUndefined();
  expect(proofMapAt(reading([history, { path: 'findingsLedger', value: {} }]))).toBeUndefined();
  const result = proofMapAt(reading([history, { path: 'findingsLedger', value: [] }]));
  expect(result?.calls.map(call => call.toolCallId)).toEqual(['a']);
  expect(result?.answer).toBeUndefined();
});
