/**
 * <AgentLegendStrip> — persistent sidebar strip listing distinct agents.
 *
 * Layer 3 / Tier B / Lens v0.1.
 *
 * Renders one row per `AgentLegendEntry`. Hovering or clicking a row
 * surfaces the agent via `onHighlight(id)`; the consumer paints all
 * matching nodes in the flowchart. Clicking the currently-highlighted
 * row toggles the highlight OFF.
 *
 * Visual contract
 * ───────────────
 *   - One color swatch per row (`data-color-idx={0..7}` so the
 *     consumer's design tokens own the palette).
 *   - `data-agent-id` attribute on each row for selector-based wiring.
 *   - `aria-pressed` reflects the highlight state (toggle button).
 *
 * NO design-token coupling here — colors come from CSS variables the
 * caller defines for `--lens-agent-color-N` (N = 0..7). This keeps the
 * component theme-portable.
 */

import React from 'react';
import type { AgentLegendEntry } from '../../core/utils/extractAgentLegend.js';

export interface AgentLegendStripProps {
  readonly entries: readonly AgentLegendEntry[];
  readonly highlightedAgentId?: string;
  readonly onHighlight?: (id: string | undefined) => void;
}

export const AgentLegendStrip: React.FC<AgentLegendStripProps> = ({
  entries,
  highlightedAgentId,
  onHighlight,
}) => {
  if (entries.length === 0) return null;

  return (
    <div role="list" className="lens-agent-legend" aria-label="Agents in this run">
      {entries.map((entry) => {
        const isActive = entry.subflowId === highlightedAgentId;
        return (
          <button
            key={entry.subflowId}
            role="listitem"
            type="button"
            data-agent-id={entry.subflowId}
            data-color-idx={entry.colorIdx}
            aria-pressed={isActive}
            className={`lens-agent-row${isActive ? ' lens-agent-row--active' : ''}`}
            onClick={() => {
              if (!onHighlight) return;
              onHighlight(isActive ? undefined : entry.subflowId);
            }}
          >
            <span
              aria-hidden
              className="lens-agent-swatch"
              style={{ background: `var(--lens-agent-color-${entry.colorIdx})` }}
            />
            <span className="lens-agent-name">{entry.name}</span>
            {entry.role.length > 0 && <span className="lens-agent-role">{entry.role}</span>}
            {entry.model && <span className="lens-agent-model">{entry.model}</span>}
          </button>
        );
      })}
    </div>
  );
};
