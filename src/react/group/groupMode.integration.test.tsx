/**
 * Group mode over a REAL run — the ids have to line up or nothing lights.
 *
 * The unit tests hand `<LensFlow>` a member set by name. The risk they cannot
 * see is the join: membership is derived from the RECORDING (boundary ranges +
 * commit log), while the chart's node ids come from the SPEC
 * (`structureGraphFromRunner`). If those two address spaces disagreed by so much
 * as an `#executionIndex`, group mode would dim the whole chart and light
 * nothing — and every test above would still pass.
 *
 * So this runs a real agent, asks `useChartGroup` where the cursor is, and
 * renders the actual chart with the answer.
 */

import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, renderHook } from '@testing-library/react';
import { Agent, type LLMProvider } from 'agentfootprint';
import type { TraceFlowLayout } from 'footprint-explainable-ui/flowchart';
import { lensRecorder } from '../../core/LensRecorder.js';
import { structureGraphFromRunner } from '../../core/collapser/structureGraphFromRunner.js';
import { buildGroups } from '../../core/group/buildGroups.js';
import { activeChartGroup } from '../../core/group/activeChartGroup.js';
import { useChartGroup } from '../hooks/useChartGroup.js';
import { LensFlow } from '../LensFlow.js';
import { LENS_NODE_TYPES } from '../lensNodeTypes.js';
import { GROUP_MEMBER_CLASS, GROUP_NODE_CLASS } from './groupEmphasis.js';

const passthrough: TraceFlowLayout = (g) => g;

function scripted(): LLMProvider {
  return {
    name: 'scripted',
    complete: async (req) => {
      const hadTool = req.messages.some((m) => m.role === 'tool');
      return hadTool
        ? { content: 'done', toolCalls: [], usage: { input: 30, output: 10 }, stopReason: 'stop' as const }
        : {
            content: '',
            toolCalls: [{ id: 't1', name: 'lookup', args: { q: 'x' } }],
            usage: { input: 20, output: 5 },
            stopReason: 'tool_use' as const,
          };
    },
  };
}

async function runAgent() {
  const agent = Agent.create({ provider: scripted(), model: 'mock' })
    .system('')
    .tool({
      schema: { name: 'lookup', description: '', inputSchema: { type: 'object' } },
      execute: () => 'found',
    })
    .build();
  const recorder = lensRecorder();
  recorder.observe(agent);
  await agent.run({ message: 'go' });
  return { recorder, runner: agent };
}

describe('group mode over a real run', () => {
  it('lights real chart nodes — the recording ids and the chart ids are the same address space', async () => {
    const { recorder, runner } = await runAgent();
    const groups = buildGroups(recorder.boundary.boundaryIndex);
    const commits = recorder.getCommitLog();
    // The first non-root group with commits inside it — any real boundary will do.
    const target = groups.find((g) => !g.isRoot && (g.closesAtCommitIdx ?? commits.length) > g.opensAtCommitIdx);
    expect(target, 'the run recorded no boundary to group by').toBeTruthy();

    const group = activeChartGroup({ groups, commits, commitIdx: target!.opensAtCommitIdx });
    expect(group?.name).toBe(target!.name);

    const chart = { graph: structureGraphFromRunner(runner), layout: passthrough, nodeTypes: LENS_NODE_TYPES };
    const { container, getByTestId } = render(
      <LensFlow chart={chart} granularity="group" activeGroup={group!} showControls={false} showBackground={false} />,
    );

    // THE JOIN: at least one real chart node matched a member id.
    expect(container.querySelectorAll(`.${GROUP_MEMBER_CLASS}`).length).toBeGreaterThan(0);
    // …and the boundary is drawn, named with the group's own name.
    expect(getByTestId('lens-group-boundary-name').textContent).toBe(group!.name);
  });

  it('the same chart in step mode carries none of it', async () => {
    const { recorder, runner } = await runAgent();
    void recorder;
    const chart = { graph: structureGraphFromRunner(runner), layout: passthrough, nodeTypes: LENS_NODE_TYPES };
    const { container, queryByTestId } = render(
      <LensFlow chart={chart} showControls={false} showBackground={false} />,
    );
    expect(container.querySelectorAll(`.${GROUP_NODE_CLASS}`)).toHaveLength(0);
    expect(queryByTestId('lens-group-boundary')).toBeNull();
  });

  it('useChartGroup answers from the recorder alone — one call per cursor move', async () => {
    const { recorder } = await runAgent();
    const groups = buildGroups(recorder.boundary.boundaryIndex);
    const target = groups.find((g) => !g.isRoot)!;
    const { result } = renderHook(() => useChartGroup(recorder, target.opensAtCommitIdx));
    expect(result.current?.runtimeGroupId).toBe(target.runtimeGroupId);
    expect(result.current?.name).toBe(target.name);
    expect(result.current?.memberNodeIds.size).toBeGreaterThan(0);
  });

  it('no cursor means no group — the chart is left alone', async () => {
    const { recorder } = await runAgent();
    const { result } = renderHook(() => useChartGroup(recorder, undefined));
    expect(result.current).toBeUndefined();
  });
});
