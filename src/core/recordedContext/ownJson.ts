import { ContextPresentationError } from './types.js';

/** One budget shared by every value, not reset for each reference. */
export function presentationBudget(): { own(value: unknown): unknown } {
  let nodes = 200_000;
  let bytes = 64 * 1024 * 1024;
  const active = new Set<object>();
  const text = (value: string): string => {
    if (value.length > bytes) throw new ContextPresentationError('presentation-limit');
    bytes -= new TextEncoder().encode(value).byteLength;
    if (bytes < 0) throw new ContextPresentationError('presentation-limit');
    return value;
  };
  const visit = (value: unknown, depth: number): unknown => {
    if (--nodes < 0 || depth > 100) throw new ContextPresentationError('presentation-limit');
    if (typeof value === 'string') return text(value);
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'object' || value === null || active.has(value))
      throw new ContextPresentationError('invalid-context');
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (!array && prototype !== Object.prototype && prototype !== null)
      throw new ContextPresentationError('invalid-context');
    active.add(value);
    const output: Record<string, unknown> | unknown[] = array ? [] : {};
    const keys = Reflect.ownKeys(value);
    if (array && keys.length !== value.length + 1) throw new ContextPresentationError('invalid-context');
    if (keys.length > nodes + 1) throw new ContextPresentationError('presentation-limit');
    for (const key of keys) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== 'string' || !descriptor || !('value' in descriptor) || !descriptor.enumerable)
        throw new ContextPresentationError('invalid-context');
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))
        throw new ContextPresentationError('invalid-context');
      text(key);
      Object.defineProperty(output, key, { value: visit(descriptor.value, depth + 1), enumerable: true });
    }
    if (array && output.length !== value.length) throw new ContextPresentationError('invalid-context');
    active.delete(value);
    return Object.freeze(output);
  };
  return { own: (value) => visit(value, 0) };
}
