import type { StandingShape } from './findings.js';
import type { PlacedShape } from './reasoningResult.js';
import {
  prepareReasoning, type BasisShape, type CollapsedShape, type ReasoningCard, type ReasoningFold, type ReasoningInput,
} from './reasoning.js';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** The emission as the assistant message in `history` carries it: `toolCalls[i]`. */
export interface EmittedCallShape {
  readonly id: string;
  readonly name?: string;
  readonly args?: Record<string, unknown>;
}

/** The tool calls the record's assistant messages emitted, by id, first message wins. */
function emittedById(history: readonly unknown[] | undefined): ReadonlyMap<string, EmittedCallShape> {
  const out = new Map<string, EmittedCallShape>();
  for (const m of history ?? []) {
    if (!isRecord(m) || m.role !== 'assistant' || !Array.isArray(m.toolCalls)) continue;
    for (const c of m.toolCalls) {
      if (!isRecord(c) || typeof c.id !== 'string' || out.has(c.id)) continue;
      out.set(c.id, {
        id: c.id,
        ...(typeof c.name === 'string' ? { name: c.name } : {}),
        ...(isRecord(c.args) ? { args: c.args } : {}),
      });
    }
  }
  return out;
}

/** The model's beat for one call: the emission, split into its `_findings` block and the rest. */
export interface CallBeat {
  readonly kind: 'call';
  readonly side: 'model';
  readonly toolCallId: string;
  readonly toolName?: string;
  /** `args._findings` as emitted — or, `fromLedger`, the basis row's own declaration. */
  readonly findings?: unknown;
  /** The remaining args as emitted; absent when the emission is not on the record. */
  readonly args?: Record<string, unknown>;
  /** `history` no longer carries the emission; the ledger's basis row stands in. */
  readonly fromLedger: boolean;
}

/** The tool's beat for one call: the result as the tool message holds it, and what the wire served instead. */
export interface ResultBeat {
  readonly kind: 'result';
  readonly side: 'tool';
  readonly toolCallId: string;
  readonly toolName?: string;
  /** The content as the record holds it (a string, or the batch's value). */
  readonly content: unknown;
  /** The placement ticket, when the producer recorded a matching receipt. */
  readonly placed?: PlacedShape;
  /** Recorded text following that ticket in the tool message. */
  readonly followingText?: string;
  /** The ticket the wire at the stop's epoch carried in place of this result. */
  readonly collapsed?: CollapsedShape;
  /** The standing a later call (or the answer) declared for it — the cards' AFTER. */
  readonly after?: StandingShape;
}

/** What was served for the answer turn: the `source: 'findings'` piece, its text verbatim. */
export interface ServedBeat {
  readonly kind: 'served';
  readonly side: 'model';
  readonly source: string;
  readonly text: string;
}

/** The answer the model gave, and which field of the record holds it. */
export interface AnswerBeat {
  readonly kind: 'answer';
  readonly side: 'model';
  readonly text: string;
  readonly from: 'history' | 'finalContent' | 'llmLatestContent';
}

export type ExchangeBeat = CallBeat | ResultBeat | ServedBeat | AnswerBeat;

export interface ExchangeFold {
  readonly beats: readonly ExchangeBeat[];
  /** The cards' fold, which this one stands on. */
  readonly reasoning: ReasoningFold;
}

/** The basis row's declaration as the ledger spells it, for a call `history` no longer carries. */
function ledgerFindings(before: BasisShape): Record<string, unknown> {
  return {
    basis: before.basis,
    ...(before.expect !== undefined ? { expect: before.expect } : {}),
    ...(before.proposition !== undefined ? { proposition: before.proposition } : {}),
    ...(before.predicts !== undefined ? { predicts: before.predicts } : {}),
  };
}

