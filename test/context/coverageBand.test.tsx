/**
 * <CoverageBand> — what the tools declared they checked, did not check and
 * can never cover, on the recorded `coverage` fixture (agentfootprint 9.109.1,
 * generated alone).
 *
 * Test types: Render (the boundary lists every item of the fixture's
 * declarations, deduped, in the right sections, each with the tools that
 * declared it; the by-call blocks match the record row by row) · Law (the
 * tracked key at the stop — one declaration at the first tool-calls stop, two
 * at the second, nothing before; absent on an unarmed run at every stop —
 * omit, never deny; the library's own equality, pinned against the block the
 * library composed onto the answer; malformed rows dropped one by one; the
 * fold at twelve; no mover of the band's own) · Determinism (the same bytes
 * on two renders) · Functional (inside `<ReasoningLens>` with `shared` the
 * band renders under the cards, the transport steps the cursor, and the
 * no-ledger run renders the band alone; standalone beside `<ContextView>` it
 * follows the ONE cursor) · Unit (`foldCoverage`, `coverageRecordOf`,
 * `sameItem`).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { COVERAGE_BLOCK_HEADING } from 'agentfootprint';

import { contextAt } from '../../src/core/context/contextAt.js';
import { lensCursorFrom } from '../../src/core/cursor/lensCursor.js';
import { ContextView } from '../../src/react/components/ContextView.js';
import {
  CoverageBand,
  CoverageRows,
  LABELS,
  coverageRecordOf,
  foldCoverage,
  sameItem,
  type CoverageSection,
} from '../../src/react/components/CoverageBand.js';
import { LABELS as REASONING_LABELS, ReasoningLens } from '../../src/react/components/ReasoningLens.js';
import { useSharedCursor } from '../../src/react/useSharedCursor.js';
import { load, loadTampered, stopsOf, type FixtureBundle } from '../served/helpers.js';

afterEach(cleanup);

type Fixture = ReturnType<typeof load>;

interface ItemShape {
  readonly what: string;
  readonly why?: string;
}

interface RowShape {
  readonly kind: string;
  readonly toolName: string;
  readonly toolCallId?: string;
  readonly iteration: number;
  readonly lookedFor?: string;
  readonly checked: readonly ItemShape[];
  readonly notChecked: readonly ItemShape[];
  readonly cannotCover: readonly ItemShape[];
}

const SECTIONS: readonly CoverageSection[] = ['checked', 'notChecked', 'cannotCover'];

/** The grouped-axis index of a stop. */
const stepOf = (fixture: Fixture, stop: { runtimeStageId: string; commitIdx: number }): number =>
  fixture.positions.findIndex((p) => p.runtimeStageId === stop.runtimeStageId && p.commitIdx === stop.commitIdx);

/** The rows as the record holds them at one step — the test's oracle, never a hand-written copy. */
function rowsAt(fixture: Fixture, step: number): readonly RowShape[] | undefined {
  const stop = fixture.positions[step]!;
  const value = contextAt(fixture.snapshot, { runtimeStageId: stop.runtimeStageId, commitIdx: stop.commitIdx }, {}).keys.find(
    (k) => k.path === 'coverageDeclared',
  )?.value;
  return Array.isArray(value) ? (value as RowShape[]) : undefined;
}

/**
 * The block the LIBRARY composed onto the answer (`composeAnswerWithCoverage`,
 * on the `agentfootprint.agent.turn_end` event's `payload.finalContent`),
 * parsed back into its three sections — what the append showed the end user.
 */
function libraryBlock(fixture: Fixture): Record<CoverageSection, ItemShape[]> {
  const events = fixture.recording.events as readonly { type?: string; payload?: { finalContent?: unknown } }[];
  const text = events.find((e) => e.type === 'agentfootprint.agent.turn_end')?.payload?.finalContent;
  if (typeof text !== 'string') throw new Error('the fixture carries no turn_end finalContent');
  const at = text.indexOf(COVERAGE_BLOCK_HEADING);
  if (at < 0) throw new Error('the answer carries no coverage block');
  const names: Record<string, CoverageSection> = { Checked: 'checked', 'Not checked': 'notChecked', 'Cannot cover': 'cannotCover' };
  const out: Record<CoverageSection, ItemShape[]> = { checked: [], notChecked: [], cannotCover: [] };
  for (const para of text.slice(at).split('\n\n')) {
    const [head, ...lines] = para.split('\n');
    const section = head !== undefined && head.endsWith(':') ? names[head.slice(0, -1)] : undefined;
    if (section === undefined || lines.length === 0) continue;
    out[section] = lines.map((line) => {
      const [what, ...why] = line.replace(/^- /, '').split(' — ');
      return why.length > 0 ? { what: what!, why: why.join(' — ') } : { what: what! };
    });
  }
  return out;
}

