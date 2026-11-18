import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RecordedInvocation } from '../../core/recordingSourceCodec/index.js';
import type { LensRecordingSource } from './types.js';
import type { SharedCursor } from '../useSharedCursor.js';
import type { CursorAddress } from '../../core/cursor/sharedCursor.js';
import { useRecordingSource } from './useRecordingSource.js';
import { childrenAt, ROOT_SCOPE, samePath, scopeFor } from './scopeModel.js';

interface Choice { readonly on: LensRecordingSource; readonly request?: RecordedInvocation; readonly abort: AbortController }
const NO_INVOCATIONS: readonly RecordedInvocation[] = Object.freeze([]);

/** View-local interest and disclosure only. The native source owns all child data. */
export function useLensSource(source: LensRecordingSource | undefined, drillPath: readonly string[], onEnter: (path: readonly string[]) => void, shared?: SharedCursor) {
  const snapshot = useRecordingSource(source);
  const [pending, setPending] = useState<Choice>();
  const [chooser, setChooser] = useState<{ readonly on: LensRecordingSource; readonly node?: string }>();
  const [query, setQuery] = useState('');
  const [failure, setFailure] = useState<LensRecordingSource>();
  const active = useRef<Choice>();
  const latestSource = useRef(source); latestSource.current = source;
  useEffect(() => {
    setPending(undefined); setChooser(undefined); setFailure(undefined); setQuery('');
    return () => { active.current?.abort.abort(); active.current = undefined; };
  }, [source]);
  const invocations = snapshot?.invocations ?? NO_INVOCATIONS;
  const invocationPath = useMemo(() => scopeFor(invocations, drillPath), [invocations, drillPath]);
  const direct = useMemo(() => childrenAt(invocations, invocationPath), [invocations, invocationPath]);
  const currentRequest = invocations.find(value => samePath(value.invocationPath, invocationPath));
  const currentReady = snapshot?.loads.some(value => value.status === 'ready' && samePath(value.request.invocationPath, invocationPath));
  const heldRequest = shared?.address?.drillPath === undefined ? undefined : invocations.find(value => samePath(value.invocationPath, shared.address!.drillPath!));
  const open = source !== undefined && chooser?.on === source;
  const candidates = useMemo(() => direct.filter(value => (chooser?.on !== source || chooser?.node === undefined || value.subflowId === chooser.node)
    && `${value.subflowId} ${value.mountRuntimeStageId}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [direct, chooser, source, query]);
  const cancel = useCallback(() => {
    active.current?.abort.abort(); active.current = undefined; setPending(undefined); setFailure(undefined);
  }, []);
  const choose = useCallback((request: RecordedInvocation) => {
    if (source === undefined) return;
    active.current?.abort.abort();
    const interest: Choice = { on: source, request, abort: new AbortController() };
    active.current = interest; setPending(interest); setFailure(undefined); setChooser(undefined); setQuery('');
    void source.load(request, { signal: interest.abort.signal }).then(() => {
      if (active.current !== interest || latestSource.current !== source) return;
      active.current = undefined; setPending(undefined); onEnter(request.invocationPath);
    }).catch(() => {
      if (active.current !== interest || latestSource.current !== source || interest.abort.signal.aborted) return;
      active.current = undefined; setPending(undefined); setFailure(source);
    });
  }, [source, onEnter]);
  const drill = useCallback((path: readonly string[]) => {
    if (source === undefined) return;
    if (path.length === 0) { cancel(); onEnter(ROOT_SCOPE); return; }
    const exact = invocations.filter(value => samePath(value.invocationPath, path) || value.mountRuntimeStageId === path[path.length - 1]);
    if (exact.length === 1) { choose(exact[0]!); return; }
    if (exact.length > 1) { setChooser({ on: source }); setQuery(path[path.length - 1] ?? ''); return; }
    // A recorded composition group in the current scope is not an isolated
    // child. It already reads this scope; no artificial child request exists.
    onEnter(path);
  }, [source, invocations, cancel, onEnter, choose]);
  const node = useCallback((id: string) => {
    if (source === undefined) return;
    const exact = direct.filter(value => value.subflowId === id);
    if (exact.length === 1) choose(exact[0]!);
    else if (exact.length > 1) { setChooser({ on: source, node: id }); setQuery(''); }
  }, [source, direct, choose]);
  const navigate = useCallback(async (address: CursorAddress, options?: { readonly signal?: AbortSignal }): Promise<boolean> => {
    if (source === undefined || shared === undefined || options?.signal?.aborted) return false;
    active.current?.abort.abort();
    const interest: Choice = { on: source, abort: new AbortController() };
    active.current = interest; setPending(interest); setFailure(undefined); setChooser(undefined);
    const abort = () => interest.abort.abort();
    options?.signal?.addEventListener('abort', abort, { once: true });
    let resolved: CursorAddress | undefined;
    try { resolved = await source.resolveAddress(address, { signal: interest.abort.signal }); }
    catch { /* A foreign structural source has the same fixed unavailable presentation. */ }
    finally { options?.signal?.removeEventListener('abort', abort); }
    if (active.current !== interest || latestSource.current !== source) return false;
    if (interest.abort.signal.aborted) { active.current = undefined; setPending(undefined); return false; }
    active.current = undefined; setPending(undefined);
    if (resolved === undefined) { setFailure(source); return false; }
    onEnter(resolved.drillPath ?? ROOT_SCOPE); shared.moveTo(resolved); return true;
  }, [source, shared, onEnter]);
  const current = source !== undefined && pending?.on === source ? pending : undefined;
  const load = snapshot?.loads.find(value => current?.request !== undefined && samePath(value.request.invocationPath, current.request.invocationPath));
  return { snapshot, invocationPath, pending: current !== undefined, preparing: load?.status === 'preparing',
    failed: source !== undefined && failure === source, open, query, setQuery,
    choices: candidates.slice(0, 12), choiceCount: candidates.length, childCount: direct.length,
    currentRequest: currentReady ? undefined : currentRequest,
    heldRequest: heldRequest !== undefined && !samePath(heldRequest.invocationPath, invocationPath) ? heldRequest : undefined,
    choose, node, drill, cancel, navigate,
    toggle: () => { if (source !== undefined) { setChooser(open ? undefined : { on: source }); setQuery(''); } },
  };
}
