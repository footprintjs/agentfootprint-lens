/** Recorded coverage declarations and their merged, first-seen boundary. */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** One piece of ground as the record carries it: the author's `what`, and its `why` when written. */
export interface CoverageItemShape {
  readonly what: string;
  readonly why?: string;
}

/** The three lists of one declaration, by the record's own field names. */
export type CoverageSection = 'checked' | 'notChecked' | 'cannotCover';

/** One `DeclaredCoverage` row, as read: the call it came from and its three lists. */
export interface DeclaredCoverageShape {
  /** The record's own word — `absence` or `ledger` on a 9.109 record; printed, never mapped. */
  readonly kind: string;
  readonly toolName: string;
  readonly toolCallId?: string;
  readonly iteration: number;
  /** What the search was for — an absence carries it. */
  readonly lookedFor?: string;
  readonly checked: readonly CoverageItemShape[];
  readonly notChecked: readonly CoverageItemShape[];
  readonly cannotCover: readonly CoverageItemShape[];
}

function itemOf(v: unknown): CoverageItemShape | undefined {
  if (!isRecord(v) || typeof v.what !== 'string' || v.what.length === 0) return undefined;
  return Object.freeze({ what: v.what, ...(typeof v.why === 'string' ? { why: v.why } : {}) });
}

/** A list as the record carries it: absent reads as empty; a value that is not an array does not fit. */
function listOf(v: unknown): readonly CoverageItemShape[] | undefined {
  if (v === undefined) return Object.freeze([]);
  if (!Array.isArray(v)) return undefined;
  return Object.freeze(
    v.flatMap((entry) => {
      const item = itemOf(entry);
      return item !== undefined ? [item] : [];
    }),
  );
}

/** Narrow one row of `coverageDeclared` to the shape the band draws; anything else is nothing. */
export function coverageRecordOf(value: unknown): DeclaredCoverageShape | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.kind !== 'string' || value.kind.length === 0) return undefined;
  if (typeof value.toolName !== 'string' || typeof value.iteration !== 'number') return undefined;
  const checked = listOf(value.checked);
  const notChecked = listOf(value.notChecked);
  const cannotCover = listOf(value.cannotCover);
  if (checked === undefined || notChecked === undefined || cannotCover === undefined) return undefined;
  return Object.freeze({
    kind: value.kind,
    toolName: value.toolName,
    iteration: value.iteration,
    ...(typeof value.toolCallId === 'string' ? { toolCallId: value.toolCallId } : {}),
    ...(typeof value.lookedFor === 'string' ? { lookedFor: value.lookedFor } : {}),
    checked,
    notChecked,
    cannotCover,
  });
}

// ─── The fold ─────────────────────────────────────────────────────────────

/**
 * The library's own equality, copied byte for byte from `agentfootprint ·
 * coverage/items.ts · sameItem`: two entries are the same ground when they
 * say the same two things. Not an equality of this file's own.
 */
export function sameItem(a: CoverageItemShape, b: CoverageItemShape): boolean {
  return a.what === b.what && (a.why ?? '') === (b.why ?? '');
}

/** One merged entry: the ground, and the tools that declared it, in landed order. */
export interface BoundaryItem extends CoverageItemShape {
  readonly declaredBy: readonly string[];
}

/** The merged view — the three sections the appended block carried, in its order. */
export interface CoverageBoundary {
  readonly checked: readonly BoundaryItem[];
  readonly notChecked: readonly BoundaryItem[];
  readonly cannotCover: readonly BoundaryItem[];
}

export interface CoverageFold {
  readonly boundary: CoverageBoundary;
  /** Every well-formed declaration, in landed order — no dedupe across calls. */
  readonly calls: readonly DeclaredCoverageShape[];
}

/** Merge one section across the calls the way the append merges it (`mergeItems`), keeping who declared each entry. */
function mergeSection(calls: readonly DeclaredCoverageShape[], section: CoverageSection): readonly BoundaryItem[] {
  type Entry = { item: CoverageItemShape; declarers: Set<string> };
  const byWhat = new Map<string, Map<string, Entry>>();
  const ordered: Entry[] = [];
  for (const call of calls) {
    for (const item of call[section]) {
      let reasons = byWhat.get(item.what);
      if (reasons === undefined) {
        reasons = new Map();
        byWhat.set(item.what, reasons);
      }
      const reason = item.why ?? ''; // sameItem treats an omitted reason as empty.
      let entry = reasons.get(reason);
      if (entry === undefined) {
        entry = { item, declarers: new Set() };
        reasons.set(reason, entry);
        ordered.push(entry);
      }
      entry.declarers.add(call.toolName);
    }
  }
  return Object.freeze(ordered.map(({ item, declarers }) =>
    Object.freeze({ ...item, declaredBy: Object.freeze([...declarers]) }),
  ));
}

/**
 * Fold the rows for reading: the boundary (each section merged across the
 * calls in landed order, deduped by `sameItem`, every entry stamped with the
 * tools that declared it) and the calls themselves. Pure; a row that does
 * not fit the shape is passed over.
 */
export function foldCoverage(rows: readonly unknown[]): CoverageFold {
  const calls = Object.freeze(
    rows.flatMap((row) => {
      const call = coverageRecordOf(row);
      return call !== undefined ? [call] : [];
    }),
  );
  return Object.freeze({
    boundary: Object.freeze({
      checked: mergeSection(calls, 'checked'),
      notChecked: mergeSection(calls, 'notChecked'),
      cannotCover: mergeSection(calls, 'cannotCover'),
    }),
    calls,
  });
}
