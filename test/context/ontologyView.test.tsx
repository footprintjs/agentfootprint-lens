/**
 * <OntologyView> — the declared map drawn from the record, on the recorded
 * `ontology` fixture (agentfootprint 9.106.0, generated alone).
 *
 * Test types: Render (the chart and the list draw every term, source, holding
 * and relation of the fixture's spec — ids, relation words, the `via` tool,
 * the coverage sentences verbatim; the header's id · version · hash · counts)
 * · Law (the unheld term sits under the declaration's own heading and among
 * no holding; `configured` only on the source that declared it; an unarmed
 * run draws nothing at any stop — omit, never deny; the root's identity is
 * the record's) · Determinism (the same bytes on two renders) · Functional
 * (the transport mounts with `shared`; stepping does not change the map — a
 * run constant; a per-axis `cursor` brings no mover) · Unit (`foldOntology`
 * sorts by id and lists the unheld; `layoutOntology` is pure and columnar;
 * `ontologyRecordOf` refuses a value that does not fit).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { contextAt } from '../../src/core/context/contextAt.js';
import { lensCursorFrom } from '../../src/core/cursor/lensCursor.js';
import { ContextView } from '../../src/react/components/ContextView.js';
import {
  GEOMETRY,
  LABELS,
  OntologyView,
  foldOntology,
  layoutOntology,
  ontologyRecordOf,
  type OntologyRecordShape,
} from '../../src/react/components/OntologyView.js';
import { useSharedCursor } from '../../src/react/useSharedCursor.js';
import { load, loadTampered, type FixtureBundle, type FixtureName } from '../served/helpers.js';

afterEach(cleanup);

type Fixture = ReturnType<typeof load>;

interface SpecShape {
  readonly id: string;
  readonly version: string;
  readonly nodes: Record<string, { meaning: string; unit?: string; aliases?: string[]; sources?: { source: string; via?: string[]; coverage?: string }[] }>;
  readonly sources: Record<string, { meaning: string; coverage?: string; configured?: boolean }>;
  readonly edges: { from: string; to: string; relation: string; meaning?: string }[];
}

interface RecordShape {
  readonly id: string;
  readonly version: string;
  readonly hash: string;
  readonly spec: SpecShape;
}

/** The run constant as the record holds it at the run's end — the test's oracle, never a hand-written copy. */
function recordOf(fixture: Fixture): RecordShape {
  const last = fixture.positions[fixture.positions.length - 1]!;
  const value = contextAt(fixture.snapshot, { runtimeStageId: last.runtimeStageId, commitIdx: last.commitIdx }, {}).keys.find(
    (k) => k.path === 'ontology',
  )?.value;
  if (value === undefined) throw new Error('the fixture carries no ontology key');
  return value as RecordShape;
}

/** The view at one grouped-axis step, handed the ONE cursor. */
function renderAt(fixture: Fixture, step: number): void {
  render(<OntologyView runner={fixture.runner} cursor={lensCursorFrom(fixture.positions, step, () => undefined)} />);
}

const attr = (els: readonly HTMLElement[], name: string): (string | null)[] => els.map((e) => e.getAttribute(name));

