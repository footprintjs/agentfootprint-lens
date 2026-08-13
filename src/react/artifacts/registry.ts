/**
 * The artifact COMPONENT REGISTRY — render by ref, never by markup.
 *
 * The no-eval law, extended to every screen: the model never sends UI. It
 * hands the screen a ref plus vocabulary, and the screen renders a component
 * the APP registered for the artifact's KIND (`'dataset/rows'`,
 * `'chart/spec'`) — ids + props, never model-generated markup or code. The
 * kind is the PRODUCER's declared vocabulary (stamped at mint), so the model
 * cannot summon a component the producing tool did not describe.
 *
 * Two built-ins ship: a generic rows table for `'dataset/rows'`, and — for
 * any kind nothing is registered for — the pane falls back to the honest
 * metadata card (`ArtifactMetaCard`), which states the gap and still shows
 * the parcel. Registered components win over built-ins, so an app's own
 * `'dataset/rows'` table replaces the shipped one by registration alone.
 *
 * Module-level on purpose: one page has one vocabulary, and threading a
 * registry prop through every surface would make two panes disagree about
 * what a kind looks like. Registration returns an unregister function for
 * scoped setups (tests, storybooks, hot reload).
 */

import type React from 'react';
import type { ArtifactMetaView, PresentedCallView } from '../../core/artifacts/types.js';
import { ArtifactRowsTable } from './ArtifactRowsTable.js';

/** What every registered artifact component receives. `meta.ref` carries the
 *  ref (never a top-level `ref` prop — that name is React's). */
export interface ArtifactComponentProps {
  /** The claim ticket's description, as resolved live. */
  readonly meta: ArtifactMetaView;
  /** The payload, as `artifact-get` returned it. */
  readonly data: unknown;
  /** The `present` call that put this artifact on screen, when the surface
   *  has it — carries the model's `as` vocabulary and the speak-time label. */
  readonly presented?: PresentedCallView;
}

/** One registered renderer for one artifact kind. */
export interface RegisterArtifactComponentArgs {
  /** The producer-declared kind this component draws: `'dataset/rows'`,
   *  `'chart/spec'`, … Exact match; kinds are ids, not patterns. */
  readonly kind: string;
  /** The React component to render artifacts of that kind. */
  readonly component: React.ComponentType<ArtifactComponentProps>;
}

const registered = new Map<string, React.ComponentType<ArtifactComponentProps>>();

/** The shipped renderers, consulted AFTER the app's registrations — so
 *  registering `'dataset/rows'` replaces the built-in table. */
const BUILT_IN = new Map<string, React.ComponentType<ArtifactComponentProps>>([
  ['dataset/rows', ArtifactRowsTable],
]);

/**
 * Register a React component for an artifact kind. Registering a kind again
 * replaces the earlier component — that is the deliberate override door, and
 * it is why the call returns an unregister function (which removes only the
 * component it registered, never a later replacement).
 */
export function registerArtifactComponent(args: RegisterArtifactComponentArgs): () => void {
  const kind = typeof args?.kind === 'string' ? args.kind.trim() : '';
  if (kind.length === 0) {
    throw new Error(
      "registerArtifactComponent needs `kind` — the producer-declared vocabulary the mint " +
        "stamped on the artifact ('dataset/rows', 'chart/spec'). The registry keys on the " +
        "artifact's kind, not on the model's `as` hint.",
    );
  }
  const component = args.component;
  if (typeof component !== 'function' && (component === null || typeof component !== 'object')) {
    throw new Error(
      `registerArtifactComponent('${kind}') needs \`component\` — a React component ` +
        '(a function, or a memo/forwardRef object). Got ' +
        (component === null ? 'null' : typeof component) +
        '.',
    );
  }
  registered.set(kind, component);
  return () => {
    if (registered.get(kind) === component) registered.delete(kind);
  };
}

/**
 * The renderer for a kind: the app's registration first, then the shipped
 * built-ins, else `undefined` — at which point the pane renders the honest
 * metadata card and SAYS no component is registered, never a blank pane.
 */
export function artifactComponentFor(
  kind: string,
): React.ComponentType<ArtifactComponentProps> | undefined {
  return registered.get(kind) ?? BUILT_IN.get(kind);
}
