/**
 * EVICTED TURNS (0.52.0) — the receipt's attention drops, on screen.
 *
 * agentfootprint 9.93.0 made the agent chart's window file every turn it
 * evicts for budget on the next call's receipt (`omittedForAttention`), one
 * hash per turn, each "the turn's own `messages.entries[].hash`, so it pairs
 * with the receipt that last served it". This file drives that pairing law on
 * the REAL evicting run (`window-evicts.json`: `slidingWindow({ keepRecentTurns:
 * 1 })`, three calls) and pins where each fact draws:
 *
 *   · core — `servedRowAt(...).evictedTurns`: one row per hash, paired with
 *     the LATEST earlier epoch in this recording that served it;
 *   · graph — one withheld edge per drop into the MESSAGES slot, carrying the
 *     receipt's field name as its reason, the hash, and the epoch;
 *   · list — the OMISSIONS section: the count, then one line per drop;
 *   · the two honest absences: a 9.93+ receipt with no drops is the
 *     receipt's own claim (count 0, nothing withheld); a hash no earlier
 *     receipt here served draws Not on record, never a number.
 *
 * Measured on the fixture as generated: epoch 3's receipt drops TWO turns —
 * the assistant tool call and its result — and both were last served on
 * epoch 2 (epoch 1 served only the user message), so the pairs land on 2.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { receiptAt } from 'agentfootprint';

import {
  attentionOmissionStatus,
  carriesCacheStrategy,
  pairEvictedTurns,
  servedRowAt,
} from '../../src/core/served/index.js';
import { ServedGraph } from '../../src/react/components/ServedGraph.js';
import { ServedTab, LABELS } from '../../src/react/components/ServedTab.js';
import { graphAt, load, loadTampered, stopsOf, type LoadedFixture } from './helpers.js';

const cursorOf = (stop: { runtimeStageId: string; commitIdx: number }) => ({
  runtimeStageId: stop.runtimeStageId,
  commitIdx: stop.commitIdx,
});

function mountTab(f: LoadedFixture, stop: { runtimeStageId: string; commitIdx: number }) {
  return render(<ServedTab runner={f.runner} cursorRuntimeStageId={stop.runtimeStageId} commitIdx={stop.commitIdx} />);
}

describe('the pairing rule — a dropped hash pairs with the latest earlier epoch that served it', () => {
  it('window-evicts, epoch 3: two drops, both last served on epoch 2, and they are epoch 2\'s own entries', () => {
    const f = load('window-evicts');
    const third = stopsOf(f, 'llm-turn')[2]!;
    const row = servedRowAt(f.snapshot, cursorOf(third))!;
    expect(row.epoch).toBe(3);
    const drops = receiptAt(f.snapshot, 3)!.omittedForAttention!;
    expect(drops.count).toBe(2);
    expect(row.evictedTurns).toHaveLength(2);
    expect(row.evictedTurns!.map((t) => t.hash)).toEqual([...drops.hashes]);
    // Each hash is on epoch 2's receipt, and NOT on epoch 1's — so 2 is the
    // latest earlier epoch that served it.
    const served2 = receiptAt(f.snapshot, 2)!.messages.entries.map((e) => e.hash);
    const served1 = receiptAt(f.snapshot, 1)!.messages.entries.map((e) => e.hash);
    for (const turn of row.evictedTurns!) {
      expect(served2).toContain(turn.hash);
      expect(served1).not.toContain(turn.hash);
      expect(turn.lastServedOn).toBe(2);
    }
    // The rows are frozen, like every return in core/served.
    expect(Object.isFrozen(row.evictedTurns)).toBe(true);
    expect(Object.isFrozen(row.evictedTurns![0])).toBe(true);
  });

  it('pairEvictedTurns: the LATEST match wins, order of the earlier receipts is irrelevant, and an unknown hash stays unpaired', () => {
    const f = load('window-evicts');
    const r1 = receiptAt(f.snapshot, 1)!;
    const r2 = receiptAt(f.snapshot, 2)!;
    const r3 = receiptAt(f.snapshot, 3)!;
    const drops = r3.omittedForAttention!;
    expect(pairEvictedTurns(drops, [r1, r2])).toEqual(pairEvictedTurns(drops, [r2, r1]));
    expect(pairEvictedTurns(drops, [r2]).every((t) => t.lastServedOn === 2)).toBe(true);
    // The user turn was served on epochs 1, 2 and 3: had it been dropped, the
    // pair would be the latest earlier epoch — 2, not 1.
    const userHash = r1.messages.entries[0]!.hash;
    expect(r2.messages.entries.map((e) => e.hash)).toContain(userHash);
    expect(pairEvictedTurns({ count: 1, hashes: [userHash] }, [r1, r2])).toEqual([{ hash: userHash, lastServedOn: 2 }]);
    // A hash nothing served: no `lastServedOn` key at all — absent, not null.
    const [unpaired] = pairEvictedTurns({ count: 1, hashes: ['0000000000000000'] }, [r1, r2]);
    expect(unpaired).toEqual({ hash: '0000000000000000' });
    expect('lastServedOn' in unpaired!).toBe(false);
  });

  it('epochs 1 and 2 carry no drops on a 9.93+ receipt: the receipt\'s own claim, not "not on record"', () => {
    const f = load('window-evicts');
    for (const k of [1, 2]) {
      const receipt = receiptAt(f.snapshot, k)!;
      expect(receipt.omittedForAttention).toBeUndefined();
      expect(carriesCacheStrategy(receipt)).toBe(true);
      expect(attentionOmissionStatus(receipt)).toBe('none-on-receipt');
      const row = servedRowAt(f.snapshot, cursorOf(stopsOf(f, 'llm-turn')[k - 1]!))!;
      expect(row.evictedTurns).toBeUndefined();
    }
    expect(attentionOmissionStatus(receiptAt(f.snapshot, 3)!)).toBe('on-receipt');
    expect(attentionOmissionStatus(undefined)).toBe('not-on-record');
    // A receipt WITHOUT the 9.93.0 key: absence means nobody recorded a drop.
    const { cache, ...rest } = receiptAt(f.snapshot, 1)!;
    const { strategy: _dropped, ...olderCache } = cache;
    expect(attentionOmissionStatus({ ...rest, cache: olderCache } as never)).toBe('not-on-record');
  });
});

describe('where the drops draw — the graph', () => {
  it('iteration 3: two withheld edges into the messages slot, each with the receipt\'s field name, its hash and "epoch 2"', () => {
    const f = load('window-evicts');
    const third = stopsOf(f, 'llm-turn')[2]!;
    const { graph, row } = graphAt(f, third);
    const drops = graph.withheld.filter((w) => w.kind === 'attention-drop');
    expect(drops).toHaveLength(2);
    for (const node of drops) {
      expect(node.from).toBe('receipt');
      expect(node.slot).toBe('messages');
      expect(node.name).toBe('omittedForAttention');
      expect(node.lastServedOn).toBe(2);
      expect(node.status).toBeUndefined();
      expect(node.why).toBeUndefined();
    }
    expect(drops.map((n) => n.hash)).toEqual(row.evictedTurns!.map((t) => t.hash));

    render(<ServedGraph graph={graph} />);
    const messages = screen
      .getAllByTestId('graph-slot')
      .find((el) => el.dataset.slot === 'messages')!;
    const edges = within(messages)
      .getAllByTestId('graph-withheld-edge')
      .filter((el) => el.dataset.kind === 'attention-drop');
    expect(edges).toHaveLength(2);
    edges.forEach((edge, i) => {
      expect(edge.dataset.hash).toBe(row.evictedTurns![i]!.hash);
      expect(edge.dataset.lastServedOn).toBe('2');
      expect(within(edge).getByTestId('graph-evicted-hash')).toHaveTextContent(row.evictedTurns![i]!.hash);
      expect(within(edge).getByTestId('graph-evicted-epoch')).toHaveTextContent('epoch 2');
      expect(edge).toHaveTextContent('omittedForAttention');
    });
    // The same two on the withheld band, with the same facts.
    const cards = screen.getAllByTestId('graph-withheld').filter((el) => el.dataset.kind === 'attention-drop');
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.dataset.from).toBe('receipt');
      expect(within(card).getByTestId('graph-evicted-epoch')).toHaveTextContent('epoch 2');
      expect(within(card).queryByTestId('graph-withheld-why')).toBeNull();
    }
  });

  it('iterations 1 and 2: NOTHING withheld for attention — the receipt says none, so no node and no badge', () => {
    const f = load('window-evicts');
    for (const stop of stopsOf(f, 'llm-turn').slice(0, 2)) {
      cleanup();
      const { graph } = graphAt(f, stop);
      expect(graph.withheld.some((w) => w.kind === 'attention-drop')).toBe(false);
      render(<ServedGraph graph={graph} />);
      expect(screen.getAllByTestId('graph-withheld').some((el) => el.dataset.kind === 'attention-drop')).toBe(false);
    }
  });

  it('a drop no earlier receipt in this recording served: the edge draws Not on record, never a number', () => {
    // THE ONE EDIT: epoch 3's first dropped hash is replaced by one nothing
    // served — the shape a drop has when its turn was served on a leg this
    // recording does not hold.
    const f = loadTampered('window-evicts', (r) => {
      for (const b of r.snapshot.commitLog) {
        const receipt = b.overwrite?.receipt as
          | { basis?: { epoch?: number }; omittedForAttention?: { hashes: string[] } }
          | undefined;
        if (receipt?.basis?.epoch === 3 && receipt.omittedForAttention !== undefined) {
          receipt.omittedForAttention.hashes[0] = 'ffffffffffffffff';
        }
      }
    });
    const third = stopsOf(f, 'llm-turn')[2]!;
    const { graph, row } = graphAt(f, third);
    expect(row.evictedTurns![0]).toEqual({ hash: 'ffffffffffffffff' });
    expect(row.evictedTurns![1]!.lastServedOn).toBe(2);
    render(<ServedGraph graph={graph} />);
    const edges = screen.getAllByTestId('graph-withheld-edge').filter((el) => el.dataset.kind === 'attention-drop');
    expect(edges).toHaveLength(2);
    expect(within(edges[0]!).queryByTestId('graph-evicted-epoch')).toBeNull();
    expect(within(edges[0]!).getByTestId('served-badge').dataset.status).toBe('not-on-record');
    expect(within(edges[1]!).getByTestId('graph-evicted-epoch')).toHaveTextContent('epoch 2');
  });
});

describe('where the drops draw — the list', () => {
  it('iteration 3: count 2, then one line per drop with its hash and "epoch 2"; iteration 2: count 0 and no lines', () => {
    const f = load('window-evicts');
    const turns = stopsOf(f, 'llm-turn');
    mountTab(f, turns[2]!);
    const omissions = screen.getByTestId('served-omissions');
    expect(within(omissions).getByTestId('served-omissions-count')).toHaveTextContent('2');
    const lines = within(omissions).getAllByTestId('served-evicted-turn');
    expect(lines).toHaveLength(2);
    const row = servedRowAt(f.snapshot, cursorOf(turns[2]!))!;
    lines.forEach((line, i) => {
      expect(within(line).getByTestId('served-evicted-hash')).toHaveTextContent(row.evictedTurns![i]!.hash);
      expect(within(line).getByTestId('served-evicted-epoch')).toHaveTextContent(`${LABELS.epoch} 2`);
      expect(line).toHaveTextContent(LABELS.lastServedOn);
    });
    // No gap chip on the section: a receipt is here, and it names the field.
    expect(omissions.dataset.gapped).toBeUndefined();

    cleanup();
    mountTab(f, turns[1]!);
    const before = screen.getByTestId('served-omissions');
    expect(within(before).getByTestId('served-omissions-count')).toHaveTextContent('0');
    expect(within(before).queryByTestId('served-evicted-turn')).toBeNull();
    expect(within(before).queryByTestId('served-badge')).toBeNull();
  });
});
