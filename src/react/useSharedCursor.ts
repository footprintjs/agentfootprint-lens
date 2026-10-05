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
 *   <Lens recorder={recorder} shared={shared} />                     // 0.56.0
 *   <ContextView runner={runner} cursor={shared.forAxis('group')} />
 *   <SkillGraphDebugger step=… onStepChange={shared.onStepChange} />  // bridged
 *
 * A view that takes `shared` derives its own step over whatever axis it
 * draws (`over(positions)`). The last line is the BRIDGE: a view that still
 * speaks step + report keeps working, reporting into the same address. It
 * exists so hosts migrate one lens at a time.
 *
 * Default: with no move yet, the address is the run's END — one past the last
 * commit, no stage named — from which every axis derives its own last stop,
 * where every lens has always opened. A new recorder (another turn, another
 * run) drops the held address; the default applies again. Positions per axis
 * are computed once per recorder and axis.
 */
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';

import { cursorForTarget, type CursorAddress, type SharedCursorTarget } from '../core/cursor/sharedCursor.js';
import { resolveSourcePrefix, type SourcePrefixResolution } from '../core/cursor/sourcePrefix.js';
import type { LensCursor } from '../core/cursor/lensCursor.js';
import type { CursorPosition } from '../core/group/cursorPositionsAtDrill.js';
import { scrubAxisFor } from '../core/group/scrubAxisFor.js';
import type { LensRecorder } from '../core/LensRecorder.js';
import type { LensCursorAt } from './useLensCursor.js';

export type SharedAxis = 'step' | 'group';

export interface SharedCursor {
  /** The held address — `undefined` until a move, when the default (the run's end) applies. */
  readonly address: CursorAddress | undefined;
  /** The one held target. A source prefix must not be read as an ordinary stage address. */
  readonly target?: SharedCursorTarget;
  /** Current resolution of a held source target, including explicit withheld/unavailable state. */
  readonly sourcePrefix?: SourcePrefixResolution;
  /** Resolve first; only a verified location moves the target. A refusal never moves it. */
  selectSourcePrefix?(position: unknown): SourcePrefixResolution;
  /** The `LensCursor` a lens drawing this axis reads; its `moveTo` moves the shared address. */
  forAxis(granularity: SharedAxis, drillPath?: readonly string[]): LensCursor;
  /**
   * The general form (0.56.0): the `LensCursor` over ANY positions a view
   * draws — a tag-filtered axis, a drilled one — read under `drillPath`.
   * `forAxis` is this over the library's own two axes. Same positions, same
   * address → the same object, so a memo keyed on it holds.
   */
  over(positions: readonly CursorPosition[], drillPath?: readonly string[]): LensCursor;
  /** Move the ONE cursor to an address — what every mover ends in. */
  moveTo(address: CursorAddress): void;
  /** The older contract, bridged: a `<Lens onStepChange>` or a transport reporting a step lands here. */
  onStepChange(step: number, at: LensCursorAt): void;
}

/** The hook's complete controller; manually supplied legacy SharedCursor objects remain valid. */
export interface SourceAwareSharedCursor extends SharedCursor {
  readonly target: SharedCursorTarget | undefined;
  readonly sourcePrefix: SourcePrefixResolution | undefined;
  selectSourcePrefix(position: unknown): SourcePrefixResolution;
}

const NO_POSITIONS: readonly CursorPosition[] = Object.freeze([]);
const NOWHERE: CursorAddress = Object.freeze({ runtimeStageId: '', commitIdx: -1 });

function axisKey(granularity: SharedAxis, drillPath: readonly string[]): string {
  // A visible, unambiguous key: JSON keeps segment boundaries, so ['ab','c']
  // and ['a','bc'] never share a cache line.
  return JSON.stringify([granularity, ...drillPath]);
}

