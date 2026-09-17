/**
 * <ReasoningLens> — the model's declared reasoning BY CALL, on the recorded
 * `findings-ledger` fixture (agentfootprint 9.101.1, generated alone).
 *
 * Test types: Render (one card per call up to the cursor, in call order; the
 * answer card) · Law (the basis chip is the row's own word; an undeclared
 * result reads `undeclared`, never `open`; the conflict's two cards both carry
 * the chip; an unarmed run draws nothing — omit, never deny) · Functional
 * (the lens moves with the ONE shared cursor — a card is gone once the cursor
 * stands before its call; the collapsed chip follows the epoch's wire) · Unit
 * (`foldReasoning`: the proposition and the prediction are quoted verbatim
 * when a record carries them; a placement ticket is read by shape; a row
 * that does not fit is passed over) · Exchange (0.63.0: the toggle switches
 * views; beats in wire order per call up to the cursor; the model beat's
 * `_findings` is the emission in `history`, verbatim; the tool beat's content
 * round-trips to the tool message's; the collapsed ticket and the served
 * piece follow the epoch's wire; the answer beat is the record's field; a
 * call `history` no longer carries reads `from ledger`).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { contextAt } from '../../src/core/context/contextAt.js';
import { lensCursorFrom } from '../../src/core/cursor/lensCursor.js';
import { foldFactsAt } from '../../src/core/served/index.js';
import { ContextView } from '../../src/react/components/ContextView.js';
import { foldFindings } from '../../src/react/components/FindingsBand.js';
import { LABELS, ReasoningLens, foldExchange, foldReasoning } from '../../src/react/components/ReasoningLens.js';
import { useSharedCursor } from '../../src/react/useSharedCursor.js';
import { load, loadTampered, stopsOf, type FixtureBundle } from '../served/helpers.js';

afterEach(cleanup);

type Fixture = ReturnType<typeof load>;

/** The grouped-axis index of a stop. */
const stepOf = (fixture: Fixture, stop: { runtimeStageId: string; commitIdx: number }): number =>
  fixture.positions.findIndex((p) => p.runtimeStageId === stop.runtimeStageId && p.commitIdx === stop.commitIdx);

/** The lens at one grouped-axis step, handed the ONE cursor. */
function renderAt(fixture: Fixture, step: number): void {
  render(<ReasoningLens runner={fixture.runner} cursor={lensCursorFrom(fixture.positions, step, () => undefined)} />);
}

const cards = (): HTMLElement[] => screen.getAllByTestId('reasoning-card');
const cardOf = (id: string): HTMLElement => {
  const card = cards().find((c) => c.getAttribute('data-tool-call-id') === id);
  if (card === undefined) throw new Error(`no card for ${id}`);
  return card;
};

