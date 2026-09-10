/**
 * The tag axis — the Why Lens's scrub positions rebuilt from DECLARED tags.
 *
 * footprintjs 9.21's `tagStops(names)` is the strategy: keep the stops whose
 * first bundle carries any of the asked-for tags, fold the untagged stages
 * into the tagged stop before them (`filterStops`), and carry the bundle's
 * whole tag array as `Stop.meta`. This module speaks those stops in the
 * Lens's own `CursorPosition` grammar, so the picked axis rides the SAME port
 * (`openLensCursor`), the same funnel (`useLensCursor`) and the same panels
 * as the default one. No new position state anywhere: the axis is a
 * different LIST, the cursor is still one step into it.
 *
 * THE BOOKENDS ARE THE LENS'S. The default root axis opens and closes on the
 * lens's own `__root__#0` bookends (`'group-start'` / `'group-end'` at depth
 * 0), and every panel — the Served tab's "no call at or before this stop",
 * the chart's empty/full gate — reads those exact positions. So the tag axis
 * borrows them from the default axis rather than inventing lookalikes; the
 * library's `'start'` / `'end'` stops supply only the commit indices.
 *
 * `tagStops` is read off the `footprintjs/trace` namespace at call time: the
 * peer range still admits 9.17, which has no such export. On such a peer the
 * axis is `undefined` and the picker says so with a label.
 */

import * as trace from 'footprintjs/trace';
import type { Stop, TimeTravelStrategy } from 'footprintjs/trace';
import * as agentfootprint from 'agentfootprint';

import type { CursorPosition } from '../group/cursorPositionsAtDrill.js';

type TagStops = (tags?: readonly string[]) => TimeTravelStrategy<readonly string[]>;

/** footprintjs 9.21's `tagStops`, when the installed peer ships it. */
export function tagStopsStrategy(): TagStops | undefined {
  const fn = (trace as { tagStops?: unknown }).tagStops;
  return typeof fn === 'function' ? (fn as TagStops) : undefined;
}

type MilestoneFromTags = (
  tags: readonly unknown[] | undefined,
) => { readonly kind: string; readonly label: string } | null;

function milestoneOf(meta: readonly string[] | undefined): { kind: string; label: string } | undefined {
  const fn = (agentfootprint as { milestoneFromTags?: unknown }).milestoneFromTags;
  if (typeof fn !== 'function') return undefined;
  const m = (fn as MilestoneFromTags)(meta);
  return m ? { kind: m.kind, label: m.label } : undefined;
}

/** The stops `tagStops(tags)` derives from a snapshot's log, or `undefined` on a peer without it. */
export function tagStopsFor(snapshot: unknown, tags: readonly string[]): readonly Stop<readonly string[]>[] | undefined {
  const make = tagStopsStrategy();
  if (make === undefined) return undefined;
  const s = snapshot as { commitLog?: unknown; executionTree?: unknown } | null | undefined;
  const log = Array.isArray(s?.commitLog) ? (s.commitLog as Parameters<TimeTravelStrategy['stopsFor']>[0]) : [];
  const tree = s?.executionTree as Parameters<TimeTravelStrategy['stopsFor']>[1];
  return make(tags).stopsFor(log, tree);
}

function isRootBookend(p: CursorPosition | undefined, kind: 'group-start' | 'group-end'): p is CursorPosition {
  return p !== undefined && p.depth === 0 && (p.kind === kind || p.kind === (kind === 'group-start' ? 'user-in' : 'user-out'));
}

/**
 * The Lens positions for a picked tag set, or `undefined` when the peer has
 * no `tagStops`. An empty pick is the caller's business (the default axis);
 * an empty log is an empty axis.
 *
 * @param snapshot the run's snapshot (`runner.getLastSnapshot()`)
 * @param tags     the picked tag names — `tagStops`'s any-of keep rule
 * @param base     the default axis at the ROOT drill level; its two bookends
 *                 are reused verbatim when present
 *
 * @example
 * ```ts
 * const axis = tagAxisPositions(snapshot, ['milestone:llm-turn'], scrubAxisFor(recorder, 'group'));
 * axis?.map((p) => p.label);   // ['Run · start', 'LLM turn 1', 'LLM turn 2', 'Run · end']
 * ```
 */
export function tagAxisPositions(
  snapshot: unknown,
  tags: readonly string[],
  base: readonly CursorPosition[],
): readonly CursorPosition[] | undefined {
  const stops = tagStopsFor(snapshot, tags);
  if (stops === undefined) return undefined;
  if (stops.length === 0) return [];
  const first = base[0];
  const last = base[base.length - 1];
  const ordinals = new Map<string, number>();
  const out: CursorPosition[] = [];
  for (const stop of stops) {
    if (stop.kind === 'start') {
      out.push(isRootBookend(first, 'group-start') ? first : rootBookend('group-start', stop));
      continue;
    }
    if (stop.kind === 'end') {
      out.push(isRootBookend(last, 'group-end') ? last : rootBookend('group-end', stop));
      continue;
    }
    const milestone = milestoneOf(stop.meta);
    const name = milestone?.label ?? stop.label;
    const n = (ordinals.get(name) ?? 0) + 1;
    ordinals.set(name, n);
    out.push({
      runtimeStageId: stop.runtimeStageId,
      runtimeGroupId: stop.runtimeStageId,
      label: `${name} ${n}`,
      kind: 'commit',
      depth: 1,
      commitIdx: stop.commitIdx,
      ...(milestone !== undefined ? { milestone: milestone.kind } : {}),
    });
  }
  return out;
}

/** The lens's root bookend, when the default axis had none to borrow. */
function rootBookend(kind: 'group-start' | 'group-end', stop: Stop<unknown>): CursorPosition {
  return {
    runtimeStageId: '__root__#0',
    runtimeGroupId: '__root__#0',
    label: stop.label,
    kind,
    depth: 0,
    commitIdx: stop.commitIdx,
  };
}
