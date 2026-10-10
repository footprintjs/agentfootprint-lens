/**
 * datasetTimeAxisOf — a dataset's declared time axis, judged by the library
 * (agentfootprint 9.128.0 `ArtifactMeta.timeAxis`; 9.129.0 moved it into the
 * time layer, `core/time/axis.ts`; time design § 8).
 *
 * WHY. A dataset may declare which column is time, in what unit and clock,
 * at what grain. Only the library judges that declaration (`readTimeAxis`),
 * words its summary (`describeTimeAxis` — "the one wording every consumer
 * shares") and places its values (`normaliseInstants` — every value to a UTC
 * instant, and every value whose clock is unknown COUNTED, never read as
 * UTC). The lens calls those three and prints what they return; it keeps no
 * second copy of any rule.
 *
 * Under a peer older than 9.128.0 the three are absent: read at CALL time
 * through explicit namespace properties (so an older peer still links), and
 * the declaration is then printed as the ticket holds it, labelled not checked
 * — never as declared-and-valid. Never return the whole namespace: that makes
 * every agent export observable and retains the runtime in browser bundles.
 */

import * as agentfootprint from 'agentfootprint';

/** `DatasetTimeAxis`, mirrored (the peer floor predates it — see `shapes.ts`). */
export interface DatasetTimeAxisShape {
  readonly column: string;
  readonly unit: string;
  readonly zone?: string;
  readonly interval?: string;
  readonly aggregate?: string | Readonly<Record<string, string>>;
}

/** `AxisCounts`, mirrored: every value the library's view could not place, by reason. */
export interface AxisCountsShape {
  readonly naive: number;
  readonly dstAmbiguous: number;
  readonly dstGap: number;
  readonly unreadable: number;
  readonly missing: number;
}

type NormalisedAxis =
  | {
      readonly status: 'instants';
      readonly points: readonly unknown[];
      readonly counts: AxisCountsShape;
    }
  | {
      readonly status: 'naive-values';
      readonly count: number;
      readonly points: readonly unknown[];
      readonly counts: AxisCountsShape;
    }
  | { readonly status: 'refused'; readonly count: number; readonly counts: AxisCountsShape };

/** What the lens can say about a ticket's time axis. */
export type DatasetTimeAxisView =
  | { readonly status: 'absent' }
  | {
      readonly status: 'declared';
      readonly axis: DatasetTimeAxisShape;
      /** The library's own summary wording, when the declaration says how rows summarise. */
      readonly summary?: string;
      /** The library's read-side view over the rows, when the rows were handed in. */
      readonly values?: AxisValues;
    }
  | { readonly status: 'malformed'; readonly issues: readonly string[] }
  /** The peer cannot judge it: the declaration as the ticket holds it. */
  | { readonly status: 'unjudged'; readonly raw: unknown };

/** `normaliseInstants`' verdict, reduced to what a line prints. */
export interface AxisValues {
  readonly status: NormalisedAxis['status'];
  /** Values placed as instants. */
  readonly placed: number;
  /** Values whose clock is unknown (`naive` + `dstAmbiguous`) — `naive-values` / `refused`. */
  readonly clockUnknown: number;
  readonly counts: AxisCountsShape;
}

// A private port derived from the official implementation, optional because
// the supported peer floor predates these functions. These implementation
// types do not escape into the Lens's public, older-peer-compatible shapes.
type Door = Partial<Pick<
  typeof agentfootprint,
  'readTimeAxis' | 'describeTimeAxis' | 'normaliseInstants'
>>;

/** The three judges, read at call time (absent under an older peer). */
function door(): Door {
  return {
    readTimeAxis: agentfootprint.readTimeAxis,
    describeTimeAxis: agentfootprint.describeTimeAxis,
    normaliseInstants: agentfootprint.normaliseInstants,
  };
}

function valuesOf(
  rows: readonly unknown[],
  axis: Parameters<typeof agentfootprint.normaliseInstants>[1],
): AxisValues | undefined {
  const normalise = door().normaliseInstants;
  if (typeof normalise !== 'function') return undefined;
  try {
    const view = normalise(rows, axis);
    return {
      status: view.status,
      placed: view.status === 'refused' ? 0 : view.points.length,
      clockUnknown: view.status === 'instants' ? 0 : view.count,
      counts: view.counts,
    };
  } catch {
    // A declaration the judge accepted and the view refuses: say nothing about values.
    return undefined;
  }
}

/**
 * The ticket's time axis — `meta` is the claim ticket (`ArtifactMetaView` or
 * anything shaped like one), `rows` the dataset's rows when the caller holds
 * them (the values are then placed by the library's view).
 */
export function datasetTimeAxisOf(meta: unknown, rows?: readonly unknown[]): DatasetTimeAxisView {
  const raw =
    meta !== null && typeof meta === 'object' ? (meta as { readonly timeAxis?: unknown }).timeAxis : undefined;
  if (raw === undefined) return { status: 'absent' };
  const { readTimeAxis, describeTimeAxis } = door();
  if (typeof readTimeAxis !== 'function') return { status: 'unjudged', raw };
  const reading = readTimeAxis(meta);
  if (reading.status === 'absent') return { status: 'absent' };
  if (reading.status === 'malformed') return { status: 'malformed', issues: reading.issues };
  const summary = typeof describeTimeAxis === 'function' ? describeTimeAxis(reading.axis) : undefined;
  const values = rows !== undefined ? valuesOf(rows, reading.axis) : undefined;
  return {
    status: 'declared',
    axis: reading.axis,
    ...(summary !== undefined ? { summary } : {}),
    ...(values !== undefined ? { values } : {}),
  };
}
