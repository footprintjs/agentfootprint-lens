import type { ContextAt } from './contextAt.js';
import { foldFindings, type DeclaredOnShape, type FindingsFold, type StandingShape } from './findings.js';
import { ontologyRecordOf, foldOntology } from './ontology.js';

// ─── The row shapes this view reads beyond the band's ────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** One carrier of a contingent value: the result, and the standing it held. */
export interface CarrierShape {
  readonly toolCallId: string;
  readonly standing: string;
}

/** A `contingent` row, as read: who used the value, the value, every carrier. */
export interface ContingentShape {
  readonly declaredOn: DeclaredOnShape;
  readonly value: string;
  readonly carriers: readonly CarrierShape[];
  readonly iteration?: number;
}

function declaredOnOf(v: unknown): DeclaredOnShape | undefined {
  if (v === 'answer') return 'answer';
  if (isRecord(v) && typeof v.toolCallId === 'string') return { toolCallId: v.toolCallId };
  return undefined;
}

function carrierOf(v: unknown): CarrierShape | undefined {
  if (!isRecord(v) || typeof v.toolCallId !== 'string' || typeof v.standing !== 'string') return undefined;
  return { toolCallId: v.toolCallId, standing: v.standing };
}

function contingentOf(row: unknown): ContingentShape | undefined {
  if (!isRecord(row) || row.kind !== 'contingent' || typeof row.value !== 'string') return undefined;
  const declaredOn = declaredOnOf(row.declaredOn);
  if (declaredOn === undefined || !Array.isArray(row.carriers)) return undefined;
  const carriers = row.carriers.flatMap((c) => {
    const shaped = carrierOf(c);
    return shaped !== undefined ? [shaped] : [];
  });
  return {
    declaredOn,
    value: row.value,
    carriers,
    ...(typeof row.iteration === 'number' ? { iteration: row.iteration } : {}),
  };
}

/** A `judgment` row, as read: the result and the standing the judge gave it. */
interface JudgmentShape {
  readonly toolCallId: string;
  readonly standing: string;
}

function judgmentOf(row: unknown): JudgmentShape | undefined {
  if (!isRecord(row) || row.kind !== 'judgment' || row.source !== 'judge') return undefined;
  if (typeof row.toolCallId !== 'string' || typeof row.standing !== 'string') return undefined;
  return { toolCallId: row.toolCallId, standing: row.standing };
}

/** A basis row, as read here: the call and, when the row carries it, the tool and the basis word. */
interface BasisShape {
  readonly toolCallId: string;
  readonly toolName?: string;
  readonly basis?: string;
}

function basisOf(row: unknown): BasisShape | undefined {
  if (!isRecord(row) || row.kind !== 'basis' || typeof row.toolCallId !== 'string') return undefined;
  return {
    toolCallId: row.toolCallId,
    ...(typeof row.toolName === 'string' ? { toolName: row.toolName } : {}),
    ...(typeof row.basis === 'string' ? { basis: row.basis } : {}),
  };
}

/** `unsupportedValues.values[].value`, as read; absent when the key does not fit. */
function unsupportedOf(value: unknown): readonly string[] | undefined {
  if (!isRecord(value) || !Array.isArray(value.values)) return undefined;
  return value.values.flatMap((v) => (isRecord(v) && typeof v.value === 'string' ? [v.value] : []));
}

/** The tool each result on the record was produced by: `history`'s tool messages, then the batch. */
function toolNamesById(history: readonly unknown[] | undefined, toolResults: readonly unknown[] | undefined): ReadonlyMap<string, string | undefined> {
  const out = new Map<string, string | undefined>();
  for (const m of history ?? []) {
    if (isRecord(m) && m.role === 'tool' && typeof m.toolCallId === 'string' && !out.has(m.toolCallId)) {
      out.set(m.toolCallId, typeof m.toolName === 'string' ? m.toolName : undefined);
    }
  }
  for (const r of toolResults ?? []) {
    if (isRecord(r) && typeof r.toolCallId === 'string' && !out.has(r.toolCallId)) {
      out.set(r.toolCallId, typeof r.toolName === 'string' ? r.toolName : undefined);
    }
  }
  return out;
}

// ─── The fold ──────────────────────────────────────────────────────────────

/** One tool call as the map draws it. */
export interface ProofCall {
  readonly toolCallId: string;
  readonly toolName?: string;
  /** The basis row's word, when the row carries it. */
  readonly basis?: string;
  /** The CURRENT standing row about this result; absent = undeclared. */
  readonly standing?: StandingShape;
  /** The judge's standing (the last `judgment` row about this result), when one exists. */
  readonly judged?: string;
  /** The keys of the conflict rows naming this result as a witness. */
  readonly conflicts: readonly string[];
}

/** The answer node: what the model declared on it, what it used contingently, what nothing carried. */
export interface ProofAnswer {
  /** The results whose standing was declared on the answer, in ledger order. */
  readonly standsOn: readonly StandingShape[];
  /** The contingent rows declared on the answer. */
  readonly contingent: readonly ContingentShape[];
  /** `unsupportedValues.values[].value`, when the gate wrote the key. */
  readonly unsupported: readonly string[];
}

/** One source of the declared map, with the tools the map says read it. */
export interface ProofSource {
  readonly id: string;
  readonly meaning: string;
  /** The `via` names, sorted, that name a tool in the map's tools column. */
  readonly tools: readonly string[];
}

