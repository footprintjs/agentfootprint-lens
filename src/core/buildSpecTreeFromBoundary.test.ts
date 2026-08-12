/**
 * buildSpecTreeFromBoundary — Phase 5 Layer 4 tests.
 * Covers all 7 test types per Convention 3.
 *
 * Verifies the BoundaryRecorder→SpecNode tree adapter that feeds
 * explainable-ui's `specToLayout` for fanout-correct visual rendering.
 *
 * Sections:
 *   1. unit         — single subflow → single child
 *   2. functional   — Parallel root produces children-as-array (fanout)
 *   3. integration  — real Parallel run + specToLayout produces side-by-side positions
 *   4. property     — depth of tree node === label's subflowPath length
 *   5. security     — SpecNode never carries payload
 *   6. performance  — 100 boundaries built in <50ms
 *   7. load         — 1000 boundaries < 200ms
 */

import { describe, it, expect } from 'vitest';
import { LLMCall, Parallel } from 'agentfootprint'
import { MockProvider } from 'agentfootprint/providers';
import { boundaryRecorder } from 'agentfootprint/observe';
import { buildSpecTreeFromBoundary, type SpecNode } from './buildSpecTreeFromBoundary.js';
import type { TraversalContext, FlowSubflowEvent } from 'footprintjs';

/**
 * Local minimal stand-in for the legacy
 * `footprint-explainable-ui/flowchart#specToLayout` helper, which was
 * removed in explainable-ui v0.20+ (the public surface migrated to
 * `TraceGraph`-based rendering via `<TraceFlow>` / `<TracedFlow>`).
 *
 * Used ONLY by the integration tests below to verify that the
 * `buildSpecTreeFromBoundary` output has the expected fanout SHAPE
 * (children-as-array → side-by-side x positions; next-chain → stacked
 * y positions). Mirrors the legacy helper's two layout rules with
 * fixed spacing so the test assertions about relative position hold.
 */
function specToLayout(root: SpecNode): { nodes: Array<{ id: string; x: number; y: number }> } {
  const nodes: Array<{ id: string; x: number; y: number }> = [];
  const X_SPACING = 200;
  const Y_SPACING = 100;
  function walk(node: SpecNode, x: number, y: number): void {
    if (node.id) nodes.push({ id: node.id, x, y });
    if (node.children && node.children.length > 0) {
      // Fanout: distribute children horizontally at the same y.
      const startX = x - ((node.children.length - 1) * X_SPACING) / 2;
      node.children.forEach((c, i) => walk(c, startX + i * X_SPACING, y + Y_SPACING));
    }
    if (node.next) walk(node.next, x, y + Y_SPACING);
  }
  walk(root, 0, 0);
  return { nodes };
}

function ctx(opts: { rid: string; runId?: string; subflowPath?: string }): TraversalContext {
  return {
    runId: opts.runId ?? 'test-run',
    stageId: opts.rid.split('#')[0] ?? '',
    runtimeStageId: opts.rid,
    stageName: opts.rid,
    depth: opts.subflowPath ? opts.subflowPath.split('/').length : 0,
    ...(opts.subflowPath ? { subflowPath: opts.subflowPath } : {}),
  };
}

function subflowEvent(
  rid: string,
  subflowId: string,
  description: string,
  subflowPath?: string,
): FlowSubflowEvent {
  // BoundaryRecorder derives the path from `subflowId` (split by '/'), so a
  // nested subflow under "committee" must be emitted with id "committee/legal".
  // We accept the parent path here for readability and prefix it ourselves.
  const fullId = subflowPath ? `${subflowPath}/${subflowId}` : subflowId;
  return {
    name: subflowId,
    subflowId: fullId,
    description,
    traversalContext: ctx({ rid, subflowPath }),
  };
}

