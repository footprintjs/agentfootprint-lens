/**
 * `servedGraphAt` — the three bands, measured on the REAL fixtures.
 *
 * One test per law of `docs/design/2026-09-served-graph.md`, plus the edge
 * state pinned on the two fixtures that move between epochs. Nothing here
 * hand-authors a recording: every fact comes off a frozen run in ./fixtures.
 */

import { describe, expect, it } from 'vitest';
import { receiptAt, SERVED_GAPS, UNGAPPED_FIELDS } from 'agentfootprint';

import { servedGraphAt, SERVED_SLOTS } from '../../src/core/served/index.js';
import { graphAt, load, loadTampered, stopsOf, tamperToolSchema, turnStops, type TamperableRecording } from './helpers.js';

describe('LAW 1 — one cursor: the graph holds no position, it renders the row the cursor resolved', () => {
  it('the same cursor builds the same graph twice; a different stop builds a different epoch', () => {
    const f = load('tool-set-changes');
    const stops = stopsOf(f, 'llm-turn');
    const first = graphAt(f, stops[0]!);
    const again = graphAt(f, stops[0]!);
    expect(again.graph).toEqual(first.graph);
    expect(first.graph.call.epoch).toBe(1);

    const second = graphAt(f, stops[1]!);
    expect(second.graph.call.epoch).toBe(2);
    // The row is the cursor's; the graph only arranges it.
    expect(second.graph.call.callRuntimeStageId).toBe(second.row.callRuntimeStageId);
    expect(second.graph.call.commitIdx).toBe(second.row.commitIdx);
  });

  it('every return is frozen, and the slot nodes are exactly the library\'s three', () => {
    const f = load('flat-dynamic-tools');
    const { graph } = graphAt(f, stopsOf(f, 'llm-turn')[0]!);
    expect(Object.isFrozen(graph)).toBe(true);
    expect(Object.isFrozen(graph.edges)).toBe(true);
    expect(Object.isFrozen(graph.held)).toBe(true);
    expect(graph.served.map((s) => s.slot)).toEqual(['system-prompt', 'messages', 'tools']);
    expect(SERVED_SLOTS).toEqual(['system-prompt', 'messages', 'tools']);
    // Every edge targets one of those three and nothing else.
    for (const edge of graph.edges) expect(SERVED_SLOTS).toContain(edge.slot);
    // Every source node is the piece's OWN `source`; every message node its
    // own `role`. The graph maps neither vocabulary onto the other.
    const pieces = graph.edges.filter((e) => e.kind === 'piece');
    expect(pieces.map((e) => e.origin)).toEqual(pieces.map((e) => e.source));
    const messages = graph.edges.filter((e) => e.kind === 'message');
    expect(messages.map((e) => e.origin)).toEqual(messages.map((e) => e.role));
    // A tool row carries neither on the record, so the graph gives it neither.
    expect(graph.edges.filter((e) => e.kind === 'tool').every((e) => e.origin === undefined)).toBe(true);
  });

  it('a stop between calls draws the preceding call and says so on the call node', () => {
    const f = load('flat-dynamic-tools');
    const route = f.positions.find((p) => p.milestone === 'decision')!;
    const { graph } = graphAt(f, route);
    expect(graph.call.epoch).toBe(1);
    expect(graph.call.betweenCalls).toBe(true);
    // On the call's own stop it is false — the same flag, from the same row.
    expect(graphAt(f, stopsOf(f, 'llm-turn')[0]!).graph.call.betweenCalls).toBe(false);
  });
});

