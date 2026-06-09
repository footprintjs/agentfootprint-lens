/**
 * LensRecorder diagnostics tests — backlog item U4.
 *
 * The recorder ALWAYS maintains health counters (`getDiagnostics()`):
 * per-type counts of unknown event types + a bracket-mismatch count.
 * Console warnings are opt-in via `{ debug: true }` (or footprintjs's
 * global `enableDevMode()`), warn ONCE per unknown type (not per
 * event), and fire on EVERY bracket mismatch with the expected/found
 * kinds + the closing event's runtimeStageId.
 *
 * 6 patterns:
 *   1. unknown type: counters increment per event; debug warns once per type
 *   2. unknown type: silent without debug — counters still maintained
 *   3. bracket mismatch: counter + debug warning with kinds + runtimeStageId
 *   4. debug resolution: footprintjs isDevMode() fallback; debug:false wins
 *   5. well-formed run: zero diagnostics, zero console noise (debug ON)
 *   6. clear() resets all diagnostic state (incl. the warned-once set)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  Agent,
  type AgentfootprintEvent,
  type LLMProvider,
} from 'agentfootprint';
import { enableDevMode, disableDevMode } from 'footprintjs';
import { LensRecorder, lensRecorder } from './LensRecorder.js';

// ─── Fixtures ───────────────────────────────────────────────────

/** Synthetic typed-event envelope (same shape the dispatcher emits). */
function evt(
  type: string,
  payload: Record<string, unknown> = {},
): AgentfootprintEvent {
  return {
    type,
    payload,
    meta: {
      wallClockMs: 1000,
      runOffsetMs: 0,
      runtimeStageId: 'test#0',
      subflowPath: [],
      compositionPath: [],
      runId: 'test',
    },
  } as unknown as AgentfootprintEvent;
}

/** Feed a synthetic event through the recorder's private event path —
 *  the same seam `observe()`'s `runner.on('*')` subscription uses.
 *  Real runners can't emit unknown types or malformed brackets, which
 *  is exactly what these tests need to produce. */
function feed(rec: LensRecorder, e: AgentfootprintEvent): void {
  (
    rec as unknown as { handleEvent: (e: AgentfootprintEvent) => void }
  ).handleEvent(e);
}

function scriptedToolProvider(): LLMProvider {
  return {
    name: 'scripted',
    complete: async (req) => {
      const hadTool = req.messages.some((m) => m.role === 'tool');
      if (hadTool) {
        return {
          content: 'all done',
          toolCalls: [],
          usage: { input: 30, output: 10 },
          stopReason: 'stop',
        };
      }
      return {
        content: 'using tool',
        toolCalls: [{ id: 't1', name: 'noop', args: {} }],
        usage: { input: 20, output: 5 },
        stopReason: 'tool_use',
      };
    },
  };
}

afterEach(() => {
  disableDevMode();
  vi.restoreAllMocks();
});

// ─── Pattern 1: unknown type — counted per event, warned once per type ──

describe('LensRecorder diagnostics — pattern 1: unknown event types in debug mode', () => {
  it('counts every occurrence but warns only once per type', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rec = lensRecorder('Run', { debug: true });

    feed(rec, evt('myapp.custom.thing'));
    feed(rec, evt('myapp.custom.thing'));
    feed(rec, evt('myapp.other.thing'));

    expect(rec.getDiagnostics()).toEqual({
      unknownEventTypes: { 'myapp.custom.thing': 2, 'myapp.other.thing': 1 },
      bracketMismatches: 0,
    });
    // Once per TYPE, not per event — 3 events, 2 types, 2 warnings.
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("unknown event type 'myapp.custom.thing'"),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("unknown event type 'myapp.other.thing'"),
    );
  });

  it('still attaches the unknown event to the log (counted, not dropped)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rec = lensRecorder('Run', { debug: true });
    feed(rec, evt('myapp.custom.thing'));
    expect(rec.entryCount).toBe(1);
    expect(rec.selectEventLog()[0]!.event.type).toBe('myapp.custom.thing');
  });
});

// ─── Pattern 2: unknown type — silent without debug, counters intact ──