describe('<ReasoningLens> at the end of the armed run', () => {
  const fixture = load('findings-ledger');
  const last = fixture.positions.length - 1;
  const lastStop = fixture.positions[last]!;
  const ledger = foldFactsAt(fixture.snapshot, { runtimeStageId: lastStop.runtimeStageId, commitIdx: lastStop.commitIdx })
    .findingsLedger as readonly Record<string, unknown>[];
  const basisRows = ledger.filter((r) => r.kind === 'basis') as { toolCallId: string; basis: string; expect?: string; toolName: string; iteration: number }[];

  it('draws one card per tool call, in call order, each with the basis chip the row carries', () => {
    renderAt(fixture, last);
    expect(screen.getByTestId('reasoning-lens').getAttribute('data-calls')).toBe('6');
    expect(cards().map((c) => c.getAttribute('data-tool-call-id'))).toEqual(basisRows.map((r) => r.toolCallId));
    expect(cards().map((c) => c.getAttribute('data-tool-call-id'))).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
    for (const row of basisRows) {
      const card = cardOf(row.toolCallId);
      expect(card.getAttribute('data-basis')).toBe(row.basis);
      expect(within(card).getByTestId('reasoning-basis').textContent).toBe(row.basis);
      expect(within(card).getByTestId('reasoning-card-id').textContent).toBe(row.toolCallId);
      expect(within(card).getByTestId('reasoning-card-id').getAttribute('title')).toBe(row.toolCallId);
      expect(card.textContent).toContain(`${LABELS.iteration} ${row.iteration}`);
      expect(card.textContent).toContain(row.toolName);
      const chip = within(card).queryByTestId('reasoning-expect');
      if (row.expect !== undefined) expect(chip?.textContent).toBe(`${LABELS.expect} ${row.expect}`);
      else expect(chip).toBeNull();
    }
    expect(cardOf('c1').getAttribute('data-basis')).toBe('direct');
    expect(cardOf('c2').getAttribute('data-basis')).toBe('exploratory');
  });

  it('BEFORE is drawn only on the call that declared a proposition — quoted verbatim, labelled by field', () => {
    renderAt(fixture, last);
    const basisRows = ledger.filter((r) => r.kind === 'basis') as { toolCallId: string; proposition?: string; predicts?: string }[];
    const declared = basisRows.filter((r) => r.proposition !== undefined);
    expect(declared.length).toBe(1);
    expect(screen.getAllByTestId('reasoning-before')).toHaveLength(1);
    const card = cardOf(declared[0]!.toolCallId);
    const before = within(card).getByTestId('reasoning-before');
    expect(within(before).getByText(declared[0]!.proposition!).tagName).toBe('Q');
    expect(within(before).getByText(declared[0]!.predicts!).tagName).toBe('Q');
    for (const r of basisRows.filter((r) => r.proposition === undefined)) {
      expect(within(cardOf(r.toolCallId)).queryByTestId('reasoning-before')).toBeNull();
    }
  });

  it('the fact card shows its assertion; the ruled-out card its `line`; the open card its `settles` — quoted, labelled by field', () => {
    renderAt(fixture, last);
    const fact = cardOf('c1');
    expect(fact.getAttribute('data-standing')).toBe('fact');
    expect(within(fact).getByTestId('reasoning-standing').textContent).toBe('fact');
    expect(within(fact).getByTestId('reasoning-line').textContent).toBe('port/fc1/7 · state = up');
    expect(within(fact).getByTestId('reasoning-sought')).toBeInTheDocument();
    expect(within(fact).getByTestId('reasoning-declared-on').textContent).toBe(`${LABELS.declaredOn} c5`);

    const ruledRow = ledger.find((r) => r.kind === 'standing' && r.standing === 'ruled-out') as { line: string };
    const ruled = cardOf('c3');
    expect(ruled.getAttribute('data-standing')).toBe('ruled-out');
    expect(within(ruled).getByTestId('reasoning-line').textContent).toBe(`${LABELS.line} ${ruledRow.line}`);
    // The model's words are quoted — a <q> element — in the simple line and again in the disclosure.
    expect(within(ruled).getAllByText(ruledRow.line).map((e) => e.tagName)).toEqual(['Q', 'Q']);

    const openRow = ledger.find((r) => r.kind === 'standing' && r.standing === 'open') as { settles: string };
    const open = cardOf('c4');
    expect(open.getAttribute('data-standing')).toBe('open');
    expect(within(open).getByTestId('reasoning-line').textContent).toBe(`${LABELS.settles} ${openRow.settles}`);

    expect(cardOf('c2').getAttribute('data-standing')).toBe('noise');
    expect(within(cardOf('c2')).queryByTestId('reasoning-line')).toBeNull();

    // c5 was declared on the answer — the record's own word for where.
    expect(within(cardOf('c5')).getByTestId('reasoning-declared-on').textContent).toBe(`${LABELS.declaredOn} answer`);
    expect(within(cardOf('c5')).getByTestId('reasoning-line').textContent).toBe('port/fc1/7 · state = down');
  });

  it('a result no standing names reads `undeclared` — the label — and never `open`', () => {
    renderAt(fixture, last);
    const card = cardOf('c6');
    expect(card.getAttribute('data-standing')).toBe(LABELS.undeclared);
    expect(within(card).getByTestId('reasoning-standing').textContent).toBe(LABELS.undeclared);
    expect(card.textContent).not.toContain('open');
    expect(within(card).queryByTestId('reasoning-declared-on')).toBeNull();
    expect(within(card).queryByTestId('reasoning-line')).toBeNull();
  });

  it('the conflict row puts a chip on BOTH witnesses’ cards and on no other', () => {
    renderAt(fixture, last);
    const conflictRow = ledger.find((r) => r.kind === 'conflict') as { key: string; witnesses: { toolCallId: string }[] };
    expect(conflictRow.witnesses.map((w) => w.toolCallId)).toEqual(['c1', 'c5']);
    for (const card of cards()) {
      const id = card.getAttribute('data-tool-call-id');
      const chips = within(card).queryAllByTestId('reasoning-conflict');
      if (id === 'c1' || id === 'c5') {
        expect(chips).toHaveLength(1);
        expect(chips[0]!.textContent).toBe(LABELS.conflict);
        expect(chips[0]!.getAttribute('title')).toBe(conflictRow.key);
      } else expect(chips).toHaveLength(0);
    }
  });

  it('the wire at the answer epoch collapsed c2 and c3 to tickets — the chip carries the ticket’s own standing', () => {
    renderAt(fixture, last);
    const collapsed = cards().filter((c) => within(c).queryByTestId('reasoning-collapsed') !== null);
    expect(collapsed.map((c) => c.getAttribute('data-tool-call-id'))).toEqual(['c2', 'c3']);
    expect(within(cardOf('c2')).getByTestId('reasoning-collapsed').getAttribute('title')).toBe('noise');
    expect(within(cardOf('c3')).getByTestId('reasoning-collapsed').getAttribute('title')).toBe('ruled-out');
    expect(within(cardOf('c3')).getByTestId('reasoning-ticket').textContent).toBe(`${LABELS.ticket} ruled-out`);
  });

  it('the details disclosure holds the full id, the result’s size in chars, and every assertion', () => {
    renderAt(fixture, last);
    const details = within(cardOf('c1')).getByTestId('reasoning-details');
    expect(details.textContent).toContain(LABELS.details);
    expect(within(details).getByTestId('reasoning-result').getAttribute('data-chars')).toBe(String('lookup result'.length));
    expect(within(details).getByTestId('reasoning-result').textContent).toBe(`${LABELS.result} ${'lookup result'.length} ${LABELS.chars}`);
    expect(within(details).getAllByTestId('reasoning-assertion').map((a) => a.textContent)).toEqual(['port/fc1/7 · state = up']);
    // Not open: the disclosure is the browser's, and it starts closed.
    expect((details as HTMLDetailsElement).open).toBe(false);
  });

  it('the answer card’s counts equal the fold’s, under the served piece’s field names; the serve mode is the run constant', () => {
    renderAt(fixture, last);
    const answer = screen.getByTestId('reasoning-answer');
    const fold = foldFindings(ledger, [{ toolCallId: 'c5' }, { toolCallId: 'c6' }]);
    const counts = Object.fromEntries(
      within(answer)
        .getAllByTestId('reasoning-count')
        .map((c) => [c.getAttribute('data-bucket'), Number(c.getAttribute('data-count'))]),
    );
    expect(counts).toEqual({
      [LABELS.facts]: fold.facts.length,
      [LABELS.limitations]: fold.ruledOut.length,
      [LABELS.evidenceRefs]: fold.open.length,
      [LABELS.nextSteps]: fold.open.filter((s) => s.settles !== undefined).length,
      [LABELS.noise]: fold.noise.length,
      [LABELS.undeclared]: fold.undeclared.length,
    });
    expect(counts).toEqual({ facts: 2, limitations: 1, evidenceRefs: 1, nextSteps: 1, noise: 1, undeclared: 1 });
    expect(within(answer).getByTestId('reasoning-serve').textContent).toBe(`${LABELS.serve} ledger-and-facts`);
    // The record carries no `findingsAnswerAsk` — nothing is drawn for it.
    // The run constant the record carries: the answer ask was on for this run.
    expect(within(answer).getByTestId('reasoning-answer-ask').textContent).toBe(`${LABELS.answerAsk} quote-facts`);
    expect(answer.getAttribute('data-answer-ask')).toBe('quote-facts');
  });
});

