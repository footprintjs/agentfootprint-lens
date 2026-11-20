import * as observe from 'agentfootprint/observe';
import { fitsContextShapeBudget } from './contextShapeBudget.js';

type ScalarKind = 'object' | 'string' | 'number' | 'boolean' | 'null';
type RecordedShape = readonly [ScalarKind | 'unknown'] | readonly ['array', number];
type Reader = (index: unknown, commitIdx: number, path: readonly string[]) => RecordedShape;

export type ContextValueShape = { readonly path: readonly string[] } & (
  | { readonly type: 'array'; readonly arrayLength: number }
  | { readonly type: ScalarKind; readonly arrayLength?: never }
);

/** Only a fact consistent with the state that Context actually folded may be displayed. */
function matchesFold(value: unknown, recorded: RecordedShape): boolean {
  if (value === 'REDACTED' || value === '[REDACTED]') return false;
  if (typeof value === 'number' && !Number.isFinite(value)) return false;
  if (Array.isArray(value)) return recorded[0] === 'array' && recorded[1] === value.length;
  if (value !== null && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    return recorded[0] === 'object' && (proto === null || proto === Object.prototype);
  }
  return recorded[0] === (value === null ? 'null' : typeof value);
}

/** Bind the producer's path reader to this publication and fold position. AgentFootprint 15
 * has the observe entry point but lacks this export. A new live publication gets a new reader. */
export function shapeReaderAt(snapshot: unknown, commitIdx: number, lookups: number) {
  const index = (snapshot as { contextShapes?: unknown } | null)?.contextShapes;
  const { contextShapeAt: read } = observe as { readonly contextShapeAt?: Reader };
  if (typeof read !== 'function' || !fitsContextShapeBudget(index, commitIdx, lookups)) return undefined;
  return (path: readonly string[], value: unknown): ContextValueShape | undefined => {
    const fact = read(index, commitIdx, path);
    if (fact[0] === 'unknown' || !matchesFold(value, fact)) return undefined;
    const address = Object.freeze([...path]);
    return fact[0] === 'array'
      ? Object.freeze({ path: address, type: fact[0], arrayLength: fact[1] })
      : Object.freeze({ path: address, type: fact[0] });
  };
}

/** Look up only the configured nested paths, without enumerating arrays or invoking getters. */
export function nestedArrayShapes(
  read: NonNullable<ReturnType<typeof shapeReaderAt>>,
  state: Readonly<Record<string, unknown>>,
  paths: readonly (readonly string[])[],
): ReadonlyMap<string, ContextValueShape[]> {
  const grouped = new Map<string, ContextValueShape[]>();
  const seen = new Set<string>();
  for (const path of paths) {
    if (path.length < 2) continue;
    const key = JSON.stringify(path);
    if (seen.has(key)) continue;
    seen.add(key);
    let value: unknown = state;
    for (const segment of path) {
      if (value === null || typeof value !== 'object') break;
      value = Object.getOwnPropertyDescriptor(value, segment)?.value;
    }
    if (!Array.isArray(value)) continue;
    const shape = read(path, value);
    if (!shape) continue;
    const group = grouped.get(path[0]);
    if (group) group.push(shape);
    else grouped.set(path[0], [shape]);
  }
  return grouped;
}
