/**
 * core/served — the four pure queries, on REAL recordings.
 *
 * Every fixture under ./fixtures was produced by driving agentfootprint 9.88.0
 * (`fixtures/generate.ts`); nothing here is hand-built, because the claim under
 * test is that the tab's data agrees with what the library rebuilt and what
 * the call itself committed.
 *
 * Test types: functional (cursor → epoch on the Why Lens's own axis, in both
 * chart shapes) · property (verified ⇔ hashes agree, checked against the
 * library's own `receiptHash`) · edge (no receipt, no fold base, forced tool,
 * a tool set that moves, a role-hidden skill) · invariant (frozen returns).
 */

import { describe, expect, it } from 'vitest';
import { messageDigestInput, receiptAt, receiptHash, SERVED_GAPS } from 'agentfootprint';

import {
  EXCUSING_GAPS,
  foldFactsAt,
  servedRowAt,
  servedRowForEpoch,
  sincePrevious,
  verify,
} from '../../src/core/served/index.js';
import { load, loadTampered, stopsOf, type TamperableRecording } from './helpers.js';

const cursorOf = (p: { runtimeStageId: string; commitIdx: number }) => ({
  runtimeStageId: p.runtimeStageId,
  commitIdx: p.commitIdx,
});

describe('servedRowAt — the one cursor resolved to its epoch', () => {
  it('flat: an llm-turn stop IS its epoch; every later stop is between calls, as of it', () => {
    const f = load('flat-dynamic-tools');
    const turns = stopsOf(f, 'llm-turn');
    expect(turns).toHaveLength(2);
    turns.forEach((stop, i) => {
      const row = servedRowAt(f.snapshot, cursorOf(stop))!;
      expect(row.epoch).toBe(i + 1);
      expect(row.betweenCalls).toBe(false);
      expect(row.callRuntimeStageId).toBe(stop.runtimeStageId);
      expect(row.commitIdx).toBe(stop.commitIdx);
    });
    // The route stop after call 1 shows call 1, between calls.
    const route = f.positions.find((p) => p.milestone === 'decision')!;
    const row = servedRowAt(f.snapshot, cursorOf(route))!;
    expect(row.epoch).toBe(1);
    expect(row.betweenCalls).toBe(true);
    // Run · start is before any call: no row, never a fabricated one.
    expect(servedRowAt(f.snapshot, cursorOf(f.positions[0]!))).toBeUndefined();
    // Run · end shows the last call, between calls.
    const end = f.positions[f.positions.length - 1]!;
    expect(servedRowAt(f.snapshot, cursorOf(end))).toMatchObject({ epoch: 2, betweenCalls: true });
  });

  it('grouped: the turn mount IS its epoch; the stops after it are between calls', () => {
    const f = load('dynamic-grouped');
    const mounts = stopsOf(f, 'iteration');
    expect(mounts).toHaveLength(2);
    mounts.forEach((stop, i) => {
      const row = servedRowAt(f.snapshot, cursorOf(stop))!;
      expect(row.epoch).toBe(i + 1);
      expect(row.betweenCalls).toBe(false);
      // The inner call's address is path-qualified by the mount's STAGE id.
      expect(row.callRuntimeStageId.startsWith('sf-llm-call/')).toBe(true);
    });
    const route = f.positions.find((p) => p.milestone === 'decision')!;
    expect(servedRowAt(f.snapshot, cursorOf(route))).toMatchObject({ epoch: 1, betweenCalls: true });
    // A stage drilled under the turn that is not the call: that turn, between
    // calls. A REAL drilled id is path-qualified by the mount's STAGE id
    // (`sf-llm-call/sf-messages#35`, a key of this recording's subflowResults),
    // never by its execution index — so the id alone cannot name the mount; the
    // lens anchors every stop inside a mount to the mount's own commit index,
    // and that anchor is what resolves it (rule 3).
    const drilledId = 'sf-llm-call/sf-messages#35';
    expect(Object.keys((f.snapshot as { subflowResults: object }).subflowResults)).toContain(drilledId);
    const drilled = servedRowAt(f.snapshot, { runtimeStageId: drilledId, commitIdx: mounts[1]!.commitIdx });
    expect(drilled).toMatchObject({ epoch: 2, betweenCalls: true });
    // Without the anchor, nothing in the id names a turn — no row is invented.
    expect(servedRowAt(f.snapshot, { runtimeStageId: drilledId, commitIdx: -1 })).toBeUndefined();
  });

  it('a resumed leg: the row is epoch 2 with no previous epoch IN THIS RECORDING — the data says which call it is', () => {
    const f = load('paused-resumed-no-base');
    const row = servedRowAt(f.snapshot, cursorOf(stopsOf(f, 'llm-turn')[0]!))!;
    // The receipt's own basis says call 2; the paused leg carried call 1.
    expect(row.epoch).toBe(2);
    expect(row.receipt!.basis.epoch).toBe(2);
    expect(row.previousEpoch).toBeUndefined();
    expect(servedRowForEpoch(f.snapshot, 1)).toBeUndefined();
  });

  it('a half-shaped receipt (basis only) is refused as the library refuses a non-receipt: cause on the row, never a throw', () => {
    // agentfootprint's `readReceipt` narrows only `basis.epoch`; a record with a
    // basis but no system / messages / tools / params / cache comes back typed
    // as a Receipt. The lens narrows the rest, and treats a failure as damage.
    for (const half of [
      { basis: { epoch: 1, runId: 'x' } },
      { basis: { epoch: 1, runId: 'x' }, system: { hash: 'h', pieces: [] } },
      { basis: { epoch: 1, runId: 'x' }, system: { hash: 'h', pieces: [] }, messages: { entries: [], requestOnly: [] }, tools: { names: [], schemaHashes: {} }, params: {}, cache: {} },
    ]) {
      const f = loadTampered('flat-dynamic-tools', (r) => {
        const bundle = r.snapshot.commitLog.find((b) => b.runtimeStageId === 'call-llm#18')!;
        bundle.overwrite!.receipt = half;
      });
      const row = servedRowAt(f.snapshot, cursorOf(stopsOf(f, 'llm-turn')[0]!))!;
      expect(row.epoch).toBe(1);
      expect(row.receipt).toBeUndefined();
      expect(row.receiptCause).toBe('receipt-shape-rejected');
      const checks = verify(row.view, row.receipt, '', row.receiptCause);
      expect(checks.system.status).toBe('damaged');
      expect(checks.damaged).toBe(true);
      expect(checks.params).toBe('not-on-record');
      // Handed the half-shape directly (a caller-built row), verify still
      // refuses rather than dereferences.
      const direct = verify(row.view, half as never, 'x');
      expect(direct.damaged).toBe(true);
      expect(direct.system.status).toBe('damaged');
      // …and sincePrevious over two such rows does not throw either.
      const second = servedRowAt(f.snapshot, cursorOf(stopsOf(f, 'llm-turn')[1]!))!;
      expect(() => sincePrevious({ ...second, receipt: half as never }, { ...row, receipt: half as never })).not.toThrow();
    }
  });

  it('the previous epoch rides on the row, and servedRowForEpoch fetches it', () => {
    const f = load('flat-dynamic-tools');
    const [first, second] = stopsOf(f, 'llm-turn');
    expect(servedRowAt(f.snapshot, cursorOf(first!))!.previousEpoch).toBeUndefined();
    const row = servedRowAt(f.snapshot, cursorOf(second!))!;
    expect(row.previousEpoch).toBe(1);
    expect(servedRowForEpoch(f.snapshot, 1)!.epoch).toBe(1);
    expect(servedRowForEpoch(f.snapshot, 99)).toBeUndefined();
  });

  it('returns frozen values', () => {
    const f = load('flat-dynamic-tools');
    const row = servedRowAt(f.snapshot, cursorOf(stopsOf(f, 'llm-turn')[0]!))!;
    expect(Object.isFrozen(row)).toBe(true);
    expect(Object.isFrozen(row.view)).toBe(true);
    const checks = verify(row.view, row.receipt, row.receipt!.basis.runId);
    expect(Object.isFrozen(checks)).toBe(true);
    expect(Object.isFrozen(checks.messages)).toBe(true);
    expect(Object.isFrozen(foldFactsAt(f.snapshot, cursorOf(f.positions[3]!)))).toBe(true);
  });
});

