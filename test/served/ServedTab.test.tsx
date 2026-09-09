/**
 * <ServedTab> — render tests on REAL recordings (./fixtures, generated).
 *
 *   · Verified badges appear exactly where the hashes agree, and nowhere else.
 *   · The LLMCall view prints the no-receipt gap sentence VERBATIM and no field
 *     reads "none" / "empty".
 *   · The between-calls note appears at a non-llm-turn stop and not on one.
 *   · Hidden skills come from the fold; a run with none shows no such row.
 *   · Since-previous names the tool that appeared at epoch 2.
 *   · A run whose SYSTEM TEXT changed between calls (instructions-move): the
 *     swapped words are on screen in the word diff, Show diff / Hide diff
 *     moves it, and a differing middle past the cell cap prints the
 *     "diff not computed" label instead.
 *   · Moving the cursor re-renders from props alone — the component holds no
 *     position (asserted on the source: no useState/useRef with a position).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { receiptAt, servedAt, SERVED_GAPS, UNGAPPED_FIELDS } from 'agentfootprint';

import { ServedTab, LABELS } from '../../src/react/components/ServedTab.js';
import { load, loadTampered, stopsOf } from './helpers.js';

const here = dirname(fileURLToPath(import.meta.url));

function mount(fixture: ReturnType<typeof load>, stop: { runtimeStageId: string; commitIdx: number }) {
  return render(
    <ServedTab
      runner={fixture.runner}
      cursorRuntimeStageId={stop.runtimeStageId}
      commitIdx={stop.commitIdx}
    />,
  );
}

const badges = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-testid="served-badge"]'));

/** The tab's OWN text — with the library's verbatim sentences removed, since
 *  those may say "empty" (the no-fold-base sentence does, on purpose). */
function ownText(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll('[data-testid="served-gap-why"], [data-testid="served-omissions-why"]')
    .forEach((el) => el.remove());
  return (clone.textContent ?? '').toLowerCase();
}

