/**
 * <ToolChoicePanel> — RFC-002 C7 panel tests.
 *
 * Renders from fixture `ToolChoiceCall` payloads (the shape
 * `toolChoiceRecorder().getCalls()` returns): chosen-tool highlight,
 * margin badge, ⚠ flags, honest-proxy caption, run-summary flagged
 * count, cursor-sync, skip/unscored states, and U3 windowing.
 */

/** @vitest-environment jsdom */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ToolChoiceCall, ToolChoiceSummary } from 'agentfootprint/observe';
import { ToolChoicePanel } from './ToolChoicePanel.js';

function scoredCall(
  overrides: Partial<{
    runtimeStageId: string;
    iteration: number;
    chosen: string[];
    topScored: string;
    margin: number | undefined;
    narrow: boolean;
    proxyDisagreement: boolean;
  }> = {},
): ToolChoiceCall {
  const chosen = overrides.chosen ?? ['get_fcns'];
  return {
    runtimeStageId: overrides.runtimeStageId ?? 'call-llm#3',
    iteration: overrides.iteration ?? 1,
    offered: [
      { name: 'get_fcns', description: 'live name server' },
      { name: 'influx_fcns', description: 'historic name server' },
      { name: 'send_email', description: 'send a report email' },
    ],
    chosen,
    toolCallIds: ['c1'],
    contextText: 'user: is the port registered?',
    margin: {
      scores: [
        { name: 'get_fcns', score: 0.944 },
        { name: 'influx_fcns', score: 0.932 },
        { name: 'send_email', score: 0.61 },
      ],
      chosen,
      topScored: overrides.topScored ?? 'get_fcns',
      margin: 'margin' in overrides ? overrides.margin : 0.012,
      flags: {
        narrow: overrides.narrow ?? true,
        proxyDisagreement: overrides.proxyDisagreement ?? false,
      },
    },
  };
}

const SUMMARY: ToolChoiceSummary = {
  llmCallsWithTools: 3,
  choices: 2,
  scored: 2,
  flagged: 2,
  narrow: 1,
  proxyDisagreement: 1,
  skipped: 1,
};

describe('<ToolChoicePanel> — scored call', () => {
  it('renders bars for every offered tool, chosen highlighted', () => {
    const { container } = render(
      <ToolChoicePanel
        calls={[scoredCall()]}
        summary={SUMMARY}
        cursorRuntimeStageId="call-llm#3"
      />,
    );
    const rows = container.querySelectorAll('[role="listitem"]');
    expect(rows).toHaveLength(3);
    const chosenRows = container.querySelectorAll('[data-chosen="true"]');
    expect(chosenRows).toHaveLength(1);
    expect(chosenRows[0]!.textContent).toContain('✓ get_fcns');
    // Numeric scores stay visible (honest: bars are relative).
    expect(screen.getByLabelText('get_fcns: score 0.944, chosen')).toBeTruthy();
  });

  it('shows the margin badge and the ⚠ NARROW flag', () => {
    render(
      <ToolChoicePanel
        calls={[scoredCall({ narrow: true })]}
        summary={SUMMARY}
        cursorRuntimeStageId="call-llm#3"
      />,
    );
    expect(screen.getByText('margin 0.012')).toBeTruthy();
    expect(screen.getByText('⚠ NARROW')).toBeTruthy();
  });

  it('flags proxy disagreement and marks the proxy top pick row', () => {
    const { container } = render(
      <ToolChoicePanel
        calls={[
          scoredCall({
            chosen: ['send_email'],
            topScored: 'get_fcns',
            narrow: false,
            proxyDisagreement: true,
          }),
        ]}
        summary={SUMMARY}
        cursorRuntimeStageId="call-llm#3"
      />,
    );
    expect(screen.getByText('⚠ PROXY-DISAGREEMENT')).toBeTruthy();
    expect(screen.getByText('proxy top pick')).toBeTruthy();
    const top = container.querySelector('[data-top-scored="true"]');
    expect(top?.getAttribute('data-chosen')).toBe('false');
  });

  it('states "no competition" when every offered tool was chosen', () => {
    render(
      <ToolChoicePanel
        calls={[
          scoredCall({
            chosen: ['get_fcns', 'influx_fcns', 'send_email'],
            margin: undefined,
            narrow: false,
          }),
        ]}
        cursorRuntimeStageId="call-llm#3"
      />,
    );
    expect(screen.getByText(/no competition to measure/)).toBeTruthy();
    expect(screen.queryByText(/^margin /)).toBeNull();
  });

  it('always renders the honest-proxy caption', () => {
    render(<ToolChoicePanel calls={[scoredCall()]} cursorRuntimeStageId="call-llm#3" />);
    expect(
      screen.getByText(/embedding-geometry proxies .*not.*model internals/s),
    ).toBeTruthy();
  });
});

