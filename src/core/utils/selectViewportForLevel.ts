/**
 * selectViewportForLevel — look up a saved ReactFlow viewport (pan +
 * zoom) for a given drill depth.
 *
 * Used by DrillableFlowchart to restore the user's pan/zoom when they
 * drill back. The component holds a `Map<number, Viewport>` snapshot
 * keyed by breadcrumb depth; on each navigation it stores the current
 * viewport at the OLD depth before navigating, then asks this function
 * for the saved viewport at the NEW depth.
 *
 * Pure function. Layer 1 / Tier C / Lens v0.1.
 *
 * Returns `undefined` if no snapshot exists at that depth — the caller
 * should fall through to ReactFlow's default fitView behavior.
 */

export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export function selectViewportForLevel(
  map: ReadonlyMap<number, Viewport>,
  depth: number,
): Viewport | undefined {
  // Defensive: ignore non-integer / negative depth requests rather
  // than returning a random match. Drill depth is always a
  // non-negative integer (0 = top, 1 = one drill in, …).
  if (!Number.isFinite(depth) || depth < 0 || !Number.isInteger(depth)) {
    return undefined;
  }
  return map.get(depth);
}
