import { collapsedTicketOf } from '../served/collapsedTicket.js';
import { foldFindings, type FindingsFold, type StandingShape } from './findings.js';
import { placedRefsByCall, resultShapeOf, type ResultShape } from './reasoningResult.js';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** A basis row, as read: what the model declared BEFORE the call ran. */
export interface BasisShape {
  readonly toolCallId: string;
  readonly toolName?: string;
  readonly iteration?: number;
  readonly basis: string;
  readonly expect?: string;
  readonly malformed?: number;
  /** What the model said it was testing (a record that carries it). */
  readonly proposition?: string;
  /** What the model said the result would show (a record that carries it). */
  readonly predicts?: string;
}

function basisOf(row: unknown): BasisShape | undefined {
  if (!isRecord(row) || row.kind !== 'basis') return undefined;
  if (typeof row.toolCallId !== 'string' || typeof row.basis !== 'string') return undefined;
  return {
    toolCallId: row.toolCallId,
    basis: row.basis,
    ...(typeof row.toolName === 'string' ? { toolName: row.toolName } : {}),
    ...(typeof row.iteration === 'number' ? { iteration: row.iteration } : {}),
    ...(typeof row.expect === 'string' ? { expect: row.expect } : {}),
    ...(typeof row.malformed === 'number' ? { malformed: row.malformed } : {}),
    ...(typeof row.proposition === 'string' ? { proposition: row.proposition } : {}),
    ...(typeof row.predicts === 'string' ? { predicts: row.predicts } : {}),
  };
}

/** The tool results on the record by id: `history`'s `role: 'tool'` messages, then the batch. */
function resultsById(history: readonly unknown[] | undefined, toolResults: readonly unknown[] | undefined): ReadonlyMap<string, unknown> {
  const out = new Map<string, unknown>();
  for (const m of history ?? []) {
    if (isRecord(m) && m.role === 'tool' && typeof m.toolCallId === 'string' && !out.has(m.toolCallId)) out.set(m.toolCallId, m.content);
  }
  for (const r of toolResults ?? []) {
    if (isRecord(r) && typeof r.toolCallId === 'string' && !out.has(r.toolCallId)) out.set(r.toolCallId, r.result);
  }
  return out;
}

/** A collapsed ticket as the wire carried it: the standing, and the content string itself. */
export interface CollapsedShape {
  readonly standing: string;
  readonly content: string;
}

/** The collapsed tickets on the wire at the epoch, by the result's id. */
function collapsedById(asSent: readonly unknown[] | undefined): ReadonlyMap<string, CollapsedShape> {
  const out = new Map<string, CollapsedShape>();
  for (const m of asSent ?? []) {
    if (!isRecord(m) || m.role !== 'tool' || typeof m.content !== 'string') continue;
    const t = collapsedTicketOf(m.content);
    if (t !== undefined) out.set(t.toolCallId, { standing: t.standing, content: m.content });
  }
  return out;
}

// ─── The fold ─────────────────────────────────────────────────────────────

/** One tool call as the lens draws it: before, result, after. */
export interface ReasoningCard {
  readonly toolCallId: string;
  readonly before: BasisShape;
  /** The result as the record holds it; absent when no result names the id. */
  readonly result?: ResultShape;
  /** The standing the wire at the epoch collapsed this result under; absent when served verbatim. */
  readonly collapsed?: string;
  /** The CURRENT standing row about this result; absent = undeclared. */
  readonly after?: StandingShape;
  /** The keys of the conflict rows naming this result as a witness. */
  readonly conflicts: readonly string[];
}

/** The answer turn's card: the fold's buckets under the served piece's field names. */
export interface AnswerCard {
  readonly facts: number;
  readonly limitations: number;
  readonly evidenceRefs: number;
  readonly nextSteps: number;
  readonly noise: number;
  readonly undeclared: number;
  /** The run constant `findingsServe`, when the record carries it. */
  readonly serve?: string;
  /** The run constant `findingsAnswerAsk`, when the record carries it. */
  readonly answerAsk?: unknown;
}

export interface ReasoningFold {
  readonly cards: readonly ReasoningCard[];
  /** Present once a standing row was declared on the answer. */
  readonly answer?: AnswerCard;
  /** The band's own fold, which this one stands on. */
  readonly findings: FindingsFold;
}

