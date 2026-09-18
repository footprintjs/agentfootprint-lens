/**
 * <ProofMap> — what the answer rests on, as one graph off the record, on the
 * recorded `proof-map` fixture (agentfootprint 9.110.0, generated alone: both
 * doors armed, a small declared map, three calls, a JSON answer that quotes a
 * value only a `noise` result carried and a value nothing carried).
 *
 * Test types: Render (every node and edge of the fixture's record — the
 * answer, the three calls with their standings, the two tools, the two
 * sources via the map's `via`; the `stands on`, `calls`, `reads` edges; the
 * contingent edge answer → c1 with the carrier's standing and the value in
 * the title and the list; the unsupported chip and its value) · Law (an
 * undeclared call is dashed under that word and carries no standing; before
 * the answer the answer column is absent and the map is the calls' map; an
 * unarmed run draws nothing at any stop, and an armed one nothing before its
 * ledger — omit, never deny; a conflict row is an edge between its
 * witnesses, on the ledger fixture) · Determinism (the same bytes on two
 * renders) · Functional (the transport mounts with `shared` and steps the
 * cursor; beside the Context view it follows the ONE cursor; a per-axis
 * `cursor` brings no mover; with neither it reads the run's end) · Unit
 * (`foldProofMap` reads contingent, judgment and conflict rows by shape and
 * sorts tools and sources; `layoutProofMap` is pure and columnar).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { contextAt } from '../../src/core/context/contextAt.js';
import { lensCursorFrom } from '../../src/core/cursor/lensCursor.js';
import { ContextView } from '../../src/react/components/ContextView.js';
import { GEOMETRY, LABELS, ProofMap, foldProofMap, layoutProofMap, type ProofMapInput } from '../../src/react/components/ProofMap.js';
import { useSharedCursor } from '../../src/react/useSharedCursor.js';
import { load, type FixtureName } from '../served/helpers.js';

afterEach(cleanup);

type Fixture = ReturnType<typeof load>;

interface StandingRow {
  readonly kind: 'standing';
  readonly toolCallId: string;
  readonly standing: string;
  readonly declaredOn: 'answer' | { toolCallId: string };
  readonly assertions: unknown[];
}
interface ContingentRow {
  readonly kind: 'contingent';
  readonly declaredOn: 'answer' | { toolCallId: string };
  readonly value: string;
  readonly carriers: { toolCallId: string; standing: string }[];
}
interface BasisRow {
  readonly kind: 'basis';
  readonly toolCallId: string;
  readonly toolName: string;
  readonly basis: string;
}
type Row = StandingRow | ContingentRow | BasisRow | { kind: string };

/** The record's keys at one stop — the test's oracle, never a hand-written copy. */
function recordAt(fixture: Fixture, step: number): { ledger: Row[]; unsupported?: { values: { value: string }[] }; ontology?: { spec: { nodes: Record<string, { sources?: { source: string; via?: string[] }[] }>; sources: Record<string, { meaning: string }> } } } {
  const stop = fixture.positions[step]!;
  const keys = contextAt(fixture.snapshot, { runtimeStageId: stop.runtimeStageId, commitIdx: stop.commitIdx }, {}).keys;
  const value = (path: string) => keys.find((k) => k.path === path)?.value;
  const ledger = value('findingsLedger');
  return {
    ledger: Array.isArray(ledger) ? (ledger as Row[]) : [],
    unsupported: value('unsupportedValues') as { values: { value: string }[] } | undefined,
    ontology: value('ontology') as ReturnType<typeof recordAt>['ontology'],
  };
}

/** The view at one grouped-axis step, handed the ONE cursor. */
function renderAt(fixture: Fixture, step: number): void {
  render(<ProofMap runner={fixture.runner} cursor={lensCursorFrom(fixture.positions, step, () => undefined)} />);
}

const attr = (els: readonly HTMLElement[], name: string): (string | null)[] => els.map((e) => e.getAttribute(name));
const nodesOf = (kind: string): HTMLElement[] => screen.getAllByTestId('proof-node').filter((n) => n.getAttribute('data-kind') === kind);
const edgesOf = (kind: string): HTMLElement[] => screen.queryAllByTestId('proof-edge').filter((e) => e.getAttribute('data-kind') === kind);