describe('<ServedTab> — verified where hashes agree, nowhere else', () => {
  it('flat run, on the call: system, pieces and messages verified; tool rows reconstructed; params only the dials carried', () => {
    const f = load('flat-dynamic-tools');
    const stop = stopsOf(f, 'llm-turn')[0]!;
    const { container } = mount(f, stop);
    expect(screen.getByTestId('served-epoch')).toHaveTextContent(`${LABELS.epoch} 1`);
    expect(screen.queryByTestId('served-between-calls')).toBeNull();

    const verified = badges(container).filter((b) => b.dataset.status === 'verified');
    const receipt = receiptAt(f.snapshot, 1)!;
    // system (1) + pieces + messages — exactly the rows the receipt hashes.
    expect(verified).toHaveLength(1 + receipt.system.pieces.length + receipt.messages.entries.length);
    // Every verified badge carries the two hashes it was decided by.
    verified.forEach((b) => expect(b.title).toMatch(/receipt [0-9a-f]{16} · rebuilt [0-9a-f]{16}/));
    // The schema rows are 'reconstructed' — never dressed up as verified.
    const tools = screen.getByTestId('served-tools');
    Array.from(tools.querySelectorAll<HTMLElement>('[data-testid="served-badge"]')).forEach((b) =>
      expect(b.dataset.status).toBe('reconstructed'),
    );
    expect(badges(container).some((b) => b.dataset.status === 'damaged')).toBe(false);

    // Params: the receipt carried temperature (0.25) — rendered; no other dial
    // is rendered as a default.
    expect(screen.getByTestId('served-param-temperature')).toHaveTextContent('0.25');
    expect(screen.queryByTestId('served-param-maxTokens')).toBeNull();
    expect(screen.getByTestId('served-model')).toHaveTextContent('mock');
  });

  it('LLMCall: the no-receipt gap sentence verbatim, its cause, and NO field reads none', () => {
    const f = load('llmcall');
    const stop = stopsOf(f, 'iteration')[0]!;
    const { container } = mount(f, stop);
    const whys = Array.from(container.querySelectorAll('[data-testid="served-gap-why"]')).map(
      (el) => el.textContent,
    );
    expect(whys).toContain(SERVED_GAPS['no-receipt-on-chart'].why);
    expect(whys).toContain(SERVED_GAPS['cache-transform'].why);
    const gap = container.querySelector<HTMLElement>('[data-gap="no-receipt-on-chart"][data-testid="served-gap"]')!;
    expect(gap.dataset.cause).toBe('no-receipt-committed');
    expect(screen.getByTestId('served-gap-cause')).toHaveTextContent('no-receipt-committed');
    // Reconstructed everywhere; 'Not on record' for receipt-only fields.
    expect(badges(container).some((b) => b.dataset.status === 'verified')).toBe(false);
    expect(badges(container).filter((b) => b.dataset.status === 'not-on-record').length).toBeGreaterThan(0);
    // The word "none" / "empty" appears nowhere in the tab's OWN text.
    expect(ownText(container)).not.toMatch(/\bnone\b|\bempty\b/);
    // The omissions section prints the library's sentence for the absent field.
    expect(screen.getByTestId('served-omissions-why')).toHaveTextContent(
      UNGAPPED_FIELDS.omittedForAttention!,
    );
    // Basis fields covered by the gap are highlighted as gapped.
    expect(screen.getByTestId('served-basis').dataset.gapped).toContain('no-receipt-on-chart');
  });

  it('no fold base: the gap sentence verbatim, rows reconstructed (not damaged), receipt-only counts as numbers', () => {
    const f = load('paused-resumed-no-base');
    const { container } = mount(f, stopsOf(f, 'llm-turn')[0]!);
    const whys = Array.from(container.querySelectorAll('[data-testid="served-gap-why"]')).map(
      (el) => el.textContent,
    );
    expect(whys).toContain(SERVED_GAPS['no-fold-base'].why);
    expect(badges(container).some((b) => b.dataset.status === 'damaged')).toBe(false);
    expect(screen.getByTestId('served-system').dataset.gapped).toContain('no-fold-base');
    expect(container.textContent).toContain(LABELS.onReceiptOnly);
    expect(ownText(container)).not.toMatch(/\bnone\b|\bempty\b/);
  });

  it('no fold base: the header counts are BOTH labelled (rebuilt · receipt), and a hash disagreement is printed inline', () => {
    const f = load('paused-resumed-no-base');
    const { container } = mount(f, stopsOf(f, 'llm-turn')[0]!);
    const receipt = receiptAt(f.snapshot, 2)!;
    // Messages: 1 rebuilt against 3 on the receipt; tools: 0 rebuilt against 1.
    const counts = Array.from(container.querySelectorAll<HTMLElement>('[data-testid="served-count"]'));
    const messages = counts.find((c) => c.closest('[data-testid="served-messages"]') !== null)!;
    expect(messages).toHaveTextContent(`${LABELS.rebuilt} 1 · ${LABELS.receipt} ${receipt.messages.entries.length}`);
    const tools = counts.find((c) => c.closest('[data-testid="served-tools"]') !== null)!;
    expect(tools).toHaveTextContent(`${LABELS.rebuilt} 0 · ${LABELS.receipt} ${receipt.tools.names.length}`);
    // Never a bare "0" that reads as "no tools" beside a receipt naming one.
    expect(tools.textContent!.trim()).not.toBe('0');
    // The system row disagrees under the excuse: both hashes are on screen,
    // not only in the badge's tooltip.
    const inline = screen.getByTestId('served-system').querySelector('[data-testid="served-hashes"]')!;
    expect(inline).toHaveTextContent(`${LABELS.receipt} ${receipt.system.hash}`);
    // The one rebuilt message pairs with its OWN receipt row (by key) — verified.
    const message = screen.getByTestId('served-message').querySelector<HTMLElement>('[data-testid="served-badge"]')!;
    expect(message.dataset.status).toBe('verified');
    // Params: the receipt carries no dial, and nothing prints a "0" for it —
    // the provider-defaults gap beside the section is the empty state.
    const params = screen.getByTestId('served-params');
    expect(params.dataset.gapped).toContain('provider-defaults');
    expect(params.querySelector('[data-testid="served-count"]')).toBeNull();
  });

  it('a resumed leg: the SINCE PREVIOUS section never says "no previous epoch" — it prints the epoch number and Not on record', () => {
    const f = load('paused-resumed-no-base');
    const { container } = mount(f, stopsOf(f, 'llm-turn')[0]!);
    expect(screen.getByTestId('served-epoch')).toHaveTextContent(`${LABELS.epoch} 2`);
    const since = screen.getByTestId('served-since');
    expect(since.textContent).not.toMatch(/no previous/i);
    expect(since).toHaveTextContent(`${LABELS.epoch} 1`);
    const badge = since.querySelector<HTMLElement>('[data-testid="served-badge"]')!;
    expect(badge.dataset.status).toBe('not-on-record');
    expect(ownText(container)).not.toMatch(/\bnone\b|\bempty\b|\bno previous\b/);
  });

  it('a half-shaped receipt renders Damaged on every row — it never throws', () => {
    const f = loadTampered('flat-dynamic-tools', (r) => {
      r.snapshot.commitLog.find((b) => b.runtimeStageId === 'call-llm#18')!.overwrite!.receipt = {
        basis: { epoch: 1, runId: 'x' },
      };
    });
    const { container } = mount(f, stopsOf(f, 'llm-turn')[0]!);
    expect(screen.getByTestId('served-tab').dataset.served).toBeUndefined();
    expect(screen.getByTestId('served-epoch')).toHaveTextContent(`${LABELS.epoch} 1`);
    const damaged = badges(container).filter((b) => b.dataset.status === 'damaged');
    expect(damaged.length).toBeGreaterThan(0);
    expect(badges(container).some((b) => b.dataset.status === 'verified')).toBe(false);
    const gap = container.querySelector<HTMLElement>('[data-gap="no-receipt-on-chart"][data-testid="served-gap"]')!;
    expect(gap.dataset.cause).toBe('receipt-shape-rejected');
    // Receipt-only fields: Not on record — never a value invented from a half-shape.
    expect(screen.getByTestId('served-params').querySelector<HTMLElement>('[data-testid="served-badge"]')!.dataset.status).toBe('not-on-record');
  });

  it('a row the fold cannot read is printed as data in the FOLD section, with the rest of the tab intact', () => {
    const f = loadTampered('flat-dynamic-tools', (r) => {
      const b = r.snapshot.commitLog[5]!;
      r.snapshot.commitLog[5] = { runtimeStageId: b.runtimeStageId, stageId: b.stageId, stage: b.stage, idx: 5 };
    });
    const { container } = mount(f, stopsOf(f, 'llm-turn')[0]!);
    const fold = screen.getByTestId('served-fold');
    const line = fold.querySelector('[data-testid="served-fold-skipped"], [data-testid="served-fold-error"]');
    expect(line).not.toBeNull();
    expect(line!.querySelector<HTMLElement>('[data-testid="served-badge"]')!.dataset.status).toBe('damaged');
    // The receipt and the view are unaffected by a fold defect.
    expect(badges(container).some((b) => b.dataset.status === 'verified')).toBe(true);
    expect(screen.getByTestId('served-epoch')).toHaveTextContent(`${LABELS.epoch} 1`);
  });

  it('between calls: the note appears at a decision stop and names the call', () => {
    const f = load('flat-dynamic-tools');
    const route = f.positions.find((p) => p.milestone === 'decision')!;
    mount(f, route);
    const note = screen.getByTestId('served-between-calls');
    expect(note).toHaveTextContent(`${LABELS.asOfCall} 1 — ${LABELS.betweenCalls}`);
  });

  it('before the first call: no fabricated epoch', () => {
    const f = load('flat-dynamic-tools');
    mount(f, f.positions[0]!);
    expect(screen.getByTestId('served-no-call')).toBeInTheDocument();
    expect(screen.queryByTestId('served-epoch')).toBeNull();
  });

  it('forced tool marked; withheld rendered as the library states it when present', () => {
    const f = load('tool-forced');
    mount(f, stopsOf(f, 'llm-turn')[0]!);
    expect(screen.getByTestId('served-forced')).toHaveTextContent(LABELS.forced);
    const tools = screen.getByTestId('served-tools');
    expect(tools.dataset.gapped).toContain('forced-tool-schema');
    expect(screen.queryByTestId('served-withheld')).toBeNull();
  });

  it('hidden skills come from the fold, labelled "hidden from the model" — and never appear when the fold has none', () => {
    const hidden = load('hidden-skills');
    const a = mount(hidden, stopsOf(hidden, 'llm-turn')[0]!);
    expect(screen.getByTestId('served-hidden-skills')).toHaveTextContent(LABELS.hiddenFromModel);
    expect(screen.getByTestId('served-hidden-skill')).toHaveTextContent('payroll');
    // Not on the receipt — the tab read it from the fold.
    expect(JSON.stringify(receiptAt(hidden.snapshot, 1))).not.toContain('payroll');
    a.unmount();

    const plain = load('flat-dynamic-tools');
    mount(plain, stopsOf(plain, 'llm-turn')[0]!);
    expect(screen.queryByTestId('served-hidden-skills')).toBeNull();
  });

  it('since previous names the tool that appeared at epoch 2 and the one that left', () => {
    const f = load('tool-set-changes');
    mount(f, stopsOf(f, 'llm-turn')[1]!);
    expect(screen.getByTestId('served-since-tools-added')).toHaveTextContent('charge');
    expect(screen.getByTestId('served-since-tools-removed')).toHaveTextContent('lookup');
    expect(screen.getByTestId('served-since-messages')).toHaveTextContent(`${LABELS.entered} 2`);
    expect(screen.getByTestId('served-current-skill')).toHaveTextContent('refund');
  });

  it('the diff toggle exists only when the system text changed; the schema toggle expands a schema', () => {
    const f = load('flat-dynamic-tools');
    mount(f, stopsOf(f, 'llm-turn')[1]!);
    expect(screen.queryByTestId('served-toggle-diff')).toBeNull();
    const schemaButtons = screen.getAllByRole('button', { name: LABELS.schema });
    expect(schemaButtons.length).toBeGreaterThan(0);
    fireEvent.click(schemaButtons[0]!);
    expect(schemaButtons[0]!).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('served-tools').textContent).toContain('inputSchema');
  });
});

