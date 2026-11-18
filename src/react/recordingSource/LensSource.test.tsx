import React from 'react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Lens, type LensDetailSlotProps } from '../Lens.js';
import { useSharedCursor } from '../useSharedCursor.js';
import { noBookmarkStore } from '../../core/bookmarks/index.js';
import type { RecordedInvocation } from '../../core/recordingSourceCodec/index.js';
import { createLensRecordingSource } from './controller.js';
import { useLensSource } from './useLensSource.js';
import { useSourcePrefixNavigation } from './useSourcePrefixNavigation.js';
import { useRecordingSource } from './useRecordingSource.js';
import { projectRecordingSource, readRecordingSubflow } from '../../core/recordingSourceCodec/index.js';

vi.mock('../LensFlow.js', () => ({ LensFlow: ({ onNodeClick }: { onNodeClick?: (id: string) => void }) =>
  <button type="button" onClick={() => onNodeClick?.('sf-injection-engine')}>Recorded injection box</button> }));
const input = () => {
  const full = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../core/__fixtures__/recorded-turn.json'), 'utf8'));
  const projected = projectRecordingSource(full);
  if (projected.status !== 'ready') throw Error('Native fixture projection failed');
  return { full, root: projected.value };
};
const noBookmarks = noBookmarkStore();

