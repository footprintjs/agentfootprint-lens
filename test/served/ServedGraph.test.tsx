/**
 * <ServedGraph> — the three bands on screen, on the REAL fixtures.
 *
 * Mounted the way a reader reaches it: `<ServedTab>` at a stop, then the
 * list ⇄ graph toggle. The list is the default, and the cursor never moves —
 * the graph is a second VIEW of the row the tab already resolved.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RECEIPT_BOUNDARY, SERVED_GAPS, UNGAPPED_FIELDS } from 'agentfootprint';

import { ServedTab } from '../../src/react/components/ServedTab.js';
import { GRAPH_LABELS } from '../../src/react/components/ServedGraph.js';
import { BADGE_LABELS } from '../../src/react/components/ServedBadge.js';
import { load, loadTampered, stopsOf, tamperToolSchema, turnStops, type FixtureName, type LoadedFixture } from './helpers.js';

const here = dirname(fileURLToPath(import.meta.url));

const LIBRARY_SENTENCES = new Set<string>([
  RECEIPT_BOUNDARY,
  ...Object.values(SERVED_GAPS).map((g) => g.why),
  ...Object.values(UNGAPPED_FIELDS),
]);

/** Mount the tab at a stop and switch to the graph. */
function mountGraph(
  fixture: LoadedFixture,
  stop: { runtimeStageId: string; commitIdx: number },
): HTMLElement {
  render(
    <ServedTab
      runner={fixture.runner}
      cursorRuntimeStageId={stop.runtimeStageId}
      commitIdx={stop.commitIdx}
    />,
  );
  fireEvent.click(screen.getByTestId('served-view-graph'));
  return screen.getByTestId('served-graph');
}

const firstTurn = (fixture: LoadedFixture, name: FixtureName) => turnStops(fixture, name)[0]!;

/** The graph's OWN text, with the library's verbatim sentences removed. */
function ownText(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[data-testid="graph-withheld-why"]').forEach((el) => el.remove());
  return (clone.textContent ?? '').toLowerCase();
}

describe('the toggle — the list is the default and the keyboard reaches the graph', () => {
  it('list first; the graph replaces it; both are real buttons in a tablist', async () => {
    const f = load('flat-dynamic-tools');
    const stop = stopsOf(f, 'llm-turn')[0]!;
    render(
      <ServedTab runner={f.runner} cursorRuntimeStageId={stop.runtimeStageId} commitIdx={stop.commitIdx} />,
    );
    expect(screen.getByTestId('served-tab').dataset.view).toBe('list');
    expect(screen.queryByTestId('served-graph')).toBeNull();
    expect(screen.getByTestId('served-system')).toBeInTheDocument();

    const graphButton = screen.getByTestId('served-view-graph');
    expect(graphButton.tagName).toBe('BUTTON');
    expect(graphButton).toHaveAttribute('role', 'tab');
    expect(graphButton).toHaveAttribute('aria-selected', 'false');

    // Keyboard: focus reaches the button and Enter activates it.
    const user = userEvent.setup();
    graphButton.focus();
    expect(graphButton).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('served-tab').dataset.view).toBe('graph');
    expect(screen.getByTestId('served-graph')).toBeInTheDocument();
    expect(screen.queryByTestId('served-system')).toBeNull();
    expect(screen.getByTestId('served-view-graph')).toHaveAttribute('aria-selected', 'true');

    // And back — the list is one keystroke away.
    screen.getByTestId('served-view-list').focus();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('served-tab').dataset.view).toBe('list');
  });

  it('the graph holds no state at all — no useState, no useRef in its source', () => {
    const src = readFileSync(join(here, '..', '..', 'src', 'react', 'components', 'ServedGraph.tsx'), 'utf8');
    expect(src).not.toMatch(/useState|useRef|useEffect/);
  });
});

describe('LAW 1 — one cursor: the graph draws the row the cursor resolved', () => {
  it('the call node names the epoch, the call and the commit the row resolved to', () => {
    const f = load('tool-set-changes');
    const stop = stopsOf(f, 'llm-turn')[1]!;
    const graph = mountGraph(f, stop);
    const call = within(graph).getByTestId('graph-call');
    expect(call.dataset.epoch).toBe('2');
    expect(call).toHaveTextContent(stop.runtimeStageId);
    expect(call).toHaveTextContent(`${GRAPH_LABELS.commit} ${stop.commitIdx}`);
  });

  it('three bands, three slot nodes, and the library\'s own slot names', () => {
    const f = load('flat-dynamic-tools');
    const graph = mountGraph(f, stopsOf(f, 'llm-turn')[0]!);
    expect(within(graph).getByTestId('graph-band-held')).toBeInTheDocument();
    expect(within(graph).getByTestId('graph-band-served')).toBeInTheDocument();
    expect(within(graph).getByTestId('graph-band-withheld')).toBeInTheDocument();
    const slots = within(graph).getAllByTestId('graph-slot').map((el) => el.dataset.slot);
    expect(slots).toEqual(['system-prompt', 'messages', 'tools']);
    // The system piece leaves its own source node.
    expect(within(graph).getAllByTestId('graph-origin').map((el) => el.dataset.origin)).toContain('base');
  });
});

