import { recordedJsonScalar } from './recordedJsonScalar.js';

/** Context compares values as they appear in JSON, including object key order.
 * Folded values are detached by Foottrace. Identity alone cannot recognize an
 * equal rewrite, and serializing the two entire values allocates two strings. */
export function sameRecordedValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  const a = recordedJsonScalar(left);
  const b = recordedJsonScalar(right);
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!sameRecordedValue(a[i] ?? null, b[i] ?? null)) return false;
    }
    return true;
  }
  const first = a as Record<string, unknown>;
  const second = b as Record<string, unknown>;
  const secondKeys = Object.keys(second);
  let index = 0;
  for (const key of Object.keys(first)) {
    if (first[key] === undefined) continue;
    while (index < secondKeys.length && second[secondKeys[index]] === undefined) index++;
    if (secondKeys[index++] !== key || !sameRecordedValue(first[key], second[key])) return false;
  }
  while (index < secondKeys.length && second[secondKeys[index]] === undefined) index++;
  return index === secondKeys.length;
}
