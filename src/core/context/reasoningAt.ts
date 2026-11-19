import type { ContextAt } from './contextAt.js';
import { prepareReasoning, type ReasoningFold } from './reasoning.js';
import { exchangeFor, type ExchangeFold } from './reasoningExchange.js';

/** The cards and exchange share the results and placement receipts from one recorded stop. */
export interface ReasoningAt {
  readonly coverage?: readonly unknown[];
  readonly reasoning?: ReasoningFold;
  /** Builds the exchange on first use and reuses it for this stop. */
  readonly exchange?: () => ExchangeFold;
}

const evidenceKeys = new Set([
  'coverageDeclared', 'findingsLedger', 'history', 'toolResults', 'placedTickets',
  'findingsServe', 'findingsAnswerAsk', 'finalContent', 'llmLatestContent', 'llmLatestToolCalls',
]);

/** Read the cards and any coverage declarations from the supplied Context projection. */
export function reasoningAt(context: ContextAt): ReasoningAt {
  const state = new Map<string, unknown>();
  for (const key of context.keys) {
    if (evidenceKeys.has(key.path) && !state.has(key.path)) state.set(key.path, key.value);
  }
  const coverage = state.get('coverageDeclared');
  const declarations = Array.isArray(coverage) && coverage.length ? { coverage } : {};
  const rows = state.get('findingsLedger');
  if (!Array.isArray(rows)) return declarations;

  const history = state.get('history');
  const toolResults = state.get('toolResults');
  const wire = context.served?.row.view.messages.asSent;
  const pieces = context.served?.row.view.system.pieces;
  const calls = prepareReasoning({
    rows,
    ...(Array.isArray(history) && { history }),
    ...(Array.isArray(toolResults) && { toolResults }),
    ...(Array.isArray(wire) && { asSent: wire }),
    ...(Array.isArray(pieces) && { pieces }),
    placedTickets: state.get('placedTickets'),
    findingsServe: state.get('findingsServe'),
    findingsAnswerAsk: state.get('findingsAnswerAsk'),
    finalContent: state.get('finalContent'),
    llmLatestContent: state.get('llmLatestContent'),
    llmLatestToolCalls: state.get('llmLatestToolCalls'),
  });

  let exchange: ExchangeFold | undefined;
  return {
    ...declarations,
    reasoning: calls.reasoning,
    exchange: () => exchange ??= exchangeFor(calls),
  };
}
