/**
 * <AnimatedEdge> — custom ReactFlow edge for in-flight parallel branches.
 *
 * Layer 3 / Tier B / Lens v0.1.
 *
 * When `data.isInflight` is true, the edge renders with a CSS
 * `stroke-dasharray` + `stroke-dashoffset` animation. When false, it
 * renders as a solid edge. The CSS animation is GPU-composited and
 * uses `@media (prefers-reduced-motion: reduce)` to disable motion
 * for users who request it (style applied via the className — the
 * caller's stylesheet implements the rule).
 *
 * Cap convention
 * ──────────────
 *   Consumers SHOULD cap active animated edges at ~32. Beyond that,
 *   they should fall back to pulsing the parent fork node instead.
 *   This component does not enforce the cap — it's a layout-level
 *   decision the parent flowchart applies.
 *
 * Note on dependency
 * ──────────────────
 *   Imports `BaseEdge` + `getBezierPath` from `@xyflow/react`. Lens
 *   already depends on @xyflow/react for the rest of the flowchart, so
 *   no new transitive dependency.
 */

import React from 'react';
import { ensureLensStyles } from '../lensStyles.js';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';

export interface AnimatedEdgeData {
  readonly isInflight: boolean;
}

export const AnimatedEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  style,
}) => {
  ensureLensStyles();
  const [edgePath] = getBezierPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  });

  const isInflight = Boolean((data as AnimatedEdgeData | undefined)?.isInflight);

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      style={style}
      className={`lens-animated-edge${isInflight ? ' lens-animated-edge--inflight' : ''}`}
    />
  );
};
