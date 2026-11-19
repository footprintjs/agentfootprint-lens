import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TrustBoundaryView } from './TrustBoundaryView.js';
import { useSharedCursor } from './useSharedCursor.js';
import { lensRecorder } from '../core/LensRecorder.js';
import { Lens } from './Lens.js';

function fixture() {
  const position = {
    engineRunId: 'leg',
    logRunId: 'leg',
    drillPath: [] as string[],
    committedThroughIdx: -1,
  };
  const facts = [
    {
      eventType: 'agentfootprint.middleware.decision',
      middleware: 'policy',
      moment: 'after-tool',
      outcome: 'deny',
      changed: true,
      iteration: 1,
    },
    { eventType: 'agentfootprint.permission.check', capability: 'tool_call', result: 'allow' },
    { eventType: 'agentfootprint.permission.halt', target: 'calculate', iteration: 1 },
    { eventType: 'agentfootprint.credential.requested', service: 'quotes' },
    { eventType: 'agentfootprint.credential.acquired', service: 'quotes', kind: 'bearer' },
    { eventType: 'agentfootprint.credential.authorization_required', service: 'quotes' },
    { eventType: 'agentfootprint.credential.failed', service: 'quotes', errorClass: 'Unavailable' },
  ].map((specific, index) => ({
    seq: index + 1,
    runId: 'agent-leg',
    runtimeStageId: 'emit#0',
    wallClockMs: 1,
    sourcePosition: position,
    ...specific,
  }));
  return {
    runId: 'leg',
    logAddress: { logRunId: 'leg', drillPath: [] },
    stateValuesWithheld: true,
    initialState: { privateValue: 'BASE_STATE_CANARY' },
    commitLog: [
      { idx: 0, runtimeStageId: 'emit#0', updates: { privateValue: 'FUTURE_STATE_CANARY' } },
    ],
    recorders: [
      {
        id: 'trust',
        name: 'TrustBoundaries',
        meta: { version: 1 },
        data: {
          captureId: 'window',
          facts,
          counters: { observed: 7, retained: 7, evicted: 0, invalid: 0, oversized: 0, pending: 0 },
          firstObservedSeq: 1,
          lastObservedSeq: 7,
          firstRetainedSeq: 1,
          lastRetainedSeq: 7,
        },
      },
    ],
  };
}

