/**
 * <FindingsBand> — the model's own ledger at the cursor, on the recorded
 * `findings-ledger` fixture (agentfootprint 9.101.1, generated alone).
 *
 * Test types: Render (the six groups from the record's rows) · Law (a
 * conflict shows every witness with its current standing and no verdict; a
 * result with no standing is UNDECLARED, never `open`; an empty group is not
 * rendered; an unarmed run has no band) · Functional (the band moves with the
 * ONE cursor — absent before the stop that wrote the key, `entered` at it,
 * `changed` at the next write) · Unit (the fold: the LAST standing row per
 * result is current; a conflict row is HISTORY — a witness ruled out later
 * keeps its row and reads `ruled-out` on it, the lens computing no current
 * conflict set; rows that do not fit their kind's shape are passed over).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { lensCursorFrom } from '../../src/core/cursor/lensCursor.js';
import { foldFactsAt } from '../../src/core/served/index.js';
import { ContextView } from '../../src/react/components/ContextView.js';
import { FindingsBand, LABELS, foldFindings } from '../../src/react/components/FindingsBand.js';
import { useSharedCursor } from '../../src/react/useSharedCursor.js';
import { load, stopsOf } from '../served/helpers.js';

afterEach(cleanup);

/** The grouped-axis index of a stop. */
const stepOf = (fixture: ReturnType<typeof load>, stop: { runtimeStageId: string; commitIdx: number }): number =>
  fixture.positions.findIndex((p) => p.runtimeStageId === stop.runtimeStageId && p.commitIdx === stop.commitIdx);

/** The view at one grouped-axis step, handed the ONE cursor and the stop before it. */
function renderAt(fixture: ReturnType<typeof load>, step: number): void {
  const cursor = lensCursorFrom(fixture.positions, step, () => undefined);
  const before = fixture.positions[step - 1];
  render(
    <ContextView
      runner={fixture.runner}
      cursor={cursor}
      {...(before !== undefined ? { previous: { runtimeStageId: before.runtimeStageId, commitIdx: before.commitIdx } } : {})}
    />,
  );
}