describe('LAW 2 — no sentence of the lens\'s own', () => {
  it('every explanation on the withheld band is a library constant, byte for byte', () => {
    const f = load('no-receipt');
    const graph = mountGraph(f, firstTurn(f, 'no-receipt'));
    const whys = within(graph)
      .getAllByTestId('graph-withheld-why')
      .map((el) => el.textContent ?? '');
    expect(whys.length).toBeGreaterThan(0);
    for (const why of whys) expect(LIBRARY_SENTENCES.has(why)).toBe(true);
    expect(whys).toContain(SERVED_GAPS['no-receipt-on-chart'].why);
    // The attention drops draw the badge with NO sentence: the library retired
    // its ungapped sentence for the field in 9.93.0 and the lens writes none.
    const drops = within(graph)
      .getAllByTestId('graph-withheld')
      .find((el) => el.dataset.kind === 'attention-drop')!;
    expect(within(drops).queryByTestId('graph-withheld-why')).toBeNull();
    expect(within(drops).getByTestId('served-badge')).toHaveTextContent(BADGE_LABELS.notOnRecord);
    // And the graph's own words never say a field is empty or none.
    expect(ownText(graph)).not.toMatch(/\bnone\b|\bempty\b/);
  });
});

describe('LAW 3 — a badge is never softened', () => {
  it('a tampered schema draws Damaged on its own edge, Verified on the other', () => {
    const f = loadTampered('flat-dynamic-tools', tamperToolSchema('alpha_tool'));
    const graph = mountGraph(f, stopsOf(f, 'llm-turn')[0]!);
    const edgeOf = (id: string) =>
      within(graph).getAllByTestId('graph-edge').find((el) => el.dataset.edge === id)!;
    expect(edgeOf('tool:alpha_tool').dataset.status).toBe('damaged');
    expect(within(edgeOf('tool:alpha_tool')).getByTestId('served-badge')).toHaveTextContent(
      BADGE_LABELS.damaged,
    );
    expect(edgeOf('tool:beta_tool').dataset.status).toBe('verified');
    // The call itself carries the Damaged badge, unsoftened.
    expect(within(within(graph).getByTestId('graph-call')).getByTestId('served-badge')).toHaveTextContent(
      BADGE_LABELS.damaged,
    );
  });
});

describe('LAW 4 — absent is not none', () => {
  it('a slot with nothing rebuilt draws its gap and the receipt\'s own count', () => {
    const f = load('paused-resumed-no-base');
    const graph = mountGraph(f, stopsOf(f, 'llm-turn')[0]!);
    const system = within(graph)
      .getAllByTestId('graph-slot')
      .find((el) => el.dataset.slot === 'system-prompt')!;
    expect(system.dataset.rebuilt).toBe('0');
    expect(system.dataset.receipt).toBe('1');
    expect(system.dataset.gapped).toContain('no-fold-base');
    expect(within(system).getByTestId('graph-slot-count')).toHaveTextContent(
      `${GRAPH_LABELS.rebuilt} 0 · ${GRAPH_LABELS.receipt} 1`,
    );
    expect(within(system).getByTestId('graph-slot-on-receipt-only')).toHaveTextContent('1');
    expect(ownText(graph)).not.toMatch(/\bnone\b|\bempty\b/);
  });

  it('a fold key with no committed value draws Not on record', () => {
    const f = load('flat-dynamic-tools');
    const graph = mountGraph(f, stopsOf(f, 'llm-turn')[0]!);
    const held = within(graph).getAllByTestId('graph-held');
    const skill = held.find((el) => el.dataset.key === 'currentSkillId')!;
    expect(skill.dataset.status).toBe('not-on-record');
    expect(within(skill).getByTestId('served-badge')).toHaveTextContent(BADGE_LABELS.notOnRecord);
    // A key the run DID commit shows its value, not a badge.
    const iteration = held.find((el) => el.dataset.key === 'iteration')!;
    expect(iteration).toHaveTextContent('1');
    expect(within(iteration).queryByTestId('served-badge')).toBeNull();
  });

  it('a run with no receipt: nothing Verified, the basis Not on record, the gap sentence beside it', () => {
    const f = load('no-receipt');
    const graph = mountGraph(f, firstTurn(f, 'no-receipt'));
    const badges = within(graph).getAllByTestId('served-badge');
    expect(badges.some((b) => b.dataset.status === 'verified')).toBe(false);
    expect(badges.some((b) => b.dataset.status === 'reconstructed')).toBe(true);
    const basis = within(graph).getByTestId('graph-call-basis');
    expect(within(basis).getByTestId('served-badge')).toHaveTextContent(BADGE_LABELS.notOnRecord);
    expect(within(graph).getByTestId('graph-call-cause')).toHaveTextContent('no-receipt-committed');
  });
});

