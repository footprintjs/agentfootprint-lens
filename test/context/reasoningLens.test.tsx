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
 * that does not fit is passed over).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { lensCursorFrom } from '../../src/core/cursor/lensCursor.js';
import { foldFactsAt } from '../../src/core/served/index.js';
import { ContextView } from '../../src/react/components/ContextView.js';
import { foldFindings } from '../../src/react/components/FindingsBand.js';
import { LABELS, ReasoningLens, foldReasoning } from '../../src/react/components/ReasoningLens.js';
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
      for (let i = 0; i < n; i++) fireEvent.click(screen.getByLabelText('Previous step'));
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
