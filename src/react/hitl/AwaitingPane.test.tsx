/** @vitest-environment jsdom */
/**
 * <AwaitingPane> — the typed question's screen half, pinned.
 *
 *   • live path: `propsRef` is redeemed through the resolver (get), the
 *     REGISTERED component renders with the resolved payload, the click posts
 *     the STRUCTURED decision to `onDecision`, and the pane then renders the
 *     decision as a sentence (display) over the recorded fact.
 *   • inline path: props-only asks render without any resolver.
 *   • unknown componentId: the prose question + plain answer box, STATED —
 *     and the typed text still posts as the decision. Never a dead end.
 *   • expired propsRef: the honest placeholder + the answer box.
 *   • no resolver / failed door: the door's own sentence + the answer box.
 *   • consent gates fall back to Approve/Decline + who-decided (the
 *     vocabulary the wire accepts), and the buttons stay disabled until an
 *     actor is named — an actor-less audit row cannot be posted.
 *   • a crashing registered component is caught, stated, and falls back.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ArtifactResolution, ArtifactResolver } from '../../core/artifacts/types.js';
import type { ConsentDecisionView, PendingAskView } from '../../core/hitl/types.js';
import { AwaitingPane } from './AwaitingPane.js';
import { registerDecisionComponent, type DecisionComponentProps } from './registry.js';

const OPTIONS = Array.from({ length: 3 }, (_, i) => ({ id: `option-${i}`, label: `Reason #${i}` }));

const REF_ASK: PendingAskView = {
  sessionId: 's-1',
  tool: 'pick_reason',
  question: 'Which reason?',
  component: { componentId: 'option-picker', propsRef: 'art_options1' },
  pauseData: {},
};

/** A scriptable resolver that counts every call. */
function fakeResolver(get: ArtifactResolution) {
  const calls = { head: 0, get: 0 };
  const resolver: ArtifactResolver = {
    head: async () => {
      calls.head += 1;
      return { status: 'failed', message: 'head was not scripted' };
    },
    get: async () => {
      calls.get += 1;
      return get;
    },
  };
  return { resolver, calls };
}

const LIVE_OPTIONS: ArtifactResolution = {
  status: 'live',
  meta: { ref: 'art_options1', kind: 'options/list', mediaType: 'application/json', bytes: 100 },
  data: OPTIONS,
};

describe('<AwaitingPane> — the live typed path', () => {
  it('redeems propsRef, renders the built-in picker, posts the id, then renders the sentence', async () => {
    const { resolver, calls } = fakeResolver(LIVE_OPTIONS);
    const decisions: unknown[] = [];
    render(
      <AwaitingPane awaiting={REF_ASK} resolver={resolver} onDecision={(d) => decisions.push(d)} />,
    );
    // The prose question renders while (and after) the ref resolves.
    expect(screen.getByTestId('hitl-question').textContent).toBe('Which reason?');
    const option = await screen.findByTestId('hitl-option-option-1');
    expect(calls.get).toBe(1);
    fireEvent.click(option);
    // The RECORD is the structured decision the tool documented — the id.
    expect(decisions).toEqual(['option-1']);
    // Interact-to-NL: the sentence is display; the record line shows the fact.
    expect(screen.getByTestId('hitl-decision-sentence').textContent).toBe('Chose "Reason #1".');
    expect(screen.getByTestId('hitl-decision-record').textContent).toContain('"option-1"');
  });

  it('renders an inline-props ask with no resolver at all (zero-cost when unused)', () => {
    const decisions: unknown[] = [];
    render(
      <AwaitingPane
        awaiting={{
          question: 'Pick one',
          component: { componentId: 'option-picker', props: { options: ['a', 'b'] } },
        }}
        onDecision={(d) => decisions.push(d)}
      />,
    );
    fireEvent.click(screen.getByTestId('hitl-option-b'));
    expect(decisions).toEqual(['b']);
  });

  it('hands a registered custom component question, props, data and respond', async () => {
    const seen: DecisionComponentProps[] = [];
    const Custom: React.FC<DecisionComponentProps> = (p) => {
      seen.push(p);
      return <div data-testid="custom-collector" />;
    };
    const unregister = registerDecisionComponent({ componentId: 'refund-form', component: Custom });
    const { resolver } = fakeResolver(LIVE_OPTIONS);
    try {
      render(
        <AwaitingPane
          awaiting={{
            question: 'Refund?',
            component: { componentId: 'refund-form', props: { max: 90 }, propsRef: 'art_x' },
          }}
          resolver={resolver}
          onDecision={() => {}}
        />,
      );
      await screen.findByTestId('custom-collector');
      expect(seen[0]!.question).toBe('Refund?');
      expect(seen[0]!.props).toEqual({ max: 90 });
      expect(seen[0]!.data).toEqual(OPTIONS);
      expect(typeof seen[0]!.respond).toBe('function');
    } finally {
      unregister();
    }
  });
});

