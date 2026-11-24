import { own } from '../cursor/sourcePosition.js';

/**
 * AgentFootprint 16 records four unsigned 32-bit words and the batch ordinal.
 * An unreadable new identity cannot fall back to the provider’s legacy ID.
 */
export function readCallOccurrence(payload: object): string | null | undefined {
  const slot = Object.getOwnPropertyDescriptor(payload, 'callOccurrenceKey');
  if (slot === undefined) return undefined;
  const key = slot.value;
  if (!Array.isArray(key) || own(key, 'length') !== 5) return null;
  const words: number[] = [];
  for (let index = 0; index < 5; index++) {
    const value = own(key, String(index));
    const max = index < 4 ? 0xffff_ffff : Number.MAX_SAFE_INTEGER;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) return null;
    words.push(value);
  }
  return words.join('.');
}