describe('<ServedTab> — a record can never take the tab down', () => {
  afterEach(() => vi.restoreAllMocks());

  it('a render throw is caught by the boundary: the Damaged badge and the message as data', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const runner = {
      getLastSnapshot: () => {
        throw new Error('snapshot exploded');
      },
    };
    render(<ServedTab runner={runner} cursorRuntimeStageId="call-llm#18" commitIdx={15} />);
    const tab = screen.getByTestId('served-tab');
    expect(tab.dataset.served).toBe('error');
    expect(screen.getByTestId('served-tab-error')).toHaveTextContent('snapshot exploded');
    expect(tab.querySelector<HTMLElement>('[data-testid="served-badge"]')!.dataset.status).toBe('damaged');
  });

  it('the boundary resets when the cursor moves', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = load('flat-dynamic-tools');
    let explode = true;
    const runner = {
      getLastSnapshot: () => {
        if (explode) throw new Error('once');
        return f.snapshot;
      },
    };
    const [first, second] = stopsOf(f, 'llm-turn');
    const { rerender } = render(
      <ServedTab runner={runner} cursorRuntimeStageId={first!.runtimeStageId} commitIdx={first!.commitIdx} />,
    );
    expect(screen.getByTestId('served-tab').dataset.served).toBe('error');
    explode = false;
    rerender(<ServedTab runner={runner} cursorRuntimeStageId={second!.runtimeStageId} commitIdx={second!.commitIdx} />);
    expect(screen.getByTestId('served-tab').dataset.epoch).toBe('2');
  });
});