describe('<ReasoningLens> laws', () => {
  it('an unarmed run draws nothing at any stop — the root is absent (omit, never deny)', () => {
    const fixture = load('flat-dynamic-tools');
    for (let step = 0; step < fixture.positions.length; step++) {
      renderAt(fixture, step);
      expect(screen.queryByTestId('reasoning-lens')).toBeNull();
      cleanup();
    }
  });

  it('before the first declaration the armed run draws nothing either; at the first tool-calls stop, four undeclared cards and no answer', () => {
    const fixture = load('findings-ledger');
    const [first] = stopsOf(fixture, 'tool-call');
    const firstStep = stepOf(fixture, first!);
    renderAt(fixture, firstStep - 1);
    expect(screen.queryByTestId('reasoning-lens')).toBeNull();
    cleanup();
    renderAt(fixture, firstStep);
    expect(cards().map((c) => c.getAttribute('data-tool-call-id'))).toEqual(['c1', 'c2', 'c3', 'c4']);
    for (const card of cards()) expect(card.getAttribute('data-standing')).toBe(LABELS.undeclared);
    expect(screen.queryByTestId('reasoning-answer')).toBeNull();
    // Epoch 1's wire carried no ticket.
    expect(screen.queryByTestId('reasoning-collapsed')).toBeNull();
  });

  it('with neither `cursor` nor `shared` the lens reads the run’s end and mounts no mover', () => {
    const fixture = load('findings-ledger');
    render(<ReasoningLens runner={fixture.runner} recorder={fixture.recorder} />);
    expect(screen.getByTestId('reasoning-lens').getAttribute('data-step')).toBe(String(fixture.positions.length - 1));
    expect(cards()).toHaveLength(6);
    expect(screen.queryByLabelText('Previous step')).toBeNull();
  });

  it('a record that carries a proposition and a prediction has them quoted verbatim under `tested` / `predicts`', () => {
    const fixture = loadTampered('findings-ledger', (recording) => {
      const bundle = recording.snapshot.commitLog.find(
        (b: FixtureBundle) => Array.isArray(b.overwrite?.findingsLedger),
      ) as FixtureBundle;
      const rows = bundle.overwrite!.findingsLedger as Record<string, unknown>[];
      rows[0]!.proposition = 'fc1/7 is up';
      rows[0]!.predicts = 'state = up';
    });
    renderAt(fixture, fixture.positions.length - 1);
    const before = within(cardOf('c1')).getByTestId('reasoning-before');
    expect(within(before).getByTestId('reasoning-proposition').textContent).toBe(`${LABELS.tested} fc1/7 is up`);
    expect(within(before).getByTestId('reasoning-predicts').textContent).toBe(`${LABELS.predicts} state = up`);
    expect(within(before).getByText('fc1/7 is up').tagName).toBe('Q');
    expect(within(cardOf('c2')).queryByTestId('reasoning-before')).toBeNull();
  });
});

describe('<ReasoningLens> carries the transport when it holds the shared address (0.63.1)', () => {
  function Alone({ fixture }: { readonly fixture: Fixture }) {
    const shared = useSharedCursor(fixture.recorder);
    return <ReasoningLens runner={fixture.runner} recorder={fixture.recorder} shared={shared} />;
  }

  it('mounts the same transport the Context view mounts, and stepping it back trims the calls', () => {
    const fixture = load('findings-ledger');
    render(<Alone fixture={fixture} />);
    const lastStep = fixture.positions.length - 1;
    expect(screen.getByTestId('reasoning-transport')).toBeInTheDocument();
    expect(screen.getByTestId('reasoning-lens').getAttribute('data-step')).toBe(String(lastStep));
    const [first] = stopsOf(fixture, 'tool-call');
    const firstStep = stepOf(fixture, first!);
    for (let i = 0; i < lastStep - firstStep; i++) fireEvent.click(screen.getByLabelText('Previous step'));
    expect(screen.getByTestId('reasoning-lens').getAttribute('data-step')).toBe(String(firstStep));
    expect(cards().map((c) => c.getAttribute('data-tool-call-id'))).toEqual(['c1', 'c2', 'c3', 'c4']);
    // Forward again to the end: the same address, the same cards.
    for (let i = 0; i < lastStep - firstStep; i++) fireEvent.click(screen.getByLabelText('Next step'));
    expect(cards()).toHaveLength(6);
  });

  it('a per-axis `cursor` from a slot brings the host’s mover — none is mounted here', () => {
    const fixture = load('findings-ledger');
    const last = fixture.positions[fixture.positions.length - 1]!;
    render(
      <ReasoningLens
        runner={fixture.runner}
        cursor={lensCursorFrom(fixture.positions, fixture.positions.length - 1, () => undefined)}
      />,
    );
    void last;
    expect(screen.queryByTestId('reasoning-transport')).toBeNull();
  });
});

