/**
 * sharedCursor — ONE address, every axis.
 *
 * A host that mounts several lenses over one recording keeps ONE cursor. The
 * lenses draw different axes — the commit axis (every executed stage) and
 * the milestone axis (the agent's own moments) — so what the host holds must
 * be an ADDRESS on the record, never a step on an axis: a step is a fact
 * about one axis, an address is a fact about the run.
 *
 * The law, in three sentences. A tab DERIVES its step from the address
 * (`stepForAddress`). Only a MOVER changes the address (`moveTo` hands the
 * landed position's address back). A visit to a coarser axis and back lands
 * on the same commit, because the address was never rewritten by the visit.
 *
 * The step an axis derives is the library's own ladder: the exact stage when
 * the axis has it (`stepForRuntimeStageId`), else the stop that CONTAINS the
 * commit — the last stop at or before it (`stepForCommitIdx`) — else `-1`,
 * which `lensCursorFrom` reads as "no position on this axis" (an empty
 * reading that says so; nothing is nudged onto a neighbour).
 *
 * Headless: no React, no state. `useSharedCursor` (react/) holds the address
 * and hands this out per axis. See src/core/cursor/README.md.
 */
import type { CursorPosition } from '../group/cursorPositionsAtDrill.js';
import { stepForCommitIdx } from '../group/stepForCommitIdx.js';
import { stepForRuntimeStageId } from '../group/stepForRuntimeStageId.js';
import { lensCursorFrom, type LensCursor } from './lensCursor.js';
import { foldCommitIdxOf } from './foldAt.js';
import type { SourcePosition, SourcePrefixResolution } from './sourcePrefix.js';

/** Where THE cursor stands — on the record, not on an axis. */
export interface CursorAddress {
  readonly runtimeStageId: string;
  readonly commitIdx: number;
  /**
   * The subflow the address is read inside — `scrubAxisFor`'s `drillPath`.
   * Absent = the root log. Part of the address because a subflow keeps its
   * own log: the same commit index names a different stage inside a mount.
   */
  readonly drillPath?: readonly string[];
}

/** A source prefix is not a stage stop. One held target names either, never both. */
export interface SourcePrefixTarget {
  readonly kind: 'source-prefix';
  readonly position: SourcePosition;
}

export type SharedCursorTarget =
  | { readonly kind: 'stage'; readonly address: CursorAddress }
  | SourcePrefixTarget;

/** The address a position stands at, carrying the drill path it was read under. */
export function addressOf(position: CursorPosition, drillPath?: readonly string[]): CursorAddress {
  return Object.freeze({
    runtimeStageId: position.runtimeStageId,
    commitIdx: position.commitIdx,
    ...(drillPath !== undefined && drillPath.length > 0 ? { drillPath } : {}),
  });
}

/**
 * The step `positions` derives for `address`: the stop standing at BOTH the
 * stage and the commit, else the exact stage (the library's own ladder),
 * else the stop that contains the commit, else `-1`.
 *
 * Why the first rung: an axis can hold several stops on ONE stage — a
 * milestone axis stops at a route decision and at the answer the same
 * stage produced, one commit apart — so the stage name alone is ambiguous
 * and the commit index is what tells them apart.
 */
export function stepForAddress(positions: readonly CursorPosition[], address: CursorAddress): number {
  if (address.runtimeStageId !== '') {
    const both = positions.findIndex(
      (p) => p.runtimeStageId === address.runtimeStageId && p.commitIdx === address.commitIdx,
    );
    if (both >= 0) return both;
    const exact = stepForRuntimeStageId(positions, address.runtimeStageId);
    if (exact >= 0) return exact;
  }
  return stepForCommitIdx(positions, address.commitIdx);
}

const ROOT: readonly string[] = Object.freeze([]);

function sameDrill(a: readonly string[] | undefined, b: readonly string[]): boolean {
  const x = a ?? ROOT;
  return x.length === b.length && x.every((seg, i) => seg === b[i]);
}

/**
 * A `LensCursor` over `positions` — the axis read under `axisDrillPath` —
 * whose reading is DERIVED from `address` and whose `moveTo` hands the landed
 * position's address (under that same drill path) to `onMove` — the one
 * funnel. It holds nothing: call it again with the new address.
 *
 * ACROSS MOUNTS: a subflow keeps its own log, so a commit index from one
 * drill path names a different stage under another. When the address was
 * read under a different drill path than this axis, only the exact stage
 * lookup applies (stage ids are unique across the whole run); there is no
 * commit fallback, and an address the axis cannot hold reads as no position.
 */
export function cursorForAddress(
  positions: readonly CursorPosition[],
  address: CursorAddress,
  onMove: (next: CursorAddress) => void,
  axisDrillPath: readonly string[] = ROOT,
): LensCursor {
  const step = sameDrill(address.drillPath, axisDrillPath)
    ? stepForAddress(positions, address)
    : address.runtimeStageId === ''
      ? -1
      : stepForRuntimeStageId(positions, address.runtimeStageId);
  return lensCursorFrom(positions, step, (n: number) => {
    if (positions.length === 0) return;
    const landed = positions[Math.min(Math.max(Math.trunc(n), 0), positions.length - 1)];
    if (landed !== undefined) onMove(addressOf(landed, axisDrillPath));
  });
}

/**
 * Read the one target on an axis. Source prefixes can only project to an exact
 * ROOT fold stop after their log was resolved; no stage/nearest fallback.
 * Drilled legacy axes use enclosing/overlay indices, not local history indices,
 * so they cannot claim an exact prefix stop. Visiting them never changes target.
 */
export function cursorForTarget(
  positions: readonly CursorPosition[],
  target: SharedCursorTarget,
  onMove: (next: SharedCursorTarget) => void,
  axisDrillPath: readonly string[] = ROOT,
  resolved?: SourcePrefixResolution,
): LensCursor {
  if (target.kind === 'stage') {
    return cursorForAddress(positions, target.address, (address) => onMove({ kind: 'stage', address }), axisDrillPath);
  }
  const position = target.position;
  const matches = resolved?.status === 'available'
    && resolved.state.status === 'available'
    && resolved.position.engineRunId === position.engineRunId
    && resolved.position.logRunId === position.logRunId
    && resolved.position.committedThroughIdx === position.committedThroughIdx
    && sameDrill(resolved.position.drillPath, position.drillPath);
  const step = matches && position.drillPath.length === 0 && axisDrillPath.length === 0
    ? positions.findIndex((stop) => foldCommitIdxOf(stop) === position.committedThroughIdx)
    : -1;
  const cursor = lensCursorFrom(positions, step, (n) => {
    if (positions.length === 0) return;
    const landed = positions[Math.min(Math.max(Math.trunc(n), 0), positions.length - 1)];
    if (landed !== undefined) onMove({ kind: 'stage', address: addressOf(landed, axisDrillPath) });
  });
  return Object.freeze({ ...cursor, at: Object.freeze({ ...cursor.at, sourcePosition: position }) });
}
