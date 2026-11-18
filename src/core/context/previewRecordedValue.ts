import { recordedJsonScalar } from './recordedJsonScalar.js';

/** Compact JSON for a Context key cell. Full formatting belongs to its expanded view. */
const DISPLAY_LIMIT = 160;
const PREFIX_LENGTH = 157;
const SCAN_LIMIT = 256;

/** Even one-character entries take two characters each with separators. */
export function arrayExceedsPreview(length: number): boolean {
  return length * 2 + 1 > DISPLAY_LIMIT;
}

const escapes: Readonly<Record<string, string>> = {
  '"': '\\"', '\\': '\\\\', '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t',
};

export function previewRecordedValue(value: unknown): { text: string; truncated: boolean } {
  let text = '';
  let truncated = false;
  let scanned = 0;
  function append(part: string) {
    const room = DISPLAY_LIMIT - text.length;
    text += part.slice(0, room);
    if (part.length > room) truncated = true;
  }
  function quoted(word: string) {
    append('"');
    // Iteration is by code point. A lone surrogate, like a control character,
    // needs escaping in well-formed JSON. Never escape the whole string first.
    for (const ch of word) {
      if (truncated) return;
      const code = ch.charCodeAt(0);
      if (escapes[ch]) append(escapes[ch]);
      else if (code < 0x20 || (ch.length === 1 && code >= 0xd800 && code <= 0xdfff))
        append('\\u' + code.toString(16).padStart(4, '0'));
      else append(ch);
    }
    append('"');
  }
  function visit(value: unknown): void {
    if (truncated) return;
    const item = recordedJsonScalar(value);
    if (typeof item === 'string') return quoted(item);
    if (item === null || typeof item === 'boolean') return append(String(item));
    if (typeof item === 'number') return append(String(item));
    if (typeof item !== 'object') return;
    // Each nested container emits a delimiter before descending, so depth is
    // bounded by the character budget even for deeply nested or cyclic data.
    if (Array.isArray(item)) {
      append('[');
      for (let i = 0; i < item.length && !truncated; i++) {
        if (i) append(',');
        const entry = Object.getOwnPropertyDescriptor(item, i);
        if (entry && !('value' in entry)) { truncated = true; break; }
        const child = entry?.value;
        if (child === undefined || typeof child === 'function' || typeof child === 'symbol') append('null');
        else visit(child);
      }
      if (!truncated) append(']');
      return;
    }
    append('{');
    if (truncated) return;
    let first = true;
    // Avoid a userland array of every key. Engines may still enumerate a wide
    // object's names internally; we bound properties inspected and values read.
    for (const key in item) {
      if (truncated || ++scanned > SCAN_LIMIT) { truncated = true; break; }
      const entry = Object.getOwnPropertyDescriptor(item, key);
      if (!entry) continue;
      if (!('value' in entry)) { truncated = true; break; }
      const child = entry.value;
      if (child === undefined || typeof child === 'function' || typeof child === 'symbol') continue;
      if (!first) append(',');
      first = false;
      quoted(key);
      append(':');
      visit(child);
    }
    if (!truncated) append('}');
  }
  visit(value);
  if (!truncated) return { text, truncated };
  let prefix = text.slice(0, PREFIX_LENGTH);
  if (/[\uD800-\uDBFF]$/.test(prefix)) prefix = prefix.slice(0, -1);
  return { text: prefix + '…', truncated };
}
