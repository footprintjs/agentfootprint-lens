import { ChangeNotifier } from '../ChangeNotifier.js';
import type { LensRecorder } from '../LensRecorder.js';
import { scheduleOverlayFlush, type ExternalStore } from './splitLensStores.js';

export interface LensRenderStoreOptions {
  /** Schedule one publication. A scheduler may return a cancellation function. */
  readonly schedule?: (flush: () => void) => void | (() => void);
}

/**
 * A read-only projection of a recorder for a rendering consumer. Ingestion stays
 * synchronous. A burst publishes one invalidation, and subscribers share the
 * selected value until the next flush. Return a detached value from select.
 */
export function createLensRenderStore<T>(
  recorder: LensRecorder,
  select: (recorder: LensRecorder) => T,
  { schedule = scheduleOverlayFlush }: LensRenderStoreOptions = {},
): ExternalStore<T> {
  const changes = new ChangeNotifier();
  let cached: { revision: number; value: T } | { revision: number; error: unknown } | undefined;
  let detach: (() => void) | undefined;
  let pending: { cancel?: () => void } | undefined;

  function capture(revision: number) {
    if (cached?.revision !== revision) {
      try {
        cached = { revision, value: select(recorder) };
      } catch (error) {
        // Surface a failed selection to the reader, including React's boundary.
        cached = { revision, error };
      }
    }
    return cached;
  }

  function queueFlush() {
    if (pending) return;
    const ticket: { cancel?: () => void } = {};
    pending = ticket;
    const cancel = schedule(() => {
      if (pending !== ticket) return;
      pending = undefined;
      const revision = recorder.getVersion();
      if (cached?.revision === revision) return;
      capture(revision);
      changes.notify();
    });
    if (pending === ticket && typeof cancel === 'function') ticket.cancel = cancel;
  }

  return {
    getSnapshot() {
      const selected = detach && cached ? cached : capture(recorder.getVersion());
      if ('error' in selected) throw selected.error;
      return selected.value;
    },
    subscribe(listener) {
      let active = true;
      const off = changes.subscribe(() => listener());
      if (!detach) {
        detach = recorder.subscribe(queueFlush);
        // React reads again after subscribing; include events since its render.
        capture(recorder.getVersion());
      }
      return () => {
        if (!active) return;
        active = false;
        off();
        if (changes.listenerCount === 0) {
          detach?.();
          detach = undefined;
          const ticket = pending;
          pending = undefined;
          ticket?.cancel?.();
        }
      };
    },
  };
}