describe('LAW 2 — no sentence of the lens\'s own: every reason is the library\'s string', () => {
  it('a withheld node carries the library\'s own sentence, byte for byte', () => {
    const f = load('no-receipt');
    const { graph } = graphAt(f, turnStops(f, 'no-receipt')[0]!);
    const gaps = graph.withheld.filter((w) => w.kind === 'gap');
    expect(gaps.length).toBeGreaterThan(0);
    for (const node of gaps) {
      expect(node.why).toBe(SERVED_GAPS[node.name as keyof typeof SERVED_GAPS].why);
    }
    // With no receipt the attention drops are not on record: the badge, and
    // NO sentence — the library retired `UNGAPPED_FIELDS.omittedForAttention`
    // in 9.93.0 (the field is now named by `no-receipt-on-chart`), and the
    // lens writes none of its own.
    const drops = graph.withheld.find((w) => w.kind === 'attention-drop')!;
    expect(drops.status).toBe('not-on-record');
    expect(drops.why).toBeUndefined();
    expect(UNGAPPED_FIELDS.omittedForAttention).toBeUndefined();
    expect(SERVED_GAPS['no-receipt-on-chart'].fields).toContain('omittedForAttention');
  });

  it('a request-only line is labelled with the library\'s own `reason`', () => {
    for (const name of ['flat-dynamic-tools', 'tool-set-changes', 'instructions-move'] as const) {
      const f = load(name);
      for (const stop of stopsOf(f, 'llm-turn')) {
        const { row, graph } = graphAt(f, stop);
        const lines = graph.edges.filter((e) => e.kind === 'request-only');
        expect(lines.map((e) => e.label)).toEqual(row.view.messages.requestOnly.map((l) => l.reason));
      }
    }
  });
});

describe('LAW 3 — a badge is never softened: a Damaged piece draws Damaged', () => {
  it('a schema tampered in the recording damages that tool edge and the call, and nothing else', () => {
    const f = loadTampered('flat-dynamic-tools', tamperToolSchema('alpha_tool'));
    const { graph } = graphAt(f, stopsOf(f, 'llm-turn')[0]!);
    const alpha = graph.edges.find((e) => e.id === 'tool:alpha_tool')!;
    const beta = graph.edges.find((e) => e.id === 'tool:beta_tool')!;
    expect(alpha.check.status).toBe('damaged');
    expect(alpha.check.rebuilt).not.toBe(alpha.check.onReceipt);
    expect(beta.check.status).toBe('verified');
    expect(graph.call.damaged).toBe(true);
    // The system and message edges are untouched.
    expect(graph.edges.filter((e) => e.kind === 'piece').every((e) => e.check.status === 'verified')).toBe(true);
  });

  it('a clean run damages nothing', () => {
    const f = load('flat-dynamic-tools');
    const { graph } = graphAt(f, stopsOf(f, 'llm-turn')[0]!);
    expect(graph.call.damaged).toBe(false);
    expect(graph.edges.some((e) => e.check.status === 'damaged')).toBe(false);
  });
});

describe('LAW 4 — absent is not none', () => {
  it('a slot the rebuild produced nothing for draws its gap and the receipt\'s own count', () => {
    const f = load('paused-resumed-no-base');
    const { graph } = graphAt(f, stopsOf(f, 'llm-turn')[0]!);
    const system = graph.served.find((s) => s.slot === 'system-prompt')!;
    expect(system.rebuilt).toBe(0);
    // Not an empty node: the gap that covers the field, and the count the
    // receipt carries for it, are both on the node.
    expect(system.gaps.map((g) => g.gap)).toContain('no-fold-base');
    expect(system.onReceipt).toBe(1);
    expect(system.onReceiptOnly).toBe(1);
    const messages = graph.served.find((s) => s.slot === 'messages')!;
    expect(messages.rebuilt).toBe(1);
    expect(messages.onReceiptOnly).toBe(2);
  });

  it('a fold key with no committed value is a node marked not-on-record, never an empty one', () => {
    const f = load('flat-dynamic-tools');
    const { graph, fold } = graphAt(f, stopsOf(f, 'llm-turn')[0]!);
    const held = new Map(graph.held.map((h) => [h.key, h]));
    // This run commits no skill pointer: the key is DRAWN, and marked.
    expect(fold.currentSkillId).toBeUndefined();
    expect(held.get('currentSkillId')!.status).toBe('not-on-record');
    expect(held.get('currentSkillId')!.value).toBeUndefined();
    // And a key it does commit reads as read-from-the-fold.
    expect(held.get('iteration')!.status).toBe('reconstructed');
    expect(held.get('iteration')!.value).toBe(1);
  });

  it('a fold that could not read a row of the log draws it Damaged, and the served band stands', () => {
    // A bundle with its `trace` gone: the fold skips it (footprintjs 9.18) or
    // throws (9.17); either way it is DATA on the held band.
    const traceless = (idx: number) => (r: TamperableRecording) => {
      const b = r.snapshot.commitLog[idx]!;
      r.snapshot.commitLog[idx] = { runtimeStageId: b.runtimeStageId, stageId: b.stageId, stage: b.stage, idx };
    };
    const f = loadTampered('flat-dynamic-tools', traceless(5));
    const { graph } = graphAt(f, stopsOf(f, 'llm-turn')[0]!);
    const honesty = graph.held.filter((h) => h.key === 'skipped' || h.key === 'foldError');
    expect(honesty.length).toBeGreaterThan(0);
    expect(honesty.every((h) => h.status === 'damaged')).toBe(true);
    // The receipt and the view are untouched by a fold defect.
    expect(graph.served.find((s) => s.slot === 'system-prompt')!.check!.status).toBe('verified');
  });

  it('a run with no receipt at all: the basis is not-on-record, every row reconstructed, nothing empty', () => {
    const f = load('no-receipt');
    const { graph } = graphAt(f, turnStops(f, 'no-receipt')[0]!);
    expect(graph.call.basis).toBeUndefined();
    expect(graph.call.basisStatus).toBe('not-on-record');
    expect(graph.call.receiptCause).toBe('no-receipt-committed');
    expect(graph.edges.every((e) => e.check.status === 'reconstructed')).toBe(true);
    expect(graph.edges.some((e) => e.check.status === 'verified')).toBe(false);
    // The absence is DECLARED: the gap is on the withheld band with its cause.
    const gap = graph.withheld.find((w) => w.name === 'no-receipt-on-chart')!;
    expect(gap.cause).toBe('no-receipt-committed');
    expect(gap.fields ?? []).not.toHaveLength(0);
    // A slot with no receipt count carries none — never a fabricated 0.
    expect(graph.served.every((s) => s.onReceipt === undefined)).toBe(true);
  });
});

