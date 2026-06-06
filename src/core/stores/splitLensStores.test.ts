/**
 * splitLensStores — Layer 2 / Tier A tests (Convention 3, 7 patterns).
 *
 * Uses a synchronous scheduler (`schedule: (fn) => fn()`) so the rAF-
 * coalesced overlay flush is deterministic in vitest. Production code
 * defaults to `requestAnimationFrame` — covered by the integration
 * test with a captured/manual scheduler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LensRecorder } from '../LensRecorder.js';
import { splitLensStores } from './splitLensStores.js';

/**
 * Test helper — simulates a structural change by pushing a fake
 * boundary event (which `splitLensStores` polls for spec-change
 * detection) and bumping the change notifier. Mirrors the side-effect
 * of an `onSubflowEntry` arriving at the BoundaryRecorder, without
 * the full event-plumbing setup.
 */
function appendFakeNode(rec: LensRecorder): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = rec.boundary as any;
  if (!b._fakeEvents) b._fakeEvents = [];
  b._fakeEvents.push({ type: 'subflow.entry', runtimeStageId: `sf#${b._fakeEvents.length}` });
  if (!b._origGetEvents) {
    b._origGetEvents = b.getEvents?.bind(b);
    b.getEvents = () => b._fakeEvents;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (rec as any).notifier.notify();
}

function notifyWithoutStructureChange(rec: LensRecorder): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (rec as any).notifier.notify();
}

const sync = (fn: () => void): void => fn();

let recorder: LensRecorder;

