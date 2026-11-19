// ─── The record, read by shape ─────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStringArray = (v: unknown): v is readonly string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');

/** Where a term is held, as declared: the source, the tools that read it there, the author's coverage sentence. */
export interface HeldShape {
  readonly node: string;
  readonly source: string;
  readonly via: readonly string[];
  readonly coverage?: string;
}

/** A term as declared. */
export interface TermShape {
  readonly id: string;
  readonly meaning: string;
  readonly unit?: string;
  readonly aliases: readonly string[];
  readonly held: readonly HeldShape[];
}

/** A source as declared; `configured` only when the author wrote it. */
export interface SourceShape {
  readonly id: string;
  readonly meaning: string;
  readonly coverage?: string;
  readonly configured?: boolean;
}

/** A relation as declared, in the author's own word. */
export interface RelationShape {
  readonly from: string;
  readonly to: string;
  readonly relation: string;
  readonly meaning?: string;
}

/** The run constant `ontology` as the view reads it. */
export interface OntologyRecordShape {
  readonly id: string;
  readonly version: string;
  readonly hash: string;
  readonly nodes: Readonly<Record<string, unknown>>;
  readonly sources: Readonly<Record<string, unknown>>;
  readonly edges: readonly unknown[];
}

/** Narrow the committed key to the shape the view draws; anything else is nothing. */
export function ontologyRecordOf(value: unknown): OntologyRecordShape | undefined {
  if (!isRecord(value)) return undefined;
  const { id, version, hash, spec } = value;
  if (typeof id !== 'string' || typeof version !== 'string' || typeof hash !== 'string' || !isRecord(spec)) return undefined;
  if (!isRecord(spec.nodes) || !isRecord(spec.sources)) return undefined;
  return {
    id,
    version,
    hash,
    nodes: spec.nodes,
    sources: spec.sources,
    edges: Array.isArray(spec.edges) ? spec.edges : [],
  };
}

function heldOf(node: string, value: unknown, sources: Record<string, unknown>): HeldShape | undefined {
  if (!isRecord(value) || typeof value.source !== 'string' || !(value.source in sources)) return undefined;
  return {
    node,
    source: value.source,
    via: isStringArray(value.via) ? value.via : [],
    ...(typeof value.coverage === 'string' ? { coverage: value.coverage } : {}),
  };
}

function termOf(id: string, value: unknown, sources: Record<string, unknown>): TermShape | undefined {
  if (!isRecord(value) || typeof value.meaning !== 'string') return undefined;
  const held = Array.isArray(value.sources) ? value.sources.map((s) => heldOf(id, s, sources)).filter((h): h is HeldShape => h !== undefined) : [];
  return {
    id,
    meaning: value.meaning,
    ...(typeof value.unit === 'string' ? { unit: value.unit } : {}),
    aliases: isStringArray(value.aliases) ? value.aliases : [],
    held,
  };
}

function sourceOf(id: string, value: unknown): SourceShape | undefined {
  if (!isRecord(value) || typeof value.meaning !== 'string') return undefined;
  return {
    id,
    meaning: value.meaning,
    ...(typeof value.coverage === 'string' ? { coverage: value.coverage } : {}),
    ...(typeof value.configured === 'boolean' ? { configured: value.configured } : {}),
  };
}

function relationOf(value: unknown): RelationShape | undefined {
  if (!isRecord(value) || typeof value.from !== 'string' || typeof value.to !== 'string' || typeof value.relation !== 'string') return undefined;
  return {
    from: value.from,
    to: value.to,
    relation: value.relation,
    ...(typeof value.meaning === 'string' ? { meaning: value.meaning } : {}),
  };
}

// ─── The fold ──────────────────────────────────────────────────────────────

export interface OntologyFold {
  readonly id: string;
  readonly version: string;
  readonly hash: string;
  /** Every term, sorted by id — the served piece's own order. */
  readonly terms: readonly TermShape[];
  /** Every source, sorted by id. */
  readonly sources: readonly SourceShape[];
  /** Every declared holding, in term order then declaration order. */
  readonly held: readonly HeldShape[];
  /** Every relation, in declaration order (the hash's order). */
  readonly relations: readonly RelationShape[];
  /** The ids of the terms no source holds, sorted. */
  readonly unheld: readonly string[];
}

const byId = <A extends { readonly id: string }>(a: A, b: A): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Fold the record into the lists the view draws. Pure; sorted by id where the piece sorts. */
export function foldOntology(record: OntologyRecordShape): OntologyFold {
  const terms = Object.entries(record.nodes)
    .map(([id, v]) => termOf(id, v, record.sources))
    .filter((t): t is TermShape => t !== undefined)
    .sort(byId);
  const sources = Object.entries(record.sources)
    .map(([id, v]) => sourceOf(id, v))
    .filter((s): s is SourceShape => s !== undefined)
    .sort(byId);
  const relations = record.edges.map(relationOf).filter((r): r is RelationShape => r !== undefined);
  return Object.freeze({
    id: record.id,
    version: record.version,
    hash: record.hash,
    terms: Object.freeze(terms),
    sources: Object.freeze(sources),
    held: Object.freeze(terms.flatMap((t) => t.held)),
    relations: Object.freeze(relations),
    unheld: Object.freeze(terms.filter((t) => t.held.length === 0).map((t) => t.id)),
  });
}
