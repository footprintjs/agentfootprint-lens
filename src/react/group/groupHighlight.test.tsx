/**
 * Group mode on the chart — 7-pattern test matrix.
 *
 * The design correction this pins: on the GROUPED ruler the active position was
 * styled by NODE TYPE (the LLM call carries `emphasis: 'hero'` and the overlay's
 * one active node pulses), so a group of six nodes read as "look at the LLM"
 * instead of "you are standing in this group". Three things had to become true,
 * and each has a case below:
 *
 *   1. every member lights the SAME — one class, one accent, whatever kind of
 *      node it is; every non-member recedes by the same amount;
 *   2. a boundary is DRAWN around the members;
 *   3. that boundary carries the group's NAME — the one `groupDisplayName`
 *      spelling the WHAT HAPPENED rail uses.
 *
 * And the fourth, load-bearing one: STEP mode is untouched. `granularity`
 * defaults to `'step'`, and on that path not one of these classes or elements
 * exists — pinned so a future change to group mode cannot leak into the Flow
 * Lens.
 */

import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { NodeProps, NodeTypes } from '@xyflow/react';
import type { TraceGraph, TraceFlowLayout } from 'footprint-explainable-ui/flowchart';
import { LensFlow } from '../LensFlow.js';
import { LENS_STYLESHEET } from '../lensStyles.js';
import {
  GROUP_MEMBER_CLASS,
  GROUP_NODE_CLASS,
  GROUP_OUTSIDER_CLASS,
} from './groupEmphasis.js';
import type { ChartGroupHighlight } from '../../core/group/activeChartGroup.js';

/** Identity layout — keeps the authored positions, so the boundary's geometry
 *  is exactly what this test declared (layout itself is eui's to test). */
const passthrough: TraceFlowLayout = (g) => g;

/** Three stage nodes: an LLM call carrying the hero emphasis that used to
 *  dominate, a tool, and one outside the group. */
const graph = {
  nodes: [
    { id: 'gather', type: 'probe', position: { x: 0, y: 0 }, data: { label: 'Gather', icon: 'tool', done: true } },
    { id: 'call-llm', type: 'probe', position: { x: 220, y: 0 }, data: { label: 'Call LLM', icon: 'llm', emphasis: 'hero', active: true } },
    { id: 'after', type: 'probe', position: { x: 440, y: 0 }, data: { label: 'After', icon: 'tool', emphasis: 'muted' } },
  ],
  edges: [],
} as unknown as TraceGraph;

/** A node renderer that records the `data` it was handed — the only way to see
 *  whether the emphasis reached the card or was neutralised on the way in. */
function probeNodeTypes(seen: Map<string, Record<string, unknown>>): NodeTypes {
  const Probe = (props: NodeProps): React.ReactElement => {
    seen.set(props.id, props.data as Record<string, unknown>);
    return <div data-testid={`node-${props.id}`}>{String((props.data as { label?: string }).label)}</div>;
  };
  return { probe: Probe };
}

const committee: ChartGroupHighlight = {
  runtimeGroupId: 'sf-committee#0',
  name: 'Committee',
  memberNodeIds: new Set(['gather', 'call-llm']),
  opensAtCommitIdx: 2,
  closesAtCommitIdx: 5,
  depth: 1,
};

function renderChart(props: Partial<React.ComponentProps<typeof LensFlow>> = {}, seen = new Map()) {
  return render(
    <LensFlow
      chart={{ graph, layout: passthrough, nodeTypes: probeNodeTypes(seen) }}
      showControls={false}
      showBackground={false}
      {...props}
    />,
  );
}

// ── 1. Unit ───────────────────────────────────────────────────────

describe('group mode — unit', () => {
  it('marks every member node with the member class and every other with the outsider class', () => {
    const { container } = renderChart({ granularity: 'group', activeGroup: committee });
    const members = [...container.querySelectorAll(`.${GROUP_MEMBER_CLASS}`)];
    const outsiders = [...container.querySelectorAll(`.${GROUP_OUTSIDER_CLASS}`)];
    expect(members).toHaveLength(2);
    expect(outsiders).toHaveLength(1);
    expect(members.map((el) => el.getAttribute('data-lens-group'))).toEqual(['member', 'member']);
    expect(outsiders.map((el) => el.getAttribute('data-lens-group'))).toEqual(['outsider']);
  });

  it('draws the boundary and names it', () => {
    const { getByTestId } = renderChart({ granularity: 'group', activeGroup: committee });
    expect(getByTestId('lens-group-boundary')).toBeTruthy();
    expect(getByTestId('lens-group-boundary-name').textContent).toBe('Committee');
  });
});