describe('<ProofMap> at the end of the run with both doors armed', () => {
  const fixture = load('proof-map');
  const last = fixture.positions.length - 1;
  const record = recordAt(fixture, last);
  const standings = record.ledger.filter((r): r is StandingRow => r.kind === 'standing');
  const contingent = record.ledger.filter((r): r is ContingentRow => r.kind === 'contingent');
  const bases = record.ledger.filter((r): r is BasisRow => r.kind === 'basis');

  it('the fixture is the record the packet asked for: c1 noise on c2, c2 fact on the answer, c3 undeclared, one contingent row, one unsupported value', () => {
    expect(bases.map((b) => [b.toolCallId, b.toolName])).toEqual([
      ['c1', 'port_state'],
      ['c2', 'zone_lookup'],
      ['c3', 'port_state'],
    ]);
    expect(standings.map((s) => [s.toolCallId, s.standing, s.declaredOn])).toEqual([
      ['c1', 'noise', { toolCallId: 'c2' }],
      ['c2', 'fact', 'answer'],
    ]);
    expect(contingent).toEqual([{ kind: 'contingent', declaredOn: 'answer', value: 'fc1/7', carriers: [{ toolCallId: 'c1', standing: 'noise' }], iteration: 4 }]);
    expect(record.unsupported?.values.map((v) => v.value)).toEqual(['fc9/9']);
    expect(Object.keys(record.ontology!.spec.sources).sort()).toEqual(['fcns', 'zoneset']);
  });

  it('the root carries the counts; the CHART draws the answer, the three calls, the two tools and the two sources in four columns', () => {
    renderAt(fixture, last);
    const root = screen.getByTestId('proof-map');
    expect(root.getAttribute('data-answer')).toBe('true');
    expect(root.getAttribute('data-calls')).toBe('3');
    expect(root.getAttribute('data-contingent')).toBe('1');
    expect(root.getAttribute('data-step')).toBe(String(last));
    expect(screen.getByTestId('proof-counts').textContent).toBe(`3 ${LABELS.calls} · 2 ${LABELS.tools} · 2 ${LABELS.sources}`);
    expect(attr(nodesOf('answer'), 'data-id')).toEqual(['answer']);
    expect(attr(nodesOf('call'), 'data-id')).toEqual(bases.map((b) => b.toolCallId));
    expect(attr(nodesOf('tool'), 'data-id')).toEqual(['port_state', 'zone_lookup']);
    expect(attr(nodesOf('source'), 'data-id')).toEqual(['fcns', 'zoneset']);
    const x = (n: HTMLElement) => Number(/translate\((\d+(?:\.\d+)?) /.exec(n.getAttribute('transform') ?? '')?.[1]);
    const columns = ['answer', 'call', 'tool', 'source'].map((kind) => new Set(nodesOf(kind).map(x)));
    for (const c of columns) expect(c.size).toBe(1);
    for (let i = 1; i < columns.length; i++) expect([...columns[i]!][0]!).toBeGreaterThan([...columns[i - 1]!][0]!);
    expect(attr(screen.getAllByTestId('proof-column'), 'data-kind')).toEqual(['answer', 'call', 'tool', 'source']);
  });

  it('every call carries its CURRENT standing as `data-standing` and the whole id in its <title>; the undeclared one is dashed under that word', () => {
    renderAt(fixture, last);
    const calls = nodesOf('call');
    expect(calls.map((n) => [n.getAttribute('data-id'), n.getAttribute('data-standing')])).toEqual([
      ['c1', 'noise'],
      ['c2', 'fact'],
      ['c3', LABELS.undeclared],
    ]);
    for (const n of calls) {
      expect(n.querySelector('title')?.textContent).toBe(n.getAttribute('data-id'));
      const dashed = n.querySelector('rect')?.getAttribute('stroke-dasharray');
      if (n.getAttribute('data-id') === 'c3') expect(dashed).toBe('4 3');
      else expect(dashed).toBeNull();
      expect(n.textContent).toContain(n.getAttribute('data-standing'));
    }
    // The fact carries one assertion, and says so; the tool name rides the box.
    const c2 = calls[1]!;
    expect(c2.textContent).toContain(`1 ${LABELS.assertions}`);
    expect(c2.textContent).toContain('zone_lookup');
    // No node names the judge: the record carries no judgment row.
    expect(screen.queryByTestId('proof-judged-chip')).toBeNull();
    expect(screen.queryByTestId('proof-judged')).toBeNull();
  });

  it('the edges are the rows: `stands on` answer → c2 labelled fact; `calls` per call; `reads` tool → source from the map’s own `via`', () => {
    renderAt(fixture, last);
    const standsOn = edgesOf('stands-on');
    expect(standsOn.map((e) => [e.getAttribute('data-from'), e.getAttribute('data-to'), e.querySelector('text')?.textContent])).toEqual([
      ['answer:answer', 'call:c2', 'fact'],
    ]);
    expect(edgesOf('calls').map((e) => [e.getAttribute('data-from'), e.getAttribute('data-to')])).toEqual([
      ['call:c1', 'tool:port_state'],
      ['call:c2', 'tool:zone_lookup'],
      ['call:c3', 'tool:port_state'],
    ]);
    const declared = Object.values(record.ontology!.spec.nodes)
      .flatMap((n) => n.sources ?? [])
      .flatMap((s) => (s.via ?? []).map((v) => [`tool:${v}`, `source:${s.source}`]));
    expect(edgesOf('reads').map((e) => [e.getAttribute('data-from'), e.getAttribute('data-to')])).toEqual(declared);
    expect(declared).toEqual([
      ['tool:port_state', 'source:fcns'],
      ['tool:zone_lookup', 'source:zoneset'],
    ]);
    expect(edgesOf('conflict')).toEqual([]);
    // A straight edge for each of the three kinds; the arrowhead on every path.
    for (const e of [...standsOn, ...edgesOf('calls'), ...edgesOf('reads')]) {
      expect(e.querySelector('path')?.getAttribute('d')).toMatch(/^M \d+(\.\d+)? \d+(\.\d+)? L \d+(\.\d+)? \d+(\.\d+)?$/);
      expect(e.querySelector('path')?.getAttribute('marker-end')).toMatch(/^url\(#proof-arrow-/);
    }
  });

  it('the contingent overlay: one dashed edge answer → c1 labelled with the carrier’s standing, the value whole in the <title> and verbatim in the list', () => {
    renderAt(fixture, last);
    const edges = edgesOf('contingent');
    expect(edges.map((e) => [e.getAttribute('data-from'), e.getAttribute('data-to')])).toEqual([['answer:answer', 'call:c1']]);
    const edge = edges[0]!;
    expect(edge.querySelector('title')?.textContent).toBe('fc1/7');
    expect(edge.querySelector('text')?.textContent).toBe(`${LABELS.contingent} · noise`);
    expect(edge.querySelector('path')?.getAttribute('stroke-dasharray')).toBe('4 3');
    expect(edge.querySelector('path')?.getAttribute('d')).toMatch(/^M \d+(\.\d+)? \d+(\.\d+)? H \d+(\.\d+)? V \d+(\.\d+)? H \d+(\.\d+)?$/);
    // The contingent edge and the `stands on` edge take different strokes.
    expect(edge.querySelector('path')?.getAttribute('stroke')).not.toBe(edgesOf('stands-on')[0]!.querySelector('path')?.getAttribute('stroke'));
    const rows = screen.getAllByTestId('proof-contingent');
    expect(rows.map((r) => [r.getAttribute('data-declared-on'), r.getAttribute('data-value')])).toEqual([['answer', 'fc1/7']]);
    const carriers = within(rows[0]!).getAllByTestId('proof-carrier');
    expect(carriers.map((c) => [c.getAttribute('data-id'), c.getAttribute('data-standing')])).toEqual([['c1', 'noise']]);
    expect(rows[0]!.textContent).toContain('fc1/7');
    expect(screen.getByTestId('proof-contingent-rows').getAttribute('data-count')).toBe('1');
  });

  it('the answer node carries the unsupported count as a chip and the whole values in its <title>; the list names the value', () => {
    renderAt(fixture, last);
    const answer = nodesOf('answer')[0]!;
    expect(within(answer).getByTestId('proof-unsupported-chip').textContent).toBe(`1 ${LABELS.unsupported}`);
    expect(answer.querySelector('title')?.textContent).toBe('fc9/9');
    const list = screen.getByTestId('proof-answer');
    expect(list.getAttribute('data-stands-on')).toBe('1');
    expect(list.getAttribute('data-unsupported')).toBe('1');
    expect(attr(screen.getAllByTestId('proof-unsupported'), 'data-value')).toEqual(['fc9/9']);
    expect(screen.getAllByTestId('proof-stands-on').map((s) => [s.getAttribute('data-id'), s.getAttribute('data-standing')])).toEqual([['c2', 'fact']]);
  });

  it('the LIST draws every call with tool, basis, standing (undeclared under that word), the tools sorted, the sources with the tools that read them', () => {
    renderAt(fixture, last);
    const calls = screen.getAllByTestId('proof-call');
    expect(calls.map((c) => [c.getAttribute('data-id'), c.getAttribute('data-tool'), c.getAttribute('data-basis'), c.getAttribute('data-standing')])).toEqual(
      bases.map((b) => [b.toolCallId, b.toolName, b.basis, standings.find((s) => s.toolCallId === b.toolCallId)?.standing ?? LABELS.undeclared]),
    );
    expect(attr(calls, 'data-standing')).toEqual(['noise', 'fact', LABELS.undeclared]);
    expect(attr(screen.getAllByTestId('proof-tool'), 'data-id')).toEqual(['port_state', 'zone_lookup']);
    const sources = screen.getAllByTestId('proof-source');
    expect(sources.map((s) => [s.getAttribute('data-id'), s.getAttribute('data-tools')])).toEqual([
      ['fcns', 'port_state'],
      ['zoneset', 'zone_lookup'],
    ]);
    for (const s of sources) expect(s.textContent).toContain(record.ontology!.spec.sources[s.getAttribute('data-id')!]!.meaning);
    // A source's meaning is its node's <title> on the chart.
    for (const n of nodesOf('source')) expect(n.querySelector('title')?.textContent).toBe(record.ontology!.spec.sources[n.getAttribute('data-id')!]!.meaning);
  });

  it('draws the same bytes twice — layout is a function of the fold alone', () => {
    renderAt(fixture, last);
    const first = screen.getByTestId('proof-map').outerHTML;
    cleanup();
    renderAt(fixture, last);
    expect(screen.getByTestId('proof-map').outerHTML).toBe(first);
    expect(first).toContain('<svg');
  });
});

describe('<ProofMap> laws', () => {
  it('an earlier stop, before the answer: no answer column, no `stands on`, no contingent edge — the calls’ map alone', () => {
    const fixture = load('proof-map');
    // The last llm-turn stop: three basis rows and c1's standing on the record, nothing declared on the answer yet.
    const step = fixture.positions.map((p, i) => [p.milestone, i] as const).filter(([m]) => m === 'llm-turn').map(([, i]) => i).pop()!;
    const record = recordAt(fixture, step);
    expect(record.ledger.map((r) => r.kind)).toEqual(['basis', 'standing', 'basis', 'basis']);
    expect(record.unsupported).toBeUndefined();
    renderAt(fixture, step);
    const root = screen.getByTestId('proof-map');
    expect(root.getAttribute('data-answer')).toBe('false');
    expect(root.getAttribute('data-calls')).toBe('3');
    expect(root.getAttribute('data-contingent')).toBe('0');
    expect(nodesOf('answer')).toEqual([]);
    expect(screen.queryByTestId('proof-answer')).toBeNull();
    expect(edgesOf('stands-on')).toEqual([]);
    expect(edgesOf('contingent')).toEqual([]);
    expect(attr(nodesOf('call'), 'data-standing')).toEqual(['noise', LABELS.undeclared, LABELS.undeclared]);
    expect(attr(screen.getAllByTestId('proof-column'), 'data-kind')).toEqual(['call', 'tool', 'source']);
    // The calls column is the first one drawn.
    const x = (n: HTMLElement) => Number(/translate\((\d+(?:\.\d+)?) /.exec(n.getAttribute('transform') ?? '')?.[1]);
    expect(x(nodesOf('call')[0]!)).toBe(GEOMETRY.padding);
  });

  it('an unarmed run draws nothing at any stop — the root is absent (omit, never deny)', () => {
    const fixture = load('flat-dynamic-tools' satisfies FixtureName);
    for (let step = 0; step < fixture.positions.length; step++) {
      renderAt(fixture, step);
      expect(screen.queryByTestId('proof-map')).toBeNull();
      cleanup();
    }
  });

  it('an armed run draws nothing before its first basis row, and the calls’ map from that stop on', () => {
    const fixture = load('proof-map');
    let absent = 0;
    let drawn = 0;
    for (let step = 0; step < fixture.positions.length; step++) {
      const held = recordAt(fixture, step).ledger.length > 0;
      renderAt(fixture, step);
      const root = screen.queryByTestId('proof-map');
      if (held) {
        expect(root).not.toBeNull();
        drawn += 1;
      } else {
        expect(root).toBeNull();
        absent += 1;
      }
      cleanup();
    }
    expect(absent).toBeGreaterThan(0);
    expect(drawn).toBeGreaterThan(0);
  });

  it('a conflict row is an edge between its witnesses, in the error colour, the key in its <title> — on the ledger fixture, which declares no map', () => {
    const fixture = load('findings-ledger');
    renderAt(fixture, fixture.positions.length - 1);
    const conflicts = edgesOf('conflict');
    expect(conflicts.map((e) => [e.getAttribute('data-from'), e.getAttribute('data-to')])).toEqual([['call:c1', 'call:c5']]);
    const key = screen.getByTestId('proof-conflict').getAttribute('data-key');
    expect(conflicts[0]!.querySelector('title')?.textContent).toBe(key);
    expect(conflicts[0]!.querySelector('text')?.textContent).toBe(LABELS.conflict);
    expect(conflicts[0]!.querySelector('path')?.getAttribute('stroke')).not.toBe(edgesOf('stands-on')[0]!.querySelector('path')?.getAttribute('stroke'));
    // No map declared: no sources column, no `reads` edge; no contingent row on a 9.101.1 record.
    expect(nodesOf('source')).toEqual([]);
    expect(screen.queryByTestId('proof-sources')).toBeNull();
    expect(edgesOf('reads')).toEqual([]);
    expect(edgesOf('contingent')).toEqual([]);
    expect(screen.getByTestId('proof-map').getAttribute('data-contingent')).toBe('0');
    // The answer stands on c5 (fact), declared on the answer; c6 is undeclared.
    expect(screen.getAllByTestId('proof-stands-on').map((s) => [s.getAttribute('data-id'), s.getAttribute('data-standing')])).toEqual([['c5', 'fact']]);
    expect(nodesOf('call').find((n) => n.getAttribute('data-id') === 'c6')?.getAttribute('data-standing')).toBe(LABELS.undeclared);
    // The witnesses carry the chip the fold holds for each of them now.
    expect(within(screen.getByTestId('proof-conflict')).getAllByTestId('proof-witness').map((w) => [w.getAttribute('data-id'), w.getAttribute('data-standing')])).toEqual([
      ['c1', 'fact'],
      ['c5', 'fact'],
    ]);
  });

  it('with neither `cursor` nor `shared` the view reads the run’s end and mounts no mover', () => {
    const fixture = load('proof-map');
    render(<ProofMap runner={fixture.runner} recorder={fixture.recorder} />);
    expect(screen.getByTestId('proof-map').getAttribute('data-step')).toBe(String(fixture.positions.length - 1));
    expect(screen.getByTestId('proof-map').getAttribute('data-answer')).toBe('true');
    expect(screen.queryByTestId('proof-transport')).toBeNull();
    expect(screen.queryByLabelText('Previous step')).toBeNull();
  });

  it('a per-axis `cursor` from a slot brings the host’s mover — none is mounted here', () => {
    const fixture = load('proof-map');
    renderAt(fixture, fixture.positions.length - 1);
    expect(screen.queryByTestId('proof-transport')).toBeNull();
  });
});

describe('<ProofMap> carries the transport when it holds the shared address', () => {
  function Alone({ fixture }: { readonly fixture: Fixture }) {
    const shared = useSharedCursor(fixture.recorder);
    return <ProofMap runner={fixture.runner} recorder={fixture.recorder} shared={shared} />;
  }

  it('mounts the same transport the other views mount; stepping moves the cursor and the map follows the fold at the new stop', () => {
    const fixture = load('proof-map');
    render(<Alone fixture={fixture} />);
    const lastStep = fixture.positions.length - 1;
    expect(screen.getByTestId('proof-transport')).toBeInTheDocument();
    expect(screen.getByTestId('proof-map').getAttribute('data-step')).toBe(String(lastStep));
    expect(screen.getByTestId('proof-map').getAttribute('data-answer')).toBe('true');
    // Step back to the last llm-turn stop: the answer is not on the record yet.
    const turn = fixture.positions.map((p, i) => [p.milestone, i] as const).filter(([m]) => m === 'llm-turn').map(([, i]) => i).pop()!;
    for (let s = lastStep; s > turn; s--) fireEvent.click(screen.getByLabelText('Previous step'));
    expect(screen.getByTestId('proof-map').getAttribute('data-step')).toBe(String(turn));
    expect(screen.getByTestId('proof-map').getAttribute('data-answer')).toBe('false');
    fireEvent.click(screen.getByLabelText('Next step'));
    expect(screen.getByTestId('proof-map').getAttribute('data-step')).toBe(String(turn + 1));
    expect(screen.getByTestId('proof-map').getAttribute('data-answer')).toBe('true');
  });

  it('stepped back before the first basis row, the root keeps its transport and draws nothing else (0.66.1) — a person can step forward again', () => {
    const fixture = load('proof-map');
    render(<Alone fixture={fixture} />);
    const lastStep = fixture.positions.length - 1;
    for (let s = lastStep; s > 0; s--) fireEvent.click(screen.getByLabelText('Previous step'));
    const root = screen.getByTestId('proof-map');
    expect(root.getAttribute('data-step')).toBe('0');
    expect(root.getAttribute('data-drawn')).toBe('false');
    expect(root.hasAttribute('data-calls')).toBe(false);
    expect(screen.queryByTestId('proof-node')).toBeNull();
    // The counts are data at every stop: 0 · 0 before the first row (0.66.2).
    expect(screen.getByTestId('proof-counts').textContent).toBe(`0 ${LABELS.calls} · 0 ${LABELS.tools}`);
    expect(screen.getByTestId('proof-transport')).toBeInTheDocument();
    for (let s = 0; s < lastStep; s++) fireEvent.click(screen.getByLabelText('Next step'));
    expect(screen.getByTestId('proof-map').getAttribute('data-drawn')).toBe('true');
    expect(screen.getByTestId('proof-map').getAttribute('data-answer')).toBe('true');
  });

  function Host({ fixture }: { readonly fixture: Fixture }) {
    const shared = useSharedCursor(fixture.recorder);
    return (
      <>
        <ContextView runner={fixture.runner} recorder={fixture.recorder} shared={shared} />
        <ProofMap runner={fixture.runner} recorder={fixture.recorder} shared={shared} />
      </>
    );
  }

  it('beside the Context view it follows the ONE cursor: the Context view’s transport moves both', () => {
    const fixture = load('proof-map');
    render(<Host fixture={fixture} />);
    const lastStep = fixture.positions.length - 1;
    expect(screen.getByTestId('proof-map').getAttribute('data-step')).toBe(String(lastStep));
    fireEvent.click(within(screen.getByTestId('context-transport')).getByLabelText('Previous step'));
    expect(screen.getByTestId('context-view').getAttribute('data-step')).toBe(String(lastStep - 1));
    expect(screen.getByTestId('proof-map').getAttribute('data-step')).toBe(String(lastStep - 1));
  });
});

describe('foldProofMap / layoutProofMap — the pure fold and the pure layout', () => {
  const port = { kind: 'port', id: 'fc1/7' };
  const input: ProofMapInput = {
    rows: [
      { kind: 'basis', toolCallId: 'c1', toolName: 'zeta', basis: 'direct' },
      { kind: 'basis', toolCallId: 'c2', toolName: 'alpha', basis: 'exploratory' },
      { kind: 'standing', toolCallId: 'c1', standing: 'open', assertions: [], declaredOn: { toolCallId: 'c2' } },
      { kind: 'judgment', source: 'judge', toolCallId: 'c1', standing: 'fact', confidence: 0.9 },
      { kind: 'basis', toolCallId: 'c3', toolName: 'alpha', basis: 'direct' },
      { kind: 'standing', toolCallId: 'c1', standing: 'ruled-out', assertions: [], declaredOn: 'answer' },
      { kind: 'standing', toolCallId: 'c2', standing: 'fact', assertions: [{ subject: port, predicate: 'state', value: 'up' }], declaredOn: 'answer' },
      { kind: 'standing', toolCallId: 'c3', standing: 'fact', assertions: [{ subject: port, predicate: 'state', value: 'down' }], declaredOn: 'answer' },
      { kind: 'conflict', key: 'port/fc1/7·state', witnesses: [{ toolCallId: 'c2', subject: port, predicate: 'state' }, { toolCallId: 'c3', subject: port, predicate: 'state' }] },
      { kind: 'contingent', declaredOn: { toolCallId: 'c3' }, value: '41200', carriers: [{ toolCallId: 'c1', standing: 'open' }], iteration: 3 },
      { kind: 'contingent', declaredOn: 'answer', value: 'sw-01', carriers: [{ toolCallId: 'c1', standing: 'ruled-out' }], iteration: 4 },
      { kind: 'contingent', value: 'no declaredOn' },
      { kind: 'judgment', source: 'not-the-judge', toolCallId: 'c2', standing: 'noise' },
    ],
    history: [
      { role: 'tool', toolCallId: 'c1', toolName: 'zeta', content: 'x' },
      { role: 'tool', toolCallId: 'c9', toolName: 'omega', content: 'a result the ledger never named' },
    ],
    ontology: {
      id: 'm',
      version: '1',
      hash: 'h',
      spec: {
        nodes: { a: { meaning: 'ay', sources: [{ source: 't', via: ['zeta', 'never-called'] }, { source: 's', via: ['alpha'] }] } },
        sources: { t: { meaning: 'tee' }, s: { meaning: 'ess' } },
      },
    },
    unsupportedValues: { values: [{ value: 'fc9/9', shape: 'identifier' }, { value: 'v2', shape: 'number' }], posture: 'assist' },
  };

  it('the LAST standing per result is current; the judge’s standing is a separate field; calls follow the basis rows then the record; tools and sources sorted', () => {
    const fold = foldProofMap(input);
    expect(fold.calls.map((c) => [c.toolCallId, c.toolName, c.basis, c.standing?.standing, c.judged, c.conflicts])).toEqual([
      ['c1', 'zeta', 'direct', 'ruled-out', 'fact', []],
      ['c2', 'alpha', 'exploratory', 'fact', undefined, ['port/fc1/7·state']],
      ['c3', 'alpha', 'direct', 'fact', undefined, ['port/fc1/7·state']],
      ['c9', 'omega', undefined, undefined, undefined, []],
    ]);
    expect(fold.tools).toEqual(['alpha', 'omega', 'zeta']);
    // The map's join: only `via` names that are tools of this run; a source with none keeps an empty list.
    expect(fold.sources).toEqual([
      { id: 's', meaning: 'ess', tools: ['alpha'] },
      { id: 't', meaning: 'tee', tools: ['zeta'] },
    ]);
    // Contingent rows by shape: the one without `declaredOn` is passed over; the judgment from another source too.
    expect(fold.contingent.map((c) => [c.declaredOn, c.value])).toEqual([
      [{ toolCallId: 'c3' }, '41200'],
      ['answer', 'sw-01'],
    ]);
    expect(fold.answer?.standsOn.map((s) => [s.toolCallId, s.standing])).toEqual([
      ['c1', 'ruled-out'],
      ['c2', 'fact'],
      ['c3', 'fact'],
    ]);
    expect(fold.answer?.contingent.map((c) => c.value)).toEqual(['sw-01']);
    expect(fold.answer?.unsupported).toEqual(['fc9/9', 'v2']);
    expect(Object.isFrozen(fold)).toBe(true);
  });

  it('the answer node exists once ANY of a standing, a contingent row or an unsupported value names the answer; a map absent = no sources', () => {
    const basis = { kind: 'basis', toolCallId: 'c1', toolName: 't', basis: 'direct' };
    expect(foldProofMap({ rows: [basis] }).answer).toBeUndefined();
    expect(foldProofMap({ rows: [basis] }).sources).toBeUndefined();
    expect(foldProofMap({ rows: [basis, { kind: 'standing', toolCallId: 'c1', standing: 'noise', assertions: [], declaredOn: 'answer' }] }).answer?.standsOn).toHaveLength(1);
    const contingentOnly = foldProofMap({ rows: [basis, { kind: 'contingent', declaredOn: 'answer', value: 'v', carriers: [{ toolCallId: 'c1', standing: 'noise' }] }] });
    expect(contingentOnly.answer).toEqual({ standsOn: [], contingent: contingentOnly.contingent, unsupported: [] });
    expect(foldProofMap({ rows: [basis], unsupportedValues: { values: [] } }).answer).toEqual({ standsOn: [], contingent: [], unsupported: [] });
    expect(foldProofMap({ rows: [basis], unsupportedValues: 'not a record' }).answer).toBeUndefined();
    expect(foldProofMap({ rows: [basis], ontology: { id: 'm' } }).sources).toBeUndefined();
  });

  it('places the answer, calls, tools and sources in four columns; straight edges for stands-on / calls / reads, a lane per overlay edge left of the calls', () => {
    const layout = layoutProofMap(foldProofMap(input));
    const by = Object.fromEntries(layout.nodes.map((n) => [`${n.kind}:${n.id}`, n]));
    expect(by['answer:answer']!.column).toBe(0);
    expect(by['call:c1']!.column).toBe(1);
    expect(by['tool:alpha']!.column).toBe(2);
    expect(by['source:s']!.column).toBe(3);
    expect(by['call:c1']!.y).toBeLessThan(by['call:c2']!.y);
    expect(layout.columns).toEqual({ answer: by['answer:answer']!.x, call: by['call:c1']!.x, tool: by['tool:alpha']!.x, source: by['source:s']!.x });
    const of = (kind: string) => layout.edges.filter((e) => e.kind === kind);
    expect(of('stands-on').map((e) => [e.to, e.label])).toEqual([
      ['call:c1', 'ruled-out'],
      ['call:c2', 'fact'],
      ['call:c3', 'fact'],
    ]);
    expect(of('calls').map((e) => [e.from, e.to])).toEqual([
      ['call:c1', 'tool:zeta'],
      ['call:c2', 'tool:alpha'],
      ['call:c3', 'tool:alpha'],
      ['call:c9', 'tool:omega'],
    ]);
    expect(of('reads').map((e) => [e.from, e.to])).toEqual([
      ['tool:alpha', 'source:s'],
      ['tool:zeta', 'source:t'],
    ]);
    // Overlays in row order: the two contingent carriers, then the conflict's witness pair; each in its own lane.
    expect(of('contingent').map((e) => [e.from, e.to, e.label, e.title])).toEqual([
      ['call:c3', 'call:c1', `${LABELS.contingent} · open`, '41200'],
      ['answer:answer', 'call:c1', `${LABELS.contingent} · ruled-out`, 'sw-01'],
    ]);
    expect(of('conflict').map((e) => [e.from, e.to, e.label, e.title])).toEqual([['call:c2', 'call:c3', LABELS.conflict, 'port/fc1/7·state']]);
    const lane = (p: string) => Number(/H (\d+(?:\.\d+)?) V/.exec(p)![1]);
    const lanes = [...of('contingent'), ...of('conflict')].map((e) => lane(e.path));
    expect(new Set(lanes).size).toBe(3);
    for (const l of lanes) {
      expect(l).toBeLessThan(by['call:c1']!.x);
      expect(l).toBeGreaterThan(by['answer:answer']!.x + GEOMETRY.nodeWidth);
    }
    expect(lanes[1]! - lanes[0]!).toBe(-GEOMETRY.laneGap);
    expect(layout.width).toBeGreaterThan(by['source:s']!.x + GEOMETRY.nodeWidth);
    expect(layout.height).toBeGreaterThan(by['call:c9']!.y + GEOMETRY.nodeHeight);
  });

  it('is pure: the same input lays out to deep-equal geometry twice; an edge to an id not on the map is not drawn', () => {
    const a = layoutProofMap(foldProofMap(input));
    const b = layoutProofMap(foldProofMap(input));
    expect(b).toEqual(a);
    const dangling = layoutProofMap(
      foldProofMap({
        rows: [
          { kind: 'basis', toolCallId: 'c1', toolName: 't', basis: 'direct' },
          { kind: 'standing', toolCallId: 'zzz', standing: 'fact', assertions: [], declaredOn: 'answer' },
          { kind: 'contingent', declaredOn: 'answer', value: 'v', carriers: [{ toolCallId: 'zzz', standing: 'noise' }] },
        ],
      }),
    );
    // The standing and the carrier name a result no basis row and no result
    // on the record holds: no node is invented for it, and the edges to it are
    // not drawn — the answer node still stands (a standing WAS declared on it).
    expect(dangling.nodes.map((n) => `${n.kind}:${n.id}`)).toEqual(['answer:answer', 'call:c1', 'tool:t']);
    expect(dangling.edges.map((e) => e.kind)).toEqual(['calls']);
  });

  it('without an answer the calls column is the first, shifted right only by the overlay lanes it needs', () => {
    const none = layoutProofMap(foldProofMap({ rows: [{ kind: 'basis', toolCallId: 'c1', toolName: 't', basis: 'direct' }] }));
    expect(none.columns).toEqual({ call: GEOMETRY.padding, tool: GEOMETRY.padding + GEOMETRY.nodeWidth + GEOMETRY.columnGap });
    const laned = layoutProofMap(
      foldProofMap({
        rows: [
          { kind: 'basis', toolCallId: 'c1', toolName: 't', basis: 'direct' },
          { kind: 'basis', toolCallId: 'c2', toolName: 't', basis: 'direct' },
          { kind: 'standing', toolCallId: 'c1', standing: 'noise', assertions: [], declaredOn: { toolCallId: 'c2' } },
          { kind: 'contingent', declaredOn: { toolCallId: 'c2' }, value: 'v', carriers: [{ toolCallId: 'c1', standing: 'noise' }] },
        ],
      }),
    );
    expect(laned.columns.answer).toBeUndefined();
    expect(laned.columns.call).toBe(GEOMETRY.padding + GEOMETRY.laneGap * 2);
    const edge = laned.edges.find((e) => e.kind === 'contingent')!;
    expect(edge.path).toMatch(/^M \d+(\.\d+)? \d+(\.\d+)? H \d+(\.\d+)? V \d+(\.\d+)? H \d+(\.\d+)?$/);
    expect(edge.from).toBe('call:c2');
    expect(edge.to).toBe('call:c1');
  });
});
