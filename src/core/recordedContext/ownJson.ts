import { ContextPresentationError } from './types.js';

/** Deepest JSON nesting the owner admits for an ordinary value. */
export const MAX_DEPTH = 100;
/**
 * Most stages on one path from an execution tree's root, following `next` and
 * `children`. Only a tree place has a chain; everything else keeps MAX_DEPTH.
 */
export const MAX_STAGE_CHAIN = 1_000;

/** Leaf of an owned place: the value there is an execution tree (one stage node). */
export const STAGE_TREE = 'stage-tree' as const;
/**
 * Exact schema paths, from the owned value's root, that the owner reads as an
 * execution tree. A trie of own keys (a Map, so no inherited name can match);
 * a key that is not on it leaves the trie for good. A key named `next` is
 * never a tree by its name alone.
 */
export type OwnedPlace = typeof STAGE_TREE | ReadonlyMap<string, OwnedPlace>;

/** The trie for paths that each end at an execution tree. */
export function stageTreesAt(...paths: readonly (readonly string[])[]): OwnedPlace {
  type Level = Map<string, Level | typeof STAGE_TREE>;
  const root: Level = new Map();
  for (const path of paths) {
    if (!path.length) throw new Error('A stage tree place needs a path.');
    let level = root;
    for (let i = 0; i < path.length; i++) {
      const key = path[i]!, known = level.get(key);
      if (known === STAGE_TREE || (known !== undefined && i === path.length - 1))
        throw new Error('A stage tree place cannot contain another place.');
      if (i === path.length - 1) { level.set(key, STAGE_TREE); break; }
      const inner: Level = known ?? new Map();
      level.set(key, inner); level = inner;
    }
  }
  return root;
}

/** One budget shared by every value, not reset for each reference. */
export function presentationBudget(): { own(value: unknown, places?: OwnedPlace): unknown } {
  let nodes = 200_000;
  let bytes = 64 * 1024 * 1024;
  const active = new Set<object>();
  const text = (value: string): string => {
    if (value.length > bytes) throw new ContextPresentationError('presentation-limit');
    bytes -= new TextEncoder().encode(value).byteLength;
    if (bytes < 0) throw new ContextPresentationError('presentation-limit');
    return value;
  };
  /** The checks every owned container passes, in today's order; returns its own keys. */
  const container = (value: object, depth: number): readonly (string | symbol)[] => {
    if (--nodes < 0 || depth > MAX_DEPTH) throw new ContextPresentationError('presentation-limit');
    if (active.has(value)) throw new ContextPresentationError('invalid-context');
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (!array && prototype !== Object.prototype && prototype !== null)
      throw new ContextPresentationError('invalid-context');
    active.add(value);
    const keys = Reflect.ownKeys(value);
    if (array && keys.length !== value.length + 1) throw new ContextPresentationError('invalid-context');
    if (keys.length > nodes + 1) throw new ContextPresentationError('presentation-limit');
    return keys;
  };
  /** One own key's data value, admitted the way every key is. */
  const member = (value: object, key: string | symbol): unknown => {
    const array = Array.isArray(value);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor || !('value' in descriptor) || !descriptor.enumerable)
      throw new ContextPresentationError('invalid-context');
    if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))
      throw new ContextPresentationError('invalid-context');
    text(key);
    return descriptor.value;
  };
  const visit = (value: unknown, depth: number, place?: OwnedPlace): unknown => {
    if (place === STAGE_TREE && isRecord(value)) return stageTree(value, depth);
    if (typeof value !== 'object' || value === null) {
      if (--nodes < 0 || depth > MAX_DEPTH) throw new ContextPresentationError('presentation-limit');
      if (typeof value === 'string') return text(value);
      if (value === null || typeof value === 'boolean') return value;
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      throw new ContextPresentationError('invalid-context');
    }
    const keys = container(value, depth);
    const array = Array.isArray(value);
    const output: Record<string, unknown> | unknown[] = array ? [] : {};
    const inner = !array && place instanceof Map ? place : undefined;
    for (const key of keys) {
      if (array && key === 'length') continue;
      const item = member(value, key);
      Object.defineProperty(output, key, { value: visit(item, depth + 1, inner?.get(key as string)), enumerable: true });
    }
    if (array && output.length !== (value as unknown[]).length) throw new ContextPresentationError('invalid-context');
    active.delete(value);
    return Object.freeze(output);
  };
  /**
   * An execution tree, read with an explicit stack: depth counts inside one
   * stage and one level per `children` step, `next` adds none, and every
   * stage, array and value still spends the one node budget. A path of more
   * than MAX_STAGE_CHAIN stages is refused as the presentation limit. So the
   * owned tree's JSON nesting stays below MAX_DEPTH + MAX_STAGE_CHAIN.
   */
  const stageTree = (root: Record<string, unknown>, depth: number): unknown => {
    // A stage stays active until the whole tree is owned: a later stage that
    // reaches back to any earlier one is refused, as a cycle is.
    const stages: object[] = [];
    const owned = {};
    const pending: StageTask[] = [{ source: root, output: owned, depth, chain: 1 }];
    while (pending.length) {
      const stage = pending.pop()!;
      if (stage.chain > MAX_STAGE_CHAIN) throw new ContextPresentationError('presentation-limit');
      const keys = container(stage.source, stage.depth);
      stages.push(stage.source);
      const later: StageTask[] = [];
      for (const key of keys) {
        const item = member(stage.source, key);
        let value: unknown;
        if (key === 'next' && isRecord(item)) {
          value = {};
          later.push({ source: item, output: value as object, depth: stage.depth, chain: stage.chain + 1 });
        } else if (key === 'children' && Array.isArray(item)) {
          value = branches(item, stage.depth, stage.chain, later);
        } else {
          value = visit(item, stage.depth + 1);
        }
        Object.defineProperty(stage.output, key as string, { value, enumerable: true });
      }
      Object.freeze(stage.output);
      for (let i = later.length - 1; i >= 0; i--) pending.push(later[i]!);
    }
    for (const stage of stages) active.delete(stage);
    return owned;
  };
  /** A stage's `children` array: each stage element is one level below its parent stage. */
  const branches = (array: unknown[], depth: number, chain: number, later: StageTask[]): readonly unknown[] => {
    const keys = container(array, depth + 1);
    const output: unknown[] = [];
    for (const key of keys) {
      if (key === 'length') continue;
      const item = member(array, key);
      let value: unknown;
      if (isRecord(item)) {
        value = {};
        later.push({ source: item, output: value as object, depth: depth + 1, chain: chain + 1 });
      } else value = visit(item, depth + 2);
      Object.defineProperty(output, key as string, { value, enumerable: true });
    }
    if (output.length !== array.length) throw new ContextPresentationError('invalid-context');
    active.delete(array);
    return Object.freeze(output);
  };
  return { own: (value, places) => visit(value, 0, places) };
}

/** One stage waiting on the explicit stack, with its empty output already placed. */
interface StageTask {
  readonly source: Record<string, unknown>;
  readonly output: object;
  readonly depth: number;
  readonly chain: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