describe('verify — verified means the hashes agree, and nothing else', () => {
  for (const name of ['flat-dynamic-tools', 'dynamic-grouped', 'tool-set-changes', 'instructions-move'] as const) {
    it(`${name}: every hashed row agrees with the receipt, computed with the library's rule`, () => {
      const f = load(name);
      const stops = stopsOf(f, name === 'dynamic-grouped' ? 'iteration' : 'llm-turn');
      expect(stops.length).toBeGreaterThan(0);
      for (const stop of stops) {
        const row = servedRowAt(f.snapshot, cursorOf(stop))!;
        const receipt = receiptAt(f.snapshot, row.epoch)!;
        const checks = verify(row.view, receipt, receipt.basis.runId);
        // The system prompt: the badge says 'verified' exactly when the two
        // hashes are the same string, and they are the library's own.
        expect(checks.system.status).toBe('verified');
        expect(checks.system.rebuilt).toBe(receiptHash(receipt.basis.runId, row.view.system.text));
        expect(checks.system.onReceipt).toBe(receipt.system.hash);
        checks.pieces.forEach((c) => expect(c.status).toBe('verified'));
        checks.messages.forEach((c, i) => {
          expect(c.status).toBe('verified');
          expect(c.rebuilt).toBe(
            receiptHash(receipt.basis.runId, messageDigestInput(row.view.messages.asSent[i]!)),
          );
        });
        // Names carry no hash, so they are never 'verified'; the receipt's list
        // is handed back as data instead.
        expect(checks.toolNames.status).toBe('reconstructed');
        expect(checks.namesOnReceipt).toEqual(receipt.tools.names);
        // Schemas: the canonical serializer is not exported, so reconstructed.
        for (const s of row.view.tools.schemas) {
          expect(checks.toolSchemas[s.name]!.status).toBe('reconstructed');
          expect(checks.toolSchemas[s.name]!.onReceipt).toBe(receipt.tools.schemaHashes[s.name]);
        }
        expect(checks.damaged).toBe(false);
        expect(checks.basis).toBe('on-receipt');
      }
    });
  }

  it('a tampered receipt hash turns exactly that row to damaged — not softer', () => {
    const f = load('flat-dynamic-tools');
    const row = servedRowAt(f.snapshot, cursorOf(stopsOf(f, 'llm-turn')[0]!))!;
    const receipt = receiptAt(f.snapshot, row.epoch)!;
    const tampered = JSON.parse(JSON.stringify(receipt)) as typeof receipt;
    (tampered.system as { hash: string }).hash = '0000000000000000';
    const checks = verify(row.view, tampered, tampered.basis.runId);
    expect(checks.system.status).toBe('damaged');
    expect(checks.damaged).toBe(true);
    // Rows the tampering did not touch still verify.
    checks.messages.forEach((c) => expect(c.status).toBe('verified'));
  });

  it('a rebuild LONGER than its receipt is damaged, and the extra rows are counted both ways', () => {
    // No gap in the library's catalogue says a rebuild may be LONG — only that
    // it may be SHORT. A receipt is the witness of what went out, so a rebuilt
    // row it never hashed contradicts it.
    const f = load('flat-dynamic-tools');
    const row = servedRowAt(f.snapshot, cursorOf(stopsOf(f, 'llm-turn')[0]!))!;
    const receipt = row.receipt!;
    const ghosted = {
      ...row.view,
      system: {
        ...row.view.system,
        pieces: [...row.view.system.pieces, { slot: 'system-prompt', source: 'base', text: 'ghost piece' }],
      },
      messages: { ...row.view.messages, asSent: [...row.view.messages.asSent, { role: 'user', content: 'ghost' }] },
      tools: { ...row.view.tools, names: [...row.view.tools.names, 'ghost_tool'] },
    } as typeof row.view;
    const checks = verify(ghosted, receipt, receipt.basis.runId);
    expect(checks.pieces.map((c) => c.status)).toEqual(['verified', 'damaged']);
    expect(checks.messages.map((c) => c.status)).toEqual(['verified', 'damaged']);
    expect(checks.toolNames.status).toBe('damaged');
    expect(checks.rebuiltOnly).toEqual({ pieces: 1, messages: 1, requestOnly: 0, toolNames: ['ghost_tool'] });
    expect(checks.onReceiptOnly).toEqual({ pieces: 0, messages: 0, requestOnly: 0, toolNames: [] });
    expect(checks.damaged).toBe(true);
  });

  it('a TRUNCATED receipt (a hash dropped, a name dropped) is caught like a flipped one', () => {
    const f = load('tool-set-changes');
    const stops = stopsOf(f, 'llm-turn');
    const row = servedRowAt(f.snapshot, cursorOf(stops[stops.length - 1]!))!;
    const truncated = JSON.parse(JSON.stringify(row.receipt)) as NonNullable<typeof row.receipt>;
    (truncated.messages.entries as unknown[]).pop();
    (truncated.tools.names as string[]).pop();
    const checks = verify(row.view, truncated, truncated.basis.runId);
    // The last rebuilt message has no receipt row: damaged, not 'reconstructed'.
    expect(checks.messages[checks.messages.length - 1]!.status).toBe('damaged');
    expect(checks.rebuiltOnly.messages).toBe(1);
    expect(checks.rebuiltOnly.toolNames).toHaveLength(1);
    expect(checks.toolNames.status).toBe('damaged');
    expect(checks.damaged).toBe(true);
    // The untouched receipt still verifies every row.
    expect(verify(row.view, row.receipt, row.receipt!.basis.runId).damaged).toBe(false);
  });

  it('no fold base: a rebuilt row WITH a counterpart on the receipt is checked by its own key — verified, or damaged when tampered', () => {
    // A log-only rebuild recovers the TAIL of the conversation (what the log
    // itself appended). Pairing by position would check the tail against the
    // head; the receipt's own join key (`ReceiptMessage.key`, a tool result's
    // toolCallId) names the real counterpart.
    const f = load('paused-resumed-no-base');
    const row = servedRowAt(f.snapshot, cursorOf(stopsOf(f, 'llm-turn')[0]!))!;
    const receipt = row.receipt!;
    expect(row.view.messages.asSent).toHaveLength(1);
    expect(receipt.messages.entries).toHaveLength(3);
    const toolRow = row.view.messages.asSent[0]!;
    const counterpart = receipt.messages.entries.find((e) => e.key === toolRow.toolCallId)!;
    expect(counterpart).toBeDefined();
    const checks = verify(row.view, receipt, receipt.basis.runId);
    expect(checks.messages[0]!.status).toBe('verified');
    expect(checks.messages[0]!.onReceipt).toBe(counterpart.hash);
    expect(checks.messages[0]!.rebuilt).toBe(receiptHash(receipt.basis.runId, messageDigestInput(toolRow)));
    // The two head rows the rebuild could not produce: the declared short list.
    expect(checks.onReceiptOnly.messages).toBe(2);
    expect(checks.rebuiltOnly.messages).toBe(0);
    // The system row CAN be short (0 chars recovered vs 27 that went out) —
    // that stays the excuse, with both hashes on the check.
    expect(checks.system.status).toBe('reconstructed');
    expect(checks.system.onReceipt).toBe(receipt.system.hash);
    expect(checks.damaged).toBe(false);

    // Tamper the counterpart's hash: the row is damaged — the excuse never
    // hides a disagreement on a row that has its witness.
    const tampered = JSON.parse(JSON.stringify(receipt)) as typeof receipt;
    (tampered.messages.entries.find((e) => e.key === toolRow.toolCallId) as { hash: string }).hash =
      'deadbeefdeadbeef';
    const again = verify(row.view, tampered, tampered.basis.runId);
    expect(again.messages[0]!.status).toBe('damaged');
    expect(again.damaged).toBe(true);
  });

  it('no receipt (LLMCall): every row reconstructed, receipt-only fields not on record, cause on the gap', () => {
    const f = load('llmcall');
    const row = servedRowAt(f.snapshot, cursorOf(stopsOf(f, 'iteration')[0]!))!;
    expect(row.receipt).toBeUndefined();
    expect(row.receiptCause).toBe('no-receipt-committed');
    const checks = verify(row.view, undefined, '');
    expect(checks.system.status).toBe('reconstructed');
    expect(checks.messages.length).toBe(row.view.messages.asSent.length);
    checks.messages.forEach((c) => expect(c.status).toBe('reconstructed'));
    expect(checks.basis).toBe('not-on-record');
    expect(checks.params).toBe('not-on-record');
    expect(checks.cache).toBe('not-on-record');
    expect(checks.damaged).toBe(false);
    const gap = row.view.gaps.find((g) => g.gap === 'no-receipt-on-chart')!;
    expect(gap.cause).toBe('no-receipt-committed');
    expect(gap.why).toBe(SERVED_GAPS['no-receipt-on-chart'].why);
  });

  it('a value under the receipt key the library refused marks every row damaged', () => {
    const f = load('llmcall');
    const row = servedRowAt(f.snapshot, cursorOf(stopsOf(f, 'iteration')[0]!))!;
    // The shape the library reports for a refused receipt, stated on the view.
    const damagedView = {
      ...row.view,
      gaps: [
        { ...row.view.gaps.find((g) => g.gap === 'no-receipt-on-chart')!, cause: 'receipt-shape-rejected' as const },
        ...row.view.gaps.filter((g) => g.gap !== 'no-receipt-on-chart'),
      ],
    };
    const checks = verify(damagedView, undefined, '');
    expect(checks.system.status).toBe('damaged');
    expect(checks.damaged).toBe(true);
  });

  it('no fold base: a disagreement under an EXCUSING gap is reconstructed, and the receipt-only rows are counted', () => {
    const f = load('paused-resumed-no-base');
    const row = servedRowAt(f.snapshot, cursorOf(stopsOf(f, 'llm-turn')[0]!))!;
    expect(row.view.gaps.map((g) => g.gap)).toContain('no-fold-base');
    expect(EXCUSING_GAPS).toContain('no-fold-base');
    const receipt = row.receipt!;
    const checks = verify(row.view, receipt, receipt.basis.runId);
    // The rebuild is SHORT (the library's own sentence); the receipt hashed
    // what really went out. That is the declared gap, not damage.
    expect(checks.system.status).toBe('reconstructed');
    expect(checks.damaged).toBe(false);
    expect(checks.onReceiptOnly.pieces).toBe(receipt.system.pieces.length - row.view.system.pieces.length);
    expect(checks.onReceiptOnly.messages).toBe(
      receipt.messages.entries.length - row.view.messages.asSent.length,
    );
    expect(checks.onReceiptOnly.messages).toBeGreaterThan(0);
  });

  it('forced tool: named on the view, schema row absent, gap declared', () => {
    const f = load('tool-forced');
    const row = servedRowAt(f.snapshot, cursorOf(stopsOf(f, 'llm-turn')[0]!))!;
    expect(row.view.tools.forced).toBeDefined();
    expect(row.view.tools.names).toContain(row.view.tools.forced);
    expect(row.view.tools.schemas.map((s) => s.name)).not.toContain(row.view.tools.forced);
    expect(row.view.gaps.map((g) => g.gap)).toContain('forced-tool-schema');
    const checks = verify(row.view, row.receipt, row.receipt!.basis.runId);
    expect(checks.system.status).toBe('verified');
    expect(checks.onReceiptOnly.toolNames).toEqual([]);
  });
});

