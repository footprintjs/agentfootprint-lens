/**
 * Every reader in this package that walks a recording's execution tree, run on
 * the longest tree the codec admits (MAX_STAGE_CHAIN stages along `next`, at
 * the root and in a child). None may recurse along the chain: each must
 * answer, not overflow the stack.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { observeRecording } from '../../core/observeRecording.js';
import { buildStepGraphFromSnapshot } from '../../core/buildStepGraphFromSnapshot.js';
import { cursorProvenance } from '../../core/cursorProvenance.js';
import { tagStopsFor } from '../../core/tags/tagAxis.js';
import { MAX_STAGE_CHAIN } from '../../core/recordedContext/ownJson.js';
import { chainLength, lastStage, stageChainRecording } from '../../../test/fixtures/stageChain.js';
import { projectRecordingSource, readRecordingSubflow, type RecordedInvocation } from '../../core/recordingSourceCodec/index.js';
import { noBookmarkStore } from '../../core/bookmarks/index.js';
import { Lens } from '../Lens.js';
import { useSharedCursor } from '../useSharedCursor.js';
import { createLensRecordingSource } from './controller.js';

type Json = Record<string, any>;
async function longRecording() {
  const full = await stageChainRecording(MAX_STAGE_CHAIN);
  const projected = projectRecordingSource(full);
  if (projected.status !== 'ready') throw new Error(`Projection refused: ${projected.reason}`);
  const loadSubflow = vi.fn((request: RecordedInvocation) => {
    const read = readRecordingSubflow(full, request);
    if (read.status !== 'ready') throw new Error(`Child refused: ${read.reason}`);
    return read.value;
  });
  return { full, root: projected.value, loadSubflow };
}

describe(`readers of a ${MAX_STAGE_CHAIN}-stage execution tree`, () => {
  it('opens the lazy source, loads the long child and reads its axis, overlay and graph', async () => {
    const { root, loadSubflow } = await longRecording();
    expect(chainLength(root.recording.snapshot!.executionTree)).toBe(MAX_STAGE_CHAIN);
    const source = createLensRecordingSource({ root, loadSubflow });
    try {
      expect(source.getGraph([]).nodes.length).toBeGreaterThan(0);
      expect(source.getAxis([]).length).toBeGreaterThan(0);
      expect(source.getOverlay([])).toBeDefined();
      const child = root.invocations[0]!;
      await source.load(child);
      expect(loadSubflow).toHaveBeenCalledTimes(1);
      expect(source.getSnapshot().loads.map(load => load.status)).toEqual(['ready']);
      const loaded = (source.getSnapshot().recording.snapshot!.subflowResults as Json)[child.mountRuntimeStageId] as Json;
      expect(chainLength(loaded.treeContext.stageContexts)).toBe(MAX_STAGE_CHAIN);
      const axis = source.getAxis(child.invocationPath);
      expect(axis).toHaveLength(loaded.treeContext.history.length);
      expect(source.getOverlay(child.invocationPath)).toBeDefined();
      expect(source.getGraph(child.invocationPath)).toBeDefined();
      const last = axis[axis.length - 1]!;
      expect(await source.resolveAddress({ drillPath: child.invocationPath, runtimeStageId: last.runtimeStageId, commitIdx: last.commitIdx! }))
        .toEqual({ runtimeStageId: last.runtimeStageId, commitIdx: last.commitIdx, drillPath: child.invocationPath });
    } finally { source.dispose(); }
  }, 60_000);

  it('replays the whole recording and walks the tree for steps, provenance and tags', async () => {
    const { full } = await longRecording();
    // A composition label on the LAST stage: the step walk must reach the chain's end.
    const last = lastStage(full.snapshot.executionTree); last.description = 'LLMCall: the last stage';
    const observed = observeRecording(full, { debug: false });
    try {
      const runner = observed.runner as unknown as { getLastSnapshot(): Json };
      const snapshot = runner.getLastSnapshot();
      expect(chainLength(snapshot.executionTree)).toBe(MAX_STAGE_CHAIN);
      const steps = buildStepGraphFromSnapshot(snapshot);
      expect(steps.nodes[steps.nodes.length - 1]).toMatchObject({ id: last.runtimeStageId, primitiveKind: 'LLMCall' });
      const lastCommit = snapshot.commitLog[snapshot.commitLog.length - 1];
      const provenance = cursorProvenance(runner, lastCommit.runtimeStageId);
      expect(provenance?.writtenKeys).toEqual(['count']);
      expect(provenance?.sliceFor('count').frames.length).toBeGreaterThan(0);
      const ticks = tagStopsFor(snapshot, ['tick']).filter(stop => stop.meta?.includes('tick'));
      expect(ticks).toHaveLength(MAX_STAGE_CHAIN - 1);
    } finally { observed.recorder.detach(); }
  }, 60_000);

  it('renders the Lens over the long lazy source and its loaded child', async () => {
    const { root, loadSubflow } = await longRecording();
    const source = createLensRecordingSource({ root, loadSubflow });
    function Host() {
      const shared = useSharedCursor(source.observed.recorder);
      return <Lens recorder={source.observed.recorder} runner={source.observed.runner} recordingSource={source}
        shared={shared} bookmarkStore={noBookmarkStore()} />;
    }
    const mounted = render(<Host />);
    try {
      const steps = source.getAxis([]).length;
      expect(screen.getByRole('button', { name: `Go to step ${steps}` })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Recorded subflows (1)' }));
      const child = root.invocations[0]!;
      fireEvent.click(screen.getByRole('button', { name: `Open recorded invocation ${child.invocationPath.join(' → ')}` }));
      await waitFor(() => expect(loadSubflow).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(source.getSnapshot().loads.map(load => load.status)).toEqual(['ready']));
      const stops = screen.getByRole('combobox', { name: 'Move to a recorded stop' }) as HTMLSelectElement;
      const options = [...stops.options].map(option => option.value).filter(value => value !== '');
      expect(options).toHaveLength(source.getAxis(child.invocationPath).length);
      fireEvent.change(stops, { target: { value: options[options.length - 1] } });
      await waitFor(() => expect(screen.queryByRole('region', { name: 'Cursor not on this axis' })).toBeNull());
    } finally { mounted.unmount(); source.dispose(); }
  }, 60_000);
});