// ── 2. Functional ─────────────────────────────────────────────────

describe('group mode — functional', () => {
  it('members share ONE class string — no node type gets a louder variant', () => {
    // The uniformity claim, stated as code: two nodes of different kinds (a tool
    // and a hero LLM call) carry byte-identical emphasis classes.
    const { container } = renderChart({ granularity: 'group', activeGroup: committee });
    const classes = [...container.querySelectorAll(`.${GROUP_NODE_CLASS}`)]
      .filter((el) => el.getAttribute('data-lens-group') === 'member')
      .map((el) => el.className);
    expect(new Set(classes).size).toBe(1);
    expect(classes[0]).toBe(`${GROUP_NODE_CLASS} ${GROUP_MEMBER_CLASS}`);
  });

  it('strips the type emphasis and the visited tint — but the CURSOR rides through', () => {
    // Two eras pinned at once. FAILS ON THE FIRST behaviour: `emphasis: 'hero'`
    // reached the card, so the LLM box dominated the group it was only one
    // member of. FAILS ON THE SECOND: `active` was force-cleared, so the chart
    // had no "you are here" inside the boundary at all — the group is the
    // PLACE, but the cursor still stands on ONE step in it and must show.
    const seen = new Map<string, Record<string, unknown>>();
    renderChart({ granularity: 'group', activeGroup: committee }, seen);
    expect(seen.get('call-llm')?.emphasis).toBeUndefined();
    expect(seen.get('call-llm')?.active).toBe(true); // the current node lights within the group
    expect(seen.get('after')?.emphasis).toBeUndefined();
    // Per-member visited state is levelled: the uniform accent says "members",
    // the ⛓ step lens is where done/visited belongs.
    expect(seen.get('gather')?.done).toBe(false);
    expect(seen.get('gather')?.active).toBeFalsy(); // only the cursor's node lights
    // What the node IS survives: the icon is untouched on both sides.
    expect(seen.get('call-llm')?.icon).toBe('llm');
    expect(seen.get('gather')?.icon).toBe('tool');
  });

  it('the boundary encloses the members, not the whole chart', () => {
    const { getByTestId } = renderChart({ granularity: 'group', activeGroup: committee });
    const style = getByTestId('lens-group-boundary').getAttribute('style') ?? '';
    // Members sit at x=0 and x=220; the outsider at x=440 is outside the box.
    const width = Number(/width:\s*(\d+(?:\.\d+)?)px/.exec(style)?.[1] ?? '0');
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThan(440);
  });
});

// ── 3. Integration — STEP MODE IS UNTOUCHED (pinned) ──────────────

describe('step mode — pinned unchanged', () => {
  it('renders no group class, no boundary and no name by default', () => {
    const { container, queryByTestId } = renderChart();
    expect(container.querySelectorAll(`.${GROUP_NODE_CLASS}`)).toHaveLength(0);
    expect(queryByTestId('lens-group-boundary')).toBeNull();
    expect(queryByTestId('lens-group-boundary-name')).toBeNull();
  });

  it('leaves the node data exactly as the chart authored it', () => {
    const seen = new Map<string, Record<string, unknown>>();
    renderChart({}, seen);
    expect(seen.get('call-llm')?.emphasis).toBe('hero');
    expect(seen.get('after')?.emphasis).toBe('muted');
  });

  it('an explicit granularity="step" is the same render as the default', () => {
    const { container: a } = renderChart();
    const { container: b } = renderChart({ granularity: 'step' });
    expect(b.querySelectorAll('.react-flow__node').length).toBe(
      a.querySelectorAll('.react-flow__node').length,
    );
    expect(b.querySelectorAll(`.${GROUP_NODE_CLASS}`)).toHaveLength(0);
  });

  it('granularity="group" with nothing active renders as step — a mode with nothing to draw draws nothing', () => {
    const { container, queryByTestId } = renderChart({ granularity: 'group' });
    expect(container.querySelectorAll(`.${GROUP_NODE_CLASS}`)).toHaveLength(0);
    expect(queryByTestId('lens-group-boundary')).toBeNull();
  });
});

// ── 4. Property ───────────────────────────────────────────────────

