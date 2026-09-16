/**
 * useSharedCursor — the ONE cursor a host keeps across every lens it mounts.
 *
 * `useLensCursor` is `<Lens>`'s own step over the ONE axis it is drawing.
 * This hook is the layer above it: the HOST's cursor, held as an ADDRESS on
 * the record (`CursorAddress`), handed to each lens as a `LensCursor` for
 * the axis that lens draws (`forAxis`). A Why tab on the milestone axis, a
 * Flow tab on the commit axis and a Context tab on the milestone axis all
 * read one address; a click in any of them moves it; opening another tab
 * derives that tab's step from it and rewrites nothing.
 *
 * Before this hook a host wrote the same thing by hand — a `{ axis, step,
 * at }` state plus a remap by commit index on every tab switch. That remap is
 * `stepForAddress` now, inside `cursorForAddress`, so the host keeps no
 * axis arithmetic of its own.
 *
 *   const shared = useSharedCursor(observed?.recorder);
 *   <ContextView runner={runner} cursor={shared.forAxis('group')} />
 *   <Lens step={shared.forAxis('group').at.step} onStepChange={shared.onStepChange} />
 *
 * The second line is the BRIDGE: a `<Lens step onStepChange>` or a Skill
 * Graph transport that still speaks step + report keeps working, reporting
 * into the same address. It exists so hosts migrate one lens at a time.
 *
 * Default: with no move yet, the address is the run's END — one past the last
 * commit, no stage named — from which every axis derives its own last stop,
 * where every lens has always opened. A new recorder (another turn, another
 * run) drops the held address; the default applies again. Positions per axis
 * are computed once per recorder and axis.
 */
import { useCallback, useMemo, useState } from 'react';

import { cursorForAddress, type CursorAddress } from '../core/cursor/sharedCursor.js';
import type { LensCursor } from '../core/cursor/lensCursor.js';
import type { CursorPosition } from '../core/group/cursorPositionsAtDrill.js';
import { scrubAxisFor } from '../core/group/scrubAxisFor.js';
import type { LensRecorder } from '../core/LensRecorder.js';
import type { LensCursorAt } from './useLensCursor.js';

export type SharedAxis = 'step' | 'group';

export interface SharedCursor {
  /** The held address — `undefined` until a move, when the default (the run's end) applies. */
  readonly address: CursorAddress | undefined;
  /** The `LensCursor` a lens drawing this axis reads; its `moveTo` moves the shared address. */
  forAxis(granularity: SharedAxis, drillPath?: readonly string[]): LensCursor;
  /** Move the ONE cursor to an address — what every mover ends in. */
  moveTo(address: CursorAddress): void;
  /** The older contract, bridged: a `<Lens onStepChange>` or a transport reporting a step lands here. */
  onStepChange(step: number, at: LensCursorAt): void;
}

const NO_POSITIONS: readonly CursorPosition[] = Object.freeze([]);
const NOWHERE: CursorAddress = Object.freeze({ runtimeStageId: '', commitIdx: -1 });

function axisKey(granularity: SharedAxis, drillPath: readonly string[]): string {
  // A visible, unambiguous key: JSON keeps segment boundaries, so ['ab','c']
  // and ['a','bc'] never share a cache line.
  return JSON.stringify([granularity, ...drillPath]);
}

export function useSharedCursor(recorder: LensRecorder | undefined): SharedCursor {
  // The address is held WITH the recorder it was read on: another recorder
  // means another run, and a stale address on it would be a claim.
  const [held, setHeld] = useState<{
    readonly on: LensRecorder | undefined;
    readonly address: CursorAddress;
  }>();
  const address = held !== undefined && held.on === recorder ? held.address : undefined;

  // Positions per axis, once per recorder. Filled from `forAxis`, i.e. during
  // a CONSUMER's render — a manual memo, idempotent (same key, same array),
  // so a StrictMode double render reads what the first one wrote.
  const axes = useMemo(() => new Map<string, readonly CursorPosition[]>(), [recorder]);
  const positionsFor = useCallback(
    (granularity: SharedAxis, drillPath: readonly string[]): readonly CursorPosition[] => {
      if (recorder === undefined) return NO_POSITIONS;
      const key = axisKey(granularity, drillPath);
      const known = axes.get(key);
      if (known !== undefined) return known;
      const built = scrubAxisFor(recorder, granularity, drillPath);
      axes.set(key, built);
      return built;
    },
    [recorder, axes],
  );

  const moveTo = useCallback(
    (next: CursorAddress): void => {
      setHeld({ on: recorder, address: next });
    },
    [recorder],
  );

  const onStepChange = useCallback(
    (_step: number, at: LensCursorAt): void => {
      moveTo({ runtimeStageId: at.runtimeStageId, commitIdx: at.commitIdx });
    },
    [moveTo],
  );

  // One `LensCursor` per axis per address: the same object comes back until
  // the address moves, so a consumer's memo keyed on it holds across renders.
  const cursors = useMemo(() => new Map<string, LensCursor>(), [address, moveTo, positionsFor, recorder]);
  const forAxis = useCallback(
    (granularity: SharedAxis, drillPath: readonly string[] = []): LensCursor => {
      const key = axisKey(granularity, drillPath);
      const known = cursors.get(key);
      if (known !== undefined) return known;
      const positions = positionsFor(granularity, drillPath);
      // The run's END as an address: one past the last commit, no stage named.
      // Each axis derives its own last stop from it — the commit axis its last
      // visible stage, the milestone axis its absorbing end stop — because the
      // two axes anchor the same stage at different commit indices and one of
      // them hides framework stages; only an address serves both.
      const effective =
        address ??
        (recorder === undefined ? NOWHERE : { runtimeStageId: '', commitIdx: recorder.getCommitCount() });
      const cursor = cursorForAddress(positions, effective, moveTo, drillPath);
      cursors.set(key, cursor);
      return cursor;
    },
    [positionsFor, address, moveTo, recorder, cursors],
  );

  return useMemo(
    () => ({ address, forAxis, moveTo, onStepChange }),
    [address, forAxis, moveTo, onStepChange],
  );
}
