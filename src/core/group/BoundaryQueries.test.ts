import { describe, expect, it } from 'vitest';
import { BoundaryRecorder, type BoundaryRangeLabel } from 'agentfootprint/observe';
import { CommitRangeIndex } from 'foottrace';
import { buildGroups } from './buildGroups.js';
import { findInflightBranches } from '../utils/findInflightBranches.js';

const root: BoundaryRangeLabel = {
  type: 'run.entry', runtimeStageId: '__root__#0', subflowPath: [], depth: 0, ts: 0,
};
const child: BoundaryRangeLabel = {
  type: 'subflow.entry', runtimeStageId: 'work#1', subflowPath: ['work'],
  subflowId: 'work', subflowName: 'Work', depth: 1, ts: 1,
};

describe('boundary queries accept the reader contract, not a concrete index class', () => {
  for (const [name, makeIndex] of [
    ['the canonical Foottrace index', () => new CommitRangeIndex<BoundaryRangeLabel>()],
    ['the installed AgentFootprint recorder index', () => new BoundaryRecorder().boundaryIndex],
  ] as const) {
    it(name, () => {
      const index = makeIndex();
      index.open(root, 0);
      const token = index.open(child, 2);
      index.close(token, 5);

      // In the AgentFootprint 10 lane this is Foottrace's index. In the 9.x
      // lane it is FootPrint's. Neither consumer needs either class's private
      // storage, mutation methods or constructor identity.
      expect(buildGroups(index).map((group) => [group.runtimeGroupId, group.parentGroupId]))
        .toEqual([['__root__#0', undefined], ['work#1', '__root__#0']]);
      expect(findInflightBranches(index, 3)).toEqual(['work#1']);
      expect(findInflightBranches(index, 6)).toEqual([]);

      // These calls are also compile-time regressions: the old signatures
      // rejected a query-only view despite using no other index operation.
      const reader = {
        enclosing: index.enclosing.bind(index),
        overlapping: index.overlapping.bind(index),
      };
      expect(buildGroups(reader)).toEqual(buildGroups(index));
      expect(findInflightBranches({ enclosing: reader.enclosing }, 3)).toEqual(['work#1']);
      expect(index.size).toBe(2);
      expect(index.enclosing(6).map((entry) => entry.label.runtimeStageId)).toEqual(['__root__#0']);
    });
  }
});
