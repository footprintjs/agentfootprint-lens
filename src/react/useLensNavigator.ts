/**
 * useLensNavigator — move the ONE cursor to a stage by its address.
 *
 * `<Lens step onStepChange>` lets a host OWN the cursor. This is the other
 * half a pointing host needs: a way to SAY WHERE, when the only thing it knows
 * is a `runtimeStageId` — a chat answer citing the step it means, a dashboard
 * row, a deep link.
 *
 * THE ONE-CURSOR LAW, kept: this adds NO state and NO second channel. It is a
 * RESOLUTION (`resolveNavigation`, the shipped ladder) followed by the SAME
 * `moveTo` funnel every internal mover already goes through — the step strip,
 * the ◀ ▶ buttons, the arrow keys, a chart click, the live auto-advance. So it
 * behaves exactly like a person clicking that stop:
 *
 *   - **Uncontrolled** — the cursor moves, and `onStepChange` reports it.
 *   - **Controlled** — nothing moves on its own; `onStepChange` fires with the
 *     step and the host's own `step` prop lands it. Two owners never fight,
 *     because there is still only one owner.
 *   - **Already there** — no move, no event (a non-move is not a change), and
 *     still `{ ok: true }` with the step the cursor is standing on.
 *
 * HONEST MISSES: an address the axis cannot hold comes back `{ ok: false }`
 * with the nearest-previous stop OFFERED as data, never taken. See
 * `resolveNavigation` for the ladder.
 *
 * @example The handle, on the component.
 * ```tsx
 * const nav = useRef<LensNavigator>(null);
 *
 * <Lens recorder={recorder} navigatorRef={nav} />
 *
 * // Later — a chat answer points at its evidence:
 * const to = nav.current?.navigateTo('llm#7');
 * if (to?.ok) show(`Jumped to ${to.label}`);
 * else if (to?.nearest) offer(`Not on this ruler. Go to ${to.nearest.label}?`);
 * // Taking the offer is one more call — `nearest.runtimeStageId` is an exact
 * // hit by construction:
 * //   nav.current?.navigateTo(to.nearest.runtimeStageId);
 * ```
 */

import { useImperativeHandle, useMemo, useRef, type Ref } from 'react';

import type { CursorPosition } from '../core/group/cursorPositionsAtDrill.js';
import {
  resolveNavigation,
  type NavigationResult,
} from '../core/group/resolveNavigation.js';

/**
 * The imperative handle `<Lens navigatorRef>` fills in — the lens's cursor,
 * addressable by stage.
 */
export interface LensNavigator {
  /**
   * Move the ONE cursor to the stop that holds `runtimeStageId`, on whatever
   * axis the lens is currently scrubbing (`granularity="step"` → the commit
   * axis, `granularity="group"` → the milestone axis).
   *
   * Returns where it went — or, on a miss, why it did not and what was nearby.
   * Never throws, and never moves on a miss.
   */
  navigateTo(runtimeStageId: string): NavigationResult;
}

export interface UseLensNavigatorArgs {
  /** The ACTIVE scrub axis — the same list the lens renders its ruler from. */
  readonly positions: readonly CursorPosition[];
  /** The one cursor funnel (`useLensCursor`'s `moveTo`). */
  readonly moveTo: (step: number) => void;
  /** The host's ref, filled with the handle. Omit and the hook still returns
   *  the navigator for in-tree use. */
  readonly navigatorRef?: Ref<LensNavigator> | undefined;
}

export function useLensNavigator({
  positions,
  moveTo,
  navigatorRef,
}: UseLensNavigatorArgs): LensNavigator {
  // Refs, not deps: the handle must stay IDENTITY-STABLE across renders (a
  // host holding `nav.current` from an effect keeps a working one), while the
  // axis grows under a live run and `moveTo`'s identity changes with the
  // controlled/uncontrolled mode. Reading through refs gives every call the
  // CURRENT axis and the CURRENT funnel without rebuilding the handle.
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const moveRef = useRef(moveTo);
  moveRef.current = moveTo;

  const navigator = useMemo<LensNavigator>(
    () => ({
      navigateTo(runtimeStageId: string): NavigationResult {
        const to = resolveNavigation(positionsRef.current, runtimeStageId);
        // A miss NEVER moves. The nearest stop rides back as data so the
        // caller can offer it; taking it is another call.
        if (to.ok) moveRef.current(to.step);
        return to;
      },
    }),
    [],
  );

  useImperativeHandle(navigatorRef ?? null, () => navigator, [navigator]);

  return navigator;
}
