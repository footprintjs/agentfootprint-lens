/**
 * LensFlow — 7-pattern test matrix.
 *
 * The component is a thin xyflow shell over `useLensRenderGraph`. Tests
 * focus on: (a) it mounts without crashing on each composition kind,
 * (b) it forwards consumer overrides, (c) it does not throw at render
 * for valid runners.
 *
 * xyflow's <ReactFlow> uses ResizeObserver under the hood; the
 * jsdom polyfill is configured globally in the test setup, so we
 * only need to mount and assert on Lens-specific outputs.
 */

import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { LLMCall, Sequence, Parallel, type LLMProvider } from 'agentfootprint';
import { LensFlow } from './LensFlow.js';

// Minimal LLMProvider stub. We mount the component but never run it.
const stubProvider = { name: 'mock' } as unknown as LLMProvider;

const buildLLMCall = (id = 'call', name = 'Call') =>
  LLMCall.create({ id, name, provider: stubProvider, model: 'mock' })
    .system('test')
    .build();

const buildSeq = () =>
  Sequence.create({ id: 'seq', name: 'Pipeline' })
    .step('classify', buildLLMCall('classify-call', 'Classify'))
    .step('respond', buildLLMCall('respond-call', 'Respond'))
    .build();

const buildPar = () =>
  Parallel.create({ id: 'par', name: 'Committee' })
    .branch('legal', buildLLMCall('legal-call'))
    .branch('ops', buildLLMCall('ops-call'))
    .mergeWithFn((r) => Object.values(r).join(' / '))
    .build();

// ── 1. Unit ───────────────────────────────────────────────────────

describe('LensFlow — unit', () => {
  it('mounts a single LLMCall runner without throwing', () => {
    const { container } = render(<LensFlow runner={buildLLMCall()} />);
    expect(container).toBeTruthy();
  });

  it('renders the stage label in the default lensStage card', () => {
    const { getByText } = render(<LensFlow runner={buildLLMCall()} />);
    // The default renderer puts the LLMCall name inside the card.
    expect(getByText('Call')).toBeTruthy();
    // ...and the kind chip above it.
    expect(getByText('LLMCall')).toBeTruthy();
  });
});

// ── 2. Functional ─────────────────────────────────────────────────

describe('LensFlow — functional', () => {
  it('mounts a Sequence composition and shows every step label', () => {
    const { getByText } = render(<LensFlow runner={buildSeq()} />);
    // Step labels come from each member LLMCall's `name` (translator
    // maps metadata.name → LensNode.label → renderer card).
    expect(getByText('Classify')).toBeTruthy();
    expect(getByText('Respond')).toBeTruthy();
  });

  it('mounts a Parallel composition and renders the container', () => {
    const { container } = render(<LensFlow runner={buildPar()} />);
    // Parallel container is rendered as an xyflow group node — xyflow's
    // default group rendering puts the container in the DOM as a
    // wrapper element. We assert the test environment didn't throw
    // and we got SOME DOM back.
    expect(container.querySelector('.react-flow')).toBeTruthy();
  });
});

// ── 3. Integration ────────────────────────────────────────────────

describe('LensFlow — integration', () => {
  it('honours a consumer-supplied nodeTypes override', () => {
    const Marker = () => <div data-testid="consumer-node">custom</div>;
    const { getAllByTestId } = render(
      <LensFlow
        runner={buildLLMCall()}
        nodeTypes={{ lensStage: Marker }}
      />,
    );
    expect(getAllByTestId('consumer-node').length).toBe(1);
  });

  it('does NOT remount the consumer node component on parent re-render (memoised nodeTypes)', () => {
    // Regression for the xyflow antipattern of rebuilding nodeTypes
    // on every render — when triggered, every custom node remounts,
    // losing any internal state. We assert by mounting a renderer that
    // tracks mount count via a module-level counter and rerendering
    // the parent without changing nodeTypes identity.
    let mountCount = 0;
    const Tracker = () => {
      // Increment on every mount (React StrictMode would double it,
      // but the test env runs once per real mount).
      // eslint-disable-next-line react-hooks/rules-of-hooks
      React.useEffect(() => {
        mountCount += 1;
      }, []);
      return <div data-testid="tracker">tracker</div>;
    };
    const nodeTypes = { lensStage: Tracker };
    const runner = buildLLMCall();
    const { rerender } = render(
      <LensFlow runner={runner} nodeTypes={nodeTypes} />,
    );
    const after1 = mountCount;
    rerender(<LensFlow runner={runner} nodeTypes={nodeTypes} />);
    rerender(<LensFlow runner={runner} nodeTypes={nodeTypes} />);
    // No additional mounts — the Tracker should stay mounted across
    // re-renders because nodeTypes identity is stable.
    expect(mountCount).toBe(after1);
  });
});

// ── 4. Property ───────────────────────────────────────────────────

describe('LensFlow — property', () => {
  it.each([
    ['LLMCall', buildLLMCall],
    ['Sequence', buildSeq],
    ['Parallel', buildPar],
  ] as const)('mounts %s composition without throwing', (_kind, factory) => {
    expect(() => render(<LensFlow runner={factory()} />)).not.toThrow();
  });
});

// ── 5. Security ───────────────────────────────────────────────────

describe('LensFlow — security', () => {
  it('forwards proOptions.hideAttribution by default (no third-party badge)', () => {
    // ReactFlow injects a "React Flow" attribution badge unless
    // hideAttribution is set. Lens passes hideAttribution: true so
    // consumer flows don't surface third-party branding.
    const { container } = render(<LensFlow runner={buildLLMCall()} />);
    const attribution = container.querySelector('.react-flow__attribution');
    expect(attribution).toBeNull();
  });
});

// ── 6. Performance ────────────────────────────────────────────────

describe('LensFlow — performance', () => {
  it('mounts a 4-branch Parallel composition under 500ms', () => {
    let b = Parallel.create({ id: 'par', name: 'Big' });
    for (const id of ['a', 'b', 'c', 'd']) {
      b = b.branch(id, buildLLMCall(`${id}-call`));
    }
    const runner = b.mergeWithFn((r) => Object.values(r).join(' / ')).build();
    const t0 = performance.now();
    render(<LensFlow runner={runner} />);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

// ── 7. ROI ────────────────────────────────────────────────────────

describe('LensFlow — ROI', () => {
  it('one component covers every composition kind without per-kind props', () => {
    for (const runner of [buildLLMCall(), buildSeq(), buildPar()]) {
      const { container } = render(<LensFlow runner={runner} />);
      expect(container.querySelector('.react-flow')).toBeTruthy();
    }
  });
});
