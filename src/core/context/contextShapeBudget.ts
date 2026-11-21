/**
 * The v1 producer reader walks the index once per requested path. Admit the
 * whole set of annotations only when those walks fit this deterministic cap.
 * Charge a unit per frame and entry and two per address segment (validation
 * and comparison). Building the ordinary Context rows is independent of it.
 */
const MAX_SHAPE_WORK = 1_000_000;

function afterEntries(entries: unknown, remaining: number): number {
  if (!Array.isArray(entries) || entries.length > remaining) return -1;
  remaining -= entries.length;
  for (let i = 0; i < entries.length; i++) {
    const entry: unknown = entries[i];
    if (!Array.isArray(entry) || !Array.isArray(entry[0])) return -1;
    remaining -= 2 * entry[0].length;
    if (remaining < 0) return -1;
  }
  return remaining;
}

/** Inspect container sizes only. The published reader still validates which facts may be shown. */
export function fitsContextShapeBudget(index: unknown, commitIdx: number, lookups: number): boolean {
  if (!index || typeof index !== 'object' || lookups <= 0) return false;
  const { version, initial, changes } = index as { version?: unknown; initial?: unknown; changes?: unknown };
  if (version !== 1 || !Array.isArray(changes)) return false;
  // At the initial state the producer never traverses change frames. At any
  // later stop it visits each frame, but only reads entries through that stop.
  let remaining = Math.floor(MAX_SHAPE_WORK / lookups) - 1;
  if (commitIdx >= 0) remaining -= changes.length;
  remaining = afterEntries(initial, remaining);
  if (remaining < 0) return false;
  if (commitIdx < 0) return true;
  for (const frame of changes) {
    if (!Array.isArray(frame) || typeof frame[0] !== 'number') return false;
    if (frame[0] > commitIdx) continue;
    remaining = afterEntries(frame[1], remaining);
    if (remaining < 0) return false;
  }
  return true;
}
