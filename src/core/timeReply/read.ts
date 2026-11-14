import { awaitingInputOf } from '../time/awaitingInput.js';
import { readAskMetadata, preflightAskArrays, askDataArray, ownAskData, AskMetadataError } from '../time/askMetadata.js';
import type { TimeReplyField, TimeReplyInput, TimeReplyReader, TimeReplyPairView, TimeReplyRequestView } from './types.js';
const own = ownAskData;
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
    // Preflight numeric fields/enum/label data before the native reader can traverse them.
    const rawFields = preflightAskArrays(request);
    own(request, 'context'); // The native reader receives an opaque own-data context, never an accessor.
    const pairs = askDataArray(reader(request as unknown as TimeReplyRequestView), 32) as readonly TimeReplyPairView[];
    if (pairs.length === 0) return { status: 'none' };
    const pairsById = new Set<string>();
    for (const pair of pairs) { pairsById.add(id(own(pair, 'range'))); pairsById.add(id(own(pair, 'correction'))); }
    const snapshot = readAskMetadata(request, field => pairsById.has(id(own(field, 'id'))));
    const fields = snapshot.fields;
    const allIds = new Set<string>();
    for (const field of rawFields) {
      const key = id(own(field, 'id'));
      if (allIds.has(key)) throw Error('ambiguous field');
      allIds.add(key);
    }
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
      requestId: id(snapshot.requestId), pairs: Object.freeze(projected), complete: used.size === rawFields.length }) };
  } catch (error) { return { status: 'unavailable', reason: error instanceof AskMetadataError && error.reason === 'presentation-limit'
    ? 'presentation-limit' : 'binding-unavailable' }; }
}