describe('<ToolChoicePanel> — run summary line', () => {
  it('shows the flagged-call count with the narrow/proxy split', () => {
    render(
      <ToolChoicePanel
        calls={[scoredCall()]}
        summary={SUMMARY}
        cursorRuntimeStageId="call-llm#3"
      />,
    );
    expect(screen.getByText(/⚠.*2 flagged/s)).toBeTruthy();
    expect(screen.getByText(/2 scored · 3 calls offered tools/)).toBeTruthy();
    expect(screen.getByText(/1 narrow, 1 proxy-disagreement/)).toBeTruthy();
  });

  it('zero flagged renders without the warning glyph', () => {
    render(
      <ToolChoicePanel
        calls={[scoredCall()]}
        summary={{ ...SUMMARY, flagged: 0, narrow: 0, proxyDisagreement: 0 }}
        cursorRuntimeStageId="call-llm#3"
      />,
    );
    expect(screen.getByText('0 flagged')).toBeTruthy();
    expect(screen.queryByText(/⚠ 0 flagged/)).toBeNull();
  });
});

describe('<ToolChoicePanel> — cursor sync (ONE cursor, derived view)', () => {
  const calls = [
    scoredCall({ runtimeStageId: 'call-llm#3', iteration: 1 }),
    scoredCall({ runtimeStageId: 'call-llm#9', iteration: 2 }),
  ];

  it('cursor between two calls shows the nearest-previous call', () => {
    render(
      <ToolChoicePanel calls={calls} cursorRuntimeStageId="execute-tools#5" />,
    );
    expect(screen.getByText('Iteration 1')).toBeTruthy();
    expect(screen.getByText('call-llm#3')).toBeTruthy();
  });

  it('cursor at the second call shows it exactly', () => {
    render(<ToolChoicePanel calls={calls} cursorRuntimeStageId="call-llm#9" />);
    expect(screen.getByText('Iteration 2')).toBeTruthy();
  });

  it('cursor before the first call explains the empty state', () => {
    render(<ToolChoicePanel calls={calls} cursorRuntimeStageId="seed#0" />);
    expect(
      screen.getByText(/No tool-offering LLM call at or before this cursor/),
    ).toBeTruthy();
  });

  it('Run · start (root group-start) shows nothing yet', () => {
    render(
      <ToolChoicePanel
        calls={calls}
        cursorRuntimeStageId="__root__#0"
        cursorKind="group-start"
      />,
    );
    expect(
      screen.getByText(/No tool-offering LLM call at or before this cursor/),
    ).toBeTruthy();
  });

  it('Run · end (root group-end) shows the last call', () => {
    render(
      <ToolChoicePanel
        calls={calls}
        cursorRuntimeStageId="__root__#0"
        cursorKind="group-end"
      />,
    );
    expect(screen.getByText('Iteration 2')).toBeTruthy();
  });
});