describe('group mode — property', () => {
  it('every rendered node is exactly one of member / outsider', () => {
    for (const members of [['gather'], ['gather', 'call-llm'], ['gather', 'call-llm', 'after']]) {
      const { container, unmount } = renderChart({
        granularity: 'group',
        activeGroup: { ...committee, memberNodeIds: new Set(members) },
      });
      const all = [...container.querySelectorAll(`.${GROUP_NODE_CLASS}`)];
      expect(all).toHaveLength(3);
      expect(all.filter((el) => el.getAttribute('data-lens-group') === 'member')).toHaveLength(
        members.length,
      );
      unmount();
    }
  });

  it('scrubbing group to group moves the highlight without remounting a node', () => {
    // xyflow keys node components by `nodeTypes` identity — a map rebuilt per
    // cursor move would remount the whole chart on every scrub.
    let mounts = 0;
    const Counting = (props: NodeProps): React.ReactElement => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      React.useEffect(() => {
        mounts += 1;
      }, []);
      return <div data-testid={`node-${props.id}`} />;
    };
    const chart = { graph, layout: passthrough, nodeTypes: { probe: Counting } as NodeTypes };
    const { rerender, getByTestId } = render(
      <LensFlow chart={chart} granularity="group" activeGroup={committee} showControls={false} showBackground={false} />,
    );
    const afterFirst = mounts;
    rerender(
      <LensFlow
        chart={chart}
        granularity="group"
        activeGroup={{ ...committee, name: 'Ethics', memberNodeIds: new Set(['after']) }}
        showControls={false}
        showBackground={false}
      />,
    );
    expect(mounts).toBe(afterFirst);
    expect(getByTestId('lens-group-boundary-name').textContent).toBe('Ethics');
  });
});

// ── 5. Security / robustness ──────────────────────────────────────

describe('group mode — robustness', () => {
  it('a member that is not on the chart at this drill level is skipped, not invented', () => {
    const { container, getByTestId } = renderChart({
      granularity: 'group',
      activeGroup: { ...committee, memberNodeIds: new Set(['gather', 'sf-elsewhere/inner']) },
    });
    expect(container.querySelectorAll(`.${GROUP_MEMBER_CLASS}`)).toHaveLength(1);
    expect(getByTestId('lens-group-boundary')).toBeTruthy();
  });

  it('renders no boundary at all when NO member is on the chart', () => {
    const { queryByTestId } = renderChart({
      granularity: 'group',
      activeGroup: { ...committee, memberNodeIds: new Set(['nowhere']) },
    });
    expect(queryByTestId('lens-group-boundary')).toBeNull();
  });

  it('the name is rendered as text, never as markup', () => {
    const { getByTestId } = renderChart({
      granularity: 'group',
      activeGroup: { ...committee, name: '<img src=x onerror=alert(1)>' },
    });
    const chip = getByTestId('lens-group-boundary-name');
    expect(chip.querySelector('img')).toBeNull();
    expect(chip.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('the boundary never eats a click meant for a node', () => {
    expect(LENS_STYLESHEET).toMatch(/\.lens-group-boundary\s*\{[^}]*pointer-events:\s*none/);
  });
});

// ── 6. Performance ────────────────────────────────────────────────

describe('group mode — performance', () => {
  it('lights a 40-node group in under 500ms', () => {
    const big = {
      nodes: Array.from({ length: 40 }, (_, i) => ({
        id: `n${i}`,
        type: 'probe',
        position: { x: (i % 8) * 180, y: Math.floor(i / 8) * 90 },
        data: { label: `N${i}` },
      })),
      edges: [],
    } as unknown as TraceGraph;
    const group: ChartGroupHighlight = {
      ...committee,
      memberNodeIds: new Set(Array.from({ length: 20 }, (_, i) => `n${i}`)),
    };
    const t0 = performance.now();
    render(
      <LensFlow
        chart={{ graph: big, layout: passthrough, nodeTypes: probeNodeTypes(new Map()) }}
        granularity="group"
        activeGroup={group}
        showControls={false}
        showBackground={false}
      />,
    );
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

// ── 7. ROI ────────────────────────────────────────────────────────

describe('group mode — ROI', () => {
  it('the whole feature is two props on the component an embedder already renders', () => {
    const { getByTestId, container } = renderChart({ granularity: 'group', activeGroup: committee });
    expect(getByTestId('lens-group-boundary-name').textContent).toBe('Committee');
    expect(container.querySelectorAll(`.${GROUP_MEMBER_CLASS}`).length).toBeGreaterThan(0);
  });

  it('one accent token themes the whole highlight, in both themes', () => {
    // Members, boundary and chip all resolve the SAME variable chain, so a
    // consumer retunes "the place I am standing in" with one declaration — and
    // the chain ends in a literal, so it paints with no consumer tokens at all.
    const groupRules = LENS_STYLESHEET.split('\n').filter((line) => line.includes('lens-group-accent'));
    expect(groupRules.length).toBeGreaterThanOrEqual(4);
    for (const rule of groupRules) expect(rule).toMatch(/var\(--lens-group-accent, var\(--fp-group-accent, #[0-9a-f]{6}\)\)/);
  });
});
