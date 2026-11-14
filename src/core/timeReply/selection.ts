import type { TimeReplyForm } from './types.js';
export type TimeReplyValues = Readonly<Record<string, string>>;
/** UI completeness only. The native decoder still classifies and validates the answer. */
export function selectedTimeReply(form: TimeReplyForm, values: TimeReplyValues):
  { readonly requestId: string; readonly values: Readonly<Record<string, string>> } | undefined {
  try {
    if (!form.complete) return undefined;
    const allowed = new Set(form.pairs.flatMap(pair => [pair.range.id, pair.correction.id]));
    for (const key of Reflect.ownKeys(values)) {
      if (typeof key !== 'string' || !allowed.has(key)) return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(values, key);
      if (!descriptor?.enumerable || !('value' in descriptor) ||
          typeof descriptor.value !== 'string' || descriptor.value.length === 0) return undefined;
    }
    const entries: [string, string][] = [];
    for (const pair of form.pairs) {
      const read = (id: string): unknown => {
        const descriptor = Object.getOwnPropertyDescriptor(values, id);
        if (descriptor && !('value' in descriptor)) throw Error('value');
        return descriptor?.value;
      };
      const range = read(pair.range.id); const correction = read(pair.correction.id);
      const hasRange = typeof range === 'string' && range.length > 0;
      const hasCorrection = typeof correction === 'string' && correction.length > 0;
      if (hasRange === hasCorrection) return undefined;
      if (hasRange) {
        if (!pair.range.choices.some(choice => choice.value === range)) return undefined;
        entries.push([pair.range.id, range]);
      } else entries.push([pair.correction.id, correction as string]);
    }
    return Object.freeze({ requestId: form.requestId, values: Object.freeze(Object.fromEntries(entries)) });
  } catch { return undefined; }
}