/** The band at one grouped-axis step, handed the ONE cursor. */
function renderAt(fixture: Fixture, step: number): void {
  render(<CoverageBand runner={fixture.runner} cursor={lensCursorFrom(fixture.positions, step, () => undefined)} />);
}

const itemsOf = (section: HTMLElement): ItemShape[] =>
  within(section)
    .getAllByTestId('coverage-item')
    .map((li) => {
      const why = within(li).queryByTestId('coverage-why');
      return {
        what: within(li).getByTestId('coverage-what').textContent!,
        ...(why !== null ? { why: why.textContent!.replace(/^ — /, '') } : {}),
      };
    });

const sectionOf = (scope: HTMLElement, section: CoverageSection): HTMLElement | null =>
  within(scope)
    .queryAllByTestId('coverage-section')
    .find((el) => el.getAttribute('data-section') === section) ?? null;

const calls = (): HTMLElement[] => screen.getAllByTestId('coverage-call');

describe('<CoverageBand> at the end of the run whose tools declared their coverage', () => {
  const fixture = load('coverage');
  const last = fixture.positions.length - 1;
  const rows = rowsAt(fixture, last)!;
  const block = libraryBlock(fixture);

  it('the record: two declarations, a ledger then an absence, and the library’s block on the answer', () => {
    expect(rows.map((r) => [r.toolName, r.kind, r.iteration])).toEqual([
      ['zone_membership', 'ledger', 1],
      ['flogi_for_port', 'absence', 2],
    ]);
    expect(block.checked).toHaveLength(3);
    expect(block.notChecked).toHaveLength(1);
    expect(block.cannotCover).toHaveLength(2);
  });

  it('the root counts the declarations; the boundary lists every item the block listed, deduped, in the block’s order per section', () => {
    renderAt(fixture, last);
    const root = screen.getByTestId('coverage-band');
    expect(root.getAttribute('data-declarations')).toBe(String(rows.length));
    expect(root.getAttribute('data-step')).toBe(String(last));
    const boundary = screen.getByTestId('coverage-boundary');
    for (const section of SECTIONS) {
      const el = sectionOf(boundary, section)!;
      expect(el, section).not.toBeNull();
      expect(itemsOf(el)).toEqual(block[section]);
      expect(el.getAttribute('data-count')).toBe(String(block[section].length));
      expect(within(el).getByTestId('coverage-section-chip').textContent).toBe(LABELS[section]);
    }
    // The three sections in the block's order, no fourth.
    expect(within(boundary).getAllByTestId('coverage-section').map((el) => el.getAttribute('data-section'))).toEqual([...SECTIONS]);
  });

  it('`data-declared-by` names every tool that declared an item, in landed order — the append never said which', () => {
    renderAt(fixture, last);
    const boundary = screen.getByTestId('coverage-boundary');
    const declaredBy = (section: CoverageSection): Record<string, string | null> =>
      Object.fromEntries(
        within(sectionOf(boundary, section)!)
          .getAllByTestId('coverage-item')
          .map((li) => [`${within(li).getByTestId('coverage-what').textContent}|${within(li).queryByTestId('coverage-why')?.textContent ?? ''}`, li.getAttribute('data-declared-by')]),
      );
    expect(declaredBy('checked')).toEqual({
      'shq-fab-a: the live fcns database|': 'zone_membership,flogi_for_port',
      'window: the last 24h| — the active zoneset is read live': 'zone_membership',
      'window: the last 24h| — FLOGI history retention on this fabric': 'flogi_for_port',
    });
    expect(declaredBy('notChecked')).toEqual({ 'the archived zoneset history| — older than the 24h window': 'zone_membership' });
    expect(declaredBy('cannotCover')).toEqual({
      'ports on the peer fabric| — this collector is scoped to one fabric': 'zone_membership,flogi_for_port',
      'host-side multipathing| — no collector runs on the ESX hosts': 'zone_membership',
    });
    // The visible names are the same list.
    const shared = within(sectionOf(boundary, 'checked')!)
      .getAllByTestId('coverage-item')
      .find((li) => li.getAttribute('data-declared-by')?.includes(','))!;
    expect(within(shared).getByTestId('coverage-declared-by').textContent).toBe('zone_membership, flogi_for_port');
  });

  it('the equality is the library’s: the same `what` under two `why`s is two entries in the block and two on the band', () => {
    const window = block.checked.filter((i) => i.what === 'window: the last 24h');
    expect(window).toHaveLength(2);
    expect(window[0]!.why).not.toBe(window[1]!.why);
    renderAt(fixture, last);
    const checked = sectionOf(screen.getByTestId('coverage-boundary'), 'checked')!;
    expect(itemsOf(checked).filter((i) => i.what === 'window: the last 24h')).toEqual(window);
    // The copied rule, on the same case — and on the one the library folds.
    expect(sameItem(window[0]!, window[1]!)).toBe(false);
    expect(sameItem({ what: 'ports on the peer fabric', why: 'this collector is scoped to one fabric' }, rows[1]!.cannotCover[0]!)).toBe(true);
    expect(sameItem({ what: 'a' }, { what: 'a', why: '' })).toBe(true);
    expect(sameItem({ what: 'a' }, { what: 'a', why: 'b' })).toBe(false);
    expect(sameItem({ what: 'a', why: 'b' }, { what: 'A', why: 'b' })).toBe(false);
  });

  it('the by-call blocks match the record row by row: tool, id, kind, iteration, lookedFor, and the three lists as declared', () => {
    renderAt(fixture, last);
    const blocks = calls();
    expect(blocks).toHaveLength(rows.length);
    rows.forEach((row, i) => {
      const el = blocks[i]!;
      expect(el.getAttribute('data-tool')).toBe(row.toolName);
      expect(el.getAttribute('data-kind')).toBe(row.kind);
      expect(el.getAttribute('data-iteration')).toBe(String(row.iteration));
      expect(el.getAttribute('data-tool-call-id')).toBe(row.toolCallId);
      expect(within(el).getByTestId('coverage-kind').textContent).toBe(row.kind);
      const id = within(el).getByTestId('coverage-call-id');
      expect(id.textContent).toBe(row.toolCallId);
      expect(id.getAttribute('title')).toBe(row.toolCallId);
      const lookedFor = within(el).queryByTestId('coverage-looked-for');
      if (row.lookedFor !== undefined) {
        expect(lookedFor!.textContent).toBe(`${LABELS.lookedFor} ${row.lookedFor}`);
        expect(within(lookedFor!).getByText(row.lookedFor).tagName).toBe('Q');
      } else expect(lookedFor).toBeNull();
      for (const section of SECTIONS) {
        const sec = sectionOf(el, section);
        if (row[section].length === 0) expect(sec, `${row.toolName} ${section}`).toBeNull();
        else {
          expect(itemsOf(sec!)).toEqual(row[section]);
          // A call's own items carry no declared-by: the block names the tool once.
          for (const li of within(sec!).getAllByTestId('coverage-item')) expect(li.hasAttribute('data-declared-by')).toBe(false);
        }
      }
    });
    expect(rows[0]!.lookedFor).toBeUndefined();
    expect(rows[1]!.lookedFor).toBe('FLOGI entries on fc1/3');
    expect(rows[1]!.notChecked).toEqual([]);
  });

  it('the same bytes on two renders', () => {
    renderAt(fixture, last);
    const first = screen.getByTestId('coverage-band').outerHTML;
    cleanup();
    renderAt(fixture, last);
    expect(screen.getByTestId('coverage-band').outerHTML).toBe(first);
  });
});

