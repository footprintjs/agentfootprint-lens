/** @vitest-environment node */
import { expect, it, vi } from 'vitest';
import { foldExchange, foldReasoning, reasoningAt, type ContextAt } from '../index.js';

vi.mock('react', () => {
  throw new Error('The Reasoning folds must load without React');
});

it('keeps a lazy exchange with its own reading of the ledger', () => {
  const context: ContextAt = {
    cursor: { runtimeStageId: 'finish', commitIdx: 2 },
    keys: [{ path: 'findingsLedger', value: [{ kind: 'basis', toolCallId: 'a', basis: 'direct' }] }],
    left: [], rows: [], redacted: false, why: [],
  };
  const reading = reasoningAt(context);
  const exchange = reading.exchange?.();
  expect(exchange?.beats[0]).toMatchObject({ kind: 'call', toolCallId: 'a' });
  expect(exchange?.reasoning).toBe(reading.reasoning);
  expect(reading.exchange?.()).toBe(exchange);
  const coverage = [{ toolCallId: 'b' }];
  const earlier = reasoningAt({ ...context, keys: [{ path: 'coverageDeclared', value: coverage }] });
  expect(earlier).toEqual({ coverage });
});

it('Cards and Exchange use the same placement receipt through the headless entry', () => {
  const ticket = { placed: true, ref: 'art_1', reason: 'stored by the producer', bytes: 5000 };
  const recording = {
    rows: [{ kind: 'basis', toolCallId: 'a', toolName: 'lookup', basis: 'direct' }],
    toolResults: [{ toolCallId: 'a', result: ticket }],
  };
  const unconfirmed = foldReasoning(recording);
  expect(unconfirmed.cards[0]?.result).toEqual({ chars: JSON.stringify(ticket).length });
  expect(foldExchange(recording).beats[1]).not.toHaveProperty('placed');

  const confirmed = { ...recording, placedTickets: [{ toolCallId: 'a', ref: ticket.ref }] };
  const cards = foldReasoning(confirmed);
  const exchange = foldExchange(confirmed);
  expect(cards.cards[0]?.result).toEqual({ placed: { ref: 'art_1', bytes: 5000 } });
  expect(exchange.reasoning).toEqual(cards);
  expect(exchange.beats[1]).toMatchObject({ kind: 'result', placed: { ref: 'art_1', bytes: 5000 } });
});
