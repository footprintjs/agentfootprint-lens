/**
 * useLensRecorder — React hook bridging `LensRecorder` to React's render cycle.
 *
 * Pattern: `useSyncExternalStore` (React 18+). Recorder is an external
 *          store; each handled event increments a version counter and
 *          fires every subscriber synchronously. The hook subscribes
 *          once, re-renders event-by-event, and exposes the recorder's
 *          three selectors as memoized getters.
 * Role:    Replace the 100ms polling pattern (setInterval + setState)
 *          with push-based reactivity. Zero polling, zero post-flush
 *          debt, progressive rendering for every run length from 5ms
 *          to 5 minutes.
 *
 * Why not just `useState` in the consumer?
 *   - The consumer would have to re-subscribe on every recorder swap.
 *   - `useSyncExternalStore` batches tear-safely across concurrent
 *     renders (React 18+ requirement).
 *   - Snapshots are stable across renders unless the version actually
 *     bumped — identity check avoids redundant downstream re-renders.
 */

import { useSyncExternalStore } from 'react';
import type { LensRecorder } from '../../core/LensRecorder.js';

/**
 * Subscribe a React component to a LensRecorder. Returns the recorder
 * itself; call `recorder.selectRunTree()` / `selectEventLog()` /
 * `selectSummary()` in the component body — they re-run every render
 * because the version bumped, so they see the fresh state.
 */
export function useLensRecorder(recorder: LensRecorder): LensRecorder {
  useSyncExternalStore(
    (listener) => recorder.subscribe(listener),
    () => recorder.getVersion(),
    () => recorder.getVersion(),
  );
  return recorder;
}
