import { presentationBudget } from './ownJson.js';
import { ContextPresentationError, type RecordedContextView } from './types.js';

type Payload =
  | { readonly kind: 'piece'; readonly id: string }
  | { readonly kind: 'literal'; readonly value: null | boolean | number | string }
  | { readonly kind: 'array'; readonly items: readonly Payload[] }
  | { readonly kind: 'object'; readonly entries: readonly (readonly [string, Payload])[] };

/** A presentation tree, never an archive codec or a parser of user reference shapes. */
export function contextPayloads(view: RecordedContextView): {
  project(value: unknown): Payload;
  expand(value: Payload): unknown;
  format(value: unknown): string;
} {
  const budget = presentationBudget();
  let comparisonBytes = 64 * 1024 * 1024;
  const spelling = (value: unknown): string => {
    const result = JSON.stringify(value);
    if (result === undefined || result.length > comparisonBytes)
      throw new ContextPresentationError('presentation-limit');
    comparisonBytes -= new TextEncoder().encode(result).byteLength;
    if (comparisonBytes < 0) throw new ContextPresentationError('presentation-limit');
    return result;
  };
  const values = new Map(view.dictionary.map((piece) => [piece.id, piece.value]));
  const exact = new Map<string, string>();
  const shapes = new Set<string>();
  const shape = (value: object): string => JSON.stringify(Object.keys(value).sort());
  for (const piece of view.dictionary) {
    const key = spelling(piece.value);
    if (!exact.has(key)) exact.set(key, piece.id);
    if (piece.value !== null && typeof piece.value === 'object') shapes.add(shape(piece.value));
  }
  const visit = (value: unknown): Payload => {
    const object = value !== null && typeof value === 'object';
    const id = !object || shapes.has(shape(value)) ? exact.get(spelling(value)) : undefined;
    if (id !== undefined) return { kind: 'piece', id };
    if (Array.isArray(value)) return { kind: 'array', items: value.map(visit) };
    if (object) return { kind: 'object', entries: Object.entries(value).map(([key, item]) => [key, visit(item)]) };
    return { kind: 'literal', value: value as null | boolean | number | string };
  };
  const expand = (value: Payload): unknown => {
    switch (value.kind) {
      case 'piece': return values.get(value.id);
      case 'literal': return value.value;
      case 'array': return value.items.map(expand);
      case 'object': return Object.fromEntries(value.entries.map(([key, item]) => [key, expand(item)]));
    }
  };
  const print = (value: Payload, depth: number): string => {
    switch (value.kind) {
      case 'piece': return `⟦context ${JSON.stringify(value.id)}⟧`;
      case 'literal': return JSON.stringify(value.value);
      case 'array': return `[${value.items.map((item) => print(item, depth + 1)).join(', ')}]`;
      case 'object': return `{${value.entries.map(([key, item]) =>
        `\n${'  '.repeat(depth + 1)}${JSON.stringify(key)}: ${print(item, depth + 1)}`).join(',')}` +
        `${value.entries.length > 0 ? `\n${'  '.repeat(depth)}` : ''}}`;
    }
  };
  const project = (value: unknown): Payload => visit(budget.own(value));
  return { project, expand, format: (value) => print(project(value), 0) };
}
