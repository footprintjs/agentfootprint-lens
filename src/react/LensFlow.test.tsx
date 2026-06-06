/**
 * LensFlow — 7-pattern test matrix.
 *
 * LensFlow is a thin xyflow shell over a CONSUMER-SUPPLIED chart (built with
 * `structureGraphFromRunner` — the one runner→graph path). Tests focus on:
 * (a) it mounts without crashing for a chart from any composition kind,
 * (b) it forwards / merges consumer node renderers, (c) it hides the xyflow
 * attribution badge.
 *
 * xyflow's <ReactFlow> uses ResizeObserver under the hood; the jsdom polyfill is
 * configured globally in the test setup, so we only need to mount + assert.
 */

import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { LLMCall, Sequence, Parallel, type LLMProvider } from 'agentfootprint';
import type { NodeTypes } from '@xyflow/react';
import type { TraceGraph, TraceFlowLayout } from 'footprint-explainable-ui/flowchart';
import { LensFlow } from './LensFlow.js';
import { structureGraphFromRunner } from '../core/collapser/structureGraphFromRunner.js';

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

/** A chart for a runner: the real structure graph + a passthrough layout
 *  (identity — keeps nodes at their authored positions; layout correctness is
 *  exercised in the explainable-ui layout tests, not here). */
const passthrough: TraceFlowLayout = (g) => g;
const chartFor = (runner: Parameters<typeof structureGraphFromRunner>[0]) => ({
  graph: structureGraphFromRunner(runner),
  layout: passthrough,
});

// ── 1. Unit ───────────────────────────────────────────────────────

describe('LensFlow — unit', () => {
  it('mounts an LLMCall chart without throwing', () => {
    const { container } = render(<LensFlow chart={chartFor(buildLLMCall())} />);
    expect(container.querySelector('.react-flow')).toBeTruthy();
  });

  it('renders the chart nodes from the supplied graph', () => {
    const chart = chartFor(buildLLMCall());
    const { container } = render(<LensFlow chart={chart} />);
    // Every node in the graph becomes a `.react-flow__node` in the DOM.
    expect(container.querySelectorAll('.react-flow__node').length).toBe(chart.graph.nodes.length);
  });
});

// ── 2. Functional ─────────────────────────────────────────────────

describe('LensFlow — functional', () => {
  it('mounts a Sequence composition chart', () => {
    const { container } = render(<LensFlow chart={chartFor(buildSeq())} />);
    expect(container.querySelector('.react-flow')).toBeTruthy();
  });

  it('mounts a Parallel composition chart', () => {
    const { container } = render(<LensFlow chart={chartFor(buildPar())} />);
    expect(container.querySelector('.react-flow')).toBeTruthy();
  });
});

// ── 3. Integration ────────────────────────────────────────────────

const markerChart = (nodeTypes?: NodeTypes) => ({
  graph: {
    nodes: [{ id: 'n1', type: 'custom', position: { x: 0, y: 0 }, data: { label: 'N1' } }],
    edges: [],
  } as unknown as TraceGraph,
  layout: passthrough,
  ...(nodeTypes ? { nodeTypes } : {}),
});

describe('LensFlow — integration', () => {
  it('honours a consumer-supplied nodeTypes override (merged over chart.nodeTypes)', () => {
    const Marker = () => <div data-testid="consumer-node">custom</div>;
    const { getAllByTestId } = render(
      <LensFlow chart={markerChart()} nodeTypes={{ custom: Marker }} />,
    );
    expect(getAllByTestId('consumer-node').length).toBeGreaterThanOrEqual(1);
  });

  it('consumer nodeTypes win over chart.nodeTypes for the same key', () => {
    const ChartDefault = () => <div data-testid="chart-default">default</div>;
    const Override = () => <div data-testid="override">override</div>;
    const { queryByTestId } = render(
      <LensFlow chart={markerChart({ custom: ChartDefault })} nodeTypes={{ custom: Override }} />,
    );
    expect(queryByTestId('override')).toBeTruthy();
    expect(queryByTestId('chart-default')).toBeNull();
  });

  it('does NOT remount the consumer node component on parent re-render (memoised nodeTypes)', () => {
    let mountCount = 0;
    const Tracker = () => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      React.useEffect(() => {
        mountCount += 1;
      }, []);
      return <div data-testid="tracker">tracker</div>;
    };
    const nodeTypes = { custom: Tracker };
    const chart = markerChart();
    const { rerender } = render(<LensFlow chart={chart} nodeTypes={nodeTypes} />);
    const after1 = mountCount;
    rerender(<LensFlow chart={chart} nodeTypes={nodeTypes} />);
    rerender(<LensFlow chart={chart} nodeTypes={nodeTypes} />);
    expect(mountCount).toBe(after1);
  });
});

// ── 4. Property ───────────────────────────────────────────────────

describe('LensFlow — property', () => {
  it.each([
    ['LLMCall', buildLLMCall],
    ['Sequence', buildSeq],
    ['Parallel', buildPar],
  ] as const)('mounts a %s chart without throwing', (_kind, factory) => {
    expect(() => render(<LensFlow chart={chartFor(factory())} />)).not.toThrow();
  });
});

// ── 5. Security ───────────────────────────────────────────────────

describe('LensFlow — security', () => {
  it('forwards proOptions.hideAttribution by default (no third-party badge)', () => {
    const { container } = render(<LensFlow chart={chartFor(buildLLMCall())} />);
    expect(container.querySelector('.react-flow__attribution')).toBeNull();
  });
});

// ── 6. Performance ────────────────────────────────────────────────

describe('LensFlow — performance', () => {
  it('mounts a 4-branch Parallel chart under 500ms', () => {
    let b = Parallel.create({ id: 'par', name: 'Big' });
    for (const id of ['a', 'b', 'c', 'd']) {
      b = b.branch(id, buildLLMCall(`${id}-call`));
    }
    const runner = b.mergeWithFn((r) => Object.values(r).join(' / ')).build();
    const t0 = performance.now();
    render(<LensFlow chart={chartFor(runner)} />);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

// ── 7. ROI ────────────────────────────────────────────────────────

describe('LensFlow — ROI', () => {
  it('one component covers every composition kind via the same chart prop', () => {
    for (const runner of [buildLLMCall(), buildSeq(), buildPar()]) {
      const { container } = render(<LensFlow chart={chartFor(runner)} />);
      expect(container.querySelector('.react-flow')).toBeTruthy();
    }
  });
});
