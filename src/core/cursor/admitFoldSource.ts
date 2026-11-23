import type { FoldSource } from 'foottrace';

const MAX_DEPTH = 64;
const MAX_VALUES = 1_000_000;

/**
 * Replay uses the native fold on detached plain recording data. Descriptor
 * reads let a damaged recording refuse the fold before a base or commit value
 * can invoke a getter. Preserve every admitted path and the original log order.
 */
export function admitFoldSource(base: object, commits: readonly unknown[]): FoldSource | undefined {
  let remaining = MAX_VALUES;
  const active = new WeakSet<object>();
  const copied = new WeakMap<object, object>();

  function copy(value: unknown, depth: number): unknown {
    if (--remaining < 0 || depth > MAX_DEPTH) throw Error('recording limit');
    if (value === null || value === undefined || typeof value === 'string' ||
        typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value !== 'object' || active.has(value)) throw Error('recording value');
    const prior = copied.get(value);
    if (prior !== undefined) return prior;
    const array = Array.isArray(value);
    const prototype: unknown = Object.getPrototypeOf(value);
    if ((!array && prototype !== Object.prototype && prototype !== null) ||
        (array && prototype !== Array.prototype)) throw Error('recording object');
    const keys = Object.keys(value);
    if (keys.length > remaining) throw Error('recording limit');
    const result: object = array ? [] : Object.create(null);
    active.add(value);
    for (const key of keys) {
      const slot = Object.getOwnPropertyDescriptor(value, key);
      if (slot === undefined || !('value' in slot)) throw Error('recording accessor');
      Object.defineProperty(result, key, {
        enumerable: true, configurable: true, writable: true, value: copy(slot.value, depth + 1),
      });
    }
    if (array) {
      const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
      if (typeof length !== 'number' || length > MAX_VALUES) throw Error('recording array');
      Object.defineProperty(result, 'length', { value: length });
    }
    active.delete(value);
    copied.set(value, result);
    return result;
  }

  try {
    return Object.freeze({
      initialState: copy(base, 0) as Record<string, unknown>,
      commitLog: Object.freeze(copy(commits, 0) as readonly unknown[]),
    });
  } catch {
    return undefined;
  }
}
