/** Recorded findings at one stop, grouped by their current standing. */

interface SubjectShape {
  readonly kind: string;
  readonly id: string;
}

/** One assertion as the ledger carries it; `provenance` is the record's own `tool:<id>`. */
export interface AssertionShape {
  readonly subject: SubjectShape;
  readonly predicate: string;
  readonly value: unknown;
  readonly provenance?: string;
}

/** Where a standing was declared: on a later tool call (its id) or on the answer. */
export type DeclaredOnShape = { readonly toolCallId: string } | 'answer';

/** A standing row, as read: the result judged, its standing, what it carries. */
export interface StandingShape {
  readonly toolCallId: string;
  readonly toolName?: string;
  readonly standing: string;
  readonly assertions: readonly AssertionShape[];
  readonly settles?: string;
  readonly line?: string;
  /** The placement ticket's ref when the judged result was placed (0.62.0). */
  readonly ref?: string;
  /** The model's own flag that this result was the one it was after (0.62.0). */
  readonly sought?: true;
  /** Where the row was declared, as the record spells it (0.62.0). */
  readonly declaredOn?: DeclaredOnShape;
  /** The declaring iteration (0.62.0). */
  readonly iteration?: number;
  /** Set by the library when the id named no result in the previous batch (0.62.0). */
  readonly unknownId?: true;
}

export interface WitnessShape {
  readonly toolCallId: string;
  readonly subject: SubjectShape;
  readonly predicate: string;
}

/** A conflict row, as read: the shared key and the witnesses' identities. */
export interface ConflictShape {
  readonly key: string;
  readonly witnesses: readonly WitnessShape[];
}

/**
 * A witness as the band prints it: the row's identity plus `standing` — the
 * CURRENT standing of that result off the same fold (the last standing row
 * per `toolCallId`), the record's own word. Absent when no standing row
 * names the id; never inferred.
 */
export interface WitnessItem extends WitnessShape {
  readonly standing?: string;
}