describe('sincePrevious — what entered and left between two epochs', () => {
  it('names the tool that appeared at epoch 2 and the one that left', () => {
    const f = load('tool-set-changes');
    const [, second] = stopsOf(f, 'llm-turn');
    const row = servedRowAt(f.snapshot, cursorOf(second!))!;
    const prev = servedRowForEpoch(f.snapshot, row.previousEpoch!)!;
    const since = sincePrevious(row, prev);
    expect(since.fromEpoch).toBe(1);
    expect(since.toEpoch).toBe(2);
    expect(since.tools.added).toEqual(['charge']);
    expect(since.tools.removed).toEqual(['lookup']);
    expect(since.tools.schemasComparable).toBe(true);
    // The conversation grew by the assistant turn and the tool result.
    expect(since.messages.entered).toBe(2);
    expect(since.messages.left).toBe(0);
    expect(Object.isFrozen(since)).toBe(true);
  });

  it('a REAL run whose system text changed (instructions-move): changed, one piece left and one entered, the diff holds the swapped words, the tool set stayed', () => {
    const f = load('instructions-move');
    const [, second] = stopsOf(f, 'llm-turn');
    const row = servedRowAt(f.snapshot, cursorOf(second!))!;
    const prev = servedRowForEpoch(f.snapshot, row.previousEpoch!)!;
    // The pieces as committed: the base at both epochs, one instruction each.
    expect(prev.view.system.pieces.map((p) => [p.source, p.text])).toEqual([
      ['base', 'support bot'],
      ['instructions', 'Look the order up before you answer.'],
    ]);
    expect(row.view.system.pieces.map((p) => [p.source, p.text])).toEqual([
      ['base', 'support bot'],
      ['instructions', 'The order is on record. Answer from it.'],
    ]);
    const since = sincePrevious(row, prev);
    expect(since.system.changed).toBe(true);
    expect(since.system.piecesEntered).toBe(1);
    expect(since.system.piecesLeft).toBe(1);
    const diff = since.system.diff!;
    const text = (kind: string) => diff.filter((s) => s.kind === kind).map((s) => s.text).join(' ');
    expect(text('equal')).toContain('support bot');
    expect(text('equal')).toContain('order');
    expect(text('removed').split(/\s+/)).toEqual(expect.arrayContaining(['Look', 'before', 'you', 'answer.']));
    expect(text('added').split(/\s+/)).toEqual(expect.arrayContaining(['is', 'on', 'record.', 'Answer', 'from', 'it.']));
    // Rejoined, the diff is exactly the two texts.
    expect(diff.filter((s) => s.kind !== 'added').map((s) => s.text).join('')).toBe(prev.view.system.text);
    expect(diff.filter((s) => s.kind !== 'removed').map((s) => s.text).join('')).toBe(row.view.system.text);
    expect(since.tools.added).toEqual([]);
    expect(since.tools.removed).toEqual([]);
    expect(since.tools.schemasComparable).toBe(true);
    expect(since.messages.entered).toBe(2);
    expect(since.messages.left).toBe(0);
    // Both receipts agree with their rebuilds: a changed prompt is not damage.
    for (const r of [prev, row]) {
      const checks = verify(r.view, r.receipt, r.receipt!.basis.runId);
      expect(checks.system.status).toBe('verified');
      expect(checks.pieces.map((c) => c.status)).toEqual(['verified', 'verified']);
    }
  });

  it('a system-text change too large for the bounded diff yields NO diff — absent, reported as data', () => {
    const f = load('flat-dynamic-tools');
    const [, second] = stopsOf(f, 'llm-turn');
    const row = servedRowAt(f.snapshot, cursorOf(second!))!;
    const prev = servedRowForEpoch(f.snapshot, 1)!;
    // Two prompts that differ THROUGHOUT: 3 000 words each, no common head or
    // tail — 6 000 × 6 000 tokens, past the lens's cell cap.
    const words = (tag: string) => Array.from({ length: 3000 }, (_, i) => `${tag}${i}`).join(' ');
    const before = { ...prev, view: { ...prev.view, system: { ...prev.view.system, text: words('a') } } };
    const now = { ...row, view: { ...row.view, system: { ...row.view.system, text: words('b') } } };
    const started = performance.now();
    const since = sincePrevious(now as typeof row, before as typeof prev);
    expect(performance.now() - started).toBeLessThan(500);
    expect(since.system.changed).toBe(true);
    expect(since.system.diff).toBeUndefined();
    // A one-word change in the same size of prompt IS computed: head and tail strip.
    const oneWord = { ...row, view: { ...row.view, system: { ...row.view.system, text: words('a').replace('a1500', 'CHANGED') } } };
    const small = sincePrevious(oneWord as typeof row, before as typeof prev);
    expect(small.system.diff).toBeDefined();
    expect(small.system.diff!.filter((s) => s.kind !== 'equal').map((s) => s.text)).toEqual(['a1500', 'CHANGED']);
  });

  it('an unchanged system prompt yields an empty diff', () => {
    const f = load('flat-dynamic-tools');
    const [, second] = stopsOf(f, 'llm-turn');
    const row = servedRowAt(f.snapshot, cursorOf(second!))!;
    const since = sincePrevious(row, servedRowForEpoch(f.snapshot, 1)!);
    expect(since.system.changed).toBe(false);
    expect(since.system.diff).toEqual([]);
    expect(since.tools.added).toEqual([]);
  });
});

