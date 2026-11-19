import { describe, expect, it } from 'vitest';
import { coverageRecordOf, foldCoverage, type BoundaryItem, type CoverageSection } from '../../src/core/context/coverage.js';

// A linear search spells out the original merge contract independently of the index.
function expectedSection(rows: readonly unknown[], section: CoverageSection): BoundaryItem[] {
  const merged: { what: string; why?: string; declaredBy: string[] }[] = [];
  for (const row of rows) {
    const call = coverageRecordOf(row);
    if (!call) continue;
    for (const item of call[section]) {
      const previous = merged.find((entry) => entry.what === item.what && (entry.why ?? '') === (item.why ?? ''));
      if (!previous) merged.push({ ...item, declaredBy: [call.toolName] });
      else if (!previous.declaredBy.includes(call.toolName)) previous.declaredBy.push(call.toolName);
    }
  }
  return merged;
}

describe('recorded coverage projection', () => {
  it('keeps first-seen row and tool order, including missing and empty reasons, across large declarations', () => {
    const colliding = [
      { what: 'a|b', why: 'c' }, { what: 'a', why: 'b|c' },
      { what: 'a\0b', why: 'c' }, { what: 'a', why: 'b\0c' },
      { what: '__proto__', why: 'constructor' },
    ];
    const rows = Array.from({ length: 1600 }, (_, i) => ({
      kind: 'ledger', iteration: i, toolName: `tool-${i % 181}`,
      checked: [
        i % 2 === 0 ? { what: 'shared' } : { what: 'shared', why: '' },
        ...colliding,
        { what: `item-${i % 121}`, why: `reason-${i % 29}` },
      ],
      notChecked: [
        i % 2 === 0 ? { what: 'shared', why: '' } : { what: 'shared' },
        { what: `group-${i % 89}` },
      ],
      cannotCover: i % 7 === 0 ? colliding : [],
    }));
    const input = [null, ...rows, { kind: 'ledger', checked: false }];
    const result = foldCoverage(input);
    expect(result.calls.map((call) => call.iteration)).toEqual(rows.map((row) => row.iteration));
    for (const section of ['checked', 'notChecked', 'cannotCover'] as const) {
      expect(result.boundary[section]).toStrictEqual(expectedSection(input, section));
      expect(Object.isFrozen(result.boundary[section])).toBe(true);
      for (const item of result.boundary[section]) {
        if (!Object.isFrozen(item) || !Object.isFrozen(item.declaredBy)) throw new Error('Mutable boundary item');
      }
    }
    expect(result.boundary.checked[0]).not.toHaveProperty('why');
    expect(result.boundary.notChecked[0]?.why).toBe('');
  });
});