describe('<FindingsBand> at the end of the armed run', () => {
  const fixture = load('findings-ledger');
  const last = fixture.positions.length - 1;
  const lastStop = fixture.positions[last]!;
  // The record's own rows at the stop — what every expectation below is read against.
  const ledger = foldFactsAt(fixture.snapshot, { runtimeStageId: lastStop.runtimeStageId, commitIdx: lastStop.commitIdx })
    .findingsLedger as readonly Record<string, unknown>[];

  it('renders the band with the row count off the fold, and each group with the count of what the record holds', () => {
    renderAt(fixture, last);
    const band = screen.getByTestId('context-findings');
    expect(band.getAttribute('data-rows')).toBe(String(ledger.length));
    expect(band.textContent).toContain(`${LABELS.band} · ${ledger.length} ${LABELS.rows}`);
    // The fixture's standings: c1 fact, c2 noise, c3 ruled-out, c4 open, c5
    // fact (on the answer); one conflict row (c1 vs c5); c6 never named.
    expect(within(band).getByTestId('context-findings-facts').getAttribute('data-count')).toBe('2');
    expect(within(band).getByTestId('context-findings-conflicts').getAttribute('data-count')).toBe('1');
    expect(within(band).getByTestId('context-findings-open').getAttribute('data-count')).toBe('1');
    expect(within(band).getByTestId('context-findings-ruled-out').getAttribute('data-count')).toBe('1');
    expect(within(band).getByTestId('context-findings-noise').getAttribute('data-count')).toBe('1');
    expect(within(band).getByTestId('context-findings-undeclared').getAttribute('data-count')).toBe('1');
  });

  it('a fact is its assertion — subject kind/id · predicate = value ← provenance — every part off the record', () => {
    renderAt(fixture, last);
    const facts = within(screen.getByTestId('context-findings-facts')).getAllByTestId('context-findings-fact');
    expect(facts.map((f) => f.getAttribute('data-tool-call-id'))).toEqual(['c1', 'c5']);
    const standingRows = ledger.filter((r) => r.kind === 'standing' && r.standing === 'fact') as {
      toolCallId: string;
      assertions: { subject: { kind: string; id: string }; predicate: string; value: unknown; provenance: string }[];
    }[];
    for (const [i, row] of standingRows.entries()) {
      const a = row.assertions[0]!;
      expect(facts[i]!.textContent).toBe(`${a.subject.kind}/${a.subject.id} · ${a.predicate} = ${a.value} ← ${a.provenance}`);
    }
    // The two facts disagree on one value; the band prints both, unranked.
    expect(facts[0]!.textContent).toContain('= up ←');
    expect(facts[1]!.textContent).toContain('= down ←');
  });

  it('the conflict shows the shared key and BOTH witnesses — identities from the ConflictRow, each with its current standing, and no verdict', () => {
    renderAt(fixture, last);
    const conflictRow = ledger.find((r) => r.kind === 'conflict') as {
      key: string;
      witnesses: { toolCallId: string; subject: { kind: string; id: string }; predicate: string }[];
    };
    const group = screen.getByTestId('context-findings-conflicts');
    // The group is named as the rows' HISTORY (when each conflict was first
    // seen), never as a current set the lens did not compute.
    expect(group.textContent).toContain(`${LABELS.conflicts} · 1`);
    expect(LABELS.conflicts).toBe('conflicts first seen');
    const [conflict] = within(group).getAllByTestId('context-findings-conflict');
    expect(conflict!.getAttribute('data-key')).toBe(conflictRow.key);
    const witnesses = within(conflict!).getAllByTestId('context-findings-witness');
    expect(witnesses.map((w) => w.getAttribute('data-tool-call-id'))).toEqual(
      conflictRow.witnesses.map((w) => w.toolCallId),
    );
    expect(witnesses.map((w) => w.getAttribute('data-tool-call-id'))).toEqual(['c1', 'c5']);
    // At the answer both witnesses still stand as `fact` — the fold's own word
    // for each, stamped on the witness, not a verdict on the conflict.
    expect(witnesses.map((w) => w.getAttribute('data-standing'))).toEqual(['fact', 'fact']);
    for (const [i, w] of conflictRow.witnesses.entries()) {
      expect(witnesses[i]!.textContent).toBe(`${w.subject.kind}/${w.subject.id} · ${w.predicate} ← ${w.toolCallId} · fact`);
    }
    // Nothing beyond the witnesses' own parts: no value, no ranking word.
    expect(conflict!.textContent).toBe(witnesses.map((w) => w.textContent).join(''));
  });

  it('open carries its quoted assertion and `settles`; ruled-out carries its `line` — the model’s words, labelled by field', () => {
    renderAt(fixture, last);
    const openRow = ledger.find((r) => r.kind === 'standing' && r.standing === 'open') as { toolCallId: string; toolName: string; settles: string };
    const [open] = within(screen.getByTestId('context-findings-open')).getAllByTestId('context-findings-open-row');
    expect(open!.getAttribute('data-tool-call-id')).toBe(openRow.toolCallId);
    expect(open!.textContent).toContain(`${openRow.toolCallId} · ${openRow.toolName}`);
    expect(within(open!).getByTestId('context-findings-assertion').textContent).toBe('port/fc1/7 · flapping = true');
    expect(open!.textContent).toContain(`${LABELS.settles} · ${openRow.settles}`);

    const ruledRow = ledger.find((r) => r.kind === 'standing' && r.standing === 'ruled-out') as { toolCallId: string; line: string };
    const [ruled] = within(screen.getByTestId('context-findings-ruled-out')).getAllByTestId('context-findings-ruled-out-row');
    expect(ruled!.getAttribute('data-tool-call-id')).toBe(ruledRow.toolCallId);
    expect(ruled!.textContent).toContain(`${LABELS.line} · ${ruledRow.line}`);
  });

  it('noise is a count and the ids; undeclared is a count and the ids of the batch results no standing names — never `open`', () => {
    renderAt(fixture, last);
    const noise = screen.getByTestId('context-findings-noise');
    expect(within(noise).getAllByTestId('context-findings-noise-id').map((c) => c.textContent)).toEqual(['c2']);
    expect(noise.textContent).toContain(`${LABELS.noise} · 1`);
    // At the answer, the batch is c5 and c6; c5 has a standing, c6 has none.
    const undeclared = screen.getByTestId('context-findings-undeclared');
    expect(within(undeclared).getAllByTestId('context-findings-undeclared-id').map((c) => c.textContent)).toEqual(['c6']);
    expect(undeclared.textContent).toContain(`${LABELS.undeclared} · 1`);
    expect(undeclared.textContent).not.toContain(LABELS.open);
    expect(within(screen.getByTestId('context-findings-open')).queryByText('c6')).toBeNull();
  });
});