describe('LensRecorder diagnostics — pattern 2: silent by default', () => {
  it('never warns when debug is off, but the counters still accumulate', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rec = lensRecorder(); // no debug option, dev mode off

    feed(rec, evt('myapp.custom.thing'));
    feed(
      rec,
      evt('agentfootprint.stream.llm_end', {
        content: '',
        toolCallCount: 0,
        usage: { input: 0, output: 0 },
        stopReason: 'stop',
      }),
    ); // bracket mismatch too — also silent

    expect(warn).not.toHaveBeenCalled();
    expect(rec.getDiagnostics()).toEqual({
      unknownEventTypes: { 'myapp.custom.thing': 1 },
      bracketMismatches: 1,
    });
  });
});

// ─── Pattern 3: bracket mismatch — counter + debug warning ────────────

describe('LensRecorder diagnostics — pattern 3: bracket mismatch', () => {
  it('warns on EVERY mismatch with expected/found kinds + runtimeStageId', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rec = lensRecorder('Run', { debug: true });

    // llm_end with no llm_start on the stack → top is the synthetic
    // 'run' root, expected 'llm-call'. Twice → two warnings (mismatches
    // are not deduplicated; each one is a distinct malformation).
    const llmEnd = () =>
      evt('agentfootprint.stream.llm_end', {
        content: '',
        toolCallCount: 0,
        usage: { input: 0, output: 0 },
        stopReason: 'stop',
      });
    feed(rec, llmEnd());
    feed(rec, llmEnd());

    expect(rec.getDiagnostics().bracketMismatches).toBe(2);
    expect(rec.getDiagnostics().unknownEventTypes).toEqual({}); // llm_end is a KNOWN type
    expect(warn).toHaveBeenCalledTimes(2);
    const message = warn.mock.calls[0]![0] as string;
    expect(message).toContain("close a 'llm-call' node");
    expect(message).toContain("top of the stack is 'run'");
    expect(message).toContain('runtimeStageId: test#0');
  });
});

// ─── Pattern 4: debug resolution — isDevMode fallback, explicit wins ──

describe('LensRecorder diagnostics — pattern 4: debug flag resolution', () => {
  it('follows footprintjs enableDevMode() when debug is unset', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rec = lensRecorder(); // debug unset → isDevMode() decides
    enableDevMode();
    feed(rec, evt('myapp.custom.thing'));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('debug: false silences warnings even when dev mode is on', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rec = lensRecorder('Run', { debug: false });
    enableDevMode();
    feed(rec, evt('myapp.custom.thing'));
    expect(warn).not.toHaveBeenCalled();
    expect(rec.getDiagnostics().unknownEventTypes).toEqual({
      'myapp.custom.thing': 1,
    });
  });
});

// ─── Pattern 5: well-formed run — zero diagnostics, zero noise ────────

describe('LensRecorder diagnostics — pattern 5: well-formed run is clean', () => {
  it('a real Agent run (turn/iteration/llm/tool brackets) produces zero diagnostics', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const agent = Agent.create({
      provider: scriptedToolProvider(),
      model: 'mock',
    })
      .system('')
      .tool({
        schema: {
          name: 'noop',
          description: '',
          inputSchema: { type: 'object' },
        },
        execute: () => 'ok',
      })
      .build();

    const rec = lensRecorder('Run', { debug: true });
    rec.observe(agent);
    await agent.run({ message: 'go' });

    expect(rec.getDiagnostics()).toEqual({
      unknownEventTypes: {},
      bracketMismatches: 0,
    });
    const lensWarnings = warn.mock.calls.filter((c) =>
      String(c[0]).startsWith('[lens]'),
    );
    expect(lensWarnings).toEqual([]);
  });
});

// ─── Pattern 6: clear() resets diagnostic state ───────────────────────

describe('LensRecorder diagnostics — pattern 6: clear() resets', () => {
  it('counters AND the warned-once set reset, so the next run warns again', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rec = lensRecorder('Run', { debug: true });

    feed(rec, evt('myapp.custom.thing'));
    expect(rec.getDiagnostics().unknownEventTypes).toEqual({
      'myapp.custom.thing': 1,
    });
    expect(warn).toHaveBeenCalledTimes(1);

    rec.clear();
    expect(rec.getDiagnostics()).toEqual({
      unknownEventTypes: {},
      bracketMismatches: 0,
    });

    // Same unknown type after clear() → fresh run, fresh warning.
    feed(rec, evt('myapp.custom.thing'));
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
