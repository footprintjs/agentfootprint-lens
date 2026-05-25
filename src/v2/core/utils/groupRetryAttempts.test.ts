/**
 * groupRetryAttempts — Layer 1 / Tier B tests (Convention 3, 7 patterns).
 *
 * Consumes retry events from the agentfootprint emit channel
 * (`agentfootprint.reliability.*`) as accumulated by a Lens-owned
 * EmitRecorder. The commit log is NOT involved — telemetry never lives
 * in shared state.
 */

import { describe, it, expect } from 'vitest';
import { groupRetryAttempts, type RetryEvent } from './groupRetryAttempts.js';

function ev(
  attempt: number,
  status: 'failed' | 'ok',
  stageId = 'call-llm',
  errorMessage?: string,
  timestamp = attempt * 1000,
): RetryEvent {
  return {
    runtimeStageId: `${stageId}#${attempt - 1}`,
    stageId,
    attempt,
    status,
    ...(errorMessage !== undefined ? { errorMessage } : {}),
    timestamp,
  };
}

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('groupRetryAttempts — unit', () => {
  it('empty events returns undefined', () => {
    expect(groupRetryAttempts([], 'call-llm')).toBeUndefined();
  });

  it('no events match stageId returns undefined', () => {
    expect(groupRetryAttempts([ev(1, 'failed', 'other', 'x')], 'call-llm')).toBeUndefined();
  });

  it('empty stageId returns undefined', () => {
    expect(groupRetryAttempts([ev(1, 'failed', 'x', 'e')], '')).toBeUndefined();
  });

  it('single failed-then-ok pair produces 2-attempt cluster', () => {
    const events = [ev(1, 'failed', 'call-llm', 'timeout'), ev(2, 'ok', 'call-llm')];
    const cluster = groupRetryAttempts(events, 'call-llm');
    expect(cluster).toBeDefined();
    expect(cluster!.stageId).toBe('call-llm');
    expect(cluster!.attempts).toHaveLength(2);
    expect(cluster!.attempts[0]!.status).toBe('failed');
    expect(cluster!.attempts[0]!.errorMessage).toBe('timeout');
    expect(cluster!.attempts[1]!.status).toBe('ok');
    expect(cluster!.finalStatus).toBe('ok');
  });

  it('all-failed exhaustion produces failed cluster', () => {
    const events = [
      ev(1, 'failed', 'call-llm', 'e1'),
      ev(2, 'failed', 'call-llm', 'e2'),
      ev(3, 'failed', 'call-llm', 'e3'),
    ];
    const cluster = groupRetryAttempts(events, 'call-llm');
    expect(cluster).toBeDefined();
    expect(cluster!.attempts.every((a) => a.status === 'failed')).toBe(true);
    expect(cluster!.finalStatus).toBe('failed');
  });

  it('single ok event produces 1-attempt cluster (still a cluster — caller decides whether to render)', () => {
    const events = [ev(1, 'ok', 'call-llm')];
    const cluster = groupRetryAttempts(events, 'call-llm');
    expect(cluster).toBeDefined();
    expect(cluster!.attempts).toHaveLength(1);
    expect(cluster!.finalStatus).toBe('ok');
  });

  it('errorMessage absent when status is ok', () => {
    const events = [ev(1, 'ok', 'x')];
    const cluster = groupRetryAttempts(events, 'x')!;
    expect(cluster.attempts[0]!.errorMessage).toBeUndefined();
  });

  it('durationMs flows through when provided', () => {
    const events: RetryEvent[] = [
      { runtimeStageId: 'x#0', stageId: 'x', attempt: 1, status: 'failed', errorMessage: 'e', durationMs: 250, timestamp: 1000 },
      { runtimeStageId: 'x#1', stageId: 'x', attempt: 2, status: 'ok', durationMs: 130, timestamp: 2000 },
    ];
    const cluster = groupRetryAttempts(events, 'x')!;
    expect(cluster.attempts[0]!.durationMs).toBe(250);
    expect(cluster.attempts[1]!.durationMs).toBe(130);
  });
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('groupRetryAttempts — functional', () => {
  it('preserves event order in attempts', () => {
    const events = [
      ev(1, 'failed', 'call-llm', 'a'),
      ev(1, 'failed', 'other', 'unrelated'),  // interleaved different stage
      ev(2, 'failed', 'call-llm', 'b'),
      ev(3, 'ok', 'call-llm'),
    ];
    const cluster = groupRetryAttempts(events, 'call-llm')!;
    expect(cluster.attempts.map((a) => a.attempt)).toEqual([1, 2, 3]);
  });

  it('isolates two clusters by stageId', () => {
    const events = [
      ev(1, 'failed', 'call-llm', 'e'),
      ev(2, 'ok', 'call-llm'),
      ev(1, 'failed', 'send-email', 'smtp'),
      ev(2, 'ok', 'send-email'),
    ];
    const llm = groupRetryAttempts(events, 'call-llm')!;
    const email = groupRetryAttempts(events, 'send-email')!;
    expect(llm.attempts).toHaveLength(2);
    expect(email.attempts).toHaveLength(2);
    expect(llm.attempts[0]!.errorMessage).toBe('e');
    expect(email.attempts[0]!.errorMessage).toBe('smtp');
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('groupRetryAttempts — integration', () => {
  it('mixed event stream: retries, normal calls, unrelated stages all coexist', () => {
    const events = [
      ev(1, 'failed', 'check-policy', 'rl'),
      ev(1, 'ok', 'call-llm'),     // standalone success on different stage
      ev(2, 'ok', 'check-policy'),
      ev(1, 'failed', 'send-email', 'smtp'),
      ev(2, 'ok', 'send-email'),
    ];
    const policy = groupRetryAttempts(events, 'check-policy')!;
    const email = groupRetryAttempts(events, 'send-email')!;
    const llm = groupRetryAttempts(events, 'call-llm')!;
    expect(policy.attempts).toHaveLength(2);
    expect(email.attempts).toHaveLength(2);
    expect(llm.attempts).toHaveLength(1);
    expect(groupRetryAttempts(events, 'nope')).toBeUndefined();
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('groupRetryAttempts — property', () => {
  it('finalStatus always equals last attempt status', () => {
    const rng = (seed: number) => {
      let s = seed;
      return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
      };
    };
    const r = rng(11);
    for (let trial = 0; trial < 50; trial++) {
      const n = 1 + Math.floor(r() * 6);
      const events: RetryEvent[] = [];
      let lastStatus: 'failed' | 'ok' = 'ok';
      for (let i = 0; i < n; i++) {
        const status: 'failed' | 'ok' = r() < 0.5 ? 'failed' : 'ok';
        events.push(ev(i + 1, status, 'x', status === 'failed' ? 'e' : undefined));
        lastStatus = status;
      }
      expect(groupRetryAttempts(events, 'x')!.finalStatus).toBe(lastStatus);
    }
  });

  it('attempts.length === matching event count', () => {
    const events = [
      ev(1, 'failed', 'x', 'a'),
      ev(2, 'failed', 'y', 'b'),
      ev(2, 'ok', 'x'),
    ];
    expect(groupRetryAttempts(events, 'x')!.attempts).toHaveLength(2);
  });

  it('never throws for any reasonable input', () => {
    const cases: ReadonlyArray<RetryEvent[]> = [[], [ev(1, 'ok')], [ev(1, 'failed', 'x', 'e')]];
    for (const c of cases) {
      expect(() => groupRetryAttempts(c, 'x')).not.toThrow();
      expect(() => groupRetryAttempts(c, '')).not.toThrow();
    }
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('groupRetryAttempts — security', () => {
  it('does not mutate input events', () => {
    const events = [ev(1, 'failed', 'x', 'e'), ev(2, 'ok', 'x')];
    const before = JSON.stringify(events);
    groupRetryAttempts(events, 'x');
    expect(JSON.stringify(events)).toBe(before);
  });

  it('returned cluster has only documented fields', () => {
    const cluster = groupRetryAttempts([ev(1, 'failed', 'x', 'e'), ev(2, 'ok', 'x')], 'x')!;
    expect(Object.keys(cluster).sort()).toEqual(['attempts', 'finalStatus', 'stageId']);
  });

  it('attempt objects expose only declared fields', () => {
    const cluster = groupRetryAttempts([ev(1, 'failed', 'x', 'e')], 'x')!;
    const allowed = new Set(['runtimeStageId', 'status', 'errorMessage', 'attempt', 'durationMs', 'timestamp']);
    for (const k of Object.keys(cluster.attempts[0]!)) {
      expect(allowed.has(k)).toBe(true);
    }
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('groupRetryAttempts — performance', () => {
  it('1000-event scan 100 times in under 100ms', () => {
    const events: RetryEvent[] = [];
    for (let i = 0; i < 1000; i++) {
      const stage = i % 7 === 0 ? 'target' : 'other';
      events.push(ev(i + 1, i % 3 === 0 ? 'failed' : 'ok', stage, i % 3 === 0 ? 'e' : undefined));
    }
    const start = performance.now();
    for (let i = 0; i < 100; i++) groupRetryAttempts(events, 'target');
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(100);
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('groupRetryAttempts — load', () => {
  it('10000-event scan 50 times in under 200ms', () => {
    const events: RetryEvent[] = [];
    for (let i = 0; i < 10_000; i++) {
      const stage = i % 13 === 0 ? 'target' : 'other';
      events.push(ev(i + 1, i % 4 === 0 ? 'failed' : 'ok', stage, i % 4 === 0 ? 'e' : undefined));
    }
    const start = performance.now();
    for (let i = 0; i < 50; i++) groupRetryAttempts(events, 'target');
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(200);
  });
});