describe('LAW 5 — authority omissions come from the FOLD, never the receipt', () => {
  it('a skill hidden by role is on the withheld band, read from the fold', () => {
    const f = load('hidden-skills');
    const { graph, fold } = graphAt(f, stopsOf(f, 'llm-turn')[1]!);
    expect(fold.hiddenSkillIds).toEqual(['payroll']);
    const hidden = graph.withheld.filter((w) => w.kind === 'hidden-skill');
    expect(hidden.map((w) => w.name)).toEqual(['payroll']);
    expect(hidden.every((w) => w.from === 'fold')).toBe(true);
    // It names no slot: the record names none, and the graph invents none.
    expect(hidden[0]!.slot).toBeUndefined();
  });

  it('the receipt never carries it — strip the fold\'s key and the band loses them', () => {
    const f = load('hidden-skills');
    const stop = stopsOf(f, 'llm-turn')[1]!;
    const { row } = graphAt(f, stop);
    expect(JSON.stringify(receiptAt(f.snapshot, row.epoch))).not.toContain('payroll');

    const stripped = loadTampered('hidden-skills', (r) => {
      for (const bundle of r.snapshot.commitLog) {
        if (bundle.overwrite !== undefined) delete bundle.overwrite.hiddenSkillIds;
      }
    });
    const after = graphAt(stripped, stopsOf(stripped, 'llm-turn')[1]!);
    expect(after.fold.hiddenSkillIds).toBeUndefined();
    expect(after.graph.withheld.some((w) => w.kind === 'hidden-skill')).toBe(false);
    // And the receipt is unchanged by the strip: it never held them.
    expect(after.graph.call.epoch).toBe(2);
    expect(after.graph.edges.some((e) => e.check.status === 'verified')).toBe(true);
  });

  it('a tool list the run withheld is on the band with the library\'s own reason', () => {
    // `tools.withheld` is the library's own value; no fixture asks for wrap-up,
    // so the rule is measured where the record HAS the field: it reaches the
    // band verbatim whenever the view carries it.
    const f = load('tool-forced');
    const { row, graph } = graphAt(f, turnStops(f, 'tool-forced')[0]!);
    const node = graph.withheld.find((w) => w.kind === 'tool-withheld');
    if (row.view.tools.withheld === undefined) expect(node).toBeUndefined();
    else {
      expect(node!.name).toBe(row.view.tools.withheld);
      expect(node!.slot).toBe('tools');
      expect(node!.from).toBe('view');
    }
    // The forced tool IS on this fixture: named, marked, and its schema is the
    // declared hole the library's gap explains.
    const forced = graph.edges.find((e) => e.forced === true)!;
    expect(forced.label).toBe(row.view.tools.forced);
    expect(forced.schemaOnReceiptOnly).toBe(true);
    const gap = graph.withheld.find((w) => w.name === 'forced-tool-schema')!;
    expect(gap.slot).toBe('tools');
    expect(gap.why).toBe(SERVED_GAPS['forced-tool-schema'].why);
  });
});

