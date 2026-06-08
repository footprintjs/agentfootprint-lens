/**
 * LENS_NODE_TYPES — the renderer map for the custom node types a Lens chart uses.
 *
 * `structureGraphFromRunner` tags the three context slots with `type: 'slotPill'`
 * (and subflow boxes with `type: 'groupContainer'`). React Flow needs a renderer
 * registered for each custom type, otherwise it falls back to the default node
 * and floods the console with "node type not found" warnings.
 *
 * Exported so consumers (and the Lens's own auto-derived chart) reuse one map
 * instead of hand-rolling it. Stage nodes use TraceFlow's built-in StageNode.
 */

import type { NodeTypes } from '@xyflow/react';
import { SlotPillNode, GroupContainerNode } from 'footprint-explainable-ui/flowchart';

export const LENS_NODE_TYPES: NodeTypes = {
  slotPill: SlotPillNode,
  groupContainer: GroupContainerNode,
};
