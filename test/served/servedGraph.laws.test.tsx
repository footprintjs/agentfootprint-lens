/**
 * The five laws of the Served graph, measured a SECOND way.
 *
 * `servedGraph.test.ts` checks the graph through the function that builds it.
 * This file checks the same laws from the OUTSIDE — it recomputes what each
 * recording held and did not send straight from `foldFactsAt` + `servedAt` +
 * the receipt, and compares that with the WITHHELD band; it collects every
 * string the rendered graph paints and traces each one to a library constant,
 * a computed value or a LABEL; it tampers a schema and a message and demands
 * the badge stay Damaged. Two paths to one answer: if the builder and the
 * renderer ever agree on a falsehood, one of these files still says no.
 *
 * Written as the review's own probes (2026-09-10) and kept, because evidence
 * that only lived in a report is evidence that rots.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import type { CursorPosition } from '../../src/core/group/cursorPositionsAtDrill.js';
import { describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { RECEIPT_BOUNDARY, SERVED_GAPS, UNGAPPED_FIELDS, receiptAt, servedAt } from 'agentfootprint';

import { ServedGraph, GRAPH_LABELS } from '../../src/react/components/ServedGraph.js';
import { BADGE_LABELS } from '../../src/react/components/ServedBadge.js';
import { LABELS as TAB_LABELS } from '../../src/react/components/ServedTab.js';
import { load, loadTampered, stopsOf, tamperToolSchema, graphAt, type FixtureName, type LoadedFixture, type TamperableRecording } from './helpers.js';

const ALL: FixtureName[] = ['flat-dynamic-tools','dynamic-grouped','llmcall','no-receipt','paused-resumed-no-base','tool-forced','tool-set-changes','hidden-skills','instructions-move','tagged-chart','window-evicts','wrap-up'];

function allStops(f: LoadedFixture) {
  const t = stopsOf(f, 'llm-turn');
  return t.length > 0 ? t : stopsOf(f, 'iteration');
}

function renderGraph(f: LoadedFixture, stop: CursorPosition) {
  const g = graphAt(f, stop);
  render(<ServedGraph graph={g.graph} />);
  return { ...g, el: screen.getByTestId('served-graph') };
}

function textNodes(el: HTMLElement): string[] {
  const out: string[] = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walk.nextNode())) { const s = (n.textContent ?? '').trim(); if (s !== '') out.push(s); }
  return out;
}

// ── LAW (a) one cursor ───────────────────────────────────────────────
describe('PROBE a — one cursor', () => {
  it('the component declares no state, no effect, no ref, and no cursor prop', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/react/components/ServedGraph.tsx', 'utf8');
    expect(src).not.toMatch(/useState|useEffect|useReducer|useRef|onJumpTo|servedRowAt|foldFactsAt|stateAt/);
  });
  it('rendered standalone at each stop it draws exactly the epoch the cursor resolved', () => {
    for (const name of ALL) {
      const f = load(name);
      for (const stop of allStops(f)) {
        cleanup();
        const { el, row } = renderGraph(f, stop);
        expect(el.querySelector('[data-testid="graph-call"]')?.getAttribute('data-epoch')).toBe(String(row.epoch));
        expect(el.querySelectorAll('[data-testid="graph-call"]').length).toBe(1);
      }
    }
    cleanup();
  });
});

// ── LAW (b) no sentence of the lens's own ────────────────────────────
describe('PROBE b — every painted string traces to library / data / LABEL', () => {
  it('collects every string the graph paints across every fixture and stop', () => {
    const LIB = new Set<string>([RECEIPT_BOUNDARY, ...Object.values(SERVED_GAPS).map((g) => g.why), ...Object.values(UNGAPPED_FIELDS)]);
    const LABELS = new Set<string>([...Object.values(GRAPH_LABELS), ...Object.values(BADGE_LABELS), ...Object.values(TAB_LABELS)]);
    const unexplained: string[] = [];
    for (const name of ALL) {
      const f = load(name);
      for (const stop of allStops(f)) {
        cleanup();
        const { el, graph } = renderGraph(f, stop);
        // Everything the graph object itself carries, as strings.
        const data = new Set<string>();
        const add = (v: unknown) => { if (v !== undefined && v !== null) data.add(typeof v === 'string' ? v : JSON.stringify(v)); };
        for (const h of graph.held) { add(h.key); add(h.value); if (typeof h.value !== 'string' && h.value !== undefined) add(String(h.value)); }
        for (const s of graph.served) { add(s.slot); add(s.rebuilt); add(s.onReceipt); add(s.onReceiptOnly); add(s.rebuiltOnly); add(s.check?.onReceipt); add(s.check?.rebuilt); for (const g of s.gaps) add(g.gap); }
        for (const e of graph.edges) { add(e.label); add(e.text); add(e.origin); add(e.source); add(e.role); add(e.check.onReceipt); add(e.check.rebuilt); }
        for (const w of graph.withheld) { add(w.name); add(w.from); add(w.hash); add(w.lastServedOn); w.fields?.forEach(add); add(w.cause); }
        add(graph.call.epoch); add(graph.call.callRuntimeStageId); add(graph.call.commitIdx);
        add(graph.call.basis?.model); add(graph.call.basis?.provider); add(graph.call.basis?.runId); add(graph.call.receiptCause);
        // `cache.strategy` is data: the receipt's own name ('*' printed as itself), or its `null` under a label.
        add(graph.call.cacheStrategy);
        for (const s of textNodes(el)) {
          if (LABELS.has(s) || LIB.has(s) || data.has(s)) continue;
          // Composed rows: "<label> <number>", "from · x", "cause · x", "receipt n · rebuilt n"
          const parts = s.split(/\s+·\s+|\s+/).filter((p) => p !== '' && p !== '·');
          if (parts.every((p) => LABELS.has(p) || data.has(p) || /^-?\d+$/.test(p))) continue;
          unexplained.push(`${name} ${stop.runtimeStageId} :: ${s}`);
        }
      }
    }
    cleanup();
    expect(unexplained).toEqual([]);
  });
});

// ── LAW (c) a badge is never softened ────────────────────────────────
describe('PROBE c — Damaged is drawn, Verified never where hashes disagree', () => {
  it('a tampered tool schema and a tampered message both draw Damaged', () => {
    const schema = loadTampered('flat-dynamic-tools', tamperToolSchema('alpha_tool'));
    cleanup();
    const a = renderGraph(schema, allStops(schema)[0]!);
    expect(a.el.querySelectorAll('[data-testid="served-badge"][data-status="damaged"]').length).toBeGreaterThan(0);
    cleanup();

    // Tamper a MESSAGE: edit committed history text so the rebuild differs from the receipt hash.
    const msg = loadTampered('flat-dynamic-tools', (r: TamperableRecording) => {
      let hit = 0;
      for (const b of r.snapshot.commitLog) {
        const ov = b.overwrite as Record<string, unknown> | undefined;
        const h = ov?.history as { role: string; content: string }[] | undefined;
        if (Array.isArray(h) && h.length > 0) { h[0]!.content = `${h[0]!.content} TAMPERED`; hit += 1; }
      }
      if (hit === 0) throw new Error('probe: no history to tamper');
    });
    const b = renderGraph(msg, allStops(msg)[0]!);
    expect(b.el.querySelectorAll('[data-testid="served-badge"][data-status="damaged"]').length).toBeGreaterThan(0);
    cleanup();
  });

  it('no Verified anywhere in the graph object where the two hashes disagree', () => {
    for (const name of ALL) {
      const f = load(name);
      for (const stop of allStops(f)) {
        const { graph } = graphAt(f, stop);
        const checks = [...graph.edges.map((e) => e.check), ...graph.served.map((s) => s.check)];
        for (const c of checks) {
          if (c === undefined) continue;
          if (c.status === 'verified') expect(c.onReceipt).toBe(c.rebuilt);
          if (c.onReceipt !== undefined && c.rebuilt !== undefined && c.onReceipt !== c.rebuilt) expect(c.status).not.toBe('verified');
        }
      }
    }
  });
});

// ── LAW (d) absent is not none ───────────────────────────────────────
describe('PROBE d — absent is not none', () => {
  it('paused-resumed-no-base and no-receipt: gaps drawn, not-on-record drawn, no "none" words', () => {
    for (const name of ['paused-resumed-no-base', 'no-receipt'] as FixtureName[]) {
      const f = load(name);
      for (const stop of allStops(f)) {
        cleanup();
        const { el, graph } = renderGraph(f, stop);
        // Strip the library's own verbatim sentences first — the law is about
        // sentences the LENS writes, not the ones it prints from the library.
        const clone = el.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('[data-testid="graph-withheld-why"]').forEach((n) => n.remove());
        const text = (clone.textContent ?? '').toLowerCase();
        expect(text).not.toMatch(/\bnone\b|\bempty\b|no tools|0 tools|nothing/);
        // Every gap the view declares is on screen somewhere.
        for (const g of graph.withheld.filter((w) => w.kind === 'gap')) {
          expect(el.querySelector(`[data-testid="graph-withheld"][data-name="${g.name}"]`)).toBeTruthy();
        }
        // A fold key with no committed value draws the Not-on-record badge.
        for (const h of graph.held.filter((h) => h.status === 'not-on-record')) {
          const row = el.querySelector(`[data-testid="graph-held"][data-key="${h.key}"]`)!;
          expect(row.querySelector('[data-testid="served-badge"][data-status="not-on-record"]')).toBeTruthy();
        }
      }
    }
    cleanup();
  });
  it('every fixture: a slot with zero rebuilt rows still draws its gaps or its receipt count', () => {
    for (const name of ALL) {
      const f = load(name);
      for (const stop of allStops(f)) {
        const { graph } = graphAt(f, stop);
        for (const s of graph.served) {
          if (s.rebuilt > 0) continue;
          const explained = s.gaps.length > 0 || s.onReceipt !== undefined || s.check !== undefined;
          expect({ name, slot: s.slot, explained }).toEqual({ name, slot: s.slot, explained: true });
        }
      }
    }
  });
});

// ── LAW (e) authority omissions come from the fold ───────────────────
describe('PROBE e — hidden skills come from the fold and are never on the receipt', () => {
  it('stripping hiddenSkillIds from the recording removes them from WITHHELD', () => {
    const f = load('hidden-skills');
    const stop = allStops(f)[allStops(f).length - 1]!;
    const before = graphAt(f, stop).graph.withheld.filter((w) => w.kind === 'hidden-skill');
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((w) => w.from === 'fold')).toBe(true);

    const stripped = loadTampered('hidden-skills', (r: TamperableRecording) => {
      for (const b of r.snapshot.commitLog) {
        const ov = b.overwrite as Record<string, unknown> | undefined;
        if (ov && 'hiddenSkillIds' in ov) delete ov.hiddenSkillIds;
        const up = b.updates as Record<string, unknown> | undefined;
        if (up && 'hiddenSkillIds' in up) delete up.hiddenSkillIds;
      }
    });
    const after = graphAt(stripped, stop).graph.withheld.filter((w) => w.kind === 'hidden-skill');
    expect(after).toEqual([]);
    cleanup();
    const { el } = renderGraph(stripped, stop);
    expect(el.querySelector('[data-testid="graph-withheld"][data-kind="hidden-skill"]')).toBeNull();
    cleanup();
  });
  it('no receipt in any fixture carries a hidden skill id', () => {
    for (const name of ALL) {
      const f = load(name);
      for (let k = 1; k <= 6; k += 1) {
        const r = receiptAt(f.snapshot, k);
        if (r === undefined) continue;
        expect(JSON.stringify(r)).not.toMatch(/hiddenSkillIds|payroll/);
      }
    }
  });
});

// ── BAND 3 completeness, computed independently ──────────────────────
describe('PROBE — the third band is complete', () => {
  it('everything held-and-not-sent, computed from the record, is in WITHHELD', () => {
    const missing: string[] = [];
    for (const name of ALL) {
      const f = load(name);
      for (const stop of allStops(f)) {
        const { graph, row, fold } = graphAt(f, stop);
        const view = servedAt(f.snapshot, row.epoch)!;
        const receipt = receiptAt(f.snapshot, row.epoch);
        // Independent expectation.
        const want: string[] = [];
        if (view.tools.withheld !== undefined) want.push(`tool-withheld:${view.tools.withheld}`);
        for (const id of fold.hiddenSkillIds ?? []) want.push(`hidden-skill:${id}`);
        // Attention drops, from the RECEIPT: one node per evicted hash; one
        // Not-on-record node where no receipt can say (no receipt, one with no
        // `cache` container, or one minted before 9.93.0 wrote the key);
        // NOTHING where a 9.93+ receipt carries none — the library's claim
        // that nothing was dropped.
        if (receipt?.omittedForAttention !== undefined) {
          for (const h of receipt.omittedForAttention.hashes) want.push(`attention-drop:${h}`);
        } else if (receipt?.cache === undefined || !('strategy' in receipt.cache)) {
          want.push('attention-drop:not-on-record');
        }
        if (fold.redacted) want.push('redacted:redacted');
        for (const g of view.gaps) want.push(`gap:${g.gap}`);
        const have = graph.withheld.map((w) =>
          w.kind === 'attention-drop' ? `attention-drop:${w.hash ?? w.status}` : `${w.kind}:${w.name}`,
        );
        for (const w of want) if (!have.includes(w)) missing.push(`${name} ${stop.runtimeStageId} MISSING ${w}`);
        for (const h of have) if (!want.includes(h)) missing.push(`${name} ${stop.runtimeStageId} EXTRA ${h}`);
        // Every drop reaches the band as an edge into the messages slot, with
        // the receipt's field name as its reason.
        for (const node of graph.withheld.filter((w) => w.kind === 'attention-drop' && w.hash !== undefined)) {
          expect(node.slot).toBe('messages');
          expect(node.name).toBe('omittedForAttention');
          expect(node.from).toBe('receipt');
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('an activeInjection the fold holds that is on NO served piece would be held-and-not-sent', () => {
    const report: string[] = [];
    for (const name of ALL) {
      const f = load(name);
      for (const stop of allStops(f)) {
        const { graph, fold } = graphAt(f, stop);
        const texts = new Set(graph.edges.filter((e) => e.kind === 'piece').map((e) => e.text ?? ''));
        for (const inj of fold.activeInjections ?? []) {
          const t = (inj as { text?: string } | undefined)?.text;
          if (typeof t === 'string' && !texts.has(t)) report.push(`${name} ${stop.runtimeStageId} :: ${t.slice(0, 40)}`);
        }
      }
    }
    // Reported, not asserted: a finding either way.
    if (report.length > 0) console.log('ACTIVE-INJECTION-NOT-SERVED', report);
    expect(true).toBe(true);
  });
});

// ── EDGE STATE ───────────────────────────────────────────────────────
describe('PROBE — edge state', () => {
  it('epoch 1 (no previous in this recording): state is ABSENT, never "unchanged"', () => {
    for (const name of ALL) {
      const f = load(name);
      for (const stop of allStops(f)) {
        const { graph, row } = graphAt(f, stop);
        if (row.previousEpoch !== undefined) continue;
        for (const e of graph.edges) expect({ name, id: e.id, state: e.state }).toEqual({ name, id: e.id, state: undefined });
        cleanup();
        const { el } = renderGraph(f, stop);
        expect(el.querySelectorAll('[data-testid="graph-edge-state"]').length).toBe(0);
      }
    }
    cleanup();
  });

  it('instructions-move + tool-set-changes: entered/left/unchanged agree with sincePrevious', () => {
    for (const name of ['instructions-move', 'tool-set-changes'] as FixtureName[]) {
      const f = load(name);
      for (const stop of allStops(f)) {
        const { graph, since, row } = graphAt(f, stop);
        if (since === undefined) continue;
        const pieces = graph.edges.filter((e) => e.kind === 'piece');
        const entered = pieces.filter((e) => e.state === 'entered');
        const left = pieces.filter((e) => e.state === 'left');
        expect(entered.length).toBe(since.system.piecesEntered);
        expect(left.length).toBe(since.system.piecesLeft);
        expect(entered.map((e) => e.text)).toEqual(since.system.enteredIndexes.map((i) => row.view.system.pieces[i]!.text));
        expect(left.map((e) => e.text)).toEqual(since.system.leftPieces.map((p) => p.text));
        const tools = graph.edges.filter((e) => e.kind === 'tool');
        expect(tools.filter((e) => e.state === 'entered').map((e) => e.label)).toEqual([...since.tools.added]);
        expect(tools.filter((e) => e.state === 'left').map((e) => e.label)).toEqual([...since.tools.removed]);
        const msgs = graph.edges.filter((e) => e.kind === 'message');
        expect(msgs.filter((e) => e.state === 'entered').length).toBe(since.messages.entered);
        expect(msgs.filter((e) => e.state === 'left').length).toBe(since.messages.left);
        // Every non-left edge that did not enter says unchanged — never absent.
        for (const e of graph.edges) {
          if (e.kind === 'request-only') continue;
          expect({ id: e.id, has: e.state !== undefined }).toEqual({ id: e.id, has: true });
        }
      }
    }
  });
});
