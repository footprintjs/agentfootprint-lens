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
  let cached: { revision: number; value: T } | undefined;
  let publishedRevision: number | undefined;
  let detach: (() => void) | undefined;
  let pending: { cancel?: () => void } | undefined;

  function queueFlush() {
    if (pending) return;
    const ticket: { cancel?: () => void } = {};
    pending = ticket;
    const cancel = schedule(() => {
      if (pending !== ticket) return;
      pending = undefined;
      const revision = recorder.getVersion();
      if (publishedRevision === revision) return;
      publishedRevision = revision;
      if (cached?.revision !== revision) cached = undefined;
      changes.notify();
    });
    if (pending === ticket && typeof cancel === 'function') ticket.cancel = cancel;
  }

  return {
    getSnapshot() {
      const revision = recorder.getVersion();
      if (!cached || (!detach && cached.revision !== revision)) {
        cached = { revision, value: select(recorder) };
      }
      return cached.value;
    },
    subscribe(listener) {
      const off = changes.subscribe(listener);
      if (!detach) {
        detach = recorder.subscribe(queueFlush);
        // React reads again after subscribing; include events since its render.
        publishedRevision = recorder.getVersion();
        if (cached?.revision !== publishedRevision) cached = undefined;
      }
      return () => {
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