describe('<CoverageBand> laws', () => {
  it('the key is tracked: nothing before the first declaration, one at the first tool-calls stop, two from the second on', () => {
    const fixture = load('coverage');
    const [first, second, third] = stopsOf(fixture, 'tool-call');
    const firstStep = stepOf(fixture, first!);
    const secondStep = stepOf(fixture, second!);
    const thirdStep = stepOf(fixture, third!);
    expect(rowsAt(fixture, firstStep - 1)).toBeUndefined();
    for (let step = 0; step < firstStep; step++) {
      renderAt(fixture, step);
      expect(screen.queryByTestId('coverage-band')).toBeNull();
      cleanup();
    }
    renderAt(fixture, firstStep);
    expect(screen.getByTestId('coverage-band').getAttribute('data-declarations')).toBe('1');
    expect(calls().map((c) => c.getAttribute('data-tool'))).toEqual(['zone_membership']);
    // The boundary at that stop is the first call's own lists — no partner has landed.
    const boundary = screen.getByTestId('coverage-boundary');
    expect(itemsOf(sectionOf(boundary, 'checked')!)).toEqual(rowsAt(fixture, firstStep)![0]!.checked);
    for (const li of within(boundary).getAllByTestId('coverage-item')) expect(li.getAttribute('data-declared-by')).toBe('zone_membership');
    cleanup();
    renderAt(fixture, secondStep);
    expect(screen.getByTestId('coverage-band').getAttribute('data-declarations')).toBe('2');
    expect(calls().map((c) => c.getAttribute('data-tool'))).toEqual(['zone_membership', 'flogi_for_port']);
    cleanup();
    // The third call declared nothing: the same two.
    renderAt(fixture, thirdStep);
    expect(screen.getByTestId('coverage-band').getAttribute('data-declarations')).toBe('2');
  });

  it('an unarmed run draws nothing at any stop — the root is absent (omit, never deny)', () => {
    const fixture = load('flat-dynamic-tools');
    for (let step = 0; step < fixture.positions.length; step++) {
      renderAt(fixture, step);
      expect(screen.queryByTestId('coverage-band')).toBeNull();
      cleanup();
    }
  });

  it('with neither `cursor` nor `shared` the band reads the run’s end; it mounts no mover of its own, `shared` or not', () => {
    const fixture = load('coverage');
    render(<CoverageBand runner={fixture.runner} recorder={fixture.recorder} />);
    expect(screen.getByTestId('coverage-band').getAttribute('data-step')).toBe(String(fixture.positions.length - 1));
    expect(screen.queryByLabelText('Previous step')).toBeNull();
    cleanup();
    function Alone() {
      const shared = useSharedCursor(fixture.recorder);
      return <CoverageBand runner={fixture.runner} recorder={fixture.recorder} shared={shared} />;
    }
    render(<Alone />);
    expect(screen.getByTestId('coverage-band').getAttribute('data-step')).toBe(String(fixture.positions.length - 1));
    expect(screen.queryByLabelText('Previous step')).toBeNull();
  });

  it('the fold at twelve: the first twelve listed, `+K more` on a native details that holds the rest — boundary and call alike', () => {
    const checked = Array.from({ length: 15 }, (_, i) => ({ what: `ground ${i + 1}` }));
    const row = { kind: 'ledger', toolName: 'wide', toolCallId: 'w1', iteration: 1, checked, notChecked: [], cannotCover: [] };
    render(<CoverageRows rows={[row]} />);
    for (const scope of [screen.getByTestId('coverage-boundary'), calls()[0]!]) {
      const section = sectionOf(scope, 'checked')!;
      expect(section.getAttribute('data-count')).toBe('15');
      const more = within(section).getByTestId('coverage-more');
      expect(more.tagName).toBe('DETAILS');
      expect(more.getAttribute('data-count')).toBe('3');
      expect(more.querySelector('summary')!.textContent).toBe(`+3 ${LABELS.more}`);
      expect(within(more).getAllByTestId('coverage-item').map((li) => within(li).getByTestId('coverage-what').textContent)).toEqual([
        'ground 13',
        'ground 14',
        'ground 15',
      ]);
      // Twelve in the open list — every item on the section is either there or behind the details.
      const shown = within(section)
        .getAllByTestId('coverage-item')
        .filter((li) => !more.contains(li));
      expect(shown).toHaveLength(12);
      expect(shown.map((li) => within(li).getByTestId('coverage-what').textContent)).toEqual(checked.slice(0, 12).map((i) => i.what));
    }
    // Twelve exactly folds nothing.
    cleanup();
    render(<CoverageRows rows={[{ ...row, checked: checked.slice(0, 12) }]} />);
    expect(screen.queryByTestId('coverage-more')).toBeNull();
  });

  it('malformed rows are dropped one by one, malformed items inside a row likewise, and nothing crashes', () => {
    const good = { kind: 'ledger', toolName: 'ok', iteration: 3, checked: [{ what: 'a' }, { nope: true }, 'bare', { what: '' }], cannotCover: [{ what: 'c', why: 4 }] };
    const rows: unknown[] = [null, 'text', 7, {}, { kind: 'ledger' }, { kind: 'ledger', toolName: 't', iteration: 1, checked: 'not a list' }, { kind: '', toolName: 't', iteration: 1 }, good];
    const fold = foldCoverage(rows);
    expect(fold.calls).toHaveLength(1);
    expect(fold.calls[0]).toEqual({ kind: 'ledger', toolName: 'ok', iteration: 3, checked: [{ what: 'a' }], notChecked: [], cannotCover: [{ what: 'c' }] });
    expect(fold.boundary).toEqual({
      checked: [{ what: 'a', declaredBy: ['ok'] }],
      notChecked: [],
      cannotCover: [{ what: 'c', declaredBy: ['ok'] }],
    });
    expect(Object.isFrozen(fold)).toBe(true);
    render(<CoverageRows rows={rows} />);
    expect(screen.getByTestId('coverage-band').getAttribute('data-declarations')).toBe('1');
    expect(calls()[0]!.hasAttribute('data-tool-call-id')).toBe(false);
    expect(within(calls()[0]!).queryByTestId('coverage-call-id')).toBeNull();
    cleanup();
    // Every row malformed: nothing drawn.
    render(<CoverageRows rows={rows.slice(0, -1)} />);
    expect(screen.queryByTestId('coverage-band')).toBeNull();
    // A recording whose rows were all damaged draws nothing at the run's end either.
    const fixture = loadTampered('coverage', (recording) => {
      for (const bundle of recording.snapshot.commitLog as FixtureBundle[]) {
        if (Array.isArray(bundle.overwrite?.coverageDeclared)) bundle.overwrite!.coverageDeclared = (bundle.overwrite!.coverageDeclared as unknown[]).map(() => ({ kind: 'ledger' }));
      }
    });
    renderAt(fixture, fixture.positions.length - 1);
    expect(screen.queryByTestId('coverage-band')).toBeNull();
  });

  it('coverageRecordOf narrows by shape: the record’s word for kind is kept as written, optional fields only when carried', () => {
    expect(coverageRecordOf(undefined)).toBeUndefined();
    expect(coverageRecordOf([])).toBeUndefined();
    expect(coverageRecordOf({ kind: 'ledger', toolName: 't' })).toBeUndefined();
    expect(coverageRecordOf({ kind: 'ledger', toolName: 't', iteration: '1' })).toBeUndefined();
    expect(coverageRecordOf({ kind: 'ledger', toolName: 't', iteration: 1, notChecked: {} })).toBeUndefined();
    expect(coverageRecordOf({ kind: 'ledger', toolName: 't', iteration: 1 })).toEqual({ kind: 'ledger', toolName: 't', iteration: 1, checked: [], notChecked: [], cannotCover: [] });
    expect(
      coverageRecordOf({ kind: 'semantics', toolName: 't', toolCallId: 'x', iteration: 2, lookedFor: 'l', checked: [{ what: 'w', why: 'y' }], notChecked: [], cannotCover: [] }),
    ).toEqual({ kind: 'semantics', toolName: 't', toolCallId: 'x', iteration: 2, lookedFor: 'l', checked: [{ what: 'w', why: 'y' }], notChecked: [], cannotCover: [] });
    expect(coverageRecordOf({ kind: 'ledger', toolName: 't', iteration: 1, toolCallId: 9, lookedFor: null })).toEqual({
      kind: 'ledger',
      toolName: 't',
      iteration: 1,
      checked: [],
      notChecked: [],
      cannotCover: [],
    });
  });

  it('foldCoverage: the boundary merges across calls in landed order, per section, naming each tool once', () => {
    const a = { kind: 'ledger', toolName: 'a', iteration: 1, checked: [{ what: 'x' }, { what: 'y', why: 'one' }], notChecked: [], cannotCover: [{ what: 'z', why: 'r' }] };
    const b = { kind: 'absence', toolName: 'b', iteration: 2, lookedFor: 'q', checked: [{ what: 'y', why: 'two' }, { what: 'x' }], notChecked: [{ what: 'n' }], cannotCover: [{ what: 'z', why: 'r' }] };
    const again = { ...a, iteration: 3 };
    const fold = foldCoverage([a, b, again]);
    expect(fold.calls).toHaveLength(3);
    expect(fold.boundary.checked).toEqual([
      { what: 'x', declaredBy: ['a', 'b'] },
      { what: 'y', why: 'one', declaredBy: ['a'] },
      { what: 'y', why: 'two', declaredBy: ['b'] },
    ]);
    expect(fold.boundary.notChecked).toEqual([{ what: 'n', declaredBy: ['b'] }]);
    expect(fold.boundary.cannotCover).toEqual([{ what: 'z', why: 'r', declaredBy: ['a', 'b'] }]);
    expect(foldCoverage([])).toEqual({ boundary: { checked: [], notChecked: [], cannotCover: [] }, calls: [] });
  });
});

