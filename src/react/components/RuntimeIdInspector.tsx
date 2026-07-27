/**
 * <RuntimeIdInspector> — side-panel widget showing runtimeStageId and
 * commitLog.idx for the focused step, each with a copy button.
 *
 * Layer 3 / Tier B / Lens v0.1.
 *
 * Includes a determinism caveat tooltip:
 *   "Ids are stable per chart; non-deterministic deciders can produce
 *    different #N indices across runs."
 *
 * The copy buttons use `navigator.clipboard.writeText` when available.
 * In jsdom test environments where clipboard is absent the copy is a
 * silent no-op (we don't surface a failure UI for v0.1).
 */

import React, { useState } from 'react';
import { ensureLensStyles } from '../lensStyles.js';

export interface RuntimeIdInspectorProps {
  readonly runtimeStageId: string;
  readonly commitIdx: number | undefined;
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
  } catch {
    // No-op — caller has the value visible.
  }
}

export const RuntimeIdInspector: React.FC<RuntimeIdInspectorProps> = ({
  runtimeStageId,
  commitIdx,
}) => {
  ensureLensStyles();
  const [copiedKey, setCopiedKey] = useState<'rid' | 'commit' | null>(null);

  const onCopy = async (text: string, key: 'rid' | 'commit'): Promise<void> => {
    await copyToClipboard(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1200);
  };

  return (
    <dl className="lens-runtime-inspector" aria-label="Stage runtime identity">
      <div className="lens-runtime-inspector__row">
        <dt>Runtime ID</dt>
        <dd>
          <code data-testid="runtime-id-value">{runtimeStageId}</code>
          <button
            type="button"
            aria-label="Copy runtime id"
            data-testid="copy-runtime-id"
            onClick={() => { void onCopy(runtimeStageId, 'rid'); }}
          >
            {copiedKey === 'rid' ? 'Copied' : 'Copy'}
          </button>
        </dd>
      </div>
      <div className="lens-runtime-inspector__row">
        <dt>Commit idx</dt>
        <dd>
          <code data-testid="commit-idx-value">
            {commitIdx === undefined ? '—' : String(commitIdx)}
          </code>
          {commitIdx !== undefined && (
            <button
              type="button"
              aria-label="Copy commit idx"
              data-testid="copy-commit-idx"
              onClick={() => { void onCopy(String(commitIdx), 'commit'); }}
            >
              {copiedKey === 'commit' ? 'Copied' : 'Copy'}
            </button>
          )}
        </dd>
      </div>
      <p
        className="lens-runtime-inspector__caveat"
        title="Determinism caveat"
      >
        Ids are stable per chart; non-deterministic deciders can produce different #N indices across runs.
      </p>
    </dl>
  );
};
