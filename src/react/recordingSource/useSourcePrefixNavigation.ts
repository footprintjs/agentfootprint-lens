import { useCallback, useEffect, useRef } from 'react';
import { readSourcePosition, type SourcePrefixResolution } from '../../core/cursor/sourcePrefix.js';
import type { SharedCursor } from '../useSharedCursor.js';
import type { LensRecordingSource } from './types.js';
import { samePath } from './scopeModel.js';

/** An explicit Trust action loads only its exact recorded log before using the host cursor. */
export function useSourcePrefixNavigation(source: LensRecordingSource | undefined, shared: SharedCursor | undefined) {
  const active = useRef<AbortController>();
  const latest = useRef({ source, shared }); latest.current = { source, shared };
  useEffect(() => () => { active.current?.abort(); active.current = undefined; }, [source]);
  return useCallback(async (value: unknown): Promise<SourcePrefixResolution | undefined> => {
    active.current?.abort();
    const position = readSourcePosition(value);
    if (position === undefined || shared === undefined || typeof shared.selectSourcePrefix !== 'function') return undefined;
    const interest = new AbortController(); active.current = interest;
    const held = shared.target;
    try {
      if (source !== undefined && position.drillPath.length > 0) {
        const request = source.getSnapshot().invocations.find(candidate => samePath(candidate.invocationPath, position.drillPath));
        if (request === undefined) return undefined;
        await source.load(request, { signal: interest.signal });
      }
      if (active.current !== interest || interest.signal.aborted || latest.current.source !== source
        || latest.current.shared?.target !== held) return undefined;
      return latest.current.shared?.selectSourcePrefix?.(position);
    } catch { return undefined; }
    finally { if (active.current === interest) active.current = undefined; }
  }, [source, shared]);
}