describe('<ToolChoicePanel> — skip / unscored / absent states', () => {
  it('explains a nothing-chosen skip', () => {
    const base = scoredCall();
    const c = {
      runtimeStageId: base.runtimeStageId,
      iteration: base.iteration,
      offered: base.offered,
      chosen: [],
      toolCallIds: [],
      contextText: base.contextText,
      skipped: 'nothing-chosen',
    } as ToolChoiceCall;
    render(<ToolChoicePanel calls={[c]} cursorRuntimeStageId="call-llm#3" />);
    expect(
      screen.getByText(/model answered without invoking a tool/),
    ).toBeTruthy();
  });

  it('explains a chosen-not-offered skip (wiring anomaly surfaced)', () => {
    const base = scoredCall();
    const c = {
      runtimeStageId: base.runtimeStageId,
      iteration: base.iteration,
      offered: base.offered,
      chosen: ['ghost_tool'],
      toolCallIds: base.toolCallIds,
      contextText: base.contextText,
      skipped: 'chosen-not-offered',
    } as ToolChoiceCall;
    render(<ToolChoicePanel calls={[c]} cursorRuntimeStageId="call-llm#3" />);
    expect(screen.getByText(/not in the offered catalog/)).toBeTruthy();
  });

  it('unscored entry lists the offered menu with a "not scored yet" note', () => {
    const base = scoredCall();
    const c = {
      runtimeStageId: base.runtimeStageId,
      iteration: base.iteration,
      offered: base.offered,
      chosen: ['get_fcns'],
      toolCallIds: base.toolCallIds,
      contextText: base.contextText,
    } as ToolChoiceCall;
    const { container } = render(
      <ToolChoicePanel calls={[c]} cursorRuntimeStageId="call-llm#3" />,
    );
    expect(screen.getByText('not scored yet')).toBeTruthy();
    // Offered menu still listed (no bars).
    expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(3);
    expect(screen.getByText(/✓ get_fcns/)).toBeTruthy();
  });

  it('no calls at all → honest empty state', () => {
    render(<ToolChoicePanel calls={[]} cursorRuntimeStageId="" />);
    expect(screen.getByText('No LLM call offered tools in this run.')).toBeTruthy();
    expect(screen.getByText('no tool-choice data yet')).toBeTruthy();
  });

  it('pending without data → waiting state', () => {
    render(<ToolChoicePanel calls={[]} cursorRuntimeStageId="" pending />);
    expect(screen.getByText('Waiting for the first scored call…')).toBeTruthy();
    expect(screen.getByText('scoring tool choices…')).toBeTruthy();
  });

  it('surfaces a read error, never swallows it', () => {
    render(
      <ToolChoicePanel
        calls={[]}
        cursorRuntimeStageId=""
        error="embedder unreachable"
      />,
    );
    expect(
      screen.getByText(/Tool-choice read failed: embedder unreachable/),
    ).toBeTruthy();
  });
});

describe('<ToolChoicePanel> — U3 windowing', () => {
  it('past the threshold only the scrolled-to window renders', () => {
    const names = Array.from({ length: 60 }, (_, i) => `tool_${i}`);
    const c: ToolChoiceCall = {
      runtimeStageId: 'call-llm#3',
      iteration: 1,
      offered: names.map((name) => ({ name })),
      chosen: ['tool_0'],
      toolCallIds: ['c1'],
      contextText: 'user: q',
      margin: {
        scores: names.map((name, i) => ({ name, score: 1 - i * 0.01 })),
        chosen: ['tool_0'],
        topScored: 'tool_0',
        margin: 0.01,
        flags: { narrow: true, proxyDisagreement: false },
      },
    };
    const { container } = render(
      <ToolChoicePanel
        calls={[c]}
        cursorRuntimeStageId="call-llm#3"
        virtualizeThreshold={10}
        rowHeight={20}
      />,
    );
    const rows = container.querySelectorAll('[role="listitem"]');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(60); // windowed, not the full list
    // Spacer keeps scrollbar geometry honest.
    const spacers = container.querySelectorAll('[aria-hidden="true"]');
    expect(spacers.length).toBeGreaterThan(0);
  });

  it('below the threshold renders every row (no-op contract)', () => {
    const { container } = render(
      <ToolChoicePanel calls={[scoredCall()]} cursorRuntimeStageId="call-llm#3" />,
    );
    expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(3);
  });
});