describe('TrustBoundaryView', () => {
  it('reads Trust facts only when its shell disclosure opens and reuses the displayed evidence', async () => {
    let snapshot = fixture();
    let reads = 0;
    const facts = snapshot.recorders[0]!.data.facts;
    facts[0] = new Proxy(facts[0]!, {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'changed') reads++;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    const recorder = lensRecorder();
    vi.spyOn(recorder, 'observedRunner').mockReturnValue(
      { getLastSnapshot: () => snapshot } as unknown as ReturnType<typeof recorder.observedRunner>,
    );
    const view = () => <Lens recorder={recorder} view="user" />;
    const { rerender } = render(view());
    const summary = screen.getByText('Trust boundaries', { selector: 'summary' });
    summary.focus();
    expect(summary).toHaveFocus();
    expect(reads).toBe(0);
    fireEvent.click(summary);
    await waitFor(() => expect(screen.getByText('Middleware deny')).toBeVisible());
    expect(reads).toBe(1);
    rerender(view());
    expect(reads).toBe(1);
    fireEvent.click(summary);
    await waitFor(() => expect(summary.parentElement).not.toHaveAttribute('open'));
    fireEvent.click(summary);
    await waitFor(() => expect(screen.getByText('Middleware deny')).toBeVisible());
    expect(reads).toBe(1);
    expect(summary).toHaveFocus();
    const updated = fixture();
    Object.assign(updated.recorders[0]!.data.facts[0]!, { outcome: 'allow' });
    snapshot = updated;
    rerender(view());
    expect(screen.getByText('Middleware allow')).toBeVisible();
    expect(screen.queryByText('Middleware deny')).toBeNull();
    fireEvent.click(summary);
    await waitFor(() => expect(summary.parentElement).not.toHaveAttribute('open'));
    snapshot = { ...snapshot, recorders: [] };
    rerender(view());
    expect(screen.queryByText('Trust boundaries', { selector: 'summary' })).toBeNull();
    expect(screen.queryByText('Middleware deny')).toBeNull();
  });

  it.each(['deny', 'halt'])('shows the human answer and later permission %s for the same recorded call', result => {
    const snapshot = fixture();
    const [human, rule] = snapshot.recorders[0]!.data.facts;
    Object.assign(human!, { moment: 'before-tool', outcome: 'allow', personApproved: true, toolCallId: 'one' });
    Object.assign(rule!, { result, phase: 'resume', toolCallId: 'one', iteration: 1 });
    const { rerender } = render(<TrustBoundaryView snapshot={snapshot} />);
    expect(screen.getByText('A person approved this call.')).toBeVisible();
    expect(screen.getByText('A person approved this call, then a rule refused it.')).toBeVisible();
    expect(screen.getByText(new RegExp(`recorded result: ${result}`, 'i'))).toBeVisible();

    for (const mismatch of [{ toolCallId: 'two' }, { runId: 'other' }, { iteration: 2 }]) {
      const other = structuredClone(snapshot);
      Object.assign(other.recorders[0]!.data.facts[1]!, mismatch);
      rerender(<TrustBoundaryView snapshot={other} />);
      expect(screen.queryByText(/then a rule refused it/i)).toBeNull();
      expect(screen.getByText('A rule refused this call on resume.')).toBeVisible();
    }
  });

  it('shows a combined resume denial, a personal decline, and legacy middleware on their own evidence', () => {
    const snapshot = fixture();
    const decision = snapshot.recorders[0]!.data.facts[0]!;
    Object.assign(decision, { moment: 'before-tool', phase: 'resume', personApproved: true });
    const { rerender } = render(<TrustBoundaryView snapshot={snapshot} />);
    expect(screen.getByText('A person approved this call, then a rule refused it.')).toBeVisible();

    Reflect.deleteProperty(decision, 'phase');
    Object.assign(decision, { personApproved: false });
    rerender(<TrustBoundaryView snapshot={{ ...snapshot }} />);
    expect(screen.getByText('A person declined this call.')).toBeVisible();

    Reflect.deleteProperty(decision, 'personApproved');
    rerender(<TrustBoundaryView snapshot={{ ...snapshot }} />);
    expect(screen.getByText('Middleware deny')).toBeVisible();
    expect(screen.queryByText(/a person (approved|declined)/i)).toBeNull();
  });

  it('shows an unexecuted resume refusal only as a refusal, and never borrows a missing human decision', () => {
    const snapshot = fixture();
    const data = snapshot.recorders[0]!.data;
    const [human, rule] = data.facts;
    Object.assign(human!, { moment: 'before-tool', outcome: 'allow', personApproved: true, toolCallId: 'one' });
    Object.assign(rule!, { eventType: 'agentfootprint.middleware.decision', middleware: 'agentfootprint', moment: 'before-tool',
      outcome: 'refused', changed: false, phase: 'resume', iteration: 1, toolCallId: 'one' });
    const { rerender } = render(<TrustBoundaryView snapshot={snapshot} />);
    expect(screen.getByText('A person approved this call, then the call was refused on resume.')).toBeVisible();

    // A missing observation may be a newer human answer. Keep the refusal by itself.
    data.facts.slice(1).forEach(row => row.seq++);
    data.counters.observed++;
    data.counters.invalid++;
    data.lastObservedSeq++;
    data.lastRetainedSeq++;
    rerender(<TrustBoundaryView snapshot={{ ...snapshot }} />);
    expect(screen.getByText('The call was refused on resume.')).toBeVisible();
    expect(screen.queryByText(/then the call was refused/i)).toBeNull();
  });

  it('renders all seven event kinds without a safe badge or raw state', () => {
    const snapshot = fixture();
    Object.assign(snapshot.recorders[0]!.data.facts[0]!, {
      reason: 'REASON_CANARY',
      token: 'TOKEN_CANARY',
    });
    const { container } = render(<TrustBoundaryView snapshot={snapshot} />);
    for (const title of [
      'Middleware deny',
      'Permission allow',
      'Permission halt',
      'Credential requested',
      'Credential acquired',
      'Credential authorization required',
      'Credential failed',
    ]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(container.textContent).toContain('Coverage is unknown');
    expect(container.textContent).toContain('Changed is not proof of redaction');
    expect(container.textContent).toContain('does not mean the tool was prevented');
    expect(container.textContent).not.toContain('CANARY');
  });

  it('reports absent and future-version evidence honestly', () => {
    const { rerender } = render(<TrustBoundaryView snapshot={{}} />);
    expect(screen.getByRole('status')).toHaveTextContent('No trust boundary capture');
    const snapshot = fixture();
    snapshot.recorders[0]!.meta.version = 2;
    rerender(<TrustBoundaryView snapshot={snapshot} />);
    expect(screen.getByRole('status')).toHaveTextContent('unsupported version');
    expect(screen.queryByText('Middleware deny')).toBeNull();
  });

  it('keeps an unplaced fact visible when its source position was not recorded', () => {
    const snapshot = fixture();
    Reflect.deleteProperty(snapshot.recorders[0]!.data.facts[0]!, 'sourcePosition');
    render(<TrustBoundaryView snapshot={snapshot} />);
    expect(
      screen.getByText('Unplaced: no authoritative source position was recorded.'),
    ).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Inspect source prefix' })[0]).toBeDisabled();
  });

  it('supports legacy shared cursor objects without offering a crashing source jump', () => {
    function Host() {
      const { address, forAxis, over, moveTo, onStepChange } = useSharedCursor(undefined);
      return (
        <TrustBoundaryView
          snapshot={fixture()}
          shared={{ address, forAxis, over, moveTo, onStepChange }}
        />
      );
    }
    render(<Host />);
    expect(screen.getByText('Middleware deny')).toBeTruthy();
    for (const button of screen.getAllByRole('button', { name: 'Inspect source prefix' }))
      expect(button).toBeDisabled();
    expect(
      screen.getAllByText('Source-prefix navigation is unavailable for this cursor.'),
    ).toHaveLength(7);
  });

  it('reports loss and pending counts without fabricating decisions', () => {
    const snapshot = fixture();
    const data = snapshot.recorders[0]!.data;
    data.facts = data.facts.slice(3);
    data.counters = { observed: 7, retained: 4, evicted: 1, invalid: 1, oversized: 0, pending: 1 };
    data.firstRetainedSeq = 4;
    const { container } = render(<TrustBoundaryView snapshot={snapshot} />);
    expect(container.textContent).toContain('evicted 1 · invalid 1 · oversized 0 · pending 1');
    expect(screen.getByRole('status')).toHaveTextContent('not a complete list');
    expect(screen.queryByText('Middleware deny')).toBeNull();
  });

  it('selects exact -1 without stage fallback; unavailable next fact leaves the target unchanged', () => {
    const snapshot = fixture();
    snapshot.recorders[0]!.data.facts[1]!.sourcePosition = {
      ...snapshot.recorders[0]!.data.facts[1]!.sourcePosition,
      logRunId: 'other-log',
    };
    function Host() {
      const shared = useSharedCursor(undefined, snapshot);
      return (
        <>
          <span data-testid="target">{JSON.stringify(shared.target)}</span>
          <TrustBoundaryView snapshot={snapshot} shared={shared} />
        </>
      );
    }
    render(<Host />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Inspect source prefix' })[0]!);
    const selected = screen.getByTestId('target').textContent;
    expect(selected).toContain('"committedThroughIdx":-1');
    expect(screen.getByRole('status')).toHaveTextContent('State values were withheld');
    fireEvent.click(screen.getAllByRole('button', { name: 'Inspect source prefix' })[1]!);
    expect(screen.getByRole('status')).toHaveTextContent('Unplaced:');
    expect(screen.getByTestId('target').textContent).toBe(selected);
  });

  it('Lens uses a source-only shell across tab modes, never clamping or mounting future detail', () => {
    const snapshot = fixture();
    const recorder = lensRecorder();
    const detail = vi.fn(() => <div>FUTURE_DETAIL_CANARY</div>);
    const moved = vi.fn();
    function Host({ view }: { view: 'engineer' | 'analyst' }) {
      const shared = useSharedCursor(recorder, snapshot);
      return (
        <>
          <button
            onClick={() =>
              shared.selectSourcePrefix(snapshot.recorders[0]!.data.facts[0]!.sourcePosition)
            }
          >
            Choose prefix
          </button>
          <span data-testid="target">{JSON.stringify(shared.target)}</span>
          {shared.target && (
            <Lens
              recorder={recorder}
              theme={{ mode: 'light' }}
              view={view}
              shared={shared}
              slots={{ detail }}
              onStepChange={moved}
            />
          )}
        </>
      );
    }
    const { rerender, container } = render(<Host view="engineer" />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose prefix' }));
    detail.mockClear();
    moved.mockClear();
    expect(screen.getByRole('region', { name: 'Source prefix' })).toBeTruthy();
    expect(
      screen
        .getByRole('region', { name: 'Source prefix' })
        .style.getPropertyValue('--fp-bg-primary'),
    ).not.toBe('');
    expect(container.textContent).toContain('not step 0');
    expect(container.textContent).not.toContain('CANARY');
    const target = screen.getByTestId('target').textContent;
    rerender(<Host view="analyst" />);
    expect(screen.getByTestId('target').textContent).toBe(target);
    expect(detail).not.toHaveBeenCalled();
    expect(moved).not.toHaveBeenCalled();
  });
});
