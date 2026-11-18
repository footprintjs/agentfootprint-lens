import { useCallback, useSyncExternalStore } from 'react';
import type { LensRecordingSource } from './types.js';

/** Subscribe to a creator-owned source without acquiring another cursor or lifetime. */
export function useRecordingSource(source: LensRecordingSource | undefined) {
  const subscribe = useCallback((listener: () => void) => source?.subscribe(listener) ?? (() => {}), [source]);
  const snapshot = useCallback(() => source?.getSnapshot(), [source]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