describe('<ReasoningLens> moves with the ONE cursor', () => {
  function Host({ fixture }: { readonly fixture: Fixture }) {
    const shared = useSharedCursor(fixture.recorder);
    return (
      <>
        <ContextView runner={fixture.runner} recorder={fixture.recorder} shared={shared} />
        <ReasoningLens runner={fixture.runner} recorder={fixture.recorder} shared={shared} />
      </>
    );
  }

  it('walking the Context view’s transport back removes the cards of the calls after the cursor, then the lens itself', () => {
    const fixture = load('findings-ledger');
    const [first, second] = stopsOf(fixture, 'tool-call');
    const firstStep = stepOf(fixture, first!);
    const secondStep = stepOf(fixture, second!);
    render(<Host fixture={fixture} />);
    const lastStep = fixture.positions.length - 1;
    expect(screen.getByTestId('reasoning-lens').getAttribute('data-step')).toBe(String(lastStep));
    expect(cards()).toHaveLength(6);
    expect(screen.getByTestId('reasoning-answer')).toBeInTheDocument();
    const back = (n: number) => {
      for (let i = 0; i < n; i++) fireEvent.click(within(screen.getByTestId('context-transport')).getByLabelText('Previous step'));
    };
    // One step before the answer's declaration: no answer card, c5 undeclared.
    back(lastStep - secondStep);
    expect(screen.getByTestId('reasoning-lens').getAttribute('data-step')).toBe(String(secondStep));
    expect(screen.getByTestId('context-view').getAttribute('data-step')).toBe(String(secondStep));
    expect(cards()).toHaveLength(6);
    expect(screen.queryByTestId('reasoning-answer')).toBeNull();
    expect(cardOf('c5').getAttribute('data-standing')).toBe(LABELS.undeclared);
    expect(cardOf('c1').getAttribute('data-standing')).toBe('fact');
    // Epoch 2's wire had not collapsed anything yet.
    expect(screen.queryByTestId('reasoning-collapsed')).toBeNull();
    back(secondStep - firstStep);
    expect(cards().map((c) => c.getAttribute('data-tool-call-id'))).toEqual(['c1', 'c2', 'c3', 'c4']);
    for (const card of cards()) expect(card.getAttribute('data-standing')).toBe(LABELS.undeclared);
    back(1);
    expect(screen.queryByTestId('reasoning-lens')).toBeNull();
    expect(screen.getByTestId('context-view').getAttribute('data-step')).toBe(String(firstStep - 1));
  });
});

describe('foldReasoning — the fold the lens reads', () => {
  const basis = (toolCallId: string, extra: Record<string, unknown> = {}) => ({
    kind: 'basis',
    toolCallId,
    toolName: 't',
    iteration: 1,
    basis: 'direct',
    ...extra,
  });

  it('a placement ticket is read by shape — the ref and the bytes — from the tool message or the batch', () => {
    const ticket = { placed: true, ref: 'art_1', kind: 'tool-result/t', mediaType: 'text/plain', bytes: 5000, reason: 'r' };
    const fold = foldReasoning({
      rows: [basis('a'), basis('b'), basis('c')],
      history: [{ role: 'tool', toolCallId: 'a', content: JSON.stringify(ticket) }],
      toolResults: [
        { toolCallId: 'b', result: ticket },
        { toolCallId: 'c', result: 'seven c' },
      ],
    });
    expect(fold.cards.map((c) => c.result)).toEqual([
      { placed: { ref: 'art_1', bytes: 5000, kind: 'tool-result/t' } },
      { placed: { ref: 'art_1', bytes: 5000, kind: 'tool-result/t' } },
      { chars: 7 },
    ]);
    expect(Object.isFrozen(fold)).toBe(true);
    expect(Object.isFrozen(fold.cards[0])).toBe(true);
    expect(fold.answer).toBeUndefined();
  });

  it('the proposition, the prediction, `malformed` and `unknownId` ride the rows as declared; a basis row that does not fit is passed over', () => {
    const fold = foldReasoning({
      rows: [
        basis('a', { proposition: 'p', predicts: 'q', malformed: 2, expect: 'high' }),
        { kind: 'basis', toolCallId: 7, basis: 'direct' },
        { kind: 'basis', toolCallId: 'x' },
        basis('a'),
        { kind: 'standing', toolCallId: 'zz', standing: 'noise', assertions: [], declaredOn: 'answer', iteration: 2, unknownId: true },
      ],
    });
    expect(fold.cards.map((c) => c.toolCallId)).toEqual(['a']);
    expect(fold.cards[0]!.before).toEqual({ toolCallId: 'a', toolName: 't', iteration: 1, basis: 'direct', expect: 'high', malformed: 2, proposition: 'p', predicts: 'q' });
    expect(fold.cards[0]!.after).toBeUndefined();
    expect(fold.cards[0]!.result).toBeUndefined();
    // A standing on an id no basis row names is no card — but its answer declaration is.
    expect(fold.findings.standings.get('zz')?.unknownId).toBe(true);
    expect(fold.answer).toEqual({ facts: 0, limitations: 0, evidenceRefs: 0, nextSteps: 0, noise: 1, undeclared: 0 });
  });

  it('the answer card carries the run constants when the record does — `findingsAnswerAsk` as declared, never assumed', () => {
    const rows = [basis('a'), { kind: 'standing', toolCallId: 'a', standing: 'open', settles: 's', assertions: [], declaredOn: 'answer', iteration: 2 }];
    expect(foldReasoning({ rows, findingsServe: 'ledger-only', findingsAnswerAsk: true }).answer).toEqual({
      facts: 0,
      limitations: 0,
      evidenceRefs: 1,
      nextSteps: 1,
      noise: 0,
      undeclared: 0,
      serve: 'ledger-only',
      answerAsk: true,
    });
    expect(foldReasoning({ rows }).answer).toEqual({ facts: 0, limitations: 0, evidenceRefs: 1, nextSteps: 1, noise: 0, undeclared: 0 });
  });

  it('`unknownId` and `declaredOn` ride the standing row; a collapsed ticket on the wire is read by shape', () => {
    const rows = [
      basis('a'),
      { kind: 'standing', toolCallId: 'a', standing: 'fact', assertions: [], declaredOn: { toolCallId: 'b' }, iteration: 2, unknownId: true },
    ];
    const fold = foldReasoning({ rows, asSent: [{ role: 'tool', toolCallId: 'a', content: JSON.stringify({ collapsed: true, standing: 'fact', toolCallId: 'a' }) }] });
    expect(fold.cards[0]!.collapsed).toBe('fact');
    expect(fold.cards[0]!.after?.unknownId).toBe(true);
    expect(fold.cards[0]!.after?.declaredOn).toEqual({ toolCallId: 'b' });
  });
});