export interface ReasoningInput {
  /** The ledger as the fold holds it at the stop (`findingsLedger`). */
  readonly rows: readonly unknown[];
  /** The state's `toolResults` at the same stop. */
  readonly toolResults?: readonly unknown[];
  /** The state's `history` at the same stop — the tool messages hold every result. */
  readonly history?: readonly unknown[];
  /** The producer's { toolCallId, ref } pairs at this stop. Older recordings omit this receipt. */
  readonly placedTickets?: unknown;
  /** The served wire at the stop's epoch (`messages.asSent`), for the collapsed tickets. */
  readonly asSent?: readonly unknown[];
  readonly findingsServe?: unknown;
  readonly findingsAnswerAsk?: unknown;
  /** The served view's `system.pieces` at the stop's epoch (0.63.0, the exchange's served beat). */
  readonly pieces?: readonly unknown[];
  /** The state's `finalContent` at the stop (0.63.0, the answer beat). */
  readonly finalContent?: unknown;
  /** The state's `llmLatestContent` / `llmLatestToolCalls` at the stop (0.63.0, the answer beat). */
  readonly llmLatestContent?: unknown;
  readonly llmLatestToolCalls?: unknown;
}

/**
 * Fold the ledger BY CALL. The basis rows give the calls in call order (the
 * ledger is append-only, a basis row lands before its call runs); the
 * standings come from `foldFindings` — the LAST standing row per result is
 * the current one — and every other fact is looked up by the result's id.
 * Pure; a row that does not fit its kind's shape is passed over.
 */
export function prepareReasoning(input: ReasoningInput) {
  const findings = foldFindings(input.rows, input.toolResults);
  const results = resultsById(input.history, input.toolResults);
  const bases = input.rows.flatMap(row => {
    const before = basisOf(row);
    return before === undefined ? [] : [before];
  });
  const placedRefs = placedRefsByCall(input.placedTickets, bases, input.history, input.toolResults);
  const collapsed = collapsedById(input.asSent);
  const witnessed = new Map<string, string[]>();
  for (const c of findings.conflicts) {
    for (const w of c.witnesses) {
      const keys = witnessed.get(w.toolCallId) ?? [];
      keys.push(c.key);
      witnessed.set(w.toolCallId, keys);
    }
  }
  const seen = new Set<string>();
  const cards: ReasoningCard[] = [];
  for (const before of bases) {
    if (seen.has(before.toolCallId)) continue;
    seen.add(before.toolCallId);
    const id = before.toolCallId;
    const after = findings.standings.get(id);
    const onWire = collapsed.get(id);
    cards.push(
      Object.freeze({
        toolCallId: id,
        before,
        ...(results.has(id) ? { result: resultShapeOf(results.get(id), placedRefs.get(id)) } : {}),
        ...(onWire !== undefined ? { collapsed: onWire.standing } : {}),
        ...(after !== undefined ? { after } : {}),
        conflicts: Object.freeze(witnessed.get(id) ?? []),
      }),
    );
  }
  const answered = Array.from(findings.standings.values()).some((s) => s.declaredOn === 'answer');
  const answer: AnswerCard | undefined = answered
    ? Object.freeze({
        facts: findings.facts.length,
        limitations: findings.ruledOut.length,
        evidenceRefs: findings.open.length,
        nextSteps: findings.open.filter((s) => s.settles !== undefined).length,
        noise: findings.noise.length,
        undeclared: findings.undeclared.length,
        ...(typeof input.findingsServe === 'string' ? { serve: input.findingsServe } : {}),
        ...(input.findingsAnswerAsk !== undefined ? { answerAsk: input.findingsAnswerAsk } : {}),
      })
    : undefined;
  const reasoning: ReasoningFold = Object.freeze({
    cards: Object.freeze(cards),
    ...(answer !== undefined ? { answer } : {}),
    findings,
  });
  return { input, reasoning, results, collapsed };
}

/** Read cards in call order, with the current standing and recorded result for each call. */
export function foldReasoning(input: ReasoningInput): ReasoningFold {
  return prepareReasoning(input).reasoning;
}