describe('<CoverageBand> follows the ONE cursor beside the Context view', () => {
  function Host({ fixture }: { readonly fixture: Fixture }) {
    const shared = useSharedCursor(fixture.recorder);
    return (
      <>
        <ContextView runner={fixture.runner} recorder={fixture.recorder} shared={shared} />
        <CoverageBand runner={fixture.runner} recorder={fixture.recorder} shared={shared} />
      </>
    );
  }

  it('the Context view’s transport moves the band: two declarations, one, then none, and back', () => {
    const fixture = load('coverage');
    const [first, second] = stopsOf(fixture, 'tool-call');
    const firstStep = stepOf(fixture, first!);
    const secondStep = stepOf(fixture, second!);
    render(<Host fixture={fixture} />);
    const lastStep = fixture.positions.length - 1;
    expect(screen.getByTestId('coverage-band').getAttribute('data-step')).toBe(String(lastStep));
    expect(screen.getByTestId('coverage-band').getAttribute('data-declarations')).toBe('2');
    const back = (n: number) => {
      for (let i = 0; i < n; i++) fireEvent.click(within(screen.getByTestId('context-transport')).getByLabelText('Previous step'));
    };
    back(lastStep - secondStep);
    expect(screen.getByTestId('coverage-band').getAttribute('data-declarations')).toBe('2');
    back(secondStep - firstStep);
    expect(screen.getByTestId('coverage-band').getAttribute('data-declarations')).toBe('1');
    expect(screen.getByTestId('context-view').getAttribute('data-step')).toBe(String(firstStep));
    back(1);
    expect(screen.queryByTestId('coverage-band')).toBeNull();
    fireEvent.click(within(screen.getByTestId('context-transport')).getByLabelText('Next step'));
    expect(screen.getByTestId('coverage-band').getAttribute('data-declarations')).toBe('1');
  });
});

