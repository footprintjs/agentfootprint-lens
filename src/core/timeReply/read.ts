import { awaitingInputOf } from '../time/awaitingInput.js';
import type { TimeReplyField, TimeReplyInput, TimeReplyReader, TimeReplyPairView, TimeReplyRequestView } from './types.js';
const own = (value: unknown, key: string): unknown => {
  if (value === null || typeof value !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor && !('value' in descriptor)) throw Error('unreadable');
  return descriptor?.value;
};
const id = (value: unknown): string => {
  if (typeof value !== 'string' || !value.length || value.length > 512) throw Error('field');
  return value;
};
function field(raw: unknown): TimeReplyField {
  if (own(raw, 'type') !== 'string') throw Error('field');
  const values = own(raw, 'enum'); const labels = own(raw, 'labels');
  if (values !== undefined && (!Array.isArray(values) || values.length > 256)) throw Error('choices');
  if (labels !== undefined && (!Array.isArray(labels) || labels.length > 256)) throw Error('labels');
  const description = own(raw, 'description');
  return Object.freeze({ id: id(own(raw, 'id')),
    ...(typeof description === 'string' ? { description } : {}),
    choices: Object.freeze((values ?? []).map((value: unknown, index: number) => {
      if (typeof value !== 'string') throw Error('choice');
      const label = labels?.[index];
      return Object.freeze({ value, ...(typeof label === 'string' ? { label } : {}) });
    })),
  });
}

/** Call the injected native reader on the full request before any display filtering. */
export function readTimeReplyInput(value: unknown, reader?: TimeReplyReader): TimeReplyInput {
  if (reader === undefined) return { status: 'unchecked', reason: 'reader-missing' };
  const request = awaitingInputOf(value);
  if (request === undefined) return { status: 'unchecked', reason: 'request-unavailable' };
  try {
    const fields = own(request, 'fields');
    if (!Array.isArray(fields) || fields.length > 128) throw Error('fields');
    const pairs: readonly TimeReplyPairView[] = reader(request as unknown as TimeReplyRequestView);
    if (!Array.isArray(pairs) || pairs.length > 32) throw Error('pairs');
    if (pairs.length === 0) return { status: 'none' };
    const declarations = new Map<string, unknown>();
    for (const raw of fields) {
      const key = id(own(raw, 'id'));
      if (declarations.has(key)) throw Error('ambiguous field');
      declarations.set(key, raw);
    }
    const used = new Set<string>();
    const projected = pairs.map(pair => {
      const range = id(own(pair, 'range')); const correction = id(own(pair, 'correction'));
      if (used.has(range) || used.has(correction) || range === correction ||
          !declarations.has(range) || !declarations.has(correction)) throw Error('ambiguous pair');
      used.add(range); used.add(correction);
      // Roles come ONLY from the native reader; no suffix or reserved-context interpretation here.
      return Object.freeze({ range: field(declarations.get(range)), correction: field(declarations.get(correction)) });
    });
    return { status: 'ready', form: Object.freeze({ request: request as unknown as TimeReplyRequestView,
      requestId: id(own(request, 'requestId')), pairs: Object.freeze(projected), complete: used.size === fields.length }) };
  } catch { return { status: 'unavailable', reason: 'binding-unavailable' }; }
}