describe('native Lens lazy-source composition', () => {
  it('offers exact repeated invocations and withholds old detail while preparing', async () => {
    const { full, root } = input(); let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const loadSubflow = vi.fn(async (request: RecordedInvocation) => {
      await gate; const selected = readRecordingSubflow(full, request);
      if (selected.status !== 'ready') throw Error('Native child unavailable'); return selected.value;
    });
    const source = createLensRecordingSource({ root, loadSubflow }); let lastSlot: LensDetailSlotProps | undefined;
    let held: unknown;
    const Detail = (props: LensDetailSlotProps) => { lastSlot = props; return <output data-testid="scope-detail">{props.invocationPath?.join('/') || 'root'}</output>; };
    function Host() {
      const shared = useSharedCursor(source.observed.recorder); held = shared.target;
      return <><button type="button" onClick={() => shared.forAxis('step').moveTo(0)}>Hold root start</button>
        <Lens recorder={source.observed.recorder} runner={source.observed.runner} recordingSource={source}
          shared={shared} slots={{ detail: Detail }} bookmarkStore={noBookmarks} /></>;
    }
    const mounted = render(<Host />);
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Hold root start' })); const before = held;
      fireEvent.click(screen.getByRole('button', { name: 'Recorded injection box' }));
      expect(loadSubflow).not.toHaveBeenCalled();
      const exact = root.invocations.find(value => value.subflowId === 'sf-injection-engine')!;
      fireEvent.click(screen.getByRole('button', { name: `Open recorded invocation ${exact.invocationPath.join(' → ')}` }));
      await waitFor(() => expect(loadSubflow).toHaveBeenCalledTimes(1));
      expect(screen.getByRole('status')).toHaveTextContent('Loading recorded subflow');
      expect(screen.getByTestId('scope-detail').closest('[inert]')).not.toBeNull();
      expect(screen.getByTestId('scope-detail').closest('[aria-hidden]')).toHaveAttribute('aria-hidden', 'true');
      await act(async () => { release(); await gate; });
      await waitFor(() => expect(screen.getByRole('region', { name: 'Cursor not on this axis' })).toBeInTheDocument());
      expect(held).toBe(before);
      fireEvent.change(screen.getByRole('combobox', { name: 'Move to a recorded stop' }), { target: { value: '0' } });
      await waitFor(() => expect(screen.getByTestId('scope-detail')).toHaveTextContent(exact.mountRuntimeStageId));
      expect(lastSlot?.invocationPath).toEqual(exact.invocationPath);
      expect(lastSlot?.snapshot).toBe(source.getSnapshot().recording.snapshot);
      expect(lastSlot?.axis?.length).toBeGreaterThan(0);
      expect(source.observed.recorder.selectEventLog()).toHaveLength(root.recording.events!.length);
      fireEvent.click(screen.getByRole('tab',{name:'Served'}));
      expect(screen.getByText(/Model-input inspection is unavailable for this recorded child scope/)).toBeVisible();
      fireEvent.click(screen.getByRole('tab',{name:'What happened'}));
      expect(screen.getByText(/The root event timeline is not indexed by this recorded child/)).toBeVisible();
    } finally { mounted.unmount(); source.dispose(); }
  });

  it('a superseded pending view interest cannot select its scope later', async () => {
    const { full, root } = input(); const requests = root.invocations.filter(value => value.subflowId === 'sf-injection-engine');
    const releases = new Map<string, () => void>();
    const source = createLensRecordingSource({ root, loadSubflow: async request => {
      await new Promise<void>(resolve => { releases.set(request.mountRuntimeStageId, resolve); });
      const selected = readRecordingSubflow(full, request); if (selected.status !== 'ready') throw Error('Native child unavailable'); return selected.value;
    } });
    const entered = vi.fn(); let feature: ReturnType<typeof useLensSource> | undefined;
    function Reader() { feature = useLensSource(source, [], entered); return null; }
    const mounted = render(<Reader />);
    try {
      act(() => feature!.choose(requests[0]!)); await waitFor(() => expect(releases.has(requests[0]!.mountRuntimeStageId)).toBe(true));
      act(() => feature!.choose(requests[1]!)); await waitFor(() => expect(releases.has(requests[1]!.mountRuntimeStageId)).toBe(true));
      await act(async () => { releases.get(requests[1]!.mountRuntimeStageId)!(); });
      await waitFor(() => expect(entered).toHaveBeenCalledWith(requests[1]!.invocationPath));
      await act(async () => { releases.get(requests[0]!.mountRuntimeStageId)!(); });
      expect(entered).toHaveBeenCalledTimes(1);
    } finally { mounted.unmount(); source.dispose(); }
  });
  it('offers an explicit current cold scope load and keeps a held target unchanged on admission', async () => {
    const {full,root} = input(), request = root.invocations[0]!;
    const loader = vi.fn((exact: RecordedInvocation) => {
      const result = readRecordingSubflow(full,exact); if(result.status !== 'ready') throw Error('Unavailable'); return result.value;
    });
    const source = createLensRecordingSource({root,loadSubflow:loader}), entered = vi.fn();
    let feature!: ReturnType<typeof useLensSource>, target: unknown;
    function Reader() {
      const state = useRecordingSource(source), shared = useSharedCursor(source.observed.recorder,state?.recording.snapshot);
      target = shared.target; feature = useLensSource(source,request.invocationPath,entered,shared); return null;
    }
    const mounted = render(<Reader/>);
    try {
      expect(loader).not.toHaveBeenCalled(); expect(feature.currentRequest).toEqual(request);
      const before = target; await act(async()=> {feature.choose(feature.currentRequest!);});
      await waitFor(()=>expect(entered).toHaveBeenCalledWith(request.invocationPath));
      expect(target).toBe(before); expect(feature.currentRequest).toBeUndefined();
    } finally {mounted.unmount();source.dispose();}
  });

  it('loads an exact cold source prefix before selecting it through the same shared cursor', async () => {
    const {full,root:original} = input(), request = original.invocations[0]!;
    const logRunId = full.snapshot.runId;
    full.snapshot.subflowResults[request.mountRuntimeStageId].treeContext.logAddress = {logRunId,drillPath:request.invocationPath};
    const projected = projectRecordingSource(full); if(projected.status !== 'ready') throw Error('Projection unavailable');
    let release!:()=>void; const gate = new Promise<void>(resolve=>{release=resolve;});
    const loader = vi.fn(async (exact: RecordedInvocation)=> {await gate;const result=readRecordingSubflow(full,exact);if(result.status !== 'ready')throw Error('Unavailable');return result.value;});
    const source = createLensRecordingSource({root:projected.value,loadSubflow:loader});
    let select!: ReturnType<typeof useSourcePrefixNavigation>, target: unknown;
    function Reader() {const state=useRecordingSource(source);const shared=useSharedCursor(source.observed.recorder,state?.recording.snapshot);target=shared.target;select=useSourcePrefixNavigation(source,shared);return null;}
    const mounted=render(<Reader/>);
    try {
      const position={engineRunId:logRunId,logRunId,drillPath:request.invocationPath,committedThroughIdx:-1};
      let pending!:ReturnType<typeof select>;act(()=>{pending=select(position);});
      await waitFor(()=>expect(loader).toHaveBeenCalledTimes(1));expect(target).toBeUndefined();
      await act(async()=>{release();await pending;});
      expect(target).toEqual({kind:'source-prefix',position});
    } finally {mounted.unmount();source.dispose();}
  });

  it('cancels a native stop navigation before its pending load can move the cursor', async () => {
    const {full,root}=input(),request=root.invocations[0]!;
    let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
    const source=createLensRecordingSource({root,loadSubflow:async exact=>{await gate;const result=readRecordingSubflow(full,exact);if(result.status!=='ready')throw Error('Unavailable');return result.value;}});
    let feature!:ReturnType<typeof useLensSource>,target:unknown;const entered=vi.fn();
    function Reader(){const shared=useSharedCursor(source.observed.recorder);target=shared.target;feature=useLensSource(source,[],entered,shared);return null;}
    const mounted=render(<Reader/>);
    try {
      const abort=new AbortController();let pending!:Promise<boolean>;
      act(()=>{pending=feature.navigate({runtimeStageId:'not-selected#1',commitIdx:0,drillPath:request.invocationPath},{signal:abort.signal});});
      await waitFor(()=>expect(source.getSnapshot().loads[0]?.status).toBe('loading'));
      await act(async()=>{abort.abort();release();expect(await pending).toBe(false);});
      expect(target).toBeUndefined();expect(entered).not.toHaveBeenCalled();
    } finally {mounted.unmount();source.dispose();}
  });

});