describe('<OntologyView> at the end of the run that declared a map', () => {
  const fixture = load('ontology');
  const last = fixture.positions.length - 1;
  const record = recordOf(fixture);
  const spec = record.spec;
  const sortedIds = (o: Record<string, unknown>): string[] => Object.keys(o).sort();

  it('the root carries the record’s id, version and hash; the header prints them and the counts', () => {
    renderAt(fixture, last);
    const root = screen.getByTestId('ontology-view');
    expect(root.getAttribute('data-id')).toBe(record.id);
    expect(root.getAttribute('data-version')).toBe(record.version);
    expect(root.getAttribute('data-hash')).toBe(record.hash);
    expect(root.getAttribute('data-step')).toBe(String(last));
    expect(screen.getByTestId('ontology-id').textContent).toBe(record.id);
    // The hash is shortened on screen, whole on hover.
    const hash = screen.getByTestId('ontology-hash');
    expect(hash.getAttribute('title')).toBe(record.hash);
    expect(record.hash.startsWith(hash.textContent!.replace(/…$/, ''))).toBe(true);
    const holdings = Object.values(spec.nodes).flatMap((n) => n.sources ?? []).length;
    expect(screen.getByTestId('ontology-counts').textContent).toBe(
      `${Object.keys(spec.nodes).length} ${LABELS.nodes} · ${Object.keys(spec.sources).length} ${LABELS.sources} · ${holdings + spec.edges.length} ${LABELS.edges}`,
    );
    expect(screen.getByTestId('ontology-counts').textContent).toBe('4 nodes · 2 sources · 6 edges');
  });

  it('the LIST draws every term with its meaning, unit and aliases, sorted by id', () => {
    renderAt(fixture, last);
    const nodes = screen.getAllByTestId('ontology-node');
    expect(attr(nodes, 'data-node')).toEqual(sortedIds(spec.nodes));
    expect(attr(nodes, 'data-node')).toEqual(['maintenance_window', 'optic', 'port', 'port_error_rate']);
    for (const node of nodes) {
      const id = node.getAttribute('data-node')!;
      const declared = spec.nodes[id]!;
      expect(node.textContent).toContain(declared.meaning);
      expect(node.getAttribute('data-held')).toBe(String((declared.sources ?? []).length > 0));
      const unit = within(node).queryByTestId('ontology-unit');
      if (declared.unit !== undefined) expect(unit?.textContent).toBe(`${LABELS.unit} ${declared.unit}`);
      else expect(unit).toBeNull();
      const aliases = within(node).queryByTestId('ontology-aliases');
      if (declared.aliases !== undefined) expect(aliases?.textContent).toBe(` ${LABELS.aliases} ${declared.aliases.join(', ')}`);
      else expect(aliases).toBeNull();
    }
  });

  it('the LIST draws every source with its meaning and coverage verbatim; `configured` only where declared', () => {
    renderAt(fixture, last);
    const sources = screen.getAllByTestId('ontology-source');
    expect(attr(sources, 'data-source')).toEqual(sortedIds(spec.sources));
    const declaredConfigured = Object.entries(spec.sources).filter(([, s]) => s.configured !== undefined).map(([id]) => id);
    expect(declaredConfigured).toEqual(['inventory']);
    for (const el of sources) {
      const id = el.getAttribute('data-source')!;
      const declared = spec.sources[id]!;
      expect(el.textContent).toContain(declared.meaning);
      const chip = within(el).queryByTestId('ontology-configured');
      if (declared.configured !== undefined) {
        expect(chip?.textContent).toBe(`${LABELS.configured} ${String(declared.configured)}`);
        expect(el.getAttribute('data-configured')).toBe(String(declared.configured));
      } else {
        expect(chip).toBeNull();
        expect(el.hasAttribute('data-configured')).toBe(false);
      }
      const coverage = within(el).queryByTestId('ontology-source-coverage');
      if (declared.coverage !== undefined) {
        expect(within(coverage!).getByText(declared.coverage).tagName).toBe('Q');
      } else expect(coverage).toBeNull();
    }
    expect(screen.getAllByTestId('ontology-configured')).toHaveLength(1);
  });

  it('the LIST draws every holding — term ← source, the `via` tool, the coverage sentence verbatim', () => {
    renderAt(fixture, last);
    const held = screen.getAllByTestId('ontology-held');
    const declared = Object.keys(spec.nodes)
      .sort()
      .flatMap((id) => (spec.nodes[id]!.sources ?? []).map((s) => ({ node: id, ...s })));
    expect(held.map((h) => [h.getAttribute('data-node'), h.getAttribute('data-source')])).toEqual(declared.map((d) => [d.node, d.source]));
    expect(held.map((h) => [h.getAttribute('data-node'), h.getAttribute('data-source')])).toEqual([
      ['optic', 'inventory'],
      ['optic', 'telemetry'],
      ['port', 'inventory'],
      ['port_error_rate', 'telemetry'],
    ]);
    for (const [i, h] of held.entries()) {
      const d = declared[i]!;
      const via = within(h).queryByTestId('ontology-via');
      if (d.via !== undefined) expect(via?.textContent).toBe(` ${LABELS.via} ${d.via.join(', ')}`);
      else expect(via).toBeNull();
      const coverage = within(h).queryByTestId('ontology-held-coverage');
      if (d.coverage !== undefined) expect(within(coverage!).getByText(d.coverage).tagName).toBe('Q');
      else expect(coverage).toBeNull();
    }
    // The one `via` names the tool registered on the agent.
    expect(screen.getAllByTestId('ontology-via')).toHaveLength(1);
    expect(screen.getByTestId('ontology-via').textContent).toBe(` ${LABELS.via} lookup`);
  });

  it('the LIST draws every relation in declaration order, in the author’s own word, with its meaning when declared', () => {
    renderAt(fixture, last);
    const edges = screen.getAllByTestId('ontology-edge');
    expect(edges.map((e) => [e.getAttribute('data-from'), e.getAttribute('data-relation'), e.getAttribute('data-to')])).toEqual(
      spec.edges.map((e) => [e.from, e.relation, e.to]),
    );
    expect(attr(edges, 'data-relation')).toEqual(['measured-on', 'seated-in']);
    for (const [i, e] of edges.entries()) {
      const d = spec.edges[i]!;
      expect(e.textContent).toContain(d.relation);
      const meaning = within(e).queryByTestId('ontology-edge-meaning');
      if (d.meaning !== undefined) expect(within(meaning!).getByText(d.meaning).tagName).toBe('Q');
      else expect(meaning).toBeNull();
    }
  });

  it('the CHART draws the same nodes and edges: sources in one column, held terms in the next, the unheld in a third', () => {
    renderAt(fixture, last);
    const chart = screen.getByTestId('ontology-chart');
    const nodes = within(chart).getAllByTestId('ontology-chart-node');
    const of = (kind: string) => nodes.filter((n) => n.getAttribute('data-kind') === kind);
    expect(attr(of('source'), 'data-node')).toEqual(sortedIds(spec.sources));
    expect(attr(of('term'), 'data-node').sort()).toEqual(sortedIds(spec.nodes));
    const x = (n: HTMLElement) => Number(/translate\((\d+(?:\.\d+)?) /.exec(n.getAttribute('transform') ?? '')?.[1]);
    const sourceX = new Set(of('source').map(x));
    const heldX = new Set(of('term').filter((n) => n.getAttribute('data-held') === 'true').map(x));
    const unheldX = new Set(of('term').filter((n) => n.getAttribute('data-held') === 'false').map(x));
    expect(sourceX.size).toBe(1);
    expect(heldX.size).toBe(1);
    expect(unheldX.size).toBe(1);
    expect([...sourceX][0]!).toBeLessThan([...heldX][0]!);
    expect([...heldX][0]!).toBeLessThan([...unheldX][0]!);
    // Every node's clipped line rides whole as its <title>: a term's meaning; a source's meaning and, when declared, its coverage.
    for (const n of nodes) {
      const id = n.getAttribute('data-node')!;
      const whole =
        n.getAttribute('data-kind') === 'source'
          ? spec.sources[id]!.coverage === undefined
            ? spec.sources[id]!.meaning
            : `${spec.sources[id]!.meaning} · ${spec.sources[id]!.coverage}`
          : spec.nodes[id]!.meaning;
      expect(n.querySelector('title')?.textContent).toBe(whole);
    }
    const edges = within(chart).getAllByTestId('ontology-chart-edge');
    const held = edges.filter((e) => e.getAttribute('data-kind') === 'held');
    const relations = edges.filter((e) => e.getAttribute('data-kind') === 'relation');
    expect(held.map((e) => [e.getAttribute('data-from'), e.getAttribute('data-to')])).toEqual([
      ['inventory', 'optic'],
      ['telemetry', 'optic'],
      ['inventory', 'port'],
      ['telemetry', 'port_error_rate'],
    ]);
    expect(relations.map((e) => [e.getAttribute('data-from'), e.getAttribute('data-relation'), e.getAttribute('data-to')])).toEqual(
      spec.edges.map((e) => [e.from, e.relation, e.to]),
    );
    // The holding via the registered tool is labelled with its name; the relations with the author's word.
    const viaEdge = held.find((e) => e.getAttribute('data-to') === 'port')!;
    expect(viaEdge.querySelector('text')?.textContent).toBe('lookup');
    for (const e of relations) expect(e.querySelector('text')?.textContent).toBe(e.getAttribute('data-relation'));
    expect(within(chart).getByTestId('ontology-chart-unheld').textContent).toBe(LABELS.unheld);
  });

  it('the unheld term sits under the declaration’s own heading and among NO holding — on the chart and in the list', () => {
    renderAt(fixture, last);
    const unheldIds = Object.entries(spec.nodes)
      .filter(([, n]) => (n.sources ?? []).length === 0)
      .map(([id]) => id);
    expect(unheldIds).toEqual(['maintenance_window']);
    const group = screen.getByTestId('ontology-unheld-group');
    expect(group.textContent).toContain(LABELS.unheld);
    expect(attr(screen.getAllByTestId('ontology-unheld'), 'data-node')).toEqual(unheldIds);
    for (const h of screen.getAllByTestId('ontology-held')) expect(h.getAttribute('data-node')).not.toBe('maintenance_window');
    for (const e of screen.getAllByTestId('ontology-chart-edge').filter((e) => e.getAttribute('data-kind') === 'held')) {
      expect(e.getAttribute('data-to')).not.toBe('maintenance_window');
    }
    const chartNode = screen.getAllByTestId('ontology-chart-node').find((n) => n.getAttribute('data-node') === 'maintenance_window')!;
    expect(chartNode.getAttribute('data-held')).toBe('false');
    expect(screen.getAllByTestId('ontology-node').find((n) => n.getAttribute('data-node') === 'maintenance_window')!.getAttribute('data-held')).toBe(
      'false',
    );
  });

  it('draws the same bytes twice — layout is a function of the spec alone', () => {
    renderAt(fixture, last);
    const first = screen.getByTestId('ontology-view').outerHTML;
    cleanup();
    renderAt(fixture, last);
    const second = screen.getByTestId('ontology-view').outerHTML;
    expect(second).toBe(first);
    expect(first).toContain('<svg');
  });
});

describe('<OntologyView> laws', () => {
  it('an unarmed run draws nothing at any stop — the root is absent (omit, never deny)', () => {
    const fixture = load('flat-dynamic-tools' satisfies FixtureName);
    for (let step = 0; step < fixture.positions.length; step++) {
      renderAt(fixture, step);
      expect(screen.queryByTestId('ontology-view')).toBeNull();
      cleanup();
    }
  });

  it('the map is a run constant: at every stop where the fold holds the key the view draws it, identically; before, nothing', () => {
    const fixture = load('ontology');
    const record = recordOf(fixture);
    let drawn: string | undefined;
    let absent = 0;
    for (let step = 0; step < fixture.positions.length; step++) {
      const stop = fixture.positions[step]!;
      const held = contextAt(fixture.snapshot, { runtimeStageId: stop.runtimeStageId, commitIdx: stop.commitIdx }, {}).keys.some(
        (k) => k.path === 'ontology',
      );
      renderAt(fixture, step);
      const root = screen.queryByTestId('ontology-view');
      if (!held) {
        expect(root).toBeNull();
        absent += 1;
      } else {
        expect(root?.getAttribute('data-hash')).toBe(record.hash);
        // The step and commit ride on the root; the map itself does not move.
        const body = within(root!).getByTestId('ontology-list').outerHTML + within(root!).getByTestId('ontology-chart').outerHTML;
        if (drawn === undefined) drawn = body;
        else expect(body).toBe(drawn);
      }
      cleanup();
    }
    expect(drawn).toBeDefined();
    // Every stop is one or the other; the count of stops before the seed is the record's, not asserted.
    expect(absent).toBeGreaterThanOrEqual(0);
  });

  it('a recording whose seed wrote no `ontology` key draws nothing at any stop — the armed shape with the key gone', () => {
    // The fixture's grouped axis opens on the seed's own commit, so no stop
    // stands before the key; the tampered record models the stop that would.
    const fixture = loadTampered('ontology', (recording) => {
      const seeds = recording.snapshot.commitLog.filter((b: FixtureBundle) => b.overwrite !== undefined && 'ontology' in b.overwrite);
      expect(seeds).toHaveLength(1);
      delete seeds[0]!.overwrite!.ontology;
    });
    for (let step = 0; step < fixture.positions.length; step++) {
      renderAt(fixture, step);
      expect(screen.queryByTestId('ontology-view')).toBeNull();
      cleanup();
    }
  });

  it('with neither `cursor` nor `shared` the view reads the run’s end and mounts no mover', () => {
    const fixture = load('ontology');
    render(<OntologyView runner={fixture.runner} recorder={fixture.recorder} />);
    expect(screen.getByTestId('ontology-view').getAttribute('data-step')).toBe(String(fixture.positions.length - 1));
    expect(screen.queryByTestId('ontology-transport')).toBeNull();
    expect(screen.queryByLabelText('Previous step')).toBeNull();
  });

  it('a per-axis `cursor` from a slot brings the host’s mover — none is mounted here', () => {
    const fixture = load('ontology');
    renderAt(fixture, fixture.positions.length - 1);
    expect(screen.queryByTestId('ontology-transport')).toBeNull();
  });
});

describe('<OntologyView> carries the transport when it holds the shared address', () => {
  function Alone({ fixture }: { readonly fixture: Fixture }) {
    const shared = useSharedCursor(fixture.recorder);
    return <OntologyView runner={fixture.runner} recorder={fixture.recorder} shared={shared} />;
  }

  it('mounts the same transport the other views mount; stepping moves the cursor and leaves the map as it was', () => {
    const fixture = load('ontology');
    render(<Alone fixture={fixture} />);
    const lastStep = fixture.positions.length - 1;
    expect(screen.getByTestId('ontology-transport')).toBeInTheDocument();
    expect(screen.getByTestId('ontology-view').getAttribute('data-step')).toBe(String(lastStep));
    const before = screen.getByTestId('ontology-list').outerHTML + screen.getByTestId('ontology-chart').outerHTML;
    fireEvent.click(screen.getByLabelText('Previous step'));
    expect(screen.getByTestId('ontology-view').getAttribute('data-step')).toBe(String(lastStep - 1));
    expect(screen.getByTestId('ontology-list').outerHTML + screen.getByTestId('ontology-chart').outerHTML).toBe(before);
    fireEvent.click(screen.getByLabelText('Next step'));
    expect(screen.getByTestId('ontology-view').getAttribute('data-step')).toBe(String(lastStep));
  });

  it('with the key gone from the record, the shared root keeps only its transport (0.66.1) — nothing else drawn, and the person can still step', () => {
    const fixture = loadTampered('ontology', (recording) => {
      const seeds = recording.snapshot.commitLog.filter((b: FixtureBundle) => b.overwrite !== undefined && 'ontology' in b.overwrite);
      delete seeds[0]!.overwrite!.ontology;
    });
    render(<Alone fixture={fixture} />);
    const root = screen.getByTestId('ontology-view');
    expect(root.getAttribute('data-drawn')).toBe('false');
    expect(root.hasAttribute('data-hash')).toBe(false);
    expect(screen.queryByTestId('ontology-chart')).toBeNull();
    expect(screen.queryByTestId('ontology-list')).toBeNull();
    expect(screen.getByTestId('ontology-transport')).toBeInTheDocument();
    const step = Number(root.getAttribute('data-step'));
    fireEvent.click(screen.getByLabelText('Previous step'));
    expect(screen.getByTestId('ontology-view').getAttribute('data-step')).toBe(String(step - 1));
  });

  function Host({ fixture }: { readonly fixture: Fixture }) {
    const shared = useSharedCursor(fixture.recorder);
    return (
      <>
        <ContextView runner={fixture.runner} recorder={fixture.recorder} shared={shared} />
        <OntologyView runner={fixture.runner} recorder={fixture.recorder} shared={shared} />
      </>
    );
  }

  it('beside the Context view it follows the ONE cursor: the Context view’s transport moves both', () => {
    const fixture = load('ontology');
    render(<Host fixture={fixture} />);
    const lastStep = fixture.positions.length - 1;
    expect(screen.getByTestId('ontology-view').getAttribute('data-step')).toBe(String(lastStep));
    fireEvent.click(within(screen.getByTestId('context-transport')).getByLabelText('Previous step'));
    expect(screen.getByTestId('context-view').getAttribute('data-step')).toBe(String(lastStep - 1));
    expect(screen.getByTestId('ontology-view').getAttribute('data-step')).toBe(String(lastStep - 1));
  });
});

describe('foldOntology / layoutOntology — the pure fold and the pure layout', () => {
  const record: OntologyRecordShape = {
    id: 'm',
    version: '2',
    hash: 'abc',
    nodes: {
      b: { meaning: 'bee', sources: [{ source: 's', via: ['t1', 't2'], coverage: 'all of b' }] },
      a: { meaning: 'ay', unit: 'u', aliases: ['alpha'] },
      c: { meaning: 'sea', sources: [{ source: 's' }] },
    },
    sources: { s: { meaning: 'the source', configured: false } },
    edges: [
      { from: 'a', to: 'b', relation: 'part-of' },
      { from: 'c', to: 'b', relation: 'reads', meaning: 'c reads b' },
    ],
  };

  it('sorts terms and sources by id, lists holdings in term order and the unheld apart; the declared fields only', () => {
    const fold = foldOntology(record);
    expect(fold.terms.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(fold.terms[0]).toEqual({ id: 'a', meaning: 'ay', unit: 'u', aliases: ['alpha'], held: [] });
    expect(fold.terms[1]!.held).toEqual([{ node: 'b', source: 's', via: ['t1', 't2'], coverage: 'all of b' }]);
    expect(fold.terms[2]!.held).toEqual([{ node: 'c', source: 's', via: [] }]);
    expect(fold.sources).toEqual([{ id: 's', meaning: 'the source', configured: false }]);
    expect(fold.held.map((h) => h.node)).toEqual(['b', 'c']);
    expect(fold.relations).toEqual(record.edges);
    expect(fold.unheld).toEqual(['a']);
    expect(Object.isFrozen(fold)).toBe(true);
  });

  it('places sources in column 0, held terms in column 1, unheld in column 2; a holding is a straight line, a relation an elbow', () => {
    const layout = layoutOntology(foldOntology(record));
    const by = Object.fromEntries(layout.nodes.map((n) => [`${n.kind}:${n.id}`, n]));
    expect(by['source:s']!.column).toBe(0);
    expect(by['term:b']!.column).toBe(1);
    expect(by['term:c']!.column).toBe(1);
    expect(by['term:a']!.column).toBe(2);
    expect(by['term:b']!.y).toBeLessThan(by['term:c']!.y);
    expect(layout.unheldX).toBe(by['term:a']!.x);
    const held = layout.edges.filter((e) => e.kind === 'held');
    expect(held.map((e) => [e.from, e.to, e.label])).toEqual([
      ['s', 'b', 't1, t2'],
      ['s', 'c', ''],
    ]);
    expect(held[0]!.path).toMatch(/^M \d+(\.\d+)? \d+(\.\d+)? L \d+(\.\d+)? \d+(\.\d+)?$/);
    const relations = layout.edges.filter((e) => e.kind === 'relation');
    expect(relations.map((e) => [e.from, e.to, e.label, e.relation])).toEqual([
      ['a', 'b', 'part-of', 'part-of'],
      ['c', 'b', 'reads', 'reads'],
    ]);
    expect(relations[0]!.path).toMatch(/^M \d+(\.\d+)? \d+(\.\d+)? H \d+(\.\d+)? V \d+(\.\d+)? H \d+(\.\d+)?$/);
    // One lane per relation, in declaration order, right of every column.
    const lane = (p: string) => Number(/H (\d+(?:\.\d+)?) V/.exec(p)![1]);
    expect(lane(relations[1]!.path) - lane(relations[0]!.path)).toBe(GEOMETRY.laneGap);
    expect(lane(relations[0]!.path)).toBeGreaterThan(by['term:a']!.x + GEOMETRY.nodeWidth);
    expect(layout.width).toBeGreaterThan(lane(relations[1]!.path));
    expect(layout.height).toBeGreaterThan(by['term:c']!.y + GEOMETRY.nodeHeight);
  });

  it('is pure: the same record lays out to deep-equal geometry twice; a relation to an unknown id is not drawn', () => {
    const a = layoutOntology(foldOntology(record));
    const b = layoutOntology(foldOntology(record));
    expect(b).toEqual(a);
    const dangling = layoutOntology(foldOntology({ ...record, edges: [{ from: 'a', to: 'zzz', relation: 'x' }] }));
    expect(dangling.edges.filter((e) => e.kind === 'relation')).toEqual([]);
  });

  it('a holding that names a source the map never declared is dropped by the fold — the term counts as unheld, and chart and list agree', () => {
    const tampered = foldOntology({
      ...record,
      nodes: { ...record.nodes, orphan: { meaning: 'held by a source not declared', sources: [{ source: 'nowhere' }] } },
    });
    expect(tampered.held.some((h) => h.node === 'orphan')).toBe(false);
    expect(tampered.unheld).toContain('orphan');
    const laid = layoutOntology(tampered);
    expect(laid.edges.some((e) => e.kind === 'held' && e.to === 'orphan')).toBe(false);
  });

  it('ontologyRecordOf narrows by shape and refuses what does not fit', () => {
    expect(ontologyRecordOf(undefined)).toBeUndefined();
    expect(ontologyRecordOf('x')).toBeUndefined();
    expect(ontologyRecordOf({ id: 'm', version: '1', hash: 'h' })).toBeUndefined();
    expect(ontologyRecordOf({ id: 'm', version: '1', hash: 'h', spec: { nodes: {} } })).toBeUndefined();
    expect(ontologyRecordOf({ id: 'm', version: '1', hash: 'h', spec: { nodes: {}, sources: {} } })).toEqual({
      id: 'm',
      version: '1',
      hash: 'h',
      nodes: {},
      sources: {},
      edges: [],
    });
    // A node without a meaning, a source without one, an edge missing a side: passed over, never repaired.
    const fold = foldOntology({
      id: 'm',
      version: '1',
      hash: 'h',
      nodes: { ok: { meaning: 'fine' }, bad: { unit: 'u' } },
      sources: { s: { meaning: 'fine' }, t: {} },
      edges: [{ from: 'ok', to: 'ok', relation: 'self' }, { from: 'ok' }],
    });
    expect(fold.terms.map((t) => t.id)).toEqual(['ok']);
    expect(fold.sources.map((s) => s.id)).toEqual(['s']);
    expect(fold.relations).toHaveLength(1);
  });
});
