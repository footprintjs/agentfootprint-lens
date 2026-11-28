import { describe, expect, it } from 'vitest';
import { recordedModelCallAddress } from './address.js';

const first = ['step-first#1', 'step-first/sf-llm-call#3'] as const;
const second = ['step-second#28', 'step-second/sf-llm-call#30'] as const;
const stage = 'step-first/sf-llm-call/call-llm#22';
const request = { invocationPath: first, mountRuntimeStageId: first[1], subflowId: 'first', runId: 'engine' };
const root = { runId: 'engine', logAddress: { logRunId: 'log', drillPath: [] } };
const start = {
  type: 'agentfootprint.stream.llm_start',
  meta: {
    runtimeStageId: stage,
    sourcePosition: { engineRunId: 'engine', logRunId: 'log', drillPath: first, committedThroughIdx: 0 },
  },
};
const history = [{ runtimeStageId: 'neighbor#21' }, { runtimeStageId: stage }];
const child = { treeContext: { logAddress: { logRunId: 'log', drillPath: first }, history } };

describe('exact original child call address', () => {
  it('uses the native log position even when the start event names an earlier prefix', () => {
    expect(recordedModelCallAddress(request, stage, root, [start], child)).toEqual({
      engineRunId: 'engine', logRunId: 'log', invocationPath: first, runtimeStageId: stage, commitIdx: 1,
    });
  });

  it('refuses adjacent stages and a matching stage name from a sibling holding the same index', () => {
    const sibling = { treeContext: { ...child.treeContext, logAddress: { logRunId: 'log', drillPath: second } } };
    expect(recordedModelCallAddress(request, 'neighbor#21', root, [start], child)).toBeUndefined();
    expect(recordedModelCallAddress(request, stage, root, [start], sibling)).toBeUndefined();
  });

  it('binds event owner and full path before using the matching native commit', () => {
    for (const partial of [{ drillPath: second }, { engineRunId: 'other-engine' }, { logRunId: 'other-log' }]) {
      const foreign = { ...start, meta: { ...start.meta, sourcePosition: { ...start.meta.sourcePosition, ...partial } } };
      expect(recordedModelCallAddress(request, stage, root, [foreign], child)).toBeUndefined();
    }
  });

  it('refuses duplicate starts and duplicate native stages', () => {
    const duplicate = { treeContext: { ...child.treeContext, history: [...history, history[1]] } };
    expect(recordedModelCallAddress(request, stage, root, [start, start], child)).toBeUndefined();
    expect(recordedModelCallAddress(request, stage, root, [start], duplicate)).toBeUndefined();
  });
});