describe('edge state — entered / left / unchanged, from sincePrevious', () => {
  it('instructions-move: one system piece entered and one left between the two calls', () => {
    const f = load('instructions-move');
    const stops = stopsOf(f, 'llm-turn');
    const first = graphAt(f, stops[0]!);
    // Epoch 1 has no previous epoch in this recording: NO state is claimed.
    expect(first.graph.call.previousEpoch).toBeUndefined();
    expect(first.graph.edges.every((e) => e.state === undefined)).toBe(true);

    const { graph, since } = graphAt(f, stops[1]!);
    expect(since!.system.changed).toBe(true);
    const pieces = graph.edges.filter((e) => e.kind === 'piece');
    const entered = pieces.filter((e) => e.state === 'entered');
    const left = pieces.filter((e) => e.state === 'left');
    expect(entered).toHaveLength(1);
    expect(left).toHaveLength(1);
    expect(entered[0]!.text).toContain('The order is on record.');
    expect(left[0]!.text).toContain('Look the order up before you answer.');
    // The base piece did not move.
    expect(pieces.filter((e) => e.state === 'unchanged').map((e) => e.source)).toEqual(['base']);
    // A left edge is on no current request, so no hash checks it.
    expect(left[0]!.check.status).toBe('not-on-record');
    // The counts the list prints are this same answer.
    expect(entered).toHaveLength(since!.system.piecesEntered);
    expect(left).toHaveLength(since!.system.piecesLeft);
  });

  it('tool-set-changes: charge entered, lookup left, the rest unchanged', () => {
    const f = load('tool-set-changes');
    const { graph, since } = graphAt(f, stopsOf(f, 'llm-turn')[1]!);
    const tools = graph.edges.filter((e) => e.kind === 'tool');
    const byState = (state: string) => tools.filter((e) => e.state === state).map((e) => e.label);
    expect(byState('entered')).toEqual(['charge']);
    expect(byState('left')).toEqual(['lookup']);
    expect(byState('unchanged')).toEqual(expect.arrayContaining(['read_skill']));
    expect(byState('entered')).toEqual([...since!.tools.added]);
    expect(byState('left')).toEqual([...since!.tools.removed]);
    // The system text did NOT move on this run (the step note leads the tool
    // description), so every piece reads unchanged.
    expect(since!.system.changed).toBe(false);
    expect(graph.edges.filter((e) => e.kind === 'piece').every((e) => e.state === 'unchanged')).toBe(true);
  });

  it('a schema that changed between epochs is flagged on its own edge, not as a state', () => {
    const f = load('tool-set-changes');
    const { graph, since } = graphAt(f, stopsOf(f, 'llm-turn')[1]!);
    const changed = graph.edges.filter((e) => e.schemaChanged === true).map((e) => e.label);
    expect(changed).toEqual([...since!.tools.schemaChanged]);
    for (const edge of graph.edges.filter((e) => e.schemaChanged === true)) {
      expect(edge.state).toBe('unchanged');
    }
  });
});

describe('the graph is a projection: it reads nothing the row did not already hand it', () => {
  it('built from a row alone — no recording, no cursor, no snapshot', () => {
    const f = load('flat-dynamic-tools');
    const { row, checks, fold } = graphAt(f, stopsOf(f, 'llm-turn')[0]!);
    const graph = servedGraphAt({ row, fold, checks });
    expect(graph.call.epoch).toBe(row.epoch);
    expect(graph.edges.filter((e) => e.kind === 'piece')).toHaveLength(row.view.system.pieces.length);
    expect(graph.edges.filter((e) => e.kind === 'tool')).toHaveLength(row.view.tools.names.length);
    // With no `since`, no edge claims a state.
    expect(graph.edges.every((e) => e.state === undefined)).toBe(true);
  });
});
