/**
 * ChangeNotifier — framework-agnostic Observable primitive.
 *
 * Lens emits one notification per ingested event so any consumer
 * (React, Vue, Angular, Recoil, vanilla DOM, CLI) can refresh its view
 * without polling.
 *
 * Pattern: classic publish/subscribe + monotonic version number.
 *   - `subscribe(listener)` registers a listener; returns disposer.
 *   - `getVersion()` returns a number that changes on every notify().
 *     Frameworks like React's `useSyncExternalStore` use this as a
 *     snapshot identity check.
 *   - `notify()` fires every listener synchronously and bumps version.
 *
 * Why this exists as its OWN class (not inlined on LensRecorder):
 *   - Adapters for non-React frameworks (Vue refs, Angular signals,
 *     Recoil atoms) can wrap the SAME primitive without depending on
 *     React's `useSyncExternalStore`.
 *   - Future Lens components that need their own change-broadcast
 *     (e.g., a derived `LensSelectorCache`) reuse this primitive
 *     instead of re-implementing it.
 *   - Tests can assert change-notification semantics in isolation.
 *
 * Failure semantics: a listener that throws does NOT abort other
 * listeners. The error is swallowed (Lens prefers partial liveness
 * over crash-on-bad-listener). Consumers should log inside their own
 * listeners if visibility is needed.
 *
 * @example Vanilla adapter (DOM):
 *
 * ```typescript
 * const off = recorder.subscribe(() => {
 *   document.getElementById('event-count')!.textContent =
 *     String(recorder.entryCount);
 * });
 * // ... later
 * off();
 * ```
 *
 * @example Vue 3 adapter (composable). Returns COMPUTED refs so
 * template expressions actually re-render — returning the raw recorder
 * object would NOT trigger re-renders because Vue can't see the
 * external mutation.
 *
 * ```typescript
 * import { shallowRef, computed, onUnmounted } from 'vue';
 * export function useLens(recorder: LensRecorder) {
 *   const version = shallowRef(recorder.getVersion());
 *   const off = recorder.subscribe(() => { version.value = recorder.getVersion(); });
 *   onUnmounted(off);
 *   // computed() depends on `version` so each notify() re-runs them.
 *   return {
 *     runTree: computed(() => (version.value, recorder.selectRunTree())),
 *     summary: computed(() => (version.value, recorder.selectSummary())),
 *     log: computed(() => (version.value, recorder.selectEventLog())),
 *   };
 * }
 * ```
 *
 * @example Angular signal adapter:
 *
 * ```typescript
 * import { signal, effect } from '@angular/core';
 * const version = signal(recorder.getVersion());
 * recorder.subscribe(() => version.set(recorder.getVersion()));
 * effect(() => { version(); render(recorder.selectRunTree()); });
 * ```
 */
export class ChangeNotifier {
  private version = 0;
  private readonly listeners = new Set<() => void>();

  /** Register a change listener. Returns a disposer. Idempotent — the
   *  same listener function added twice is stored once. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Monotonic version. Bumped before each `notify()` call. Use as the
   *  snapshot key for `useSyncExternalStore` / Vue ref / Angular signal. */
  getVersion(): number {
    return this.version;
  }

  /** Bump version + fire every listener synchronously. A throwing
   *  listener doesn't abort the others. */
  notify(): void {
    this.version++;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Bad listener — swallow so one bad consumer doesn't break the
        // recorder. Consumers should log inside their own listeners.
      }
    }
  }

  /** Listener count — exposed for diagnostics + tests. */
  get listenerCount(): number {
    return this.listeners.size;
  }
}

// NOTE: a `reset()` method is deliberately NOT exposed. Resetting
// `version` to 0 would break the monotonicity that
// `useSyncExternalStore` (and similar Vue/Angular snapshot pattern)
// relies on for change detection — going from N→0→1 would skip
// re-renders. Dropping listeners silently would also leave framework
// adapters with stale subscriptions. Run-boundary resets should
// `notify()` (so adapters re-pull the cleared state) and let the
// version keep climbing.