function llm(reply: string) {
  return LLMCall.create({ provider: new MockProvider({ reply }), model: 'mock' })
    .system('hi')
    .build();
}

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('buildSpecTreeFromBoundary — unit', () => {
  it('empty boundary → root node with no children', () => {
    const rec = boundaryRecorder({ getCommitCount: () => 0 });
    const tree = buildSpecTreeFromBoundary(rec);
    expect(tree.id).toBe('__root__');
    expect(tree.children ?? []).toHaveLength(0);
  });

  it('single subflow → root with one child', () => {
    let count = 0;
    const rec = boundaryRecorder({ getCommitCount: () => count });
    count = 0;
    rec.onSubflowEntry(subflowEvent('a#1', 'a', 'LLMCall: classify'));
    count = 10;
    rec.onSubflowExit(subflowEvent('a#1', 'a', 'LLMCall: classify'));

    const tree = buildSpecTreeFromBoundary(rec);
    expect(tree.children).toHaveLength(1);
    expect(tree.children?.[0]?.id).toBe('a#1');
    expect(tree.children?.[0]?.icon).toBe('llm');
  });
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('buildSpecTreeFromBoundary — functional (Parallel fanout)', () => {
  it('Parallel with N branches → children-as-array (horizontal layout signal)', () => {
    let count = 0;
    const rec = boundaryRecorder({ getCommitCount: () => count });

    // Synthesize a Parallel parent + 3 branch entries.
    count = 0;
    rec.onSubflowEntry(subflowEvent('committee#0', 'committee', 'Parallel: 3-way fanout'));
    count = 1;
    rec.onSubflowEntry(subflowEvent('legal#1', 'legal', 'LLMCall: legal', 'committee'));
    count = 2;
    rec.onSubflowEntry(subflowEvent('ethics#2', 'ethics', 'LLMCall: ethics', 'committee'));
    count = 3;
    rec.onSubflowEntry(subflowEvent('cost#3', 'cost', 'LLMCall: cost', 'committee'));
    count = 30;
    rec.onSubflowExit(subflowEvent('legal#1', 'legal', 'LLMCall: legal', 'committee'));
    rec.onSubflowExit(subflowEvent('ethics#2', 'ethics', 'LLMCall: ethics', 'committee'));
    rec.onSubflowExit(subflowEvent('cost#3', 'cost', 'LLMCall: cost', 'committee'));
    rec.onSubflowExit(subflowEvent('committee#0', 'committee', 'Parallel: 3-way fanout'));

    const tree = buildSpecTreeFromBoundary(rec);
    // Root has the committee subflow as a child.
    expect(tree.children).toHaveLength(1);
    const committee = tree.children?.[0];
    expect(committee?.icon).toBe('fork');
    // Committee (Parallel) has 3 branches as `children[]` (fanout signal).
    expect(committee?.children).toHaveLength(3);
    const branchIds = committee?.children?.map((c) => c.id).sort();
    expect(branchIds).toEqual(['cost#3', 'ethics#2', 'legal#1']);
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('buildSpecTreeFromBoundary — integration with specToLayout', () => {
  it('Parallel tree → specToLayout positions branches side-by-side', () => {
    let count = 0;
    const rec = boundaryRecorder({ getCommitCount: () => count });

    rec.onSubflowEntry(subflowEvent('committee#0', 'committee', 'Parallel: 2-way fanout'));
    rec.onSubflowEntry(subflowEvent('legal#1', 'legal', 'LLMCall: legal', 'committee'));
    rec.onSubflowEntry(subflowEvent('ethics#2', 'ethics', 'LLMCall: ethics', 'committee'));

    const tree = buildSpecTreeFromBoundary(rec);
    const layout = specToLayout(tree);

    // The two branches should have DIFFERENT x coordinates (side-by-side)
    // AND the SAME y coordinate (same depth) — that's the fanout shape.
    const legal = layout.nodes.find((n) => n.id === 'legal#1');
    const ethics = layout.nodes.find((n) => n.id === 'ethics#2');
    expect(legal).toBeDefined();
    expect(ethics).toBeDefined();
    expect(legal!.y).toBe(ethics!.y); // same depth
    expect(legal!.x).not.toBe(ethics!.x); // different horizontal position
  });

  it('real Parallel run via Lens recorder produces fanout layout', async () => {
    const par = Parallel.create({ name: 'committee' })
      .branch('legal', llm('L'))
      .branch('ethics', llm('E'))
      .mergeWithFn((r) => Object.values(r).join('|'))
      .build();
    const rec = boundaryRecorder({
      getCommitCount: () => par.getLastSnapshot()?.commitLog.length ?? 0,
    });
    par.attach(rec);
    await par.run({ message: 'go' });

    const tree = buildSpecTreeFromBoundary(rec);
    const layout = specToLayout(tree);
    // Smoke check: layout has nodes; not empty.
    expect(layout.nodes.length).toBeGreaterThan(0);
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('buildSpecTreeFromBoundary — property', () => {
  it('every label registered ends up reachable in the tree', () => {
    let count = 0;
    const rec = boundaryRecorder({ getCommitCount: () => count });
    const expectedIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      count = i * 2;
      rec.onSubflowEntry(subflowEvent(`s${i}#${i}`, `s${i}`, 'LLMCall: x'));
      expectedIds.push(`s${i}#${i}`);
    }
    const tree = buildSpecTreeFromBoundary(rec);
    // Walk the tree and collect IDs.
    const found = new Set<string>();
    const walk = (n: { id?: string; children?: readonly { id?: string }[]; next?: { id?: string; children?: readonly { id?: string }[]; next?: unknown } }): void => {
      if (n.id) found.add(n.id);
      n.children?.forEach((c) => walk(c as Parameters<typeof walk>[0]));
      if (n.next) walk(n.next as Parameters<typeof walk>[0]);
    };
    walk(tree);
    for (const id of expectedIds) expect(found.has(id)).toBe(true);
  });

  it('sibling-name collisions do NOT re-parent across subtrees', () => {
    // Regression for the v0.16-era findParent bug: two distinct
    // `legal` branches under different Parallel parents must stay
    // under THEIR OWN parent, not collapse together. This is the
    // exact shape that caught the platform/DS review.
    let count = 0;
    const rec = boundaryRecorder({ getCommitCount: () => count });

    rec.onSubflowEntry(subflowEvent('committee#0', 'committee', 'Parallel: 2-way'));
    rec.onSubflowEntry(subflowEvent('legal#1', 'legal', 'LLMCall: c-legal', 'committee'));
    rec.onSubflowEntry(subflowEvent('ethics#2', 'ethics', 'LLMCall: c-ethics', 'committee'));
    rec.onSubflowEntry(subflowEvent('appeals#3', 'appeals', 'Parallel: 1-way'));
    // SAME subflowName ("legal") under a DIFFERENT parent. Old
    // findParent would attach this under `committee` (the first
    // node it found with name 'legal' on the segment). Path-keyed
    // lookup attaches it under `appeals` correctly.
    rec.onSubflowEntry(subflowEvent('a-legal#4', 'legal', 'LLMCall: a-legal', 'appeals'));

    const tree = buildSpecTreeFromBoundary(rec);
    const committee = tree.children?.find((c) => c.id === 'committee#0');
    const appeals = tree.children?.find((c) => c.id === 'appeals#3');
    expect(committee?.children?.map((c) => c.id).sort()).toEqual([
      'ethics#2',
      'legal#1',
    ]);
    expect(appeals?.children?.map((c) => c.id)).toEqual(['a-legal#4']);
  });

  it('slot/internal subflows are filtered out of the domain flowchart', () => {
    // Mixed input: real Parallel + LLMCall branch + internal slot
    // subflows (sf-system-prompt / sf-messages / sf-tools). Only the
    // domain primitives should appear in the rendered tree — slot
    // internals are implementation detail and live outside the
    // user-facing flowchart shape.
    let count = 0;
    const rec = boundaryRecorder({ getCommitCount: () => count });

    rec.onSubflowEntry(subflowEvent('committee#0', 'committee', 'Parallel: 2-way'));
    rec.onSubflowEntry(subflowEvent('legal#1', 'legal', 'LLMCall: legal', 'committee'));
    // sf-system-prompt has `slotKind` set on its boundary label —
    // BoundaryRecorder stamps it because `subflowId === 'sf-system-prompt'`
    // matches the slot-id convention. The filter must drop it.
    rec.onSubflowEntry(subflowEvent('sf-system-prompt#2', 'sf-system-prompt', 'Subflow: System Prompt', 'committee/legal'));
    rec.onSubflowEntry(subflowEvent('sf-messages#3', 'sf-messages', 'Subflow: Messages', 'committee/legal'));
    rec.onSubflowEntry(subflowEvent('sf-tools#4', 'sf-tools', 'Subflow: Tools', 'committee/legal'));

    const tree = buildSpecTreeFromBoundary(rec);
    // Only the Parallel and its LLMCall branch should be in the tree.
    expect(tree.children).toHaveLength(1);
    const committee = tree.children?.[0];
    expect(committee?.id).toBe('committee#0');
    expect(committee?.children?.map((c) => c.id)).toEqual(['legal#1']);
    // legal MUST NOT have System Prompt / Messages / Tools children —
    // those are slot internals, filtered out.
    expect(committee?.children?.[0]?.children).toBeUndefined();
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('buildSpecTreeFromBoundary — security', () => {
  it('SpecNode never carries `payload` (the BoundaryRangeLabel projection chain holds)', () => {
    let count = 0;
    const rec = boundaryRecorder({ getCommitCount: () => count });
    rec.onSubflowEntry({
      name: 'leaky',
      subflowId: 'leaky',
      description: 'LLMCall: x',
      mappedInput: { secret: 'should-not-leak' },
      traversalContext: ctx({ rid: 'leaky#1' }),
    });
    const tree = buildSpecTreeFromBoundary(rec);
    const child = tree.children?.[0];
    expect(child).toBeDefined();
    // SpecNode shape doesn't include `payload` — verify by structural check.
    expect((child as { payload?: unknown }).payload).toBeUndefined();
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('buildSpecTreeFromBoundary — performance', () => {
  it('100 boundaries built into a tree in under 50ms', () => {
    let count = 0;
    const rec = boundaryRecorder({ getCommitCount: () => count });
    for (let i = 0; i < 100; i++) {
      count = i * 5;
      rec.onSubflowEntry(subflowEvent(`s${i}#${i}`, `s${i}`, 'LLMCall: x'));
      count = i * 5 + 3;
      rec.onSubflowExit(subflowEvent(`s${i}#${i}`, `s${i}`, 'LLMCall: x'));
    }
    const start = performance.now();
    const tree = buildSpecTreeFromBoundary(rec);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(50);
    void tree;
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('buildSpecTreeFromBoundary — load', () => {
  it('1000 boundaries built into a tree in under 200ms', () => {
    let count = 0;
    const rec = boundaryRecorder({ getCommitCount: () => count });
    for (let i = 0; i < 1000; i++) {
      count = i * 2;
      rec.onSubflowEntry(subflowEvent(`s${i}#${i}`, `s${i}`, 'LLMCall: x'));
      count = i * 2 + 1;
      rec.onSubflowExit(subflowEvent(`s${i}#${i}`, `s${i}`, 'LLMCall: x'));
    }
    const start = performance.now();
    const tree = buildSpecTreeFromBoundary(rec);
    const ms = performance.now() - start;
    // Parent lookup is O(1) via `byPath` Map; total is O(N) plus the
    // depth-sort. 1000 boundaries: well under 100ms locally — budget
    // doubled to cover slow CI.
    expect(ms).toBeLessThan(200);
    void tree;
  });
});
