/**
 * <ArtifactPane> — render by ref, with `#REF!` taught manners.
 *
 * Given one `present` call (lifted from a recording's events or a
 * conversation transcript — `presentedFromEvents` / `readPresentedResult`),
 * the pane redeems the ref through an {@link ArtifactResolver}:
 *
 *   head → LIVE    → get → the REGISTERED component for the artifact's kind
 *                    (`registerArtifactComponent`); a kind nothing is
 *                    registered for renders the honest metadata card plus a
 *                    line naming the gap.
 *        → ABSENT  → the stated absence, rendered from the speak-time
 *                    snapshot ALONE — no store round-trip beyond the failed
 *                    head:
 *                    `Chart — "Q3 sales by region" (bar-chart, 41.0 KB) —
 *                     expired; re-run to regenerate.`
 *        → FAILED  → the door's own refusal, verbatim, under the same
 *                    descriptive head.
 *
 * Never a blank pane, never a crash (a throwing registered component is
 * caught and stated), never a stale substitute: while the head is in flight
 * the pane already shows the snapshot's facts, so there is no spinner that
 * spins forever with nothing behind it.
 *
 * @example
 * ```tsx
 * const resolver = httpArtifactResolver({ url: '/invoke', sessionId });
 * const presented = presentedFromEvents(recording.events);
 * {presented.map((call) => (
 *   <ArtifactPane key={call.toolCallId ?? call.ref} presented={call} resolver={resolver} />
 * ))}
 * ```
 */

import React from 'react';
import { artifactPlaceholder, describePresented } from '../../core/artifacts/presented.js';
import type {
  ArtifactMetaView,
  ArtifactResolver,
  PresentedCallView,
} from '../../core/artifacts/types.js';
import { LensChartBoundary } from '../LensChartBoundary.js';
import { ensureLensStyles } from '../lensStyles.js';
import { ArtifactMetaCard } from './ArtifactMetaCard.js';
import { artifactComponentFor } from './registry.js';

export interface ArtifactPaneProps {
  /** The `present` call this pane renders — ref, `as`, and the speak-time
   *  snapshot the placeholder lives on. */
  readonly presented: PresentedCallView;
  /**
   * How to redeem the ref — `httpArtifactResolver` against a served agent
   * (session identity on every request) or `storeArtifactResolver` for a
   * same-process store. Without one the pane cannot redeem, and SAYS so
   * over the snapshot's facts instead of pretending.
   */
  readonly resolver?: ArtifactResolver;
}

type PaneState =
  | { readonly phase: 'redeeming' }
  | { readonly phase: 'absent' }
  | { readonly phase: 'failed'; readonly message: string }
  | { readonly phase: 'live'; readonly meta: ArtifactMetaView; readonly data: unknown };

export const ArtifactPane: React.FC<ArtifactPaneProps> = ({ presented, resolver }) => {
  ensureLensStyles();
  const [state, setState] = React.useState<PaneState>({ phase: 'redeeming' });

  React.useEffect(() => {
    if (!resolver) return;
    let alive = true;
    const settle = (next: PaneState): void => {
      if (alive) setState(next);
    };
    setState({ phase: 'redeeming' });
    (async () => {
      // head first — the render decision. The absent arm needs NOTHING else:
      // the placeholder is built from the snapshot the present call carried.
      const head = await resolver.head(presented.ref);
      if (!alive) return;
      if (head.status === 'absent') return settle({ phase: 'absent' });
      if (head.status === 'failed') return settle({ phase: 'failed', message: head.message });
      const got = await resolver.get(presented.ref);
      if (!alive) return;
      if (got.status === 'live') return settle({ phase: 'live', meta: got.meta, data: got.data });
      if (got.status === 'absent') return settle({ phase: 'absent' });
      return settle({ phase: 'failed', message: got.message });
    })().catch((err: unknown) => {
      // Resolvers return outcomes rather than throwing; this catches a
      // hand-rolled one that throws anyway, so the pane states it.
      settle({
        phase: 'failed',
        message: err instanceof Error && err.message ? err.message : String(err),
      });
    });
    return () => {
      alive = false;
    };
  }, [resolver, presented.ref]);

  const head = describePresented(presented);

  if (!resolver) {
    return (
      <div className="lens-artifact__pane" data-testid="artifact-pane">
        <p className="lens-artifact__state" data-testid="artifact-no-resolver">
          {head} — not redeemed: no resolver was given. Pass{' '}
          <code>resolver={'{httpArtifactResolver({ url, sessionId })}'}</code> to redeem refs.
        </p>
      </div>
    );
  }

  if (state.phase === 'redeeming') {
    return (
      <div className="lens-artifact__pane" data-testid="artifact-pane">
        <p className="lens-artifact__state" data-testid="artifact-redeeming">
          {head} — redeeming…
        </p>
      </div>
    );
  }

  if (state.phase === 'absent') {
    return (
      <div className="lens-artifact__pane" data-testid="artifact-pane">
        <p className="lens-artifact__state" data-testid="artifact-placeholder">
          {artifactPlaceholder(presented)}
        </p>
      </div>
    );
  }

  if (state.phase === 'failed') {
    return (
      <div className="lens-artifact__pane" data-testid="artifact-pane">
        <p className="lens-artifact__state" role="alert" data-testid="artifact-failed">
          {head} — could not be redeemed: {state.message}
        </p>
      </div>
    );
  }

  const Component = artifactComponentFor(state.meta.kind);
  return (
    <div className="lens-artifact__pane" data-testid="artifact-pane">
      {Component ? (
        <LensChartBoundary
          fallback={
            <p className="lens-artifact__state" role="alert" data-testid="artifact-component-crashed">
              The component registered for kind &lsquo;{state.meta.kind}&rsquo; threw while
              rendering {state.meta.ref} — the artifact is live; the renderer is not.
            </p>
          }
        >
          <Component meta={state.meta} data={state.data} presented={presented} />
        </LensChartBoundary>
      ) : (
        <>
          <p className="lens-artifact__state" data-testid="artifact-unknown-kind">
            No component is registered for kind &lsquo;{state.meta.kind}&rsquo; — showing the
            artifact&rsquo;s metadata and payload instead.{' '}
            <code>
              registerArtifactComponent({'{'} kind: &lsquo;{state.meta.kind}&rsquo;, component {'}'}
              )
            </code>{' '}
            teaches Lens to draw it.
          </p>
          <ArtifactMetaCard meta={state.meta} data={state.data} presented={presented} />
        </>
      )}
    </div>
  );
};
