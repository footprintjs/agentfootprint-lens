/** @vitest-environment jsdom */
/**
 * <ArtifactPane> — #REF! taught manners, pinned.
 *
 *   • live path: head → get → the REGISTERED component for the kind, with the
 *     payload as props (ids + props, never model markup).
 *   • absent path: the placeholder is rendered FROM THE SNAPSHOT ALONE — the
 *     resolver's `get` is provably never called for its text.
 *   • unknown-kind honesty: a live artifact nothing is registered for renders
 *     the metadata card PLUS a stated line naming the gap and the register
 *     call that closes it — never a blank pane.
 *   • failed path: the door's own sentence, verbatim.
 *   • no resolver: stated, over the snapshot's facts.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type {
  ArtifactMetaView,
  ArtifactResolution,
  ArtifactResolver,
  PresentedCallView,
} from '../../core/artifacts/types.js';
import { ArtifactPane } from './ArtifactPane.js';
import { registerArtifactComponent, type ArtifactComponentProps } from './registry.js';

const PRESENTED: PresentedCallView = {
  ref: 'art_h7Kq2v',
  as: 'bar-chart',
  snapshot: {
    kind: 'chart/spec',
    mediaType: 'application/json',
    bytes: 41984,
    label: 'Q3 sales by region',
  },
  toolCallId: 't1',
};

const META: ArtifactMetaView = {
  ref: PRESENTED.ref,
  kind: 'chart/spec',
  mediaType: 'application/json',
  bytes: 41984,
  label: 'Q3 sales by region',
};

/** A scriptable resolver that counts every call. */
function fakeResolver(script: { head: ArtifactResolution; get?: ArtifactResolution }) {
  const calls = { head: 0, get: 0 };
  const resolver: ArtifactResolver = {
    head: async () => {
      calls.head += 1;
      return script.head;
    },
    get: async () => {
      calls.get += 1;
      return script.get ?? { status: 'failed', message: 'get was not scripted' };
    },
  };
  return { resolver, calls };
}

describe('<ArtifactPane> — live render path', () => {
  it('heads then gets, and renders the registered component with the payload', async () => {
    const seen: ArtifactComponentProps[] = [];
    const Chart: React.FC<ArtifactComponentProps> = (props) => {
      seen.push(props);
      return <div data-testid="custom-chart">chart for {props.meta.label}</div>;
    };
    const unregister = registerArtifactComponent({ kind: 'chart/spec', component: Chart });
    const { resolver, calls } = fakeResolver({
      head: { status: 'live', meta: META },
      get: { status: 'live', meta: META, data: { type: 'bar', series: { west: 130 } } },
    });
    try {
      render(<ArtifactPane presented={PRESENTED} resolver={resolver} />);
      await screen.findByTestId('custom-chart');
      expect(calls).toEqual({ head: 1, get: 1 });
      expect(seen[0]!.data).toEqual({ type: 'bar', series: { west: 130 } });
      expect(seen[0]!.meta).toEqual(META);
      expect(seen[0]!.presented).toEqual(PRESENTED);
    } finally {
      unregister();
    }
  });

  it('states a registered component that throws — the artifact is live, the renderer is not', async () => {
    const Exploding: React.FC<ArtifactComponentProps> = () => {
      throw new Error('renderer bug');
    };
    const unregister = registerArtifactComponent({ kind: 'chart/spec', component: Exploding });
    const { resolver } = fakeResolver({
      head: { status: 'live', meta: META },
      get: { status: 'live', meta: META, data: {} },
    });
    try {
      render(<ArtifactPane presented={PRESENTED} resolver={resolver} />);
      const stated = await screen.findByTestId('artifact-component-crashed');
      expect(stated.textContent).toContain('kind ‘chart/spec’');
      expect(stated.textContent).toContain(META.ref);
    } finally {
      unregister();
    }
  });
});

