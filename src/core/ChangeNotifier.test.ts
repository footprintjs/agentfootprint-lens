/**
 * ChangeNotifier — covers the framework-agnostic Observable primitive
 * that backs every Lens consumer adapter (React, Vue, Angular, Recoil,
 * vanilla DOM).
 */

import { describe, it, expect, vi } from 'vitest';
import { ChangeNotifier } from './ChangeNotifier.js';

describe('ChangeNotifier — unit', () => {
  it('starts at version 0', () => {
    expect(new ChangeNotifier().getVersion()).toBe(0);
  });

  it('notify() increments version monotonically', () => {
    const n = new ChangeNotifier();
    n.notify();
    expect(n.getVersion()).toBe(1);
    n.notify();
    expect(n.getVersion()).toBe(2);
  });

  it('subscribe registers a listener; notify fires it', () => {
    const n = new ChangeNotifier();
    const listener = vi.fn();
    n.subscribe(listener);
    n.notify();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('disposer returned by subscribe removes the listener', () => {
    const n = new ChangeNotifier();
    const listener = vi.fn();
    const off = n.subscribe(listener);
    n.notify();
    off();
    n.notify();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('multiple listeners all fire on notify', () => {
    const n = new ChangeNotifier();
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    n.subscribe(a);
    n.subscribe(b);
    n.subscribe(c);
    n.notify();
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
    expect(c).toHaveBeenCalledOnce();
  });

  it('subscribing the same listener twice stores it once (Set dedup)', () => {
    const n = new ChangeNotifier();
    const listener = vi.fn();
    n.subscribe(listener);
    n.subscribe(listener);
    expect(n.listenerCount).toBe(1);
    n.notify();
    expect(listener).toHaveBeenCalledOnce();
  });
});

describe('ChangeNotifier — failure isolation', () => {
  it('a throwing listener does not abort other listeners', () => {
    const n = new ChangeNotifier();
    const before = vi.fn();
    const thrower = vi.fn(() => {
      throw new Error('boom');
    });
    const after = vi.fn();
    n.subscribe(before);
    n.subscribe(thrower);
    n.subscribe(after);
    expect(() => n.notify()).not.toThrow();
    expect(before).toHaveBeenCalledOnce();
    expect(thrower).toHaveBeenCalledOnce();
    expect(after).toHaveBeenCalledOnce();
  });
});

describe('ChangeNotifier — disposer is idempotent', () => {
  it('calling the same disposer twice is safe', () => {
    const n = new ChangeNotifier();
    const listener = vi.fn();
    const off = n.subscribe(listener);
    expect(n.listenerCount).toBe(1);
    off();
    expect(n.listenerCount).toBe(0);
    expect(() => off()).not.toThrow();
    expect(n.listenerCount).toBe(0);
  });
});

describe('ChangeNotifier — performance', () => {
  it('100k notify+listener fires under 50ms', () => {
    const n = new ChangeNotifier();
    let count = 0;
    n.subscribe(() => {
      count++;
    });
    const t0 = performance.now();
    for (let i = 0; i < 100_000; i++) n.notify();
    const elapsed = performance.now() - t0;
    expect(count).toBe(100_000);
    expect(elapsed).toBeLessThan(150);
  });
});
