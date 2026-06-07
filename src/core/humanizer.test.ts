/**
 * Tests — `teachingHumanizer` / `makeTeachingHumanizer`: conversational
 * prose narration with Chatbot/LLM verb discipline.
 *
 * Patterns (cover the canonical actor-arrow events + context flavors):
 *   T1  agent.turn_start anchors the user's question with appName
 *   T2  llm.start iter 1 — "Chatbot sent the question to the LLM."
 *   T3  llm.start iter 2+ — "sent the tool's result to the LLM for reasoning"
 *   T4  llm.end with tools — "LLM said it needs to use a tool"
 *   T5  llm.end terminal — "LLM gave the final answer. Chatbot returned it"
 *   T6  tool.start — "Chatbot called the `weather` tool" + args framing
 *   T7  tool.end — "tool returned its result"
 *   T8  appName customization — 'Neo' replaces 'Chatbot'
 *   T9  context.injected source=rag — engineered narrative
 *   T10 baseline source=user / tool-result / registry — null (skipped)
 *
 * Rule under test: pure prose, NO technical numbers (no token counts,
 * no durationMs, no raw IDs, no `messages[role=tool]` brackets).
 * Verb discipline: appName uses active verbs (called/dispatched/
 * returned); LLM uses passive (suggested/responded/gave).
 */

import { describe, it, expect } from 'vitest';
import {
  defaultHumanizer,
  makeTeachingHumanizer,
  teachingHumanizer,
} from './humanizer.js';
import type { AgentfootprintEvent } from 'agentfootprint';