describe('<AwaitingPane> — fallbacks (never a dead end)', () => {
  it('states an unknown componentId and still collects through the plain box', () => {
    const decisions: unknown[] = [];
    render(
      <AwaitingPane
        awaiting={{ question: 'Approve?', component: { componentId: 'mystery-widget' } }}
        onDecision={(d) => decisions.push(d)}
      />,
    );
    expect(screen.getByTestId('hitl-unknown-component').textContent).toContain('mystery-widget');
    expect(screen.getByTestId('hitl-unknown-component').textContent).toContain(
      'registerDecisionComponent',
    );
    fireEvent.change(screen.getByTestId('hitl-answer-input'), { target: { value: 'yes' } });
    fireEvent.click(screen.getByTestId('hitl-answer-submit'));
    expect(decisions).toEqual(['yes']);
    expect(screen.getByTestId('hitl-decision-sentence').textContent).toBe('Answered: "yes".');
  });

  it('renders the honest placeholder + answer box when propsRef has expired', async () => {
    const { resolver } = fakeResolver({ status: 'absent' });
    const decisions: unknown[] = [];
    render(
      <AwaitingPane awaiting={REF_ASK} resolver={resolver} onDecision={(d) => decisions.push(d)} />,
    );
    const expired = await screen.findByTestId('hitl-ref-expired');
    expect(expired.textContent).toContain('art_options1');
    expect(expired.textContent).toContain('expired');
    // The human can still answer.
    fireEvent.change(screen.getByTestId('hitl-answer-input'), { target: { value: 'reason 7' } });
    fireEvent.click(screen.getByTestId('hitl-answer-submit'));
    expect(decisions).toEqual(['reason 7']);
  });

  it("surfaces the door's own sentence when redemption fails, and falls back", async () => {
    const { resolver } = fakeResolver({ status: 'failed', message: 'no store is attached.' });
    render(<AwaitingPane awaiting={REF_ASK} resolver={resolver} onDecision={() => {}} />);
    const failed = await screen.findByTestId('hitl-ref-failed');
    expect(failed.textContent).toContain('no store is attached.');
    expect(screen.getByTestId('hitl-answer-box')).toBeTruthy();
  });

  it('states the missing resolver when the ask ships a propsRef, and falls back', async () => {
    render(<AwaitingPane awaiting={REF_ASK} onDecision={() => {}} />);
    const failed = await screen.findByTestId('hitl-ref-failed');
    expect(failed.textContent).toContain('no resolver');
    expect(screen.getByTestId('hitl-answer-box')).toBeTruthy();
  });

  it('renders a prose-only pause (any era) as the question + plain box', () => {
    render(<AwaitingPane awaiting={{ question: 'Approve?' }} onDecision={() => {}} />);
    expect(screen.getByTestId('hitl-question').textContent).toBe('Approve?');
    expect(screen.getByTestId('hitl-answer-box')).toBeTruthy();
  });

  it('catches a crashing registered component, states it, and falls back', () => {
    const Broken: React.FC<DecisionComponentProps> = () => {
      throw new Error('boom');
    };
    const unregister = registerDecisionComponent({ componentId: 'broken', component: Broken });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(
        <AwaitingPane
          awaiting={{ question: 'Q?', component: { componentId: 'broken' } }}
          onDecision={() => {}}
        />,
      );
      expect(screen.getByTestId('hitl-component-crashed').textContent).toContain('broken');
      expect(screen.getByTestId('hitl-answer-box')).toBeTruthy();
    } finally {
      spy.mockRestore();
      unregister();
    }
  });
});

describe('<AwaitingPane> — consent gates', () => {
  const CHECK_IN: PendingAskView = {
    sessionId: 's-1',
    tool: 'transfer_money',
    question: 'Transfer $900?',
    checkIn: { tool: 'transfer_money' },
    pauseData: {},
  };

  it('falls back to Approve/Decline + actor, and posts the consent record', () => {
    const decisions: unknown[] = [];
    render(<AwaitingPane awaiting={CHECK_IN} onDecision={(d) => decisions.push(d)} />);
    // The buttons stay disabled until an actor is named — stated.
    const approve = screen.getByTestId('hitl-consent-approve') as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(screen.getByTestId('hitl-consent-needs-by')).toBeTruthy();
    fireEvent.change(screen.getByTestId('hitl-consent-by'), { target: { value: 'alice@ops' } });
    fireEvent.change(screen.getByTestId('hitl-consent-note'), { target: { value: 'verified' } });
    fireEvent.click(screen.getByTestId('hitl-consent-approve'));
    const decision = decisions[0] as ConsentDecisionView;
    expect(decision).toMatchObject({ approved: true, by: 'alice@ops', note: 'verified' });
    expect(typeof decision.at).toBe('number');
    expect(screen.getByTestId('hitl-decision-sentence').textContent).toBe(
      'Approved by alice@ops — "verified".',
    );
  });

  it('a middleware ask declines with the same vocabulary, prefilled from decidedBy', () => {
    const decisions: unknown[] = [];
    render(
      <AwaitingPane
        awaiting={{ ask: { question: 'Proceed?', middleware: 'guard' } }}
        decidedBy="bob"
        onDecision={(d) => decisions.push(d)}
      />,
    );
    // The middleware ask's question is read from awaiting.ask.question.
    expect(screen.getByTestId('hitl-question').textContent).toBe('Proceed?');
    fireEvent.click(screen.getByTestId('hitl-consent-decline'));
    expect(decisions[0]).toMatchObject({ approved: false, by: 'bob' });
    expect(screen.getByTestId('hitl-decision-sentence').textContent).toBe('Declined by bob.');
  });
});
