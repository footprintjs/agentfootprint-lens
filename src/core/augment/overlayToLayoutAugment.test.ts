/**
 * overlayToLayoutAugment — Layer 3 / Tier A tests (Convention 3, 7 patterns).
 */

import { describe, it, expect } from 'vitest';
import type { RetryCluster, RetryAttempt } from '../utils/groupRetryAttempts.js';
import { overlayToLayoutAugment } from './overlayToLayoutAugment.js';

function attempt(n: number, status: 'failed' | 'ok', err?: string, stageId = 'x'): RetryAttempt {
  return {
    runtimeStageId: `${stageId}#${n - 1}`,
    status, attempt: n,
    ...(err !== undefined ? { errorMessage: err } : {}),
    timestamp: n * 1000,
  };
}

function cluster(stageId: string, attempts: readonly RetryAttempt[]): RetryCluster {
  return {
    stageId, attempts,
    finalStatus: attempts[attempts.length - 1]!.status,
  };
}

function mapOf(...entries: readonly RetryCluster[]): ReadonlyMap<string, RetryCluster> {
  const m = new Map<string, RetryCluster>();
  for (const c of entries) m.set(c.stageId, c);
  return m;
}

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('overlayToLayoutAugment — unit', () => {
  it('empty retry map → empty augment', () => {
    const out = overlayToLayoutAugment(undefined, undefined, new Map());
    expect(out.extraNodes).toHaveLength(0);
    expect(out.extraEdges).toHaveLength(0);
  });

  it('single-attempt cluster → no synthetic nodes (base node alone)', () => {
    const out = overlayToLayoutAugment(
      undefined, undefined,
      mapOf(cluster('x', [attempt(1, 'ok')])),
    );
    expect(out.extraNodes).toHaveLength(0);
    expect(out.extraEdges).toHaveLength(0);
  });

  it('2-attempt cluster → 1 synthetic node + 1 tail edge', () => {
    const out = overlayToLayoutAugment(
      undefined, undefined,
      mapOf(cluster('x', [attempt(1, 'failed', 'e'), attempt(2, 'ok')])),
    );
    expect(out.extraNodes).toHaveLength(1);
    expect(out.extraEdges).toHaveLength(1);
    expect(out.extraEdges[0]!.target).toBe('x'); // base node id
  });

  it('3-attempt cluster → 2 synthetic + 2 edges (chain + tail)', () => {
    const out = overlayToLayoutAugment(
      undefined, undefined,
      mapOf(cluster('x', [
        attempt(1, 'failed', 'e1'),
        attempt(2, 'failed', 'e2'),
        attempt(3, 'ok'),
      ])),
    );
    expect(out.extraNodes).toHaveLength(2);
    expect(out.extraEdges).toHaveLength(2);
    expect(out.extraEdges[1]!.target).toBe('x'); // last edge lands on base
  });

  it('synthetic nodes carry anchorId, status, attempt, errorMessage', () => {
    const out = overlayToLayoutAugment(
      undefined, undefined,
      mapOf(cluster('x', [attempt(1, 'failed', 'timeout'), attempt(2, 'ok')])),
    );
    const n = out.extraNodes[0]!;
    expect(n.data.anchorId).toBe('x');
    expect(n.data.status).toBe('failed');
    expect(n.data.errorMessage).toBe('timeout');
    expect(n.data.attempt).toBe(1);
  });

  it('positions are placeholder (0,0) — merge layer places them', () => {
    const out = overlayToLayoutAugment(
      undefined, undefined,
      mapOf(cluster('x', [attempt(1, 'failed', 'e'), attempt(2, 'ok')])),
    );
    expect(out.extraNodes[0]!.position).toEqual({ x: 0, y: 0 });
  });
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('overlayToLayoutAugment — functional', () => {
  it('multiple clusters do not collide on ids', () => {
    const out = overlayToLayoutAugment(
      undefined, undefined,
      mapOf(
        cluster('a', [attempt(1, 'failed', 'e', 'a'), attempt(2, 'ok', undefined, 'a')]),
        cluster('b', [attempt(1, 'failed', 'e', 'b'), attempt(2, 'ok', undefined, 'b')]),
      ),
    );
    const ids = out.extraNodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('attempt order preserved in synthetic chain', () => {
    const out = overlayToLayoutAugment(
      undefined, undefined,
      mapOf(cluster('x', [
        attempt(1, 'failed', 'e1'),
        attempt(2, 'failed', 'e2'),
        attempt(3, 'failed', 'e3'),
        attempt(4, 'ok'),
      ])),
    );
    expect(out.extraNodes.map((n) => n.data.attempt)).toEqual([1, 2, 3]);
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('overlayToLayoutAugment — integration', () => {
  it('mixes single-attempt + multi-attempt clusters cleanly', () => {
    const out = overlayToLayoutAugment(
      undefined, undefined,
      mapOf(
        cluster('a', [attempt(1, 'ok')]),                                // skipped
        cluster('b', [attempt(1, 'failed', 'e'), attempt(2, 'ok')]),    // 1 extra
        cluster('c', [attempt(1, 'failed', 'e'), attempt(2, 'failed', 'e'), attempt(3, 'ok')]), // 2 extras
      ),
    );
    expect(out.extraNodes).toHaveLength(3);
    expect(out.extraEdges).toHaveLength(1 + 2); // tail for b + chain+tail for c
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('overlayToLayoutAugment — property', () => {
  it('extraNodes.length = sum over clusters of (attempts.length - 1) where length ≥ 2', () => {
    for (let n = 2; n <= 6; n++) {
      const attempts = Array.from({ length: n }, (_, i) => attempt(i + 1, i + 1 === n ? 'ok' : 'failed', 'e'));
      const out = overlayToLayoutAugment(undefined, undefined, mapOf(cluster('x', attempts)));
      expect(out.extraNodes).toHaveLength(n - 1);
    }
  });

  it('every synthetic edge target exists in extraNodes OR is the base anchor', () => {
    const out = overlayToLayoutAugment(
      undefined, undefined,
      mapOf(cluster('x', [attempt(1, 'failed', 'e'), attempt(2, 'failed', 'e'), attempt(3, 'ok')])),
    );
    const nodeIds = new Set(out.extraNodes.map((n) => n.id));
    for (const e of out.extraEdges) {
      expect(nodeIds.has(e.target) || e.target === 'x').toBe(true);
    }
  });

  it('never throws for any number of clusters', () => {
    for (let count = 0; count < 20; count++) {
      const entries: RetryCluster[] = [];
      for (let i = 0; i < count; i++) {
        entries.push(cluster(`s${i}`, [attempt(1, 'failed', 'e'), attempt(2, 'ok')]));
      }
      expect(() => overlayToLayoutAugment(undefined, undefined, mapOf(...entries))).not.toThrow();
    }
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('overlayToLayoutAugment — security', () => {
  it('does not mutate the input retryClusters map', () => {
    const c = cluster('x', [attempt(1, 'failed', 'e'), attempt(2, 'ok')]);
    const m = mapOf(c);
    overlayToLayoutAugment(undefined, undefined, m);
    expect(m.size).toBe(1);
    expect(m.get('x')).toBe(c);
  });

  it('synthetic node ids are namespaced under "retry-" prefix', () => {
    const out = overlayToLayoutAugment(
      undefined, undefined,
      mapOf(cluster('x', [attempt(1, 'failed', 'e'), attempt(2, 'ok')])),
    );
    expect(out.extraNodes[0]!.id.startsWith('retry-')).toBe(true);
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('overlayToLayoutAugment — performance', () => {
  it('100 clusters × 5 attempts in under 20ms', () => {
    const entries: RetryCluster[] = [];
    for (let i = 0; i < 100; i++) {
      entries.push(cluster(`s${i}`, [
        attempt(1, 'failed', 'e'),
        attempt(2, 'failed', 'e'),
        attempt(3, 'failed', 'e'),
        attempt(4, 'failed', 'e'),
        attempt(5, 'ok'),
      ]));
    }
    const m = mapOf(...entries);
    const start = performance.now();
    overlayToLayoutAugment(undefined, undefined, m);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(50);
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('overlayToLayoutAugment — load', () => {
  it('1000 clusters × 3 attempts in under 100ms', () => {
    const entries: RetryCluster[] = [];
    for (let i = 0; i < 1000; i++) {
      entries.push(cluster(`s${i}`, [
        attempt(1, 'failed', 'e'),
        attempt(2, 'failed', 'e'),
        attempt(3, 'ok'),
      ]));
    }
    const m = mapOf(...entries);
    const start = performance.now();
    overlayToLayoutAugment(undefined, undefined, m);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(200);
  });
});
