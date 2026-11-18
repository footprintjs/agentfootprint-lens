/** A fact recorded about one state path. Segment arrays preserve literal dots in keys. */
export type ContextValueShape = { readonly path: readonly string[] } & (
  | { readonly type: 'array'; readonly arrayLength: number }
  | { readonly type: 'object' | 'string' | 'number' | 'boolean' | 'null'; readonly arrayLength?: never }
);

export interface ContextValueShapes {
  get(path: readonly string[]): ContextValueShape | undefined;
  values(): IterableIterator<ContextValueShape>;
}

/** A full Context view has both the value and the metadata. Suppress a stale
 * or contradictory fact using only the addressed path and the array length. */
export function matchesFold(state: Readonly<Record<string, unknown>>, shape: ContextValueShape): boolean {
  let value: unknown = state;
  for (const segment of shape.path) {
    if (value === null || typeof value !== 'object') return false;
    const field = Object.getOwnPropertyDescriptor(value, segment);
    if (!field || !('value' in field)) return false;
    value = field.value;
  }
  if (Array.isArray(value)) return shape.type === 'array' && value.length === shape.arrayLength;
  return shape.type === (value === null ? 'null' : typeof value);
}

type Wire = { version?: unknown; initial?: unknown; changes?: unknown };

function apply(entries: unknown, shapes: Map<string, ContextValueShape>): boolean {
  if (!Array.isArray(entries)) return false;
  for (const entry of entries) {
    if (!Array.isArray(entry)) return false;
    const [path, type, length] = entry;
    if (!Array.isArray(path) || !path.length) return false;
    for (const segment of path) if (typeof segment !== 'string') return false;
    if (entry.length !== (type === 'array' ? 3 : 2)) return false;
    const key = JSON.stringify(path);
    if (type === 'deleted' || type === 'unknown') {
      shapes.delete(key);
      continue;
    }
    if (type === 'array') {
      if (!Number.isSafeInteger(length) || length < 0 || length > 0xffffffff) return false;
    } else if (type !== 'object' && type !== 'string' && type !== 'number' && type !== 'boolean' && type !== 'null') {
      return false;
    }
    const address = Object.freeze([...path]);
    const fact = type === 'array' ? { path: address, type, arrayLength: length } : { path: address, type };
    shapes.set(key, Object.freeze(fact));
  }
  return true;
}

/**
 * Recorded shapes at a root-log commit, or the initial shapes at -1.
 * This reads only the versioned metadata on this snapshot. A metadata-only
 * consumer can use it before fetching the corresponding values or events.
 * Absent/invalid metadata has no answer. A missing path also has no answer.
 */
export function contextValueShapesAt(snapshot: unknown, commitIdx: number): ContextValueShapes | undefined {
  const wire = (snapshot as { contextShapes?: Wire } | null)?.contextShapes;
  if (wire?.version !== 1 || !Array.isArray(wire.changes) || !Number.isSafeInteger(commitIdx)) return undefined;
  const shapes = new Map<string, ContextValueShape>();
  if (!apply(wire.initial, shapes)) return undefined;
  let last = -1;
  for (let i = 0; last < commitIdx && i < wire.changes.length; i++) {
    const frame = wire.changes[i];
    if (!Array.isArray(frame)) return undefined;
    const index = frame[0];
    if (!Number.isSafeInteger(index) || index <= last) return undefined;
    if (index > commitIdx) break;
    if (frame.length !== 2 || !apply(frame[1], shapes)) return undefined;
    last = index;
  }
  return Object.freeze({
    get: (path: readonly string[]) => shapes.get(JSON.stringify(path)),
    values: () => shapes.values(),
  });
}
