/**
 * <ArtifactMetaCard> — the honest fallback renderer.
 *
 * When no component is registered for an artifact's kind, the pane still owes
 * the person a real pane: this card renders the claim ticket's METADATA
 * (label, ref, kind, media type, size, expiry, origin), a bounded preview of
 * the payload, and a download / copy affordance so the data is reachable even
 * though nothing knows how to draw it. Honest, never blank — the unknown-kind
 * path renders THIS, plus a stated line naming the gap and the
 * `registerArtifactComponent` call that closes it.
 *
 * It is also a fine explicit choice: register it for any kind whose payload
 * you want inspectable rather than drawn.
 */

import React from 'react';
import { formatBytes } from '../../core/bugReport/selection.js';
import { ensureLensStyles } from '../lensStyles.js';
import type { ArtifactComponentProps } from './registry.js';

/** Preview at most this many characters of the payload's JSON. The full
 *  payload stays reachable via download/copy — the cap is stated, never silent. */
const PREVIEW_CHAR_CAP = 20_000;

/** File extension for the download, from the artifact's own media type. */
function extensionFor(mediaType: string): string {
  const bare = mediaType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (bare === 'application/json') return '.json';
  if (bare === 'text/csv') return '.csv';
  if (bare === 'text/plain') return '.txt';
  if (bare === 'text/html') return '.html';
  const slash = bare.lastIndexOf('/');
  return slash >= 0 && slash < bare.length - 1 ? `.${bare.slice(slash + 1)}` : '';
}

/** The payload as text: strings byte-for-byte, everything else as JSON.
 *  A value JSON cannot carry is REPORTED, never approximated. */
function payloadText(data: unknown): { text: string } | { error: string } {
  if (typeof data === 'string') return { text: data };
  try {
    const text = JSON.stringify(data, null, 2);
    if (text === undefined) return { error: 'The payload is not JSON-serializable.' };
    return { text };
  } catch (err) {
    return {
      error: `The payload could not be serialized for preview (${
        err instanceof Error ? err.message : String(err)
      }).`,
    };
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    const clipboard = globalThis.navigator?.clipboard;
    if (!clipboard?.writeText) return false;
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function downloadText(text: string, filename: string, mediaType: string): boolean {
  try {
    if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
    const blob = new Blob([text], { type: mediaType || 'application/octet-stream' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
    return true;
  } catch {
    return false;
  }
}

export const ArtifactMetaCard: React.FC<ArtifactComponentProps> = ({ meta, data, presented }) => {
  ensureLensStyles();
  const [note, setNote] = React.useState<string | undefined>(undefined);
  const payload = React.useMemo(() => payloadText(data), [data]);
  const hasPayload = data !== undefined;
  const title = meta.label ?? presented?.snapshot.label ?? meta.ref;

  const filename =
    (meta.label ?? meta.ref).replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') +
    extensionFor(meta.mediaType);

  const onCopy = async (): Promise<void> => {
    if ('error' in payload) return;
    const copied = await copyText(payload.text);
    setNote(
      copied
        ? 'Copied the payload to the clipboard.'
        : 'This browser gave Lens no clipboard, so nothing was copied — use Download instead.',
    );
  };

  const onDownload = (): void => {
    if ('error' in payload) return;
    const downloaded = downloadText(payload.text, filename, meta.mediaType);
    setNote(
      downloaded
        ? `Downloaded ${filename}.`
        : 'This browser gave Lens no way to save a file, so nothing was downloaded.',
    );
  };

  return (
    <div className="lens-artifact__card" data-testid="artifact-meta-card">
      <div className="lens-artifact__card-title">{title}</div>
      <dl className="lens-artifact__meta">
        <dt>ref</dt>
        <dd className="lens-artifact__mono">{meta.ref}</dd>
        <dt>kind</dt>
        <dd className="lens-artifact__mono">{meta.kind}</dd>
        <dt>media type</dt>
        <dd className="lens-artifact__mono">{meta.mediaType}</dd>
        <dt>size</dt>
        <dd>{formatBytes(meta.bytes)}</dd>
        {presented !== undefined && (
          <>
            <dt>presented as</dt>
            <dd className="lens-artifact__mono">{presented.as}</dd>
          </>
        )}
        {meta.expiresAt !== undefined && (
          <>
            <dt>expires</dt>
            <dd>{new Date(meta.expiresAt).toISOString()}</dd>
          </>
        )}
        {meta.origin?.runId !== undefined && (
          <>
            <dt>run</dt>
            <dd className="lens-artifact__mono">{meta.origin.runId}</dd>
          </>
        )}
        {meta.origin?.toolCallId !== undefined && (
          <>
            <dt>tool call</dt>
            <dd className="lens-artifact__mono">{meta.origin.toolCallId}</dd>
          </>
        )}
        {meta.parentRefs !== undefined && meta.parentRefs.length > 0 && (
          <>
            <dt>derived from</dt>
            <dd className="lens-artifact__mono">{meta.parentRefs.join(', ')}</dd>
          </>
        )}
      </dl>

      {!hasPayload ? (
        <p className="lens-artifact__note" data-testid="artifact-card-no-payload">
          Metadata only — the payload was not fetched.
        </p>
      ) : 'error' in payload ? (
        <p className="lens-artifact__note" role="alert">
          {payload.error}
        </p>
      ) : (
        <>
          <pre className="lens-artifact__preview" data-testid="artifact-card-preview">
            {payload.text.length > PREVIEW_CHAR_CAP
              ? payload.text.slice(0, PREVIEW_CHAR_CAP)
              : payload.text}
          </pre>
          {payload.text.length > PREVIEW_CHAR_CAP && (
            <p className="lens-artifact__note" data-testid="artifact-card-truncated">
              Preview cut at {PREVIEW_CHAR_CAP.toLocaleString()} characters of{' '}
              {payload.text.length.toLocaleString()} — Download carries the whole payload.
            </p>
          )}
          <div className="lens-artifact__actions">
            <button type="button" data-testid="artifact-card-copy" onClick={onCopy}>
              Copy payload
            </button>
            <button type="button" data-testid="artifact-card-download" onClick={onDownload}>
              Download {filename}
            </button>
          </div>
          {note !== undefined && (
            <p className="lens-artifact__note" role="status" data-testid="artifact-card-note">
              {note}
            </p>
          )}
        </>
      )}
    </div>
  );
};