export function useSharedCursor(recorder: LensRecorder | undefined, snapshot?: unknown): SourceAwareSharedCursor {
  // The address is held WITH the recorder it was read on: another recorder
  // means another run, and a stale address on it would be a claim.
  const [held, setHeld] = useState<{
    readonly on: LensRecorder | undefined;
    readonly target: SharedCursorTarget;
  }>();
  const target = held !== undefined && held.on === recorder ? held.target : undefined;
  const address = target?.kind === 'stage' ? target.address : undefined;
  const subscribe = useCallback((listener: () => void) => recorder?.subscribe(listener) ?? (() => {}), [recorder]);
  const getVersion = useCallback(() => recorder?.getVersion() ?? 0, [recorder]);
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  // The snapshot reference catches explicit host replacements; recorder version
  // catches nested-log/recorder growth even if root commit count is unchanged.
  const currentSnapshot = useMemo(() => {
    if (snapshot !== undefined) return snapshot;
    try {
      return recorder?.observedRunner()?.getLastSnapshot();
    } catch {
      return undefined;
    }
  }, [snapshot, recorder, version]);
  const sourcePrefix = useMemo(
    () => target?.kind === 'source-prefix' ? resolveSourcePrefix(currentSnapshot, target.position) : undefined,
    [target, currentSnapshot, version],
  );

  // Positions per axis, once per recorder. Filled from `forAxis`, i.e. during
  // a CONSUMER's render — a manual memo, idempotent (same key, same array),
  // so a StrictMode double render reads what the first one wrote.
  const axes = useMemo(() => new Map<string, readonly CursorPosition[]>(), [recorder, version, currentSnapshot]);
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
      setHeld({ on: recorder, target: { kind: 'stage', address: next } });
    },
    [recorder],
  );

  const selectSourcePrefix = useCallback((position: unknown): SourcePrefixResolution => {
    const resolved = resolveSourcePrefix(currentSnapshot, position);
    if (resolved.status === 'available') {
      setHeld({ on: recorder, target: Object.freeze({ kind: 'source-prefix', position: resolved.position }) });
    }
    return resolved;
  }, [recorder, currentSnapshot, version]);

  const onStepChange = useCallback(
    (_step: number, at: LensCursorAt): void => {
      moveTo({ runtimeStageId: at.runtimeStageId, commitIdx: at.commitIdx });
    },
    [moveTo],
  );

  // One `LensCursor` per positions list per address: the same object comes
  // back until the address moves, so a consumer's memo keyed on it holds
  // across renders. Keyed by the list's identity — `positionsFor` hands the
  // same array back per axis, a view's own axis is its own memo.
  const cursors = useMemo(
    () => new WeakMap<readonly CursorPosition[], Map<string, LensCursor>>(),
    [target, moveTo, recorder, sourcePrefix, version, currentSnapshot],
  );
  const over = useCallback(
    (positions: readonly CursorPosition[], drillPath: readonly string[] = []): LensCursor => {
      // Keyed by the list AND the drill path it is read under: the same list
      // handed in under another mount is another cursor.
      const drillKey = JSON.stringify(drillPath);
      let byDrill = cursors.get(positions);
      if (byDrill === undefined) {
        byDrill = new Map();
        cursors.set(positions, byDrill);
      }
      const known = byDrill.get(drillKey);
      if (known !== undefined) return known;
      // The run's END as an address: one past the last commit, no stage named.
      // Each axis derives its own last stop from it — the commit axis its last
      // visible stage, the milestone axis its absorbing end stop — because the
      // two axes anchor the same stage at different commit indices and one of
      // them hides framework stages; only an address serves both.
      const effective: SharedCursorTarget = target ?? {
        kind: 'stage',
        address: recorder === undefined ? NOWHERE : { runtimeStageId: '', commitIdx: recorder.getCommitCount() },
      };
      const cursor = cursorForTarget(positions, effective, (next) => {
        // Axis movement always lands on an actual stage stop. A visit never
        // calls this funnel and cannot discard a held source-prefix target.
        if (next.kind === 'stage') moveTo(next.address);
      }, drillPath, sourcePrefix);
      byDrill.set(drillKey, cursor);
      return cursor;
    },
    [target, moveTo, recorder, cursors, sourcePrefix],
  );
  const forAxis = useCallback(
    (granularity: SharedAxis, drillPath: readonly string[] = []): LensCursor =>
      over(positionsFor(granularity, drillPath), drillPath),
    [over, positionsFor],
  );

  return useMemo(
    () => ({ address, target, sourcePrefix, selectSourcePrefix, forAxis, over, moveTo, onStepChange }),
    [address, target, sourcePrefix, selectSourcePrefix, forAxis, over, moveTo, onStepChange],
  );
}
