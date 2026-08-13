/**
 * Artifacts (render-by-ref) — the headless half.
 *
 * How the lens redeems the claim tickets a run's tools minted: the
 * {@link ArtifactResolver} abstraction with its two shipped implementations
 * (over a served agent's wire ops; over a directly passed store), the walkers
 * that lift `present` calls back out of history, and the placeholder copy an
 * expired ref renders from its speak-time snapshot alone. Zero React — a Vue
 * or CLI consumer builds its own pane over exactly these.
 */

export type {
  ArtifactMetaView,
  ArtifactResolution,
  ArtifactResolver,
  PresentedCallView,
  PresentSnapshotView,
} from './types.js';
export {
  httpArtifactResolver,
  storeArtifactResolver,
  type ArtifactStoreLike,
  type HttpArtifactResolverOptions,
  type StoreArtifactResolverOptions,
} from './resolvers.js';
export {
  artifactPlaceholder,
  describePresented,
  presentedFromEvents,
  readPresentedResult,
} from './presented.js';