// ─── The exchange view (0.63.0) ───────────────────────────────────────────

type HistoryMessage = { role: string; content: string; toolCallId?: string; toolCalls?: { id: string; name: string; args: Record<string, unknown> }[] };

const beats = (): HTMLElement[] => screen.getAllByTestId('reasoning-beat');
const beatOf = (id: string, side: 'model' | 'tool'): HTMLElement => {
  const beat = beats().find((b) => b.getAttribute('data-tool-call-id') === id && b.getAttribute('data-side') === side);
  if (beat === undefined) throw new Error(`no ${side} beat for ${id}`);
  return beat;
};
/** The text of a clipped block: the head `<pre>` and the tail behind the disclosure, joined as the record had them. */
const clippedText = (block: HTMLElement): string =>
  within(block)
    .getAllByTestId('reasoning-pre')
    .map((p) => p.textContent ?? '')
    .join('\n');
const toExchange = (): void => {
  fireEvent.click(screen.getByTestId('reasoning-view-exchange'));
};

describe('<ReasoningLens view> — the exchange', () => {
  const fixture = load('findings-ledger');
  const last = fixture.positions.length - 1;
  const lastStop = fixture.positions[last]!;
  /** The record at the answer stop, read through the join the lens itself reads. */
  const recordAt = (path: string): unknown =>
    contextAt(fixture.snapshot, { runtimeStageId: lastStop.runtimeStageId, commitIdx: lastStop.commitIdx }, {}).keys.find((k) => k.path === path)?.value;
  const history = recordAt('history') as HistoryMessage[];
  const emitted = new Map(history.flatMap((m) => (m.toolCalls ?? []).map((c) => [c.id, c] as const)));
  const toolMessages = new Map(history.filter((m) => m.role === 'tool').map((m) => [m.toolCallId!, m] as const));

  it('the toggle is two real tabs; cards by default, the exchange on click, and back — the cursor untouched', () => {
    renderAt(fixture, last);
    const lens = screen.getByTestId('reasoning-lens');
    expect(lens.getAttribute('data-view')).toBe('cards');
    const tabs = screen.getByTestId('reasoning-view-toggle');
    expect(tabs.getAttribute('role')).toBe('tablist');
    const cardsTab = screen.getByTestId('reasoning-view-cards');
    const exchangeTab = screen.getByTestId('reasoning-view-exchange');
    expect(cardsTab.tagName).toBe('BUTTON');
    expect(cardsTab.getAttribute('aria-selected')).toBe('true');
    expect(exchangeTab.getAttribute('aria-selected')).toBe('false');
    expect(cardsTab.textContent).toBe(LABELS.cards);
    expect(exchangeTab.textContent).toBe(LABELS.exchange);
    expect(screen.getByTestId('reasoning-cards')).toBeInTheDocument();
    expect(screen.queryByTestId('reasoning-exchange')).toBeNull();
    toExchange();
    expect(lens.getAttribute('data-view')).toBe('exchange');
    expect(exchangeTab.getAttribute('aria-selected')).toBe('true');
    expect(cardsTab.getAttribute('aria-selected')).toBe('false');
    expect(screen.queryByTestId('reasoning-cards')).toBeNull();
    expect(screen.queryAllByTestId('reasoning-card')).toHaveLength(0);
    expect(screen.getByTestId('reasoning-exchange')).toBeInTheDocument();
    expect(lens.getAttribute('data-step')).toBe(String(last));
    fireEvent.click(cardsTab);
    expect(screen.getByTestId('reasoning-cards')).toBeInTheDocument();
    expect(screen.queryByTestId('reasoning-exchange')).toBeNull();
  });

  it('`defaultView="exchange"` opens on the exchange', () => {
    render(<ReasoningLens runner={fixture.runner} cursor={lensCursorFrom(fixture.positions, last, () => undefined)} defaultView="exchange" />);
    expect(screen.getByTestId('reasoning-lens').getAttribute('data-view')).toBe('exchange');
    expect(screen.getByTestId('reasoning-view-exchange').getAttribute('aria-selected')).toBe('true');
  });

  it('beats run in wire order — model then tool per call, c1…c6 — then the served piece and the answer', () => {
    renderAt(fixture, last);
    toExchange();
    const shape = beats().map((b) => [b.getAttribute('data-kind'), b.getAttribute('data-side'), b.getAttribute('data-tool-call-id')]);
    expect(shape).toEqual([
      ['call', 'model', 'c1'],
      ['result', 'tool', 'c1'],
      ['call', 'model', 'c2'],
      ['result', 'tool', 'c2'],
      ['call', 'model', 'c3'],
      ['result', 'tool', 'c3'],
      ['call', 'model', 'c4'],
      ['result', 'tool', 'c4'],
      ['call', 'model', 'c5'],
      ['result', 'tool', 'c5'],
      ['call', 'model', 'c6'],
      ['result', 'tool', 'c6'],
      ['served', 'model', null],
      ['answer', 'model', null],
    ]);
    expect(screen.getByTestId('reasoning-exchange').getAttribute('data-beats')).toBe('14');
  });

  it('the model beat prints the emission from `history`: the `_findings` block verbatim, then the remaining args — never from the ledger', () => {
    renderAt(fixture, last);
    toExchange();
    for (const id of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']) {
      const call = emitted.get(id)!;
      const beat = beatOf(id, 'model');
      expect(beat.textContent).toContain(call.name);
      expect(within(beat).queryByTestId('reasoning-from-ledger')).toBeNull();
      const findings = within(beat).getByTestId('reasoning-beat-findings');
      expect(findings.textContent).toContain(LABELS.findings);
      expect(JSON.parse(clippedText(findings))).toEqual(call.args._findings);
      const { _findings, ...rest } = call.args;
      const args = within(beat).getByTestId('reasoning-beat-args');
      expect(args.textContent).toContain(LABELS.args);
      expect(JSON.parse(clippedText(args))).toEqual(rest);
    }
    // c5 carries the `previous[]` declarations — the whole block, as emitted.
    const c5 = JSON.parse(clippedText(within(beatOf('c5', 'model')).getByTestId('reasoning-beat-findings'))) as { previous: unknown[] };
    expect(c5.previous).toHaveLength(4);
    expect(within(within(beatOf('c5', 'model')).getByTestId('reasoning-beat-findings')).getByTestId('reasoning-clipped').getAttribute('data-lines')).toBe(String(JSON.stringify(emitted.get('c5')!.args._findings, null, 2).split('\n').length));
    expect(within(beatOf('c5', 'model')).getByTestId('reasoning-more')).toBeInTheDocument();
    expect(within(beatOf('c1', 'model')).queryByTestId('reasoning-more')).toBeNull();
  });

  it('the tool beat prints the tool message’s content; the collapsed ones carry the chip with the ticket’s standing and the ticket itself', () => {
    renderAt(fixture, last);
    toExchange();
    for (const id of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']) {
      const beat = beatOf(id, 'tool');
      expect(clippedText(within(beat).getByTestId('reasoning-beat-content'))).toBe(toolMessages.get(id)!.content);
      expect(beat.textContent).toContain('lookup');
    }
    const collapsed = beats().filter((b) => within(b).queryByTestId('reasoning-collapsed') !== null);
    expect(collapsed.map((b) => b.getAttribute('data-tool-call-id'))).toEqual(['c2', 'c3']);
    const c3 = beatOf('c3', 'tool');
    expect(within(c3).getByTestId('reasoning-collapsed').textContent).toBe(`${LABELS.collapsed} ruled-out`);
    expect(JSON.parse(clippedText(within(c3).getByTestId('reasoning-beat-ticket')))).toEqual({ collapsed: true, standing: 'ruled-out', toolCallId: 'c3' });
    expect(within(beatOf('c2', 'tool')).getByTestId('reasoning-collapsed').textContent).toBe(`${LABELS.collapsed} noise`);
    expect(within(beatOf('c1', 'tool')).queryByTestId('reasoning-beat-ticket')).toBeNull();
    // The standing the next call declared, drawn on the tool beat — the cards' AFTER, reused.
    expect(within(c3).getByTestId('reasoning-standing').textContent).toBe('ruled-out');
    expect(within(c3).getByTestId('reasoning-line').textContent).toBe(`${LABELS.line} the optic was not swapped this week`);
    expect(within(beatOf('c1', 'tool')).getByTestId('reasoning-line').textContent).toBe('port/fc1/7 · state = up');
    expect(within(beatOf('c1', 'tool')).getByTestId('reasoning-declared-on').textContent).toBe(`${LABELS.declaredOn} c5`);
    expect(within(beatOf('c6', 'tool')).getByTestId('reasoning-standing').textContent).toBe(LABELS.undeclared);
    expect(within(beatOf('c6', 'tool')).queryByTestId('reasoning-line')).toBeNull();
  });

  it('a tool message that parses as JSON is pretty-printed and round-trips to the same object', () => {
    const fixtureJson = loadTampered('findings-ledger', (recording) => {
      for (const b of recording.snapshot.commitLog) {
        const h = b.overwrite?.history as HistoryMessage[] | undefined;
        if (!Array.isArray(h)) continue;
        for (const m of h) if (m.role === 'tool' && m.toolCallId === 'c1') m.content = JSON.stringify({ port: 'fc1/7', state: 'up', counters: [1, 2, 3] });
      }
    });
    renderAt(fixtureJson, fixtureJson.positions.length - 1);
    toExchange();
    const content = within(beatOf('c1', 'tool')).getByTestId('reasoning-beat-content');
    expect(JSON.parse(clippedText(content))).toEqual({ port: 'fc1/7', state: 'up', counters: [1, 2, 3] });
    expect(clippedText(content)).toBe(JSON.stringify({ port: 'fc1/7', state: 'up', counters: [1, 2, 3] }, null, 2));
  });

  it('the served beat prints the findings piece’s text under its own source; the answer beat the record’s `llmLatestContent`, named', () => {
    renderAt(fixture, last);
    toExchange();
    const served = beats().find((b) => b.getAttribute('data-kind') === 'served')!;
    expect(served.getAttribute('data-side')).toBe('model');
    expect(served.textContent).toContain(LABELS.served);
    expect(served.textContent).toContain('findings');
    const text = clippedText(within(served).getByTestId('reasoning-beat-content'));
    expect(text.split('\n')[0]).toContain('[AgentFootprint findings ledger');
    expect(text).toContain('port/fc1/7 · state = up ← tool:c1');
    expect(within(served).getByTestId('reasoning-more')).toBeInTheDocument();
    const answer = beats().find((b) => b.getAttribute('data-kind') === 'answer')!;
    expect(answer.textContent).toContain(LABELS.answer);
    expect(within(answer).getByTestId('reasoning-answer-from').textContent).toBe('llmLatestContent');
    const latest = recordAt('llmLatestContent') as string;
    expect(clippedText(within(answer).getByTestId('reasoning-beat-content'))).toBe(latest);
    expect(JSON.parse(latest)).toEqual({ answer: 'fc1/7' });
  });

  it('at the second tool-calls stop the wire had collapsed nothing, no findings piece was served, and no answer stands', () => {
    const [, second] = stopsOf(fixture, 'tool-call');
    renderAt(fixture, stepOf(fixture, second!));
    toExchange();
    expect(beats().map((b) => b.getAttribute('data-kind'))).toEqual(Array(12).fill(null).map((_, i) => (i % 2 === 0 ? 'call' : 'result')));
    expect(screen.queryByTestId('reasoning-collapsed')).toBeNull();
    expect(screen.queryByTestId('reasoning-beat-ticket')).toBeNull();
    expect(within(beatOf('c3', 'tool')).getByTestId('reasoning-standing').textContent).toBe('ruled-out');
    expect(within(beatOf('c5', 'tool')).getByTestId('reasoning-standing').textContent).toBe(LABELS.undeclared);
  });

  it('a call `history` no longer carries is drawn from the ledger’s basis row and says so', () => {
    const evicted = loadTampered('findings-ledger', (recording) => {
      for (const b of recording.snapshot.commitLog) {
        const h = b.overwrite?.history as HistoryMessage[] | undefined;
        if (!Array.isArray(h)) continue;
        for (const m of h) if (m.role === 'assistant' && m.toolCalls !== undefined) m.toolCalls = m.toolCalls.filter((c) => c.id !== 'c3');
      }
    });
    renderAt(evicted, evicted.positions.length - 1);
    toExchange();
    const c3 = beatOf('c3', 'model');
    expect(within(c3).getByTestId('reasoning-from-ledger').textContent).toBe(LABELS.fromLedger);
    expect(JSON.parse(clippedText(within(c3).getByTestId('reasoning-beat-findings')))).toEqual({
      basis: 'exploratory',
      proposition: 'the optic on fc1/7 was swapped this week',
      predicts: 'a swap event for fc1/7 dated within seven days',
    });
    expect(within(c3).queryByTestId('reasoning-beat-args')).toBeNull();
    expect(within(beatOf('c1', 'model')).queryByTestId('reasoning-from-ledger')).toBeNull();
  });

  it('the unarmed fixture draws no exchange either — the root is absent', () => {
    const unarmed = load('flat-dynamic-tools');
    render(<ReasoningLens runner={unarmed.runner} cursor={lensCursorFrom(unarmed.positions, unarmed.positions.length - 1, () => undefined)} defaultView="exchange" />);
    expect(screen.queryByTestId('reasoning-lens')).toBeNull();
    expect(screen.queryByTestId('reasoning-exchange')).toBeNull();
  });
});