describe('<ArtifactPane> — the honest placeholder (absent)', () => {
  it('renders the stated absence from the snapshot ALONE — get is never called', async () => {
    const { resolver, calls } = fakeResolver({ head: { status: 'absent' } });
    render(<ArtifactPane presented={PRESENTED} resolver={resolver} />);
    const placeholder = await screen.findByTestId('artifact-placeholder');
    expect(placeholder.textContent).toBe(
      'Chart — "Q3 sales by region" (bar-chart, 41.0 KB) — expired; re-run to regenerate.',
    );
    expect(calls.head).toBe(1);
    expect(calls.get).toBe(0); // the placeholder needs NO store round-trip beyond the failed head
  });

  it('renders the same placeholder when the ref expires between head and get', async () => {
    const { resolver } = fakeResolver({
      head: { status: 'live', meta: META },
      get: { status: 'absent' },
    });
    render(<ArtifactPane presented={PRESENTED} resolver={resolver} />);
    const placeholder = await screen.findByTestId('artifact-placeholder');
    expect(placeholder.textContent).toContain('expired; re-run to regenerate');
  });
});

describe('<ArtifactPane> — unknown-kind honesty (the fallback card)', () => {
  it('renders the metadata card plus a line naming the gap and the register call', async () => {
    const blob: ArtifactMetaView = { ...META, kind: 'mystery/blob' };
    const { resolver } = fakeResolver({
      head: { status: 'live', meta: blob },
      get: { status: 'live', meta: blob, data: { opaque: true } },
    });
    render(<ArtifactPane presented={PRESENTED} resolver={resolver} />);
    const stated = await screen.findByTestId('artifact-unknown-kind');
    expect(stated.textContent).toContain(
      'No component is registered for kind ‘mystery/blob’',
    );
    expect(stated.textContent).toContain('registerArtifactComponent');
    // The card underneath: meta facts + payload affordances, never a blank pane.
    const card = screen.getByTestId('artifact-meta-card');
    expect(card.textContent).toContain('mystery/blob');
    expect(card.textContent).toContain(PRESENTED.ref);
    expect(screen.getByTestId('artifact-card-preview').textContent).toContain('"opaque": true');
    expect(screen.getByTestId('artifact-card-copy')).toBeTruthy();
    expect(screen.getByTestId('artifact-card-download')).toBeTruthy();
  });
});

describe('<ArtifactPane> — failed and unconfigured doors', () => {
  it("shows the door's refusal verbatim under the descriptive head", async () => {
    const teaching =
      'this agent has no artifact store — attach one with Agent.create({ artifacts })';
    const { resolver, calls } = fakeResolver({
      head: { status: 'failed', message: teaching, code: 'ERR_NO_ARTIFACT_STORE' },
    });
    render(<ArtifactPane presented={PRESENTED} resolver={resolver} />);
    const failed = await screen.findByTestId('artifact-failed');
    expect(failed.textContent).toContain('Chart — "Q3 sales by region" (bar-chart, 41.0 KB)');
    expect(failed.textContent).toContain(teaching);
    expect(calls.get).toBe(0);
  });

  it('states a missing resolver over the snapshot facts instead of pretending', () => {
    render(<ArtifactPane presented={PRESENTED} />);
    const stated = screen.getByTestId('artifact-no-resolver');
    expect(stated.textContent).toContain('Chart — "Q3 sales by region"');
    expect(stated.textContent).toContain('no resolver was given');
  });

  it('states a resolver that throws instead of answering', async () => {
    const throwing: ArtifactResolver = {
      head: async () => {
        throw new Error('hand-rolled resolver bug');
      },
      get: async () => {
        throw new Error('unreached');
      },
    };
    render(<ArtifactPane presented={PRESENTED} resolver={throwing} />);
    const failed = await screen.findByTestId('artifact-failed');
    expect(failed.textContent).toContain('hand-rolled resolver bug');
  });

  it('shows the snapshot facts while the head is in flight — no naked spinner', async () => {
    let release: (value: ArtifactResolution) => void = () => {};
    const resolver: ArtifactResolver = {
      head: () => new Promise<ArtifactResolution>((resolve) => (release = resolve)),
      get: async () => ({ status: 'absent' }),
    };
    render(<ArtifactPane presented={PRESENTED} resolver={resolver} />);
    const redeeming = screen.getByTestId('artifact-redeeming');
    expect(redeeming.textContent).toContain('Chart — "Q3 sales by region"');
    release({ status: 'absent' });
    await waitFor(() => expect(screen.getByTestId('artifact-placeholder')).toBeTruthy());
  });
});