describe('<ServedTab> — one cursor', () => {
  it('moving the cursor re-renders the epoch from props alone', () => {
    const f = load('flat-dynamic-tools');
    const [first, second] = stopsOf(f, 'llm-turn');
    const { rerender } = render(
      <ServedTab runner={f.runner} cursorRuntimeStageId={first!.runtimeStageId} commitIdx={first!.commitIdx} />,
    );
    expect(screen.getByTestId('served-tab').dataset.epoch).toBe('1');
    rerender(
      <ServedTab runner={f.runner} cursorRuntimeStageId={second!.runtimeStageId} commitIdx={second!.commitIdx} />,
    );
    expect(screen.getByTestId('served-tab').dataset.epoch).toBe('2');
    rerender(
      <ServedTab runner={f.runner} cursorRuntimeStageId={first!.runtimeStageId} commitIdx={first!.commitIdx} />,
    );
    expect(screen.getByTestId('served-tab').dataset.epoch).toBe('1');
  });

  it('clicking the call id asks the host to move THE cursor there', () => {
    const f = load('flat-dynamic-tools');
    const route = f.positions.find((p) => p.milestone === 'decision')!;
    const jumps: string[] = [];
    render(
      <ServedTab
        runner={f.runner}
        cursorRuntimeStageId={route.runtimeStageId}
        commitIdx={route.commitIdx}
        onJumpTo={(id) => jumps.push(id)}
      />,
    );
    fireEvent.click(screen.getByTestId('served-call-id'));
    expect(jumps).toEqual([stopsOf(f, 'llm-turn')[0]!.runtimeStageId]);
  });

  it('holds no position: no useState/useRef in the source names a step, cursor, epoch or index', () => {
    const src = readFileSync(join(here, '..', '..', 'src', 'react', 'components', 'ServedTab.tsx'), 'utf8');
    expect(src).not.toMatch(/useRef\(/);
    const states = [...src.matchAll(/const \[(\w+), (\w+)\] = useState[^;]*;/g)];
    expect(states.length).toBeGreaterThan(0);
    for (const [whole, name] of states) {
      expect(name).not.toMatch(/step|cursor|epoch|position|idx|index|commit/i);
      // Initial values are a boolean or a Set — never a number.
      expect(whole).toMatch(/useState\(false\)|useState<ReadonlySet<string>>/);
    }
  });
});

describe('<ServedTab> — the system text changed between calls (instructions-move)', () => {
  // The run: `before-lookup` is active until a tool has run, `after-lookup`
  // once `lookup` returned — so between call 1 and call 2 one instruction
  // piece leaves and another enters, and the tool set stays.
  const LEFT = 'Look the order up before you answer.';
  const ENTERED = 'The order is on record. Answer from it.';

  const diffText = (kind: 'added' | 'removed' | 'equal'): string =>
    Array.from(
      document.querySelectorAll<HTMLElement>(`[data-testid="served-word-diff"] [data-diff="${kind}"]`),
    )
      .map((el) => el.textContent ?? '')
      .join(' ');

  it('SINCE PREVIOUS reads changed · pieces entered 1 · left 1 · tools 0/0, and the swapped words are on screen in the diff', () => {
    const f = load('instructions-move');
    // What the run did, on the data the tab reads — pinned so a regenerated
    // fixture with other words fails here, by name.
    expect(servedAt(f.snapshot, 1)!.system.pieces.map((p) => [p.source, p.text])).toEqual([
      ['base', 'support bot'],
      ['instructions', LEFT],
    ]);
    expect(servedAt(f.snapshot, 2)!.system.pieces.map((p) => [p.source, p.text])).toEqual([
      ['base', 'support bot'],
      ['instructions', ENTERED],
    ]);

    const { container } = mount(f, stopsOf(f, 'llm-turn')[1]!);
    expect(screen.getByTestId('served-epoch')).toHaveTextContent(`${LABELS.epoch} 2`);
    const since = screen.getByTestId('served-since-system');
    expect(since).toHaveTextContent(LABELS.changed);
    expect(since).not.toHaveTextContent(LABELS.unchanged);
    expect(since).toHaveTextContent(`${LABELS.pieces} ${LABELS.entered} 1 · ${LABELS.left} 1`);
    expect(screen.getByTestId('served-since-tools-added')).toHaveTextContent('0');
    expect(screen.getByTestId('served-since-tools-removed')).toHaveTextContent('0');
    expect(screen.getByTestId('served-since-messages')).toHaveTextContent(`${LABELS.entered} 2 · ${LABELS.left} 0`);

    // The diff is on screen (in SINCE PREVIOUS until the toggle moves it).
    const diff = screen.getByTestId('served-word-diff');
    expect(screen.getByTestId('served-since').contains(diff)).toBe(true);
    expect(diffText('removed').split(/\s+/)).toEqual(expect.arrayContaining(['Look', 'before', 'you', 'answer.']));
    expect(diffText('added').split(/\s+/)).toEqual(expect.arrayContaining(['is', 'on', 'record.', 'Answer', 'from', 'it.']));
    // What stayed is marked as neither: the base prompt and the shared word.
    expect(diffText('equal')).toContain('support bot');
    expect(diffText('equal')).toContain('order');
    expect(diffText('removed')).not.toContain('support bot');
    expect(diffText('added')).not.toContain('support bot');
    // Rejoined, the diff IS the two texts — nothing dropped on the way to the screen.
    const segments = Array.from(diff.querySelectorAll<HTMLElement>('[data-diff]'));
    const rejoin = (drop: string) =>
      segments.filter((s) => s.dataset.diff !== drop).map((s) => s.textContent ?? '').join('');
    expect(rejoin('added')).toBe(servedAt(f.snapshot, 1)!.system.text);
    expect(rejoin('removed')).toBe(servedAt(f.snapshot, 2)!.system.text);
    // A changed prompt is not damage: both pieces at epoch 2 verify against the receipt.
    const pieces = Array.from(container.querySelectorAll<HTMLElement>('[data-testid="served-piece"] [data-testid="served-badge"]'));
    expect(pieces.map((b) => b.dataset.status)).toEqual(['verified', 'verified']);
  });

  it('Show diff moves the diff into the system section in place of the pieces; Hide diff brings the pieces back and the diff returns to SINCE PREVIOUS', () => {
    const f = load('instructions-move');
    mount(f, stopsOf(f, 'llm-turn')[1]!);
    const system = screen.getByTestId('served-system');
    const since = screen.getByTestId('served-since');
    const toggle = screen.getByTestId('served-toggle-diff');
    const piecesIn = (root: HTMLElement) => root.querySelectorAll('[data-testid="served-piece"]').length;
    const diffIn = (root: HTMLElement) => root.querySelector('[data-testid="served-word-diff"]') !== null;

    expect(toggle).toHaveTextContent(LABELS.showDiff);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(piecesIn(system)).toBe(2);
    expect(diffIn(system)).toBe(false);
    expect(diffIn(since)).toBe(true);

    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent(LABELS.hideDiff);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(piecesIn(system)).toBe(0);
    expect(diffIn(system)).toBe(true);
    expect(diffIn(since)).toBe(false);
    expect(screen.getAllByTestId('served-word-diff')).toHaveLength(1);
    expect(diffText('added')).toContain('record.');

    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent(LABELS.showDiff);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(piecesIn(system)).toBe(2);
    expect(diffIn(system)).toBe(false);
    expect(diffIn(since)).toBe(true);
    expect(screen.getAllByTestId('served-word-diff')).toHaveLength(1);
  });

  it('epoch 1 of the same run: no previous epoch in this recording, so no toggle and no diff', () => {
    const f = load('instructions-move');
    mount(f, stopsOf(f, 'llm-turn')[0]!);
    expect(screen.getByTestId('served-epoch')).toHaveTextContent(`${LABELS.epoch} 1`);
    expect(screen.queryByTestId('served-toggle-diff')).toBeNull();
    expect(screen.queryByTestId('served-word-diff')).toBeNull();
    expect(screen.queryByTestId('served-diff-not-computed')).toBeNull();
  });

  it('a differing middle past the cell cap: the "diff not computed" label, never an empty diff — and the toggle moves the label the same way', () => {
    // THE ONE EDIT: the committed instruction text at BOTH epochs becomes
    // 3 000 words differing throughout (the core test's pair, past
    // DIFF_CELL_CAP). The receipt hashed the real words, so the edited piece
    // must read Damaged — the label is about the diff, not the record.
    const words = (tag: string) => Array.from({ length: 3000 }, (_, i) => `${tag}${i}`).join(' ');
    type Piece = { source?: string; rawContent?: string };
    const f = loadTampered('instructions-move', (r) => {
      const carrying = r.snapshot.commitLog.filter((b) =>
        (b.overwrite?.systemPromptInjections as Piece[] | undefined)?.some((p) => p.source === 'instructions'),
      );
      expect(carrying).toHaveLength(2);
      [words('a'), words('b')].forEach((text, i) => {
        const piece = (carrying[i]!.overwrite!.systemPromptInjections as Piece[]).find((p) => p.source === 'instructions')!;
        piece.rawContent = text;
      });
    });
    mount(f, stopsOf(f, 'llm-turn')[1]!);
    expect(screen.getByTestId('served-since-system')).toHaveTextContent(LABELS.changed);
    const label = screen.getByTestId('served-diff-not-computed');
    expect(label).toHaveTextContent(LABELS.diffNotComputed);
    expect(screen.queryByTestId('served-word-diff')).toBeNull();
    expect(screen.getByTestId('served-since').contains(label)).toBe(true);

    const toggle = screen.getByTestId('served-toggle-diff');
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent(LABELS.hideDiff);
    expect(screen.getAllByTestId('served-diff-not-computed')).toHaveLength(1);
    expect(screen.getByTestId('served-system').contains(screen.getByTestId('served-diff-not-computed'))).toBe(true);
    expect(screen.queryByTestId('served-word-diff')).toBeNull();

    fireEvent.click(toggle);
    expect(screen.getByTestId('served-since').contains(screen.getByTestId('served-diff-not-computed'))).toBe(true);
    // The edited piece is Damaged; the untouched base piece still verifies.
    const pieces = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="served-piece"] [data-testid="served-badge"]'));
    expect(pieces.map((b) => b.dataset.status)).toEqual(['verified', 'damaged']);
  });
});