describe('<ReasoningLens view="exchange"> moves with the ONE cursor', () => {
  function Host({ fixture }: { readonly fixture: Fixture }) {
    const shared = useSharedCursor(fixture.recorder);
    return (
      <>
        <ContextView runner={fixture.runner} recorder={fixture.recorder} shared={shared} />
        <ReasoningLens runner={fixture.runner} recorder={fixture.recorder} shared={shared} defaultView="exchange" />
      </>
    );
  }

  it('walking back removes the served and answer beats, then the second batch’s beats, then the lens', () => {
    const fixture = load('findings-ledger');
    const [first, second] = stopsOf(fixture, 'tool-call');
    const firstStep = stepOf(fixture, first!);
    const secondStep = stepOf(fixture, second!);
    render(<Host fixture={fixture} />);
    const lastStep = fixture.positions.length - 1;
    expect(beats()).toHaveLength(14);
    const back = (n: number) => {
      for (let i = 0; i < n; i++) fireEvent.click(within(screen.getByTestId('context-transport')).getByLabelText('Previous step'));
    };
    back(lastStep - secondStep);
    expect(screen.getByTestId('reasoning-lens').getAttribute('data-step')).toBe(String(secondStep));
    expect(screen.getByTestId('reasoning-lens').getAttribute('data-view')).toBe('exchange');
    expect(beats()).toHaveLength(12);
    expect(beats().map((b) => b.getAttribute('data-kind'))).not.toContain('served');
    expect(beats().map((b) => b.getAttribute('data-kind'))).not.toContain('answer');
    expect(screen.queryByTestId('reasoning-collapsed')).toBeNull();
    back(secondStep - firstStep);
    expect(beats().map((b) => b.getAttribute('data-tool-call-id'))).toEqual(['c1', 'c1', 'c2', 'c2', 'c3', 'c3', 'c4', 'c4']);
    for (const b of beats().filter((b) => b.getAttribute('data-side') === 'tool')) {
      expect(within(b).getByTestId('reasoning-standing').textContent).toBe(LABELS.undeclared);
    }
    back(1);
    expect(screen.queryByTestId('reasoning-lens')).toBeNull();
  });
});