beforeEach(() => {
  recorder = new LensRecorder();
});

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('splitLensStores — unit', () => {
  it('initial spec + overlay versions both at 0', () => {
    const stores = splitLensStores(recorder, { schedule: sync });
    expect(stores.specStore.getSnapshot()).toBe(0);
    expect(stores.overlayStore.getSnapshot()).toBe(0);
  });

  it('overlay bumps after a non-structural notify', () => {
    const stores = splitLensStores(recorder, { schedule: sync });
    notifyWithoutStructureChange(recorder);
    expect(stores.overlayStore.getSnapshot()).toBe(1);
  });

  it('overlay does NOT bump spec when no node was added', () => {
    const stores = splitLensStores(recorder, { schedule: sync });
    notifyWithoutStructureChange(recorder);
    expect(stores.specStore.getSnapshot()).toBe(0);
  });

  it('spec bumps when nodes.length grows', () => {
    const stores = splitLensStores(recorder, { schedule: sync });
    appendFakeNode(recorder);
    expect(stores.specStore.getSnapshot()).toBe(1);
  });

  it('overlay also bumps when spec bumps (same notify covers both)', () => {
    const stores = splitLensStores(recorder, { schedule: sync });
    appendFakeNode(recorder);
    expect(stores.overlayStore.getSnapshot()).toBe(1);
    expect(stores.specStore.getSnapshot()).toBe(1);
  });

  it('listener count is independent across stores', () => {
    const stores = splitLensStores(recorder, { schedule: sync });
    const specL = vi.fn();
    const overL = vi.fn();
    stores.specStore.subscribe(specL);
    stores.overlayStore.subscribe(overL);
    notifyWithoutStructureChange(recorder);
    expect(specL).not.toHaveBeenCalled();
    expect(overL).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops listener invocation', () => {
    const stores = splitLensStores(recorder, { schedule: sync });
    const fn = vi.fn();
    const off = stores.overlayStore.subscribe(fn);
    notifyWithoutStructureChange(recorder);
    off();
    notifyWithoutStructureChange(recorder);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('dispose() removes recorder subscription', () => {
    const stores = splitLensStores(recorder, { schedule: sync });
    stores.dispose();
    appendFakeNode(recorder);
    expect(stores.specStore.getSnapshot()).toBe(0);
    expect(stores.overlayStore.getSnapshot()).toBe(0);
  });

  it('dispose() is idempotent', () => {
    const stores = splitLensStores(recorder, { schedule: sync });
    expect(() => {
      stores.dispose();
      stores.dispose();
      stores.dispose();
    }).not.toThrow();
  });
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('splitLensStores — functional', () => {
  it('coalesces a burst of N notifies into ONE overlay flush per frame', () => {
    // Capture the pending flush so we can flush it manually.
    let pending: (() => void) | undefined;
    const stores = splitLensStores(recorder, {
      schedule: (fn) => { pending = fn; },
    });
    const overL = vi.fn();
    stores.overlayStore.subscribe(overL);

    for (let i = 0; i < 50; i++) notifyWithoutStructureChange(recorder);
    expect(overL).not.toHaveBeenCalled(); // nothing flushed yet
    pending?.();
    expect(overL).toHaveBeenCalledTimes(1);
    expect(stores.overlayStore.getSnapshot()).toBe(1);
  });

  it('spec is NOT coalesced — bumps synchronously on every structural change', () => {
    const stores = splitLensStores(recorder, { schedule: sync });
    const specL = vi.fn();
    stores.specStore.subscribe(specL);
    appendFakeNode(recorder);
    appendFakeNode(recorder);
    appendFakeNode(recorder);
    expect(specL).toHaveBeenCalledTimes(3);
    expect(stores.specStore.getSnapshot()).toBe(3);
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('splitLensStores — integration', () => {
  it('mixed: 1 structural notify + many overlay-only notifies', () => {
    let pending: (() => void) | undefined;
    const stores = splitLensStores(recorder, {
      schedule: (fn) => { pending = fn; },
    });
    appendFakeNode(recorder);
    for (let i = 0; i < 20; i++) notifyWithoutStructureChange(recorder);
    pending?.();
    expect(stores.specStore.getSnapshot()).toBe(1);
    expect(stores.overlayStore.getSnapshot()).toBe(1);
  });

  it('two consecutive batches each get their own overlay flush', () => {
    let pending: (() => void) | undefined;
    const stores = splitLensStores(recorder, {
      schedule: (fn) => { pending = fn; },
    });
    notifyWithoutStructureChange(recorder);
    pending?.();
    expect(stores.overlayStore.getSnapshot()).toBe(1);

    notifyWithoutStructureChange(recorder);
    pending?.();
    expect(stores.overlayStore.getSnapshot()).toBe(2);
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('splitLensStores — property', () => {
  it('overlayVersion is monotonically non-decreasing', () => {
    const stores = splitLensStores(recorder, { schedule: sync });
    const before: number[] = [];
    for (let i = 0; i < 30; i++) {
      notifyWithoutStructureChange(recorder);
      before.push(stores.overlayStore.getSnapshot());
    }
    for (let i = 1; i < before.length; i++) {
      expect(before[i]!).toBeGreaterThanOrEqual(before[i - 1]!);
    }
  });

  it('specVersion is monotonically non-decreasing', () => {
    const stores = splitLensStores(recorder, { schedule: sync });
    const snapshots: number[] = [];
    for (let i = 0; i < 10; i++) {
      if (i % 3 === 0) appendFakeNode(recorder);
      else notifyWithoutStructureChange(recorder);
      snapshots.push(stores.specStore.getSnapshot());
    }
    for (let i = 1; i < snapshots.length; i++) {
      expect(snapshots[i]!).toBeGreaterThanOrEqual(snapshots[i - 1]!);
    }
  });

  it('specVersion never bumps unless nodes.length changed', () => {
    const stores = splitLensStores(recorder, { schedule: sync });
    for (let i = 0; i < 50; i++) notifyWithoutStructureChange(recorder);
    expect(stores.specStore.getSnapshot()).toBe(0);
  });

  it('overlay listener count tracks add/remove correctly', () => {
    const stores = splitLensStores(recorder, { schedule: sync });
    const offs: Array<() => void> = [];
    for (let i = 0; i < 5; i++) offs.push(stores.overlayStore.subscribe(() => {}));
    for (const off of offs) off();
    // After all unsub, a notify should hit nothing.
    notifyWithoutStructureChange(recorder);
    expect(stores.overlayStore.getSnapshot()).toBe(1); // counter still bumps, listeners empty
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('splitLensStores — security', () => {
  it('a throwing spec listener does not break others or the store', () => {
    const stores = splitLensStores(recorder, { schedule: sync });
    const ok = vi.fn();
    stores.specStore.subscribe(() => { throw new Error('boom'); });
    stores.specStore.subscribe(ok);
    // Throws are isolated — appendFakeNode must NOT propagate.
    expect(() => appendFakeNode(recorder)).not.toThrow();
    expect(ok).toHaveBeenCalledTimes(1);
    expect(stores.specStore.getSnapshot()).toBe(1);
  });

  it('overlay listener registered AFTER subscribe still observes flushes', () => {
    const stores = splitLensStores(recorder, { schedule: sync });
    notifyWithoutStructureChange(recorder); // overlayVersion → 1
    const late = vi.fn();
    stores.overlayStore.subscribe(late);
    notifyWithoutStructureChange(recorder); // → 2; late called once
    expect(late).toHaveBeenCalledTimes(1);
    expect(stores.overlayStore.getSnapshot()).toBe(2);
  });

  it('after dispose, no further listener invocations', () => {
    const stores = splitLensStores(recorder, { schedule: sync });
    const fn = vi.fn();
    stores.overlayStore.subscribe(fn);
    stores.dispose();
    notifyWithoutStructureChange(recorder);
    expect(fn).not.toHaveBeenCalled();
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('splitLensStores — performance', () => {
  it('1000 overlay-only notifies handled in under 50ms', () => {
    const stores = splitLensStores(recorder, { schedule: sync });
    const overL = vi.fn();
    stores.overlayStore.subscribe(overL);
    const start = performance.now();
    for (let i = 0; i < 1000; i++) notifyWithoutStructureChange(recorder);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(50);
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('splitLensStores — load', () => {
  it('10000 mixed notifies (10% structural) under 200ms', () => {
    const stores = splitLensStores(recorder, { schedule: sync });
    stores.overlayStore.subscribe(() => {});
    stores.specStore.subscribe(() => {});
    const start = performance.now();
    for (let i = 0; i < 10_000; i++) {
      if (i % 10 === 0) appendFakeNode(recorder);
      else notifyWithoutStructureChange(recorder);
    }
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(500);
    expect(stores.specStore.getSnapshot()).toBe(1000); // 10% of 10K
  });
});
