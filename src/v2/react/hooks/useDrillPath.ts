/**
 * useDrillPath — drill-down state (which agent is the user zoomed into).
 *
 * Pattern: one state field (a readonly string[]). `drillInto(id)`
 *          appends a segment; `drillBack()` pops the last segment;
 *          `drillTo(path)` replaces. Empty path = top-level view.
 * Role:    Owns the "mode switch" that turns the flowchart from the
 *          multi-agent overview into one-agent-expanded view. Used
 *          by the breadcrumb navigator and the selector's
 *          `drillPath` parameter.
 */

import { useCallback, useState } from 'react';

export interface UseDrillPathResult {
  readonly drillPath: readonly string[];
  /** Drill into a specific boundary by its FULL subflowPath. Replaces
   *  `drillPath` (does NOT append) — nested boundaries' subflowPaths
   *  already include their parent segments, so replacement composes
   *  correctly for nested drills (Agent A → Agent B: passing B's
   *  subflowPath, which contains A's prefix, drills into B). */
  readonly drillInto: (subflowPath: readonly string[]) => void;
  readonly drillBack: () => void;
  readonly drillToRoot: () => void;
  readonly drillTo: (path: readonly string[]) => void;
}

/**
 * Drill-down state. `drillInto('triage')` puts the user "inside"
 * the triage agent; `drillBack()` pops one level; `drillToRoot()`
 * returns to the top-level view.
 *
 * No reducer, no context, no global store — the state is scoped to
 * the Lens component that owns it. Share across siblings by lifting
 * the hook and passing the result down.
 */
export function useDrillPath(
  initial: readonly string[] = [],
): UseDrillPathResult {
  const [drillPath, setDrillPath] = useState<readonly string[]>(initial);

  const drillInto = useCallback((subflowPath: readonly string[]) => {
    setDrillPath(subflowPath);
  }, []);

  const drillBack = useCallback(() => {
    setDrillPath((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev));
  }, []);

  const drillToRoot = useCallback(() => {
    setDrillPath([]);
  }, []);

  const drillTo = useCallback((path: readonly string[]) => {
    setDrillPath(path);
  }, []);

  return { drillPath, drillInto, drillBack, drillToRoot, drillTo };
}