describe('foldFactsAt — the agent keys at the stop, from the fold', () => {
  it('hidden skill ids come from the fold, with the base present', () => {
    const f = load('hidden-skills');
    const stop = stopsOf(f, 'llm-turn')[0]!;
    const facts = foldFactsAt(f.snapshot, cursorOf(stop));
    expect(facts.basis).toBe('initial+log');
    expect(facts.hiddenSkillIds).toEqual(['payroll']);
    expect(facts.present).toContain('hiddenSkillIds');
    // …and by the library's first law they are on NO receipt.
    const row = servedRowAt(f.snapshot, cursorOf(stop))!;
    expect(JSON.stringify(row.receipt)).not.toContain('payroll');
    expect(JSON.stringify(row.receipt)).not.toContain('hiddenSkillIds');
  });

  it('a run with no hidden skills has no key — absent, not empty', () => {
    const f = load('flat-dynamic-tools');
    const facts = foldFactsAt(f.snapshot, cursorOf(stopsOf(f, 'llm-turn')[0]!));
    expect(facts.hiddenSkillIds).toBeUndefined();
    expect(facts.present).not.toContain('hiddenSkillIds');
    expect(facts.iteration).toBe(1);
  });

  it('a stepped skill shows the cursor skill and the step pointer', () => {
    const f = load('tool-set-changes');
    const facts = foldFactsAt(f.snapshot, cursorOf(stopsOf(f, 'llm-turn')[1]!));
    expect(facts.currentSkillId).toBe('refund');
    expect(facts.stepPointer).toBeDefined();
  });

  it('a row the fold cannot read is data — skipped indices (footprintjs 9.18) or the fold error (9.17) — never a throw', () => {
    // A bundle with its `trace` gone: the library's `epochLocations` still
    // reads it (id and stage are there), the view and the receipt still
    // verify, and only the FOLD is hurt. footprintjs 9.17's `stateAt` throws
    // on it; 9.18 skips it and reports the index.
    const traceless = (idx: number) => (r: TamperableRecording) => {
      const b = r.snapshot.commitLog[idx]!;
      r.snapshot.commitLog[idx] = { runtimeStageId: b.runtimeStageId, stageId: b.stageId, stage: b.stage, idx };
    };
    const f = loadTampered('flat-dynamic-tools', traceless(5));
    const stop = stopsOf(f, 'llm-turn')[0]!;
    let facts: ReturnType<typeof foldFactsAt> | undefined;
    expect(() => {
      facts = foldFactsAt(f.snapshot, cursorOf(stop));
    }).not.toThrow();
    expect(facts!.skipped !== undefined || facts!.foldError !== undefined).toBe(true);
    if (facts!.skipped !== undefined) expect(facts!.skipped).toEqual([5]);
    else expect(facts!.basis).toBeUndefined();
    expect(Object.isFrozen(facts!)).toBe(true);
    // The receipt and the view are untouched by a fold defect.
    const row = servedRowAt(f.snapshot, cursorOf(stop))!;
    expect(verify(row.view, row.receipt, row.receipt!.basis.runId).system.status).toBe('verified');
    // A row BEYOND the cursor is never crossed, so the fold is clean there.
    const later = loadTampered('flat-dynamic-tools', traceless(39));
    const before = foldFactsAt(later.snapshot, cursorOf(stop));
    expect(before.skipped).toBeUndefined();
    expect(before.foldError).toBeUndefined();
    expect(before.basis).toBe('initial+log');
  });

  it('a recording without its base says so', () => {
    const f = load('paused-resumed-no-base');
    const facts = foldFactsAt(f.snapshot, cursorOf(stopsOf(f, 'llm-turn')[0]!));
    expect(facts.basis).toBe('log-only');
  });
});