export interface ProofFold {
  /** Present once a standing, a contingent row or an unsupported value names the answer. */
  readonly answer?: ProofAnswer;
  /** Every call, in ledger order (basis rows), then the results the ledger never named. */
  readonly calls: readonly ProofCall[];
  /** Every distinct tool name among the calls, sorted. */
  readonly tools: readonly string[];
  /** The declared map's sources, sorted by id; absent when no map was declared. */
  readonly sources?: readonly ProofSource[];
  /** Every `contingent` row on the record, in ledger order. */
  readonly contingent: readonly ContingentShape[];
  /** The band's fold, which this one stands on (its conflicts are the edges). */
  readonly findings: FindingsFold;
}

export interface ProofMapInput {
  /** The ledger as the fold holds it at the stop (`findingsLedger`). */
  readonly rows: readonly unknown[];
  /** The state's `toolResults` at the same stop. */
  readonly toolResults?: readonly unknown[];
  /** The state's `history` at the same stop — the tool messages name each result's tool. */
  readonly history?: readonly unknown[];
  /** The run constant `ontology`, when the record carries it. */
  readonly ontology?: unknown;
  /** The state's `unsupportedValues`, when the gate wrote it. */
  readonly unsupportedValues?: unknown;
}

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The calls in ledger order, then every result on the record the ledger never named. */
function callsOf(rows: readonly unknown[], names: ReadonlyMap<string, string | undefined>, findings: FindingsFold, judged: ReadonlyMap<string, string>): ProofCall[] {
  const witnessed = new Map<string, string[]>();
  for (const c of findings.conflicts) {
    for (const w of c.witnesses) witnessed.set(w.toolCallId, [...(witnessed.get(w.toolCallId) ?? []), c.key]);
  }
  const seen = new Set<string>();
  const out: ProofCall[] = [];
  const push = (id: string, toolName: string | undefined, basis: string | undefined): void => {
    if (seen.has(id)) return;
    seen.add(id);
    const standing = findings.standings.get(id);
    const judge = judged.get(id);
    out.push(
      Object.freeze({
        toolCallId: id,
        ...(toolName !== undefined ? { toolName } : {}),
        ...(basis !== undefined ? { basis } : {}),
        ...(standing !== undefined ? { standing } : {}),
        ...(judge !== undefined ? { judged: judge } : {}),
        conflicts: Object.freeze(witnessed.get(id) ?? []),
      }),
    );
  };
  for (const row of rows) {
    const b = basisOf(row);
    if (b !== undefined) push(b.toolCallId, b.toolName ?? names.get(b.toolCallId), b.basis);
  }
  for (const [id, toolName] of names) push(id, toolName, undefined);
  return out;
}

/** The map's sources with the `via` names that are tools of this run — the record's own join. */
function sourcesOf(ontology: unknown, tools: readonly string[]): readonly ProofSource[] | undefined {
  const record = ontologyRecordOf(ontology);
  if (record === undefined) return undefined;
  const fold = foldOntology(record);
  const known = new Set(tools);
  return Object.freeze(
    fold.sources.map((s) => {
      const via = new Set<string>();
      for (const h of fold.held) if (h.source === s.id) for (const t of h.via) if (known.has(t)) via.add(t);
      return Object.freeze({ id: s.id, meaning: s.meaning, tools: Object.freeze([...via].sort(byString)) });
    }),
  );
}

/**
 * Fold the record into the graph. The standings and conflicts come from
 * `foldFindings` (the LAST standing row per result is the current one); the
 * contingent and judgment rows are read here; the calls follow the basis
 * rows' order; tools and sources are sorted by id. Pure.
 */
export function foldProofMap(input: ProofMapInput): ProofFold {
  const findings = foldFindings(input.rows, input.toolResults);
  const judged = new Map<string, string>();
  const contingent: ContingentShape[] = [];
  for (const row of input.rows) {
    const j = judgmentOf(row);
    if (j !== undefined) judged.set(j.toolCallId, j.standing);
    const c = contingentOf(row);
    if (c !== undefined) contingent.push(Object.freeze(c));
  }
  const calls = callsOf(input.rows, toolNamesById(input.history, input.toolResults), findings, judged);
  const tools = [...new Set(calls.flatMap((c) => (c.toolName !== undefined ? [c.toolName] : [])))].sort(byString);
  const sources = sourcesOf(input.ontology, tools);
  const standsOn = [...findings.standings.values()].filter((s) => s.declaredOn === 'answer');
  const onAnswer = contingent.filter((c) => c.declaredOn === 'answer');
  const unsupported = unsupportedOf(input.unsupportedValues);
  const answered = standsOn.length > 0 || onAnswer.length > 0 || unsupported !== undefined;
  return Object.freeze({
    ...(answered
      ? { answer: Object.freeze({ standsOn: Object.freeze(standsOn), contingent: Object.freeze(onAnswer), unsupported: Object.freeze(unsupported ?? []) }) }
      : {}),
    calls: Object.freeze(calls),
    tools: Object.freeze(tools),
    ...(sources !== undefined ? { sources } : {}),
    contingent: Object.freeze(contingent),
    findings,
  });
}

/** Project only the evidence available at this replay stop. */
export function proofMapAt(context: ContextAt): ProofFold | undefined {
  const read = (path: string) => context.keys.find(key => key.path === path)?.value;
  const rows = read('findingsLedger');
  if (!Array.isArray(rows)) return undefined;
  const toolResults = read('toolResults');
  const history = read('history');
  return foldProofMap({
    rows,
    ...(Array.isArray(toolResults) && { toolResults }),
    ...(Array.isArray(history) && { history }),
    ontology: read('ontology'),
    unsupportedValues: read('unsupportedValues'),
  });
}