/** One conflict row as the band prints it: the row's key, its witnesses stamped with where each stands now. */
export interface ConflictItem {
  readonly key: string;
  readonly witnesses: readonly WitnessItem[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function subjectOf(v: unknown): SubjectShape | undefined {
  if (!isRecord(v) || typeof v.kind !== 'string' || typeof v.id !== 'string') return undefined;
  return { kind: v.kind, id: v.id };
}

function assertionOf(v: unknown): AssertionShape | undefined {
  if (!isRecord(v) || typeof v.predicate !== 'string') return undefined;
  const subject = subjectOf(v.subject);
  if (subject === undefined) return undefined;
  return {
    subject,
    predicate: v.predicate,
    value: v.value,
    ...(typeof v.provenance === 'string' ? { provenance: v.provenance } : {}),
  };
}

function standingOf(row: unknown): StandingShape | undefined {
  if (!isRecord(row) || row.kind !== 'standing') return undefined;
  if (typeof row.toolCallId !== 'string' || typeof row.standing !== 'string') return undefined;
  const declaredOn = declaredOnOf(row.declaredOn);
  const assertions = Array.isArray(row.assertions)
    ? row.assertions.flatMap((a) => {
        const shaped = assertionOf(a);
        return shaped !== undefined ? [shaped] : [];
      })
    : [];
  return {
    toolCallId: row.toolCallId,
    standing: row.standing,
    assertions,
    ...(typeof row.toolName === 'string' ? { toolName: row.toolName } : {}),
    ...(typeof row.settles === 'string' ? { settles: row.settles } : {}),
    ...(typeof row.line === 'string' ? { line: row.line } : {}),
    ...(typeof row.ref === 'string' ? { ref: row.ref } : {}),
    ...(row.sought === true ? { sought: true } : {}),
    ...(declaredOn !== undefined ? { declaredOn } : {}),
    ...(typeof row.iteration === 'number' ? { iteration: row.iteration } : {}),
    ...(row.unknownId === true ? { unknownId: true } : {}),
  };
}

/** `declaredOn` as the record spells it: `'answer'` or `{ toolCallId }`; anything else is absent. */
function declaredOnOf(v: unknown): DeclaredOnShape | undefined {
  if (v === 'answer') return 'answer';
  if (isRecord(v) && typeof v.toolCallId === 'string') return { toolCallId: v.toolCallId };
  return undefined;
}

function witnessOf(v: unknown): WitnessShape | undefined {
  if (!isRecord(v) || typeof v.toolCallId !== 'string' || typeof v.predicate !== 'string') return undefined;
  const subject = subjectOf(v.subject);
  if (subject === undefined) return undefined;
  return { toolCallId: v.toolCallId, subject, predicate: v.predicate };
}

function conflictOf(row: unknown): ConflictShape | undefined {
  if (!isRecord(row) || row.kind !== 'conflict' || typeof row.key !== 'string') return undefined;
  if (!Array.isArray(row.witnesses)) return undefined;
  const witnesses = row.witnesses.flatMap((w) => {
    const shaped = witnessOf(w);
    return shaped !== undefined ? [shaped] : [];
  });
  return { key: row.key, witnesses };
}

/** The `toolCallId` of one `toolResults` entry, when the entry carries one. */
function resultIdOf(entry: unknown): string | undefined {
  return isRecord(entry) && typeof entry.toolCallId === 'string' ? entry.toolCallId : undefined;
}

// ─── The fold ─────────────────────────────────────────────────────────────

/** One stood-on assertion with the result it was declared about. */
export interface FactItem {
  readonly toolCallId: string;
  readonly assertion: AssertionShape;
}

export interface FindingsFold {
  /** How many rows the ledger holds at the stop — every kind, as committed. */
  readonly rows: number;
  /** The assertions of the CURRENT `fact` rows, in first-declared order. */
  readonly facts: readonly FactItem[];
  /**
   * Every `conflict` row on the record — the HISTORY of when each was first
   * seen, NOT the library's current set (`foldLedger(...).conflicts` is
   * recomputed from the current fact values; this fold does not re-derive
   * that algebra). Each witness carries the standing this fold holds for it
   * now, so a retired witness reads `ruled-out` here and in `ruledOut`.
   */
  readonly conflicts: readonly ConflictItem[];
  /** The current `open` rows. */
  readonly open: readonly StandingShape[];
  /** The current `ruled-out` rows. */
  readonly ruledOut: readonly StandingShape[];
  /** The ids of the results currently standing as `noise`. */
  readonly noise: readonly string[];
  /** The ids in `toolResults` with NO standing row — undeclared, never `open`. */
  readonly undeclared: readonly string[];
  /**
   * The CURRENT standing row per `toolCallId` — the last one written — in
   * first-declared order (0.62.0). The groups above are views of this map;
   * a reader that walks the calls one by one (`<ReasoningLens>`) asks it.
   */
  readonly standings: ReadonlyMap<string, StandingShape>;
}

/**
 * Fold the ledger's rows for reading. The LAST standing row per `toolCallId`
 * is the current one (the library's own rule); the conflict rows are kept AS
 * WRITTEN — the history of when each was first seen — with every witness
 * stamped with the standing this same fold holds for it now; a result in
 * `toolResults` no standing row names is undeclared. Pure; a row that does
 * not fit its kind's shape is passed over.
 */
export function foldFindings(rows: readonly unknown[], toolResults?: readonly unknown[]): FindingsFold {
  const standing = new Map<string, StandingShape>();
  const conflictRows: ConflictShape[] = [];
  for (const row of rows) {
    const s = standingOf(row);
    if (s !== undefined) {
      standing.set(s.toolCallId, s);
      continue;
    }
    const c = conflictOf(row);
    if (c !== undefined) conflictRows.push(c);
  }
  // Stamped AFTER the whole ledger is read: a witness's standing is the LAST
  // row about it, which may land after the conflict row that names it.
  const conflicts: ConflictItem[] = conflictRows.map((c) =>
    Object.freeze({
      key: c.key,
      witnesses: Object.freeze(
        c.witnesses.map((w) => {
          const now = standing.get(w.toolCallId)?.standing;
          return Object.freeze({ ...w, ...(now !== undefined ? { standing: now } : {}) });
        }),
      ),
    }),
  );
  const facts: FactItem[] = [];
  const open: StandingShape[] = [];
  const ruledOut: StandingShape[] = [];
  const noise: string[] = [];
  for (const s of standing.values()) {
    if (s.standing === 'fact') for (const assertion of s.assertions) facts.push({ toolCallId: s.toolCallId, assertion });
    else if (s.standing === 'open') open.push(s);
    else if (s.standing === 'ruled-out') ruledOut.push(s);
    else if (s.standing === 'noise') noise.push(s.toolCallId);
  }
  const undeclared: string[] = [];
  for (const entry of toolResults ?? []) {
    const id = resultIdOf(entry);
    if (id !== undefined && !standing.has(id)) undeclared.push(id);
  }
  return Object.freeze({
    rows: rows.length,
    facts: Object.freeze(facts),
    conflicts: Object.freeze(conflicts),
    open: Object.freeze(open),
    ruledOut: Object.freeze(ruledOut),
    noise: Object.freeze(noise),
    undeclared: Object.freeze(undeclared),
    standings: standing,
  });
}
