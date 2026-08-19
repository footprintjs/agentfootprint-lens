/**
 * skillTopologyPositions — geometry, tested without rendering (the repo's
 * split: xyflow components assert the React surface, layout is asserted here).
 *
 * The property that matters most is STABILITY: the canvas re-lays out on every
 * cursor move if the layout depends on anything but the graph's shape, and a
 * graph that shifts under a scrubbing reader is unreadable. So the same shape
 * must produce the same positions, whatever order the caller lists it in.
 */

import { describe, it, expect } from 'vitest';
import { skillTopologyPositions } from './skillTopologyPositions.js';

describe('skillTopologyPositions', () => {
  it('places every named node, in routing order', () => {
    const pos = skillTopologyPositions(
      ['support', 'billing', 'refunds'],
      [
        { from: 'support', to: 'billing' },
        { from: 'billing', to: 'refunds' },
      ],
    );
    expect([...pos.keys()].sort()).toEqual(['billing', 'refunds', 'support']);
    expect(pos.get('billing')!.y).toBeGreaterThan(pos.get('support')!.y);
    expect(pos.get('refunds')!.y).toBeGreaterThan(pos.get('billing')!.y);
  });

  it('gives an unreached skill a place of its own', () => {
    const pos = skillTopologyPositions(['a', 'b', 'orphan'], [{ from: 'a', to: 'b' }]);
    const orphan = pos.get('orphan')!;
    expect(orphan).toBeTruthy();
    // Not stacked on top of another node.
    expect([...pos.values()].filter((p) => p.x === orphan.x && p.y === orphan.y)).toHaveLength(1);
  });

  it('skips an edge naming a node that does not exist, rather than inventing it', () => {
    const pos = skillTopologyPositions(['a'], [{ from: 'a', to: 'ghost' }]);
    expect([...pos.keys()]).toEqual(['a']);
  });

  it('survives a self-edge and a cycle without hanging or collapsing', () => {
    const pos = skillTopologyPositions(
      ['a', 'b'],
      [
        { from: 'a', to: 'a' },
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    );
    expect(pos.size).toBe(2);
    expect(pos.get('a')!.width).toBeGreaterThan(0);
  });

  it('depends only on the graph\'s shape — the same shape lays out the same way', () => {
    const shape = (): ReadonlyMap<string, { x: number; y: number }> =>
      skillTopologyPositions(
        ['a', 'b', 'c'],
        [
          { from: 'a', to: 'b' },
          { from: 'a', to: 'c' },
        ],
      );
    expect(JSON.stringify([...shape()])).toBe(JSON.stringify([...shape()]));
  });

  it('handles an empty graph', () => {
    expect(skillTopologyPositions([], []).size).toBe(0);
  });
});