describe('LAW 5 — authority omissions come from the fold', () => {
  it('a skill hidden by role is on the withheld band, marked as read from the fold', () => {
    const f = load('hidden-skills');
    const graph = mountGraph(f, stopsOf(f, 'llm-turn')[1]!);
    const hidden = within(graph)
      .getAllByTestId('graph-withheld')
      .filter((el) => el.dataset.kind === 'hidden-skill');
    expect(hidden).toHaveLength(1);
    expect(hidden[0]!.dataset.name).toBe('payroll');
    expect(hidden[0]!.dataset.from).toBe('fold');
    expect(hidden[0]!).toHaveTextContent(GRAPH_LABELS.hiddenFromModel);
  });

  it('strip the fold\'s key and they disappear — they were never on the receipt', () => {
    const stripped = loadTampered('hidden-skills', (r) => {
      for (const bundle of r.snapshot.commitLog) {
        if (bundle.overwrite !== undefined) delete bundle.overwrite.hiddenSkillIds;
      }
    });
    const graph = mountGraph(stripped, stopsOf(stripped, 'llm-turn')[1]!);
    expect(
      within(graph).getAllByTestId('graph-withheld').filter((el) => el.dataset.kind === 'hidden-skill'),
    ).toHaveLength(0);
    expect(graph.textContent).not.toContain('payroll');
    // The rest of the picture is unaffected: the receipt still verifies.
    expect(
      within(graph).getAllByTestId('served-badge').some((b) => b.dataset.status === 'verified'),
    ).toBe(true);
  });

  it('a withheld tool schema: the forced tool is named, marked, and its gap sits on the tools slot', () => {
    const f = load('tool-forced');
    const graph = mountGraph(f, firstTurn(f, 'tool-forced'));
    const tools = within(graph)
      .getAllByTestId('graph-slot')
      .find((el) => el.dataset.slot === 'tools')!;
    expect(tools).toHaveTextContent(GRAPH_LABELS.forced);
    expect(within(tools).getByTestId('graph-edge-schema-on-receipt')).toHaveTextContent(
      GRAPH_LABELS.onReceiptOnly,
    );
    expect(tools.dataset.gapped).toContain('forced-tool-schema');
    const gap = within(graph)
      .getAllByTestId('graph-withheld')
      .find((el) => el.dataset.name === 'forced-tool-schema')!;
    expect(within(gap).getByTestId('graph-withheld-why')).toHaveTextContent(
      SERVED_GAPS['forced-tool-schema'].why,
    );
  });
});

describe('edge state — what entered and what left, on the picture', () => {
  it('instructions-move: one instruction entered and one left, both drawn', () => {
    const f = load('instructions-move');
    const graph = mountGraph(f, stopsOf(f, 'llm-turn')[1]!);
    const edges = within(graph).getAllByTestId('graph-edge');
    const entered = edges.filter((el) => el.dataset.state === 'entered' && el.dataset.kind === 'piece');
    const left = edges.filter((el) => el.dataset.state === 'left' && el.dataset.kind === 'piece');
    expect(entered).toHaveLength(1);
    expect(left).toHaveLength(1);
    expect(entered[0]!).toHaveTextContent(GRAPH_LABELS.entered);
    expect(left[0]!).toHaveTextContent(GRAPH_LABELS.left);
    expect(within(entered[0]!).getByTestId('graph-edge-text')).toHaveTextContent('The order is on record.');
    expect(within(left[0]!).getByTestId('graph-edge-text')).toHaveTextContent('Look the order up');
  });

  it('tool-set-changes: charge entered, lookup left, a schema change flagged on its own edge', () => {
    const f = load('tool-set-changes');
    const graph = mountGraph(f, stopsOf(f, 'llm-turn')[1]!);
    const edges = within(graph).getAllByTestId('graph-edge');
    const labelled = (state: string) =>
      edges
        .filter((el) => el.dataset.kind === 'tool' && el.dataset.state === state)
        .map((el) => within(el).getByTestId('graph-edge-label').textContent);
    expect(labelled('entered')).toEqual(['charge']);
    expect(labelled('left')).toEqual(['lookup']);
    expect(within(graph).getAllByTestId('graph-edge-schema-changed').length).toBeGreaterThan(0);
  });

  it('the first epoch of a recording claims no state at all', () => {
    const f = load('instructions-move');
    const graph = mountGraph(f, stopsOf(f, 'llm-turn')[0]!);
    expect(within(graph).queryAllByTestId('graph-edge-state')).toHaveLength(0);
  });
});
