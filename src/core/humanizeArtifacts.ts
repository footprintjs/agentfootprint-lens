/**
 * Humanizer lines for the `agentfootprint.artifacts.*` lifecycle (9.21–9.23)
 * — minted, resolved, expired, refused, presented.
 *
 * These events are NEWER than the event union this package compiles against,
 * so the humanizer matches them by raw type string with structural payload
 * mirrors — the `humanizeRouting` precedent. Every payload here is META ONLY
 * by the artifacts law (bytes never enter an event), so every line is safe to
 * print anywhere the stream goes.
 *
 * The lines narrate the claim-check story in plain words: a tool checks data
 * in and the model routes tickets; the screen (or a tool) redeems them; the
 * calendar sweeps them; a refusal says why. `tool` is optional on resolved /
 * refused since 9.23.0 — a wire redemption's actor is the screen, and
 * inventing a tool name for it would be a lie.
 */

import { formatBytes } from './bugReport/selection.js';

/** Structural mirror of `ArtifactMintedPayload`. */
export interface ArtifactMintedLike {
  readonly ref?: string;
  readonly kind?: string;
  readonly bytes?: number;
  readonly label?: string;
  readonly expiresAt?: number;
  readonly tool?: string;
}

/** Structural mirror of `ArtifactResolvedPayload`. */
export interface ArtifactResolvedLike {
  readonly ref?: string;
  readonly via?: string;
  readonly kind?: string;
  readonly bytes?: number;
  readonly tool?: string;
}

/** Structural mirror of `ArtifactExpiredPayload`. */
export interface ArtifactExpiredLike {
  readonly ref?: string;
  readonly reason?: string;
  readonly kind?: string;
  readonly bytes?: number;
  readonly tool?: string;
}

/** Structural mirror of `ArtifactRefusedPayload`. */
export interface ArtifactRefusedLike {
  readonly op?: string;
  readonly reason?: string;
  readonly ref?: string;
  readonly detail?: string;
  readonly tool?: string;
}

/** Structural mirror of `ArtifactPresentedPayload`. */
export interface ArtifactPresentedLike {
  readonly ref?: string;
  readonly as?: string;
  readonly snapshot?: {
    readonly kind?: string;
    readonly bytes?: number;
    readonly label?: string;
  };
}

const ticket = (ref: string | undefined, kind: string | undefined, bytes: number | undefined): string =>
  `${ref ?? 'art_?'} [${kind ?? '?'} · ${formatBytes(bytes ?? 0)}]`;

export function humanizeArtifactMinted(p: ArtifactMintedLike): string {
  const label = p.label !== undefined ? ` "${p.label}"` : '';
  const by = p.tool !== undefined ? ` by tool "${p.tool}"` : '';
  return `Artifact minted${by} —${label} ${ticket(p.ref, p.kind, p.bytes)}. The model routes this ticket, not the bytes.`;
}

export function humanizeArtifactResolved(p: ArtifactResolvedLike): string {
  const actor = p.tool !== undefined ? `Tool "${p.tool}"` : 'The screen';
  const verb =
    p.via === 'head' ? 'described' : p.via === 'get' ? 'fetched' : `redeemed (${p.via ?? '?'})`;
  return `${actor} ${verb} artifact ${ticket(p.ref, p.kind, p.bytes)}.`;
}

export function humanizeArtifactExpired(p: ArtifactExpiredLike): string {
  return `Artifact ${ticket(p.ref, p.kind, p.bytes)} swept (${p.reason ?? 'retention'}) — its ref no longer resolves, and says so.`;
}

export function humanizeArtifactRefused(p: ArtifactRefusedLike): string {
  const ref = p.ref !== undefined ? ` for '${p.ref}'` : '';
  const by = p.tool !== undefined ? ` (tool "${p.tool}")` : '';
  const detail = p.detail !== undefined ? ` — ${p.detail}` : '';
  return `Artifact ${p.op ?? '?'}${ref} refused: ${p.reason ?? 'unknown reason'}${by}${detail}`;
}

export function humanizeArtifactPresented(p: ArtifactPresentedLike): string {
  const s = p.snapshot;
  const label = s?.label !== undefined ? ` "${s.label}"` : '';
  return `Presented${label} to the screen as '${p.as ?? '?'}' — ${ticket(p.ref, s?.kind, s?.bytes)}. The screen redeems the ref under its own session.`;
}
