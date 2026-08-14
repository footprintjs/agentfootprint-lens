/**
 * GroupBoundary — the drawn container around the active group, with its name.
 *
 * ── What it draws ───────────────────────────────────────────────────────────
 * A rounded, dashed, softly-filled rectangle enclosing the member nodes, and a
 * small chip on its top edge saying which group it is. Deliberately quiet: the
 * group is a PLACE you are standing in, not an alarm. It never takes pointer
 * events, so clicking "through" it onto a node still works.
 *
 * ── Where the geometry comes from ───────────────────────────────────────────
 * The member nodes' REAL positions and REAL sizes, read from xyflow's
 * `nodeLookup` store. This is the v12 gotcha worth stating: `getNodes()` returns
 * the nodes as the app supplied them, and a measured size is not in there —
 * `nodeLookup` is where `measured.width/height` and `internals.positionAbsolute`
 * live. A box computed from `getNodes()` would be right only for nodes whose
 * width the app happened to hardcode.
 *
 * A node that has not been measured yet (first paint, or a headless test
 * environment with no layout) contributes its authored size, then a default —
 * an approximate box that settles the moment measurement lands is better than a
 * boundary that flickers in and out of existence.
 *
 * The selector returns a STRING, not the map: `nodeLookup` is mutated in place,
 * so subscribing to its identity would miss every size change. A serialized box
 * re-renders exactly when the box actually moves, and never otherwise.
 *
 * ── Scrubbing ───────────────────────────────────────────────────────────────
 * Group-to-group movement animates the box and the chip (transform + size
 * transition, see lensStyles.ts) — and that transition is switched off under
 * `prefers-reduced-motion: reduce`, where the box simply appears at its new place.
 *
 * ── Cost ────────────────────────────────────────────────────────────────────
 * Nothing is fetched and nothing is recorded. The membership came from the
 * recording's own boundary ranges; the geometry is already in the chart.
 */

import React, { useCallback } from 'react';
import { ViewportPortal, useStore, type ReactFlowState } from '@xyflow/react';
import type { ChartGroupHighlight } from '../../core/group/activeChartGroup.js';

/** Breathing room between the member nodes and the drawn outline, in flow units. */
const PADDING = 22;
/** What an unmeasured node is assumed to occupy. Only ever used before xyflow
 *  has measured (or where nothing measures at all, e.g. jsdom). */
const FALLBACK_WIDTH = 160;
const FALLBACK_HEIGHT = 44;

export interface GroupBoundaryProps {
  /** The active group — members to enclose, and the name for the chip. */
  readonly group: ChartGroupHighlight;
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Serialize so the store subscription compares by VALUE (see the note above). */
function boxKey(memberNodeIds: ReadonlySet<string>, state: ReactFlowState): string {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = 0;

  for (const id of memberNodeIds) {
    const node = state.nodeLookup.get(id);
    if (node === undefined) continue; // member not on the chart at this drill level
    if (node.hidden === true) continue;
    const pos = node.internals?.positionAbsolute ?? node.position;
    if (pos === undefined) continue;
    const width = node.measured?.width ?? node.width ?? FALLBACK_WIDTH;
    const height = node.measured?.height ?? node.height ?? FALLBACK_HEIGHT;
    found += 1;
    if (pos.x < minX) minX = pos.x;
    if (pos.y < minY) minY = pos.y;
    if (pos.x + width > maxX) maxX = pos.x + width;
    if (pos.y + height > maxY) maxY = pos.y + height;
  }

  if (found === 0) return '';
  return `${minX - PADDING},${minY - PADDING},${maxX - minX + PADDING * 2},${maxY - minY + PADDING * 2}`;
}

function parseBox(key: string): Box | undefined {
  if (key === '') return undefined;
  const [x, y, width, height] = key.split(',').map(Number);
  if ([x, y, width, height].some((n) => n === undefined || !Number.isFinite(n))) return undefined;
  return { x: x as number, y: y as number, width: width as number, height: height as number };
}

/**
 * Render the boundary for one group. Renders NOTHING when not a single member
 * is on the chart — a box around an empty region would be a claim about nodes
 * that are not there.
 */
export const GroupBoundary: React.FC<GroupBoundaryProps> = ({ group }) => {
  const selector = useCallback(
    (state: ReactFlowState) => boxKey(group.memberNodeIds, state),
    [group.memberNodeIds],
  );
  const box = parseBox(useStore(selector));
  if (box === undefined) return null;

  return (
    <ViewportPortal>
      <div
        className="lens-group-boundary"
        data-testid="lens-group-boundary"
        data-group-id={group.runtimeGroupId}
        style={{
          position: 'absolute',
          transform: `translate(${box.x}px, ${box.y}px)`,
          width: box.width,
          height: box.height,
        }}
      >
        {/* The chip names the group with the SAME string the WHAT HAPPENED
            boundary rail uses — `groupDisplayName`, one spelling. */}
        <span className="lens-group-boundary-name" data-testid="lens-group-boundary-name">
          {group.name}
        </span>
      </div>
    </ViewportPortal>
  );
};
