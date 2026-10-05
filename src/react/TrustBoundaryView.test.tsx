import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