describe('foldExchange — the fold the exchange reads', () => {
  const basis = (toolCallId: string, extra: Record<string, unknown> = {}) => ({ kind: 'basis', toolCallId, toolName: 't', iteration: 1, basis: 'direct', ...extra });

  it('the emission is read from `history` by id; a call not there is `fromLedger` with the basis row’s declaration', () => {
    const fold = foldExchange({
      rows: [basis('a'), basis('b', { expect: 'low', proposition: 'p', predicts: 'q' })],
      history: [
        { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 'tool-a', args: { q: 1, _findings: { basis: 'direct' } } }] },
        { role: 'tool', toolCallId: 'a', content: 'seven c' },
      ],
    });
    expect(fold.beats).toEqual([
      { kind: 'call', side: 'model', toolCallId: 'a', toolName: 'tool-a', findings: { basis: 'direct' }, args: { q: 1 }, fromLedger: false },
      { kind: 'result', side: 'tool', toolCallId: 'a', toolName: 'tool-a', content: 'seven c' },
      { kind: 'call', side: 'model', toolCallId: 'b', toolName: 't', findings: { basis: 'direct', expect: 'low', proposition: 'p', predicts: 'q' }, fromLedger: true },
    ]);
    expect(Object.isFrozen(fold)).toBe(true);
    expect(Object.isFrozen(fold.beats[0])).toBe(true);
    expect(fold.reasoning.cards).toHaveLength(2);
  });

  it('a placement ticket, a collapsed ticket and the standing ride the result beat; the served piece and the answer close the exchange', () => {
    const ticket = { placed: true, ref: 'art_1', bytes: 5000 };
    const fold = foldExchange({
      rows: [basis('a'), { kind: 'standing', toolCallId: 'a', standing: 'noise', assertions: [], declaredOn: 'answer', iteration: 2 }],
      toolResults: [{ toolCallId: 'a', result: ticket }],
      asSent: [{ role: 'tool', toolCallId: 'a', content: JSON.stringify({ collapsed: true, standing: 'noise', toolCallId: 'a' }) }],
      pieces: [
        { slot: 'system-prompt', source: 'base', text: 'bot' },
        { slot: 'system-prompt', source: 'findings', text: 'ledger text' },
      ],
      finalContent: 'the answer',
      llmLatestContent: 'later',
    });
    const [, result, served, answer] = fold.beats;
    expect(result).toMatchObject({ kind: 'result', content: ticket, placed: { ref: 'art_1', bytes: 5000 }, collapsed: { standing: 'noise' } });
    expect((result as { collapsed: { content: string } }).collapsed.content).toBe('{"collapsed":true,"standing":"noise","toolCallId":"a"}');
    expect((result as { after: { standing: string } }).after.standing).toBe('noise');
    expect(served).toEqual({ kind: 'served', side: 'model', source: 'findings', text: 'ledger text' });
    expect(answer).toEqual({ kind: 'answer', side: 'model', text: 'the answer', from: 'finalContent' });
  });

  it('the answer is `history`’s closing assistant message first; `llmLatestContent` only once `llmLatestToolCalls` is empty; none otherwise', () => {
    const rows = [basis('a')];
    const closing = [{ role: 'tool', toolCallId: 'a', content: 'r' }, { role: 'assistant', content: 'done' }];
    const lastBeat = (input: Parameters<typeof foldExchange>[0]) => {
      const b = foldExchange(input).beats;
      return b[b.length - 1];
    };
    expect(lastBeat({ rows, history: closing, finalContent: 'x' })).toEqual({ kind: 'answer', side: 'model', text: 'done', from: 'history' });
    expect(lastBeat({ rows, llmLatestContent: 'late', llmLatestToolCalls: [] })).toEqual({ kind: 'answer', side: 'model', text: 'late', from: 'llmLatestContent' });
    expect(foldExchange({ rows, llmLatestContent: 'late', llmLatestToolCalls: [{ id: 'b' }] }).beats.map((b) => b.kind)).toEqual(['call']);
    expect(foldExchange({ rows, finalContent: '', llmLatestContent: '' }).beats.map((b) => b.kind)).toEqual(['call']);
    // An assistant message with tool calls is not an answer.
    expect(foldExchange({ rows, history: [{ role: 'assistant', content: 'c', toolCalls: [{ id: 'a' }] }] }).beats.map((b) => b.kind)).toEqual(['call']);
  });
});
