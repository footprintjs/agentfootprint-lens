/** Shared own-data metadata admission for the inspector and native-reader controls. */
const failures = new WeakMap<object, 'unreadable' | 'presentation-limit'>();
export class AskMetadataError extends Error {
  constructor(readonly reason: 'unreadable' | 'presentation-limit') {
    super('time-question-unavailable');
    this.name = 'AskMetadataError';
    failures.set(this, reason);
  }
}
/** WeakMap identity reads never reflect on an arbitrary thrown Proxy, including a revoked one. */
export function askMetadataFailureReason(error: unknown): 'unreadable' | 'presentation-limit' | undefined {
  return failures.get(error as object);
}
function normalizedFailure(error: unknown): AskMetadataError {
  return failures.has(error as object) ? error as AskMetadataError : new AskMetadataError('unreadable');
}
function ownData(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor && !('value' in descriptor)) throw new AskMetadataError('unreadable');
  return descriptor?.value;
}
/** Normalize hostile descriptor failures without exposing their exception text. */
export function ownAskData(value: unknown, key: string): unknown {
  try { return ownData(value, key); }
  catch (error) { throw normalizedFailure(error); }
}
/** Dense ordinary arrays only: never invoke input iterators, methods or numeric accessors. */
function denseDataArray(value: unknown, max: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new AskMetadataError('unreadable');
  const length = ownAskData(value, 'length');
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) throw new AskMetadataError('unreadable');
  if (length > max) throw new AskMetadataError('presentation-limit');
  if (Reflect.ownKeys(value).length !== length + 1) throw new AskMetadataError('unreadable');
  const result: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) throw new AskMetadataError('unreadable');
    result.push(descriptor.value);
  }
  return Object.freeze(result);
}

export function askDataArray(value: unknown, max: number): readonly unknown[] {
  try { return denseDataArray(value, max); }
  catch (error) { throw normalizedFailure(error); }
}

export interface AskMetadata {
  readonly requestId?: string;
  readonly question?: string;
  readonly fields: readonly Readonly<Record<string, unknown>>[];
  readonly missing: readonly string[];
  readonly refused?: { readonly reason?: string; readonly answer?: Readonly<Record<string, string | number | boolean>> };
  readonly repeat?: { readonly count?: number };
}
/** Validate all array descriptors before the original request reaches a native reader. */
export function preflightAskArrays(request: unknown): readonly unknown[] {
  const fields = askDataArray(ownAskData(request, 'fields'), 128);
  for (const field of fields) {
    if (field === null || typeof field !== 'object' || Array.isArray(field)) throw new AskMetadataError('unreadable');
    for (const key of ['enum', 'labels']) {
      const value = ownAskData(field, key);
      if (value !== undefined) askDataArray(value, 256);
    }
  }
  return fields;
}

/** One 4 MiB string/key budget per metadata read; no truncation or reserved-context interpretation. */
function snapshotAskMetadata(request: unknown, include: (field: unknown) => boolean): AskMetadata {
  let left = 4 * 1024 * 1024;
  const text = (value: unknown): string => {
    if (typeof value !== 'string') throw new AskMetadataError('unreadable');
    if (value.length > left) throw new AskMetadataError('presentation-limit');
    left -= new TextEncoder().encode(value).byteLength;
    if (left < 0) throw new AskMetadataError('presentation-limit');
    return value;
  };
  const optionalText = (value: unknown): string | undefined => value === undefined ? undefined : text(value);
  const scalar = (value: unknown): string | number | boolean => {
    if (typeof value === 'string') return text(value);
    if (typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
    throw new AskMetadataError('unreadable');
  };
  const fields = preflightAskArrays(request).filter(include).map(raw => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new AskMetadataError('unreadable');
    const entries: [string, unknown][] = [];
    for (const key of ['id', 'type', 'format', 'description']) {
      const value = ownAskData(raw, key); if (value !== undefined) entries.push([key, text(value)]);
    }
    for (const key of ['required', 'strict']) {
      const value = ownAskData(raw, key);
      if (value !== undefined && typeof value !== 'boolean') throw new AskMetadataError('unreadable');
      if (value !== undefined) entries.push([key, value]);
    }
    const values = ownAskData(raw, 'enum'); const labels = ownAskData(raw, 'labels');
    if (values !== undefined) entries.push(['enum', Object.freeze(askDataArray(values, 256).map(scalar))]);
    if (labels !== undefined) entries.push(['labels', Object.freeze(askDataArray(labels, 256).map(text))]);
    return Object.freeze(Object.fromEntries(entries));
  });
  const rawMissing = ownAskData(request, 'missing');
  const missing = rawMissing === undefined ? [] : askDataArray(rawMissing, 128).map(text);
  const rawRefused = ownAskData(request, 'refused');
  let refused: AskMetadata['refused'];
  if (rawRefused !== undefined) {
    if (rawRefused === null || typeof rawRefused !== 'object' || Array.isArray(rawRefused)) throw new AskMetadataError('unreadable');
    const rawAnswer = ownAskData(rawRefused, 'answer');
    let answer: Readonly<Record<string, string | number | boolean>> | undefined;
    if (rawAnswer !== undefined) {
      if (rawAnswer === null || typeof rawAnswer !== 'object' || Array.isArray(rawAnswer)) throw new AskMetadataError('unreadable');
      const keys = Reflect.ownKeys(rawAnswer);
      if (keys.length > 128) throw new AskMetadataError('presentation-limit');
      const entries: [string, string | number | boolean][] = [];
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(rawAnswer, key);
        if (!descriptor?.enumerable) continue;
        if (typeof key !== 'string' || !('value' in descriptor)) throw new AskMetadataError('unreadable');
        entries.push([text(key), scalar(descriptor.value)]);
      }
      if (entries.length) answer = Object.freeze(Object.fromEntries(entries));
    }
    refused = Object.freeze({ reason: optionalText(ownAskData(rawRefused, 'reason')),
      ...(answer !== undefined ? { answer } : {}) });
  }
  const rawRepeat = ownAskData(request, 'repeat');
  const count = ownAskData(rawRepeat, 'count');
  if (count !== undefined && (typeof count !== 'number' || !Number.isFinite(count))) throw new AskMetadataError('unreadable');
  return Object.freeze({ requestId: optionalText(ownAskData(request, 'requestId')),
    question: optionalText(ownAskData(request, 'question')), fields: Object.freeze(fields), missing: Object.freeze(missing),
    ...(refused !== undefined ? { refused } : {}), ...(rawRepeat !== undefined ? { repeat: Object.freeze({ count: count as number | undefined }) } : {}) });
}

/** Public-to-this-layer boundary: even Proxy failures keep payload-free diagnostics. */
export function readAskMetadata(request: unknown, include: (field: unknown) => boolean = () => true): AskMetadata {
  try { return snapshotAskMetadata(request, include); }
  catch (error) { throw normalizedFailure(error); }
}
