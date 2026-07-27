/**
 * <BreadcrumbHoverPreview> — hover popover for SubflowBreadcrumb segments.
 *
 * Layer 3 / Tier C / Lens v0.1.
 *
 * Shows the segment's display name + the node count at that drill
 * level. Helps with orientation when the user is ≥4 levels deep into
 * subflows and the breadcrumb itself is getting truncated.
 *
 * The `entry` shape is duck-typed against `footprint-explainable-ui`'s
 * `BreadcrumbEntry` so we don't pull a transitive type dependency
 * just to render a popover.
 */

import React from 'react';
import { ensureLensStyles } from '../lensStyles.js';

export interface BreadcrumbEntryShape {
  readonly label: string;
  readonly subflowId?: string;
}

export interface BreadcrumbHoverPreviewProps {
  readonly entry: BreadcrumbEntryShape;
  readonly nodeCount: number;
}

export const BreadcrumbHoverPreview: React.FC<BreadcrumbHoverPreviewProps> = ({
  entry,
  nodeCount,
}) => {
  ensureLensStyles();
  return (
    <div
      role="tooltip"
      className="lens-breadcrumb-hover"
      data-subflow-id={entry.subflowId}
    >
      <div className="lens-breadcrumb-hover__label">{entry.label}</div>
      <div className="lens-breadcrumb-hover__count">
        {nodeCount} {nodeCount === 1 ? 'node' : 'nodes'}
      </div>
    </div>
  );
};
