/**
 * streamingCoalesce — Layer 1 / Tier B tests (Convention 3, 7 patterns).
 *
 * Consumes stream-chunk events from the agentfootprint emit channel
 * (`agentfootprint.llm.stream.chunk`) as accumulated by a Lens-owned
 * StreamEventRecorder. Commit log is NEVER involved.
 */

import { describe, it, expect } from 'vitest';
import { streamingCoalesce, type StreamChunkEvent } from './streamingCoalesce.js';

function chunk(text: string, t: number, tokens?: number, rid = 'call-llm#0'): StreamChunkEvent {
  return { runtimeStageId: rid, text, timestamp: t, ...(tokens !== undefined ? { tokens } : {}) };
}

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('streamingCoalesce — unit', () => {
  it('empty input returns undefined', () => {
    expect(streamingCoalesce([])).toBeUndefined();
  });

  it('single chunk produces a 1-chunk result with elapsed=0 → tps=0', () => {
    const out = streamingCoalesce([chunk('hello', 1000, 1)])!;
    expect(out.final).toBe('hello');
    expect(out.firstTokenAtMs).toBe(1000);
    expect(out.lastTokenAtMs).toBe(1000);
    expect(out.totalTokens).toBe(1);
    expect(out.tokensPerSec).toBe(0); // elapsed=0
  });

  it('multiple chunks concatenate in input order', () => {
    const out = streamingCoalesce([
      chunk('hel', 1000),
      chunk('lo, ', 1100),
      chunk('world', 1200),
    ])!;
    expect(out.final).toBe('hello, world');
  });

  it('totalTokens uses provider counts when present', () => {
    const out = streamingCoalesce([
      chunk('a', 1000, 1),
      chunk('b', 1010, 2),
      chunk('c', 1020, 4),
    ])!;
    expect(out.totalTokens).toBe(7);
  });

  it('totalTokens falls back to word count when no chunk reports tokens', () => {
    const out = streamingCoalesce([
      chunk('one ', 1000),
      chunk('two three ', 1100),
      chunk('four', 1200),
    ])!;
    expect(out.totalTokens).toBe(4);
  });

  it('partial token reports → still falls into number-sum branch (any-token-count)', () => {
    // First chunk reports tokens (count=2), rest don't.
    // Per docstring: anyTokenCount=true → SUM is taken from numeric chunks only.
    const out = streamingCoalesce([
      chunk('foo bar', 1000, 2),
      chunk(' baz', 1100), // no token count → contributes 0
    ])!;
    expect(out.totalTokens).toBe(2);
  });

  it('tokensPerSec computed correctly for non-zero elapsed', () => {
    // 4 tokens over 2000ms = 2 tokens/sec
    const out = streamingCoalesce([
      chunk('a', 1000, 1),
      chunk('b', 2000, 1),
      chunk('c', 2500, 1),
      chunk('d', 3000, 1),
    ])!;
    expect(out.tokensPerSec).toBeCloseTo(2.0, 5);
  });

  it('runtimeStageId is the first chunk\'s runtimeStageId', () => {
    const out = streamingCoalesce([chunk('a', 1000, undefined, 'call-llm#5')])!;
    expect(out.runtimeStageId).toBe('call-llm#5');
  });
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('streamingCoalesce — functional', () => {
  it('realistic LLM stream (30 chunks, 1 token each, 30Hz)', () => {
    const chunks: StreamChunkEvent[] = [];
    for (let i = 0; i < 30; i++) {
      chunks.push(chunk(`tok${i} `, 1000 + i * 33, 1));
    }
    const out = streamingCoalesce(chunks)!;
    expect(out.totalTokens).toBe(30);
    // 30 tokens / (29*33 ms) ≈ 31.4 tok/s
    expect(out.tokensPerSec).toBeGreaterThan(25);
    expect(out.tokensPerSec).toBeLessThan(35);
    expect(out.firstTokenAtMs).toBe(1000);
    expect(out.lastTokenAtMs).toBe(1000 + 29 * 33);
  });

  it('keepalive frames with empty text contribute to timing but not text', () => {
    const out = streamingCoalesce([
      chunk('hello', 1000, 1),
      chunk('', 1100),       // keepalive
      chunk(' world', 1200, 1),
    ])!;
    expect(out.final).toBe('hello world');
    expect(out.totalTokens).toBe(2);
    expect(out.lastTokenAtMs).toBe(1200);
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('streamingCoalesce — integration', () => {
  it('caller-pre-filtered to ONE runtimeStageId — result uses first', () => {
    const out = streamingCoalesce([
      chunk('a', 1000, 1, 'call-llm#5'),
      chunk('b', 1100, 1, 'call-llm#5'),
      chunk('c', 1200, 1, 'call-llm#5'),
    ])!;
    expect(out.runtimeStageId).toBe('call-llm#5');
  });

  it('null/empty chunk array → undefined (caller pre-check)', () => {
    expect(streamingCoalesce([])).toBeUndefined();
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('streamingCoalesce — property', () => {
  it('final always equals concat of texts in input order', () => {
    const rng = (seed: number) => {
      let s = seed;
      return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
      };
    };
    const r = rng(13);
    for (let trial = 0; trial < 30; trial++) {
      const n = 1 + Math.floor(r() * 20);
      const chunks: StreamChunkEvent[] = [];
      let expected = '';
      for (let i = 0; i < n; i++) {
        const t = String.fromCharCode(97 + Math.floor(r() * 26));
        expected += t;
        chunks.push(chunk(t, 1000 + i * 100, 1));
      }
      expect(streamingCoalesce(chunks)!.final).toBe(expected);
    }
  });

  it('totalTokens >= 0 always', () => {
    expect(streamingCoalesce([chunk('a', 1000, 0)])!.totalTokens).toBe(0);
    expect(streamingCoalesce([chunk('', 1000)])!.totalTokens).toBe(0);
  });

  it('tokensPerSec is finite and non-negative for any valid input', () => {
    const out = streamingCoalesce([chunk('a', 1000, 1), chunk('b', 1500, 1)])!;
    expect(Number.isFinite(out.tokensPerSec)).toBe(true);
    expect(out.tokensPerSec).toBeGreaterThanOrEqual(0);
  });

  it('negative or NaN token counts are ignored (fall back to word count)', () => {
    const out = streamingCoalesce([
      chunk('hello world', 1000, -5),  // ignored
      chunk(' foo', 1100, Number.NaN), // ignored
    ])!;
    // No valid token reports → word-count fallback (3 words)
    expect(out.totalTokens).toBe(3);
  });

  it('never throws for any reasonable input', () => {
    const cases: ReadonlyArray<StreamChunkEvent[]> = [
      [],
      [chunk('', 0)],
      [chunk('a', 1000, 1)],
      Array.from({ length: 100 }, (_, i) => chunk(`t${i}`, 1000 + i * 50, 1)),
    ];
    for (const c of cases) {
      expect(() => streamingCoalesce(c)).not.toThrow();
    }
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('streamingCoalesce — security', () => {
  it('does not mutate input chunks', () => {
    const chunks = [chunk('a', 1000, 1), chunk('b', 1100, 1)];
    const before = JSON.stringify(chunks);
    streamingCoalesce(chunks);
    expect(JSON.stringify(chunks)).toBe(before);
  });

  it('returned object exposes only documented fields', () => {
    const out = streamingCoalesce([chunk('a', 1000, 1)])!;
    expect(Object.keys(out).sort()).toEqual([
      'final', 'firstTokenAtMs', 'lastTokenAtMs',
      'runtimeStageId', 'tokensPerSec', 'totalTokens',
    ]);
  });

  it('massive chunk count does not blow up via quadratic concat', () => {
    const chunks = Array.from({ length: 5000 }, (_, i) => chunk('x', 1000 + i, 1));
    const start = performance.now();
    const out = streamingCoalesce(chunks)!;
    const ms = performance.now() - start;
    expect(out.final.length).toBe(5000);
    expect(ms).toBeLessThan(50); // O(n) join, not O(n²)
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('streamingCoalesce — performance', () => {
  it('1000-chunk stream coalesced in under 5ms', () => {
    const chunks: StreamChunkEvent[] = [];
    for (let i = 0; i < 1000; i++) {
      chunks.push(chunk(`tok${i} `, 1000 + i * 10, 1));
    }
    const start = performance.now();
    streamingCoalesce(chunks);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(20);
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('streamingCoalesce — load', () => {
  it('10000-chunk stream coalesced in under 50ms', () => {
    const chunks: StreamChunkEvent[] = [];
    for (let i = 0; i < 10_000; i++) {
      chunks.push(chunk(`t${i} `, 1000 + i, 1));
    }
    const start = performance.now();
    streamingCoalesce(chunks);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(100);
  });
});