describe('<ReasoningLens> mounts the band', () => {
  function Alone({ fixture }: { readonly fixture: Fixture }) {
    const shared = useSharedCursor(fixture.recorder);
    return <ReasoningLens runner={fixture.runner} recorder={fixture.recorder} shared={shared} />;
  }

  it('a run with declarations and no ledger renders the band alone — root and transport, no cards, no count, no toggle', () => {
    const fixture = load('coverage');
    const [first] = stopsOf(fixture, 'tool-call');
    const firstStep = stepOf(fixture, first!);
    render(<Alone fixture={fixture} />);
    const lastStep = fixture.positions.length - 1;
    const root = screen.getByTestId('reasoning-lens');
    expect(root.getAttribute('data-step')).toBe(String(lastStep));
    expect(root.hasAttribute('data-calls')).toBe(false);
    expect(screen.getByTestId('reasoning-transport')).toBeInTheDocument();
    expect(screen.queryByTestId('reasoning-cards')).toBeNull();
    expect(screen.queryByTestId('reasoning-view-toggle')).toBeNull();
    // The header carries the lens's name and nothing else — no `N calls` count for a run with no ledger.
    expect(root.firstElementChild!.textContent).toBe(REASONING_LABELS.lens);
    const band = within(screen.getByTestId('reasoning-coverage')).getByTestId('coverage-band');
    expect(band.getAttribute('data-declarations')).toBe('2');
    expect(band.getAttribute('data-step')).toBe(String(lastStep));
    // The transport steps the cursor: back to one declaration, then past the first — the lens goes with it.
    for (let i = 0; i < lastStep - firstStep; i++) fireEvent.click(screen.getByLabelText('Previous step'));
    expect(screen.getByTestId('reasoning-lens').getAttribute('data-step')).toBe(String(firstStep));
    expect(screen.getByTestId('coverage-band').getAttribute('data-declarations')).toBe('1');
    fireEvent.click(screen.getByLabelText('Previous step'));
    expect(screen.queryByTestId('reasoning-lens')).toBeNull();
    expect(screen.queryByTestId('coverage-band')).toBeNull();
  });

  it('a run with neither a ledger nor a declaration still draws nothing at any stop', () => {
    const fixture = load('flat-dynamic-tools');
    render(<Alone fixture={fixture} />);
    expect(screen.queryByTestId('reasoning-lens')).toBeNull();
    cleanup();
    for (let step = 0; step < fixture.positions.length; step++) {
      render(<ReasoningLens runner={fixture.runner} cursor={lensCursorFrom(fixture.positions, step, () => undefined)} />);
      expect(screen.queryByTestId('reasoning-lens')).toBeNull();
      cleanup();
    }
  });

  /** The `findings-ledger` recording with ONE declaration landed at its first tool-calls stop — a ledger AND a declaration on one record. */
  const withDeclaration = () =>
    loadTampered('findings-ledger', (recording) => {
      const bundle = recording.snapshot.commitLog.find((b: FixtureBundle) => Array.isArray(b.overwrite?.findingsLedger)) as FixtureBundle;
      bundle.overwrite!.coverageDeclared = [
        { kind: 'ledger', toolName: 'lookup', toolCallId: 'c1', iteration: 1, checked: [{ what: 'the port table' }], notChecked: [], cannotCover: [{ what: 'the peer', why: 'no collector' }] },
      ];
      (bundle.trace as { path: string; verb: string }[]).push({ path: 'coverageDeclared', verb: 'set' });
    });

  it('with a ledger AND a declaration the band renders under the cards, and under the exchange, moving with the cards', () => {
    const fixture = withDeclaration();
    const [first] = stopsOf(fixture, 'tool-call');
    const firstStep = stepOf(fixture, first!);
    render(<Alone fixture={fixture} />);
    const lastStep = fixture.positions.length - 1;
    expect(screen.getByTestId('reasoning-lens').getAttribute('data-calls')).toBe('6');
    const cards = screen.getByTestId('reasoning-cards');
    const band = within(screen.getByTestId('reasoning-coverage')).getByTestId('coverage-band');
    expect(band.getAttribute('data-declarations')).toBe('1');
    expect(cards.compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(band).getAllByTestId('coverage-item').map((li) => within(li).getByTestId('coverage-what').textContent)).toEqual([
      'the port table',
      'the peer',
      'the port table',
      'the peer',
    ]);
    // The exchange view keeps the band under the beats; the beats themselves are untouched.
    fireEvent.click(screen.getByTestId('reasoning-view-exchange'));
    const exchange = screen.getByTestId('reasoning-exchange');
    expect(within(exchange).queryByTestId('coverage-band')).toBeNull();
    expect(exchange.compareDocumentPosition(screen.getByTestId('coverage-band')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByTestId('reasoning-view-cards'));
    // Back to the first tool-calls stop: four cards and the declaration; one more back, nothing at all.
    for (let i = 0; i < lastStep - firstStep; i++) fireEvent.click(screen.getByLabelText('Previous step'));
    expect(screen.getAllByTestId('reasoning-card')).toHaveLength(4);
    expect(screen.getByTestId('coverage-band').getAttribute('data-declarations')).toBe('1');
    fireEvent.click(screen.getByLabelText('Previous step'));
    expect(screen.queryByTestId('reasoning-lens')).toBeNull();
  });

  it('the untampered armed run has no band: a ledger alone draws the cards alone', () => {
    const fixture = load('findings-ledger');
    render(<ReasoningLens runner={fixture.runner} recorder={fixture.recorder} />);
    expect(screen.getByTestId('reasoning-cards')).toBeInTheDocument();
    expect(screen.queryByTestId('reasoning-coverage')).toBeNull();
    expect(screen.queryByTestId('coverage-band')).toBeNull();
  });
});
