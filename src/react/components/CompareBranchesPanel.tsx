/**
 * <CompareBranchesPanel> — N-column compare-branches view.
 *
 * Layer 3 / Tier B / Lens v0.1.
 *
 * Renders the columns produced by `useCompareBranches`. Each column
 * has four sticky-header sections: System | Messages | Tools | Response.
 * Sections share a single vertical scroll across columns.
 *
 * Features
 * ────────
 *   - Diff toggle (`diffEnabled`) — when true, headers indicate diff
 *     mode. Actual word-level highlighting is delegated to a future
 *     pass that uses `diffPrompts` pairwise; v0.1 just toggles the
 *     visual flag.
 *   - Column pinning (`pinnedColumnId`) — the pinned column sticks
 *     to the left when scrolling horizontally (CSS-only; this
 *     component just sets `data-pinned` so the consumer's stylesheet
 *     applies the `position: sticky` rule).
 */

import React from 'react';
import type { BranchColumn } from '../hooks/useCompareBranches.js';

export interface CompareBranchesPanelProps {
  readonly columns: readonly BranchColumn[];
  readonly diffEnabled?: boolean;
  readonly onToggleDiff?: () => void;
  readonly pinnedColumnId?: string;
  readonly onPin?: (id: string | undefined) => void;
}

const SECTIONS = ['System', 'Messages', 'Tools', 'Response'] as const;

export const CompareBranchesPanel: React.FC<CompareBranchesPanelProps> = ({
  columns,
  diffEnabled = false,
  onToggleDiff,
  pinnedColumnId,
  onPin,
}) => {
  if (columns.length === 0) return null;

  return (
    <div className="lens-compare-branches" data-diff={diffEnabled} role="region" aria-label="Compare branches">
      <header className="lens-compare-branches__toolbar">
        <button
          type="button"
          aria-pressed={diffEnabled}
          data-testid="toggle-diff"
          onClick={onToggleDiff}
        >
          {diffEnabled ? 'Hide diff' : 'Show diff'}
        </button>
      </header>
      <div className="lens-compare-branches__grid">
        {columns.map((col) => {
          const isPinned = col.branchId === pinnedColumnId;
          return (
            <article
              key={col.branchId}
              className={`lens-compare-branches__column${isPinned ? ' lens-compare-branches__column--pinned' : ''}`}
              data-branch-id={col.branchId}
              data-pinned={isPinned}
              data-status={col.status}
              aria-label={`Branch ${col.branchName}`}
            >
              <header className="lens-compare-branches__column-header">
                <h3>{col.branchName}</h3>
                <span className="lens-compare-branches__status">{col.status}</span>
                <button
                  type="button"
                  aria-label={isPinned ? 'Unpin column' : 'Pin column'}
                  data-testid={`pin-${col.branchId}`}
                  onClick={() => onPin?.(isPinned ? undefined : col.branchId)}
                >
                  {isPinned ? 'Unpin' : 'Pin'}
                </button>
              </header>
              {SECTIONS.map((section) => (
                <section key={section} className="lens-compare-branches__section">
                  <h4>{section}</h4>
                  {section === 'System' && <pre>{col.systemPrompt}</pre>}
                  {section === 'Messages' && (
                    <ul>
                      {col.messages.map((m, i) => (
                        <li key={i}>
                          <strong>{m.role}: </strong>
                          <span>{m.content}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {section === 'Tools' && (
                    <ul>
                      {col.tools.map((t, i) => (
                        <li key={i}>
                          <strong>{t.name}: </strong>
                          <span>{t.description}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {section === 'Response' && <pre>{col.response}</pre>}
                </section>
              ))}
              {col.errorMessage && (
                <p className="lens-compare-branches__error" role="alert">
                  {col.errorMessage}
                </p>
              )}
              <footer className="lens-compare-branches__footer">
                <span>in: {col.tokenCount.input}</span>
                <span>out: {col.tokenCount.output}</span>
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
};