function evt(type: string, payload: Record<string, unknown>): AgentfootprintEvent {
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

// ─── T1: agent.turn_start anchors user's question ─────────────────────

describe('teachingHumanizer — T1: agent.turn_start anchors the user question', () => {
  it('renders "User asked Chatbot:" with the prompt quoted', () => {
    const out = teachingHumanizer(
      evt('agentfootprint.agent.turn_start', {
        userPrompt: 'what is the weather in SF?',
        turnIndex: 1,
      }),
    );
    expect(out).toMatch(/User asked Chatbot/);
    expect(out).toMatch(/what is the weather in SF\?/);
  });
});

// ─── T2: llm.start iter 1 ─────────────────────────────────────────────

describe('teachingHumanizer — T2: stream.llm_start (iter 1)', () => {
  it('renders "Chatbot sent the question to the LLM."', () => {
    const out = teachingHumanizer(
      evt('agentfootprint.stream.llm_start', {
        provider: 'mock', model: 'mock-gpt',
        iteration: 1, messagesCount: 3, toolsCount: 2,
      }),
    );
    expect(out).toMatch(/Chatbot sent/);
    expect(out).toMatch(/the LLM/);
    // No technical numbers.
    expect(out).not.toMatch(/\d+\s*messages/i);
    expect(out).not.toMatch(/iter\s*\d/i);
  });
});

// ─── T3: llm.start iter 2+ — tool result reasoning ────────────────────

describe('teachingHumanizer — T3: stream.llm_start (iter 2+)', () => {
  it('renders "sent the tool\'s result to the LLM for reasoning"', () => {
    const out = teachingHumanizer(
      evt('agentfootprint.stream.llm_start', {
        provider: 'mock', model: 'mock-gpt',
        iteration: 2, messagesCount: 5, toolsCount: 2,
      }),
    );
    expect(out).toMatch(/tool's result/);
    expect(out).toMatch(/reasoning/);
  });
});

// ─── T4: llm.end with tool calls ──────────────────────────────────────

describe('teachingHumanizer — T4: stream.llm_end (tool calls)', () => {
  it('renders "LLM said it needs to use a tool"', () => {
    const out = teachingHumanizer(
      evt('agentfootprint.stream.llm_end', {
        durationMs: 42,
        usage: { input: 5, output: 3 },
        toolCallCount: 2,
        stopReason: 'tool_use',
      }),
    );
    expect(out).toMatch(/LLM said it needs/);
    expect(out).toMatch(/Chatbot will/);
    // No durationMs / token leaks.
    expect(out).not.toMatch(/42ms/);
    expect(out).not.toMatch(/5\+3/);
  });
});

// ─── T5: llm.end terminal ─────────────────────────────────────────────

describe('teachingHumanizer — T5: stream.llm_end (terminal)', () => {
  it('renders "LLM gave the final answer. Chatbot returned it to the user."', () => {
    const out = teachingHumanizer(
      evt('agentfootprint.stream.llm_end', {
        durationMs: 50,
        usage: { input: 5, output: 8 },
        toolCallCount: 0,
        stopReason: 'stop',
      }),
    );
    expect(out).toMatch(/LLM gave the final answer/);
    expect(out).toMatch(/Chatbot returned it/);
    // No "loop exits" technical phrasing.
    expect(out).not.toMatch(/loop exits/i);
  });
});

// ─── T6: tool.start — Chatbot active, LLM passive ─────────────────────

describe('teachingHumanizer — T6: stream.tool_start', () => {
  it('renders "Chatbot called the `weather` tool" + LLM-asked-for-it framing', () => {
    const out = teachingHumanizer(
      evt('agentfootprint.stream.tool_start', {
        toolName: 'weather',
        toolCallId: 'c1',
        args: { city: 'SF' },
      }),
    );
    expect(out).toMatch(/Chatbot called/);
    expect(out).toMatch(/`weather`/);
    expect(out).toMatch(/LLM asked/);
    expect(out).toMatch(/figured out the inputs/);
    // No description plumbed → no "registered as" clause.
    expect(out).not.toMatch(/registered as/);
  });

  it('cites the registered tool description when getToolDescription returns one', () => {
    const humanize = makeTeachingHumanizer({
      getToolDescription: (name) =>
        name === 'weather' ? 'Get current weather for a city' : undefined,
    });
    const out = humanize(
      evt('agentfootprint.stream.tool_start', {
        toolName: 'weather',
        toolCallId: 'c1',
        args: { city: 'SF' },
      }),
    );
    expect(out).toMatch(/Chatbot called the `weather` tool/);
    expect(out).toMatch(/registered as "Get current weather for a city"/);
    // Still ends with the LLM-asked-for-it framing.
    expect(out).toMatch(/LLM asked for it/);
  });

  it('falls back gracefully when the resolver returns undefined or empty', () => {
    const humanize = makeTeachingHumanizer({
      getToolDescription: () => undefined,
    });
    const out = humanize(
      evt('agentfootprint.stream.tool_start', {
        toolName: 'weather',
        toolCallId: 'c1',
        args: {},
      }),
    );
    expect(out).toMatch(/Chatbot called the `weather` tool\./); // no clause
    expect(out).not.toMatch(/registered as/);
  });
});

// ─── T7: tool.end — conversational, no [role=tool] bracket ────────────

describe('teachingHumanizer — T7: stream.tool_end', () => {
  it('renders "tool returned its result. Chatbot will share it..."', () => {
    const out = teachingHumanizer(
      evt('agentfootprint.stream.tool_end', {
        toolCallId: 'c1',
        result: '72°F sunny',
        durationMs: 30,
      }),
    );
    expect(out).toMatch(/tool returned its result/);
    expect(out).toMatch(/Chatbot will share it/);
    // No technical brackets in conversational mode.
    expect(out).not.toMatch(/messages\[role=tool\]/);
  });
});

// ─── T8: appName customization ────────────────────────────────────────

describe('teachingHumanizer — T8: appName replaces "Chatbot"', () => {
  it('makeTeachingHumanizer({ appName: "Neo" }) substitutes Neo everywhere', () => {
    const humanize = makeTeachingHumanizer({ appName: 'Neo' });
    const turnStart = humanize(
      evt('agentfootprint.agent.turn_start', { userPrompt: 'hi', turnIndex: 1 }),
    );
    expect(turnStart).toMatch(/User asked Neo/);
    expect(turnStart).not.toMatch(/Chatbot/);

    const llmStart = humanize(
      evt('agentfootprint.stream.llm_start', {
        provider: 'mock', model: 'm', iteration: 1, messagesCount: 1, toolsCount: 0,
      }),
    );
    expect(llmStart).toMatch(/Neo sent/);
    expect(llmStart).not.toMatch(/Chatbot/);
  });
});

// ─── T9: context.injected (rag) ───────────────────────────────────────

describe('teachingHumanizer — T9: context.injected (engineered)', () => {
  it('rag injection: "Chatbot retrieved relevant content"', () => {
    const out = teachingHumanizer(
      evt('agentfootprint.context.injected', {
        slot: 'messages', source: 'rag', sourceId: 'doc-7',
        contentSummary: 'Q3 revenue', reason: 'RAG hit',
        retrievalScore: 0.92,
      }),
    );
    expect(out).toMatch(/Chatbot retrieved/);
    // No score numbers in narrative.
    expect(out).not.toMatch(/0\.92/);
  });

  it('skill injection: "Chatbot activated a skill"', () => {
    const out = teachingHumanizer(
      evt('agentfootprint.context.injected', {
        slot: 'system-prompt', source: 'skill', sourceId: 'billing',
        contentSummary: 'billing helper',
      }),
    );
    expect(out).toMatch(/Chatbot activated a skill/);
    expect(out).toMatch(/system prompt/);
    expect(out).toMatch(/tools/);
  });
});

// ─── T10: baselines drop from narrative ───────────────────────────────

describe('teachingHumanizer — T10: baseline injections return null', () => {
  it('source=user returns null', () => {
    expect(
      teachingHumanizer(
        evt('agentfootprint.context.injected', {
          slot: 'messages', source: 'user', contentSummary: 'hi',
        }),
      ),
    ).toBeNull();
  });

  it('source=tool-result returns null', () => {
    expect(
      teachingHumanizer(
        evt('agentfootprint.context.injected', {
          slot: 'messages', source: 'tool-result', contentSummary: 'r',
        }),
      ),
    ).toBeNull();
  });

  it('source=registry returns null', () => {
    expect(
      teachingHumanizer(
        evt('agentfootprint.context.injected', {
          slot: 'tools', source: 'registry', contentSummary: 'weather tool',
        }),
      ),
    ).toBeNull();
  });
});

// ─── T11: commentaryTemplates override (i18n + brand voice hook) ──────

describe('teachingHumanizer — T11: commentaryTemplates override', () => {
  it('partial override changes ONLY the overridden key; missing keys fall back to bundled English', () => {
    const humanize = makeTeachingHumanizer({
      commentaryTemplates: {
        'agent.turn_start': 'You: "{{userPrompt}}"',
      },
    });

    // Overridden key uses the consumer's brand voice.
    expect(
      humanize(
        evt('agentfootprint.agent.turn_start', { userPrompt: 'go', turnIndex: 1 }),
      ),
    ).toBe('You: "go"');

    // Untouched key still falls back to bundled English with appName.
    expect(
      humanize(
        evt('agentfootprint.stream.llm_start', {
          provider: 'm', model: 'm', iteration: 1, messagesCount: 0, toolsCount: 0,
        }),
      ),
    ).toMatch(/Chatbot sent/);
  });

  it('full locale swap (Spanish-style) flows through unchanged template keys', () => {
    const es = {
      'agent.turn_start': 'El usuario preguntó a {{appName}}: "{{userPrompt}}".',
      'stream.llm_start.iter1': '{{appName}} envió la pregunta al LLM.',
    };
    const humanize = makeTeachingHumanizer({
      appName: 'Acme',
      commentaryTemplates: es,
    });
    expect(
      humanize(
        evt('agentfootprint.agent.turn_start', { userPrompt: 'hola', turnIndex: 1 }),
      ),
    ).toBe('El usuario preguntó a Acme: "hola".');
    expect(
      humanize(
        evt('agentfootprint.stream.llm_start', {
          provider: 'm', model: 'm', iteration: 1, messagesCount: 0, toolsCount: 0,
        }),
      ),
    ).toBe('Acme envió la pregunta al LLM.');
  });
});

// ─── Fallthrough: events without a teaching narrative ─────────────────

describe('teachingHumanizer — fallthrough to defaultHumanizer', () => {
  it('cost.tick has no teaching narrative; falls through', () => {
    const event = evt('agentfootprint.cost.tick', {
      estimatedUsd: 0.001,
      cumulative: { estimatedUsd: 0.005 },
    });
    expect(teachingHumanizer(event)).toBe(defaultHumanizer(event));
  });
});

// ─── Slot mechanics drop from the teaching narrative ──────────────────

describe('teachingHumanizer — slot mechanics return null', () => {
  it('context.slot_composed returns null (no "iter 1, 54/4000 tokens" leak)', () => {
    const out = teachingHumanizer(
      evt('agentfootprint.context.slot_composed', {
        slot: 'system-prompt',
        iteration: 1,
        budget: { used: 54, cap: 4000 },
      }),
    );
    expect(out).toBeNull();
  });

  it('context.evicted returns null', () => {
    const out = teachingHumanizer(
      evt('agentfootprint.context.evicted', {
        slot: 'messages',
        reason: 'budget',
        survivalMs: 200,
      }),
    );
    expect(out).toBeNull();
  });

  it('context.budget_pressure returns null', () => {
    const out = teachingHumanizer(
      evt('agentfootprint.context.budget_pressure', {
        slot: 'messages',
        projectedTokens: 9500,
        capTokens: 10000,
        planAction: 'evict-oldest',
      }),
    );
    expect(out).toBeNull();
  });
});

describe('teachingHumanizer — commentary quality', () => {
  it('hides the raw context.evaluated emit (low-signal internal tick)', () => {
    expect(teachingHumanizer(evt('agentfootprint.context.evaluated', {}))).toBeNull();
  });

  it('an instruction injection shows its rule content — not an empty ": ."', () => {
    const out = teachingHumanizer(
      evt('agentfootprint.context.injected', {
        slot: 'system-prompt',
        source: 'instructions',
        contentSummary: 'Never expose raw PII in your final answer',
      }),
    );
    expect(out).toContain('Never expose raw PII');
    expect(out).not.toMatch(/:\s*\.$/); // never the empty "added a rule: ."
  });
});