function callBeatOf(card: ReasoningCard, emitted: ReadonlyMap<string, EmittedCallShape>): CallBeat {
  const id = card.toolCallId;
  const e = emitted.get(id);
  const toolName = e?.name ?? card.before.toolName;
  if (e === undefined) {
    return Object.freeze({
      kind: 'call',
      side: 'model',
      toolCallId: id,
      ...(toolName !== undefined ? { toolName } : {}),
      findings: ledgerFindings(card.before),
      fromLedger: true,
    });
  }
  const { _findings, ...rest } = e.args ?? {};
  return Object.freeze({
    kind: 'call',
    side: 'model',
    toolCallId: id,
    ...(toolName !== undefined ? { toolName } : {}),
    ...(_findings !== undefined ? { findings: _findings } : {}),
    ...(e.args !== undefined ? { args: Object.freeze(rest) } : {}),
    fromLedger: false,
  });
}

function resultBeatOf(card: ReasoningCard, content: unknown, collapsed: CollapsedShape | undefined, toolName: string | undefined): ResultBeat {
  const placement = card.result && 'placed' in card.result ? card.result : undefined;
  return Object.freeze({
    kind: 'result',
    side: 'tool',
    toolCallId: card.toolCallId,
    ...(toolName !== undefined ? { toolName } : {}),
    content,
    ...placement,
    ...(collapsed !== undefined ? { collapsed } : {}),
    ...(card.after !== undefined ? { after: card.after } : {}),
  });
}

/** The served view's first `source: 'findings'` piece, read by shape. */
function findingsPieceOf(pieces: readonly unknown[] | undefined): ServedBeat | undefined {
  for (const p of pieces ?? []) {
    if (!isRecord(p) || p.source !== 'findings' || typeof p.text !== 'string') continue;
    return Object.freeze({ kind: 'served', side: 'model', source: p.source, text: p.text });
  }
  return undefined;
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/**
 * The answer as the record holds it: `history`'s closing assistant message
 * (content, no tool calls, after the last tool message), else `finalContent`,
 * else `llmLatestContent` once `llmLatestToolCalls` carries no call. Absent
 * when none of the three holds one — the run has not answered at the stop.
 */
function answerOf(input: ReasoningInput): AnswerBeat | undefined {
  const history = input.history ?? [];
  const last = history[history.length - 1];
  if (isRecord(last) && last.role === 'assistant' && nonEmpty(last.content) && (!Array.isArray(last.toolCalls) || last.toolCalls.length === 0)) {
    return Object.freeze({ kind: 'answer', side: 'model', text: last.content, from: 'history' });
  }
  if (nonEmpty(input.finalContent)) return Object.freeze({ kind: 'answer', side: 'model', text: input.finalContent, from: 'finalContent' });
  const calls = input.llmLatestToolCalls;
  if (nonEmpty(input.llmLatestContent) && (!Array.isArray(calls) || calls.length === 0)) {
    return Object.freeze({ kind: 'answer', side: 'model', text: input.llmLatestContent, from: 'llmLatestContent' });
  }
  return undefined;
}

/**
 * Fold the exchange, in wire order per call: the model's emission, the tool's
 * result; then what was served for the answer turn and the answer. Stands on
 * `foldReasoning` (the calls, the standings, the wire's tickets) and looks the
 * emission up in `history` by id. Pure; a beat prints only what its row holds.
 */
export function exchangeFor({ input, reasoning, results, collapsed }: ReturnType<typeof prepareReasoning>): ExchangeFold {
  const emitted = emittedById(input.history);
  const beats: ExchangeBeat[] = [];
  for (const card of reasoning.cards) {
    const call = callBeatOf(card, emitted);
    beats.push(call);
    if (results.has(card.toolCallId)) beats.push(resultBeatOf(card, results.get(card.toolCallId), collapsed.get(card.toolCallId), call.toolName));
  }
  const served = findingsPieceOf(input.pieces);
  if (served !== undefined) beats.push(served);
  const answer = answerOf(input);
  if (answer !== undefined) beats.push(answer);
  return Object.freeze({ beats: Object.freeze(beats), reasoning });
}

/** Read the complete recorded exchange, including its cards, directly from ledger and wire evidence. */
export function foldExchange(input: ReasoningInput): ExchangeFold {
  return exchangeFor(prepareReasoning(input));
}