describe('<FindingsBand> laws', () => {
  it('an unarmed run has no band at any stop — absent, never an empty ledger', () => {
    const fixture = load('flat-dynamic-tools');
    for (let step = 0; step < fixture.positions.length; step++) {
      renderAt(fixture, step);
      expect(screen.queryByTestId('context-findings')).toBeNull();
      cleanup();
    }
  });

  it('an empty group is not rendered: at the first write only basis rows are on the record, so only the undeclared batch shows', () => {
    const fixture = load('findings-ledger');
    const [first] = stopsOf(fixture, 'tool-call');
    renderAt(fixture, stepOf(fixture, first!));
    const band = screen.getByTestId('context-findings');
    expect(band.getAttribute('data-rows')).toBe('4');
    for (const group of ['facts', 'conflicts', 'open', 'ruled-out', 'noise']) {
      expect(within(band).queryByTestId(`context-findings-${group}`)).toBeNull();
    }
    const undeclared = within(band).getByTestId('context-findings-undeclared');
    expect(within(undeclared).getAllByTestId('context-findings-undeclared-id').map((c) => c.textContent)).toEqual([
      'c1',
      'c2',
      'c3',
      'c4',
    ]);
    expect(band.textContent).not.toContain(LABELS.open);
    expect(band.textContent).not.toContain(LABELS.facts);
  });

  it('the band stands under the record layer — after the key table, before the why band', () => {
    const fixture = load('findings-ledger');
    renderAt(fixture, fixture.positions.length - 1);
    const keys = screen.getByTestId('context-keys');
    const band = screen.getByTestId('context-findings');
    expect(keys.compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The key table lists the same key the band folds — one fold, two readings.
    expect(screen.getAllByTestId('context-key').some((r) => r.getAttribute('data-path') === 'findingsLedger')).toBe(true);
  });
});

describe('<FindingsBand> moves with the ONE cursor', () => {
  function Host({ fixture }: { readonly fixture: ReturnType<typeof load> }) {
    const shared = useSharedCursor(fixture.recorder);
    return <ContextView runner={fixture.runner} recorder={fixture.recorder} shared={shared} />;
  }

  it('walking back on the shared cursor: present and `changed` at the second write, `entered` at the first, absent the stop before', () => {
    const fixture = load('findings-ledger');
    const [first, second] = stopsOf(fixture, 'tool-call');
    const firstStep = stepOf(fixture, first!);
    const secondStep = stepOf(fixture, second!);
    expect(firstStep).toBeGreaterThan(0);
    expect(secondStep).toBeGreaterThan(firstStep);
    render(<Host fixture={fixture} />);
    const lastStep = fixture.positions.length - 1;
    expect(screen.getByTestId('context-view').getAttribute('data-step')).toBe(String(lastStep));
    expect(screen.getByTestId('context-findings')).toBeInTheDocument();
    const back = (n: number) => {
      for (let i = 0; i < n; i++) fireEvent.click(screen.getByLabelText('Previous step'));
    };
    back(lastStep - secondStep);
    expect(screen.getByTestId('context-view').getAttribute('data-step')).toBe(String(secondStep));
    expect(screen.getByTestId('context-findings').getAttribute('data-since')).toBe('changed');
    expect(screen.getByTestId('context-findings').getAttribute('data-rows')).toBe('10');
    // Batch 2 is on the record now, and neither of its results has been named yet.
    expect(
      within(screen.getByTestId('context-findings-undeclared'))
        .getAllByTestId('context-findings-undeclared-id')
        .map((c) => c.textContent),
    ).toEqual(['c5', 'c6']);
    back(secondStep - firstStep);
    expect(screen.getByTestId('context-view').getAttribute('data-step')).toBe(String(firstStep));
    expect(screen.getByTestId('context-findings').getAttribute('data-since')).toBe('entered');
    expect(screen.getByTestId('context-findings').getAttribute('data-rows')).toBe('4');
    back(1);
    expect(screen.getByTestId('context-view').getAttribute('data-step')).toBe(String(firstStep - 1));
    expect(screen.queryByTestId('context-findings')).toBeNull();
  });
});

describe('foldFindings — the fold the band reads', () => {
  const fact = (toolCallId: string, value: unknown, declaredOn: unknown = 'answer') => ({
    kind: 'standing',
    toolCallId,
    standing: 'fact',
    assertions: [{ subject: { kind: 'port', id: 'p1' }, predicate: 'state', value, stratum: 'asserted', provenance: `tool:${toolCallId}` }],
    declaredOn,
    iteration: 2,
  });

  it('the LAST standing row per result is the current one — an earlier fact re-declared as noise is noise, its assertion gone', () => {
    const rows = [
      { kind: 'basis', toolCallId: 'a', toolName: 't', iteration: 1, basis: 'direct' },
      fact('a', 'up', { toolCallId: 'b' }),
      { kind: 'standing', toolCallId: 'a', standing: 'noise', assertions: [], declaredOn: 'answer', iteration: 3 },
    ];
    const fold = foldFindings(rows, [{ toolCallId: 'b', toolName: 't', result: '' }]);
    expect(fold.rows).toBe(3);
    expect(fold.facts).toEqual([]);
    expect(fold.noise).toEqual(['a']);
    expect(fold.undeclared).toEqual(['b']);
    expect(Object.isFrozen(fold)).toBe(true);
  });

  it('a row that does not fit its kind’s shape is passed over; a standing outside the four is neither grouped nor undeclared', () => {
    const rows = [
      { kind: 'standing', toolCallId: 42, standing: 'fact' },
      { kind: 'standing', toolCallId: 'x', standing: 'maybe', assertions: [], declaredOn: 'answer', iteration: 1 },
      { kind: 'conflict', key: 'k', witnesses: [{ toolCallId: 'a', subject: { kind: 's', id: '1' }, predicate: 'p' }, { nonsense: true }] },
      null,
      'not a row',
    ];
    const fold = foldFindings(rows, [{ toolCallId: 'x' }, { toolCallId: 'y' }, { noId: true }]);
    expect(fold.facts).toEqual([]);
    expect(fold.open).toEqual([]);
    expect(fold.ruledOut).toEqual([]);
    expect(fold.noise).toEqual([]);
    // `x` HAS a standing row (unreadable as a group, still a declaration); `y` has none.
    expect(fold.undeclared).toEqual(['y']);
    expect(fold.conflicts).toHaveLength(1);
    expect(fold.conflicts[0]!.witnesses.map((w) => w.toolCallId)).toEqual(['a']);
  });

  it('a conflict row is HISTORY: a witness later ruled out keeps its row, reads `ruled-out` on it, and sits in the ruled-out group — the lens computes no current set', () => {
    // The library writes the conflict row ONCE (c1 up vs c5 down); the answer
    // then rules c5 out. `foldLedger(...).conflicts` in agentfootprint is now
    // empty — a recomputation over current fact VALUES this lens does not
    // re-derive — so the row stays, named as first seen, and each witness
    // carries where it stands now.
    const conflict = {
      kind: 'conflict',
      key: 'port p1 state ',
      witnesses: [
        { toolCallId: 'c1', subject: { kind: 'port', id: 'p1' }, predicate: 'state' },
        { toolCallId: 'c5', subject: { kind: 'port', id: 'p1' }, predicate: 'state' },
      ],
      iteration: 3,
    };
    const rows = [
      fact('c1', 'up', { toolCallId: 'c5' }),
      fact('c5', 'down'),
      conflict,
      { kind: 'standing', toolCallId: 'c5', standing: 'ruled-out', line: 'a stale read', assertions: [], declaredOn: 'answer', iteration: 4 },
    ];
    const fold = foldFindings(rows);
    expect(fold.facts.map((f) => f.toolCallId)).toEqual(['c1']);
    expect(fold.ruledOut.map((s) => s.toolCallId)).toEqual(['c5']);
    expect(fold.conflicts).toHaveLength(1);
    expect(fold.conflicts[0]!.key).toBe(conflict.key);
    expect(fold.conflicts[0]!.witnesses.map((w) => [w.toolCallId, w.standing])).toEqual([
      ['c1', 'fact'],
      ['c5', 'ruled-out'],
    ]);
    expect(Object.isFrozen(fold.conflicts[0])).toBe(true);
    expect(Object.isFrozen(fold.conflicts[0]!.witnesses[0])).toBe(true);

    // Rendered: the group is named as first seen; the retired witness prints
    // its own standing beside its id and appears under ruled out too.
    render(<FindingsBand rows={rows} />);
    const group = screen.getByTestId('context-findings-conflicts');
    expect(group.getAttribute('data-count')).toBe('1');
    expect(group.textContent).toContain(`${LABELS.conflicts} · 1`);
    const witnesses = within(group).getAllByTestId('context-findings-witness');
    expect(witnesses.map((w) => w.getAttribute('data-standing'))).toEqual(['fact', 'ruled-out']);
    expect(witnesses[1]!.textContent).toBe('port/p1 · state ← c5 · ruled-out');
    const ruled = within(screen.getByTestId('context-findings-ruled-out')).getAllByTestId('context-findings-ruled-out-row');
    expect(ruled.map((r) => r.getAttribute('data-tool-call-id'))).toEqual(['c5']);
    expect(screen.getByTestId('context-findings-facts').getAttribute('data-count')).toBe('1');
  });

  it('a witness with no standing row at all carries no standing — absent, never inferred', () => {
    const rows = [
      { kind: 'conflict', key: 'k', witnesses: [{ toolCallId: 'z', subject: { kind: 's', id: '1' }, predicate: 'p' }], iteration: 1 },
    ];
    const fold = foldFindings(rows);
    expect(fold.conflicts[0]!.witnesses[0]).toEqual({ toolCallId: 'z', subject: { kind: 's', id: '1' }, predicate: 'p' });
    expect('standing' in fold.conflicts[0]!.witnesses[0]!).toBe(false);
    render(<FindingsBand rows={rows} />);
    const [w] = screen.getAllByTestId('context-findings-witness');
    expect(w!.getAttribute('data-standing')).toBe('');
    expect(w!.textContent).toBe('s/1 · p ← z');
  });

  it('rendered alone, a fold with nothing to group prints the row count and no group', () => {
    render(<FindingsBand rows={[{ kind: 'basis', toolCallId: 'a', toolName: 't', iteration: 1, basis: 'direct' }]} />);
    const band = screen.getByTestId('context-findings');
    expect(band.getAttribute('data-rows')).toBe('1');
    expect(band.getAttribute('data-since')).toBe('');
    expect(band.querySelectorAll('[data-testid^="context-findings-"]')).toHaveLength(0);
  });
});
