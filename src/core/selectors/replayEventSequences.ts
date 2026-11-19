import type { CursorPosition } from '../group/cursorPositionsAtDrill.js';
import type { Hop } from './selectHops.js';

type Stop = Pick<CursorPosition, 'runtimeStageId' | 'kind'>;
type Anchor = Pick<Hop, 'kind'> & { readonly anchorStep?: { readonly runtimeStageId?: string } };
type LogRow = {
  readonly seq: number;
  readonly event: { readonly type?: string; readonly meta?: { readonly runtimeStageId?: string } };
};
type BoundaryEvent = { readonly type?: string; readonly payload?: unknown } | null | undefined;

/** The boundary channel supplies the first defined run input and the last run exit. */
export function readRunIO(boundary: { getEvents?(): Iterable<BoundaryEvent> } | undefined) {
  let runInput: unknown;
  let runOutput: unknown;
  try {
    for (const event of boundary?.getEvents?.() ?? []) {
      if (event?.type === 'run.entry' && runInput === undefined) runInput = event.payload;
      if (event?.type === 'run.exit') runOutput = event.payload;
    }
  } catch {
    // A runner may not have a boundary to read yet.
  }
  return { runInput, runOutput };
}

/** Scan from one end only as far as requested. The first visit from that end wins. */
function anchorLookup(log: readonly LogRow[], fromEnd: boolean) {
  const found = new Map<string, number>();
  const increment = fromEnd ? -1 : 1;
  let i = fromEnd ? log.length - 1 : 0;
  return (anchor: string): number | undefined => {
    const previous = found.get(anchor);
    if (previous !== undefined) return previous;
    while (i >= 0 && i < log.length) {
      const row = log[i]!;
      i += increment;
      const id = row.event.meta?.runtimeStageId;
      if (id === undefined || found.has(id)) continue;
      found.set(id, row.seq);
      if (id === anchor) return row.seq;
    }
    return undefined;
  };
}

/** Dispatch uses the first exact anchor; delivery and answers use the last. */
export function hopEventSequences(hops: readonly Anchor[], log: readonly LogRow[]): readonly number[] {
  if (log.length === 0 || hops.length === 0) return [];
  const first = anchorLookup(log, false);
  const last = anchorLookup(log, true);
  let previous = log[0]!.seq;
  return hops.map(hop => {
    const id = hop.anchorStep?.runtimeStageId;
    if (id !== undefined) {
      const delivery = hop.kind === 'llm->user' || hop.kind === 'answers';
      const seq = delivery ? last(id) : first(id);
      if (seq !== undefined && seq !== -1) previous = seq;
    }
    return previous;
  });
}

const plumbing = new Set([
  'run.entry', 'run.exit', 'subflow.entry', 'subflow.exit',
  'context.injected', 'context.slot_composed', 'stream.token', 'stream.thinking_delta',
]);

function commentaryStage({ event }: LogRow): string | undefined {
  const type = event.type;
  const spelling = type?.startsWith('agentfootprint.') ? type.slice('agentfootprint.'.length) : type;
  if (spelling && plumbing.has(spelling)) return undefined;
  return event.meta?.runtimeStageId;
}

function baseOf(id: string): string {
  const suffix = id.indexOf('#');
  return suffix === -1 ? id : id.slice(0, suffix);
}

/** Index the remaining rows only for scopes that a stop actually requests. */
function indexScopes(positions: readonly Stop[], log: readonly LogRow[], floor: number) {
  const scopes = new Map<string, number[]>();
  for (const { runtimeStageId: id } of positions) {
    if (id.startsWith('__root__')) continue;
    if (!scopes.has(id)) scopes.set(id, []);
    const base = baseOf(id);
    if (!scopes.has(base)) scopes.set(base, []);
  }
  for (let i = floor; i < log.length; i++) {
    const id = commentaryStage(log[i]!);
    if (!id) continue;
    scopes.get(id)?.push(i);
    // A stop's base ends before '#', so only these slash prefixes can match.
    const suffix = id.indexOf('#');
    for (let slash = id.indexOf('/'); slash >= 0 && (suffix === -1 || slash < suffix); slash = id.indexOf('/', slash + 1)) {
      scopes.get(id.slice(0, slash))?.push(i);
    }
  }
  return scopes;
}

/** First or last remaining match, in log order. */
function nextIndex(indices: readonly number[] | undefined, floor: number, closing: boolean): number | undefined {
  if (!indices?.length) return undefined;
  const last = indices[indices.length - 1]!;
  if (last < floor) return undefined;
  if (closing) return last;
  let low = 0;
  let high = indices.length - 1;
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (indices[mid]! < floor) low = mid + 1;
    else high = mid;
  }
  return indices[low];
}

/** Each visit consumes the next in-scope event, or the last remaining one when a group closes. */
export function commentaryEventSequences(positions: readonly Stop[], log: readonly LogRow[]): readonly number[] {
  if (!log.length) return positions.map(() => -1);
  let scopes: Map<string, number[]> | undefined;
  // Ordered visits usually find their match in one pass. Switch to indexed
  // lookups only if the total scan would exceed one pass (e.g. missing scopes).
  let scanBudget = log.length;
  let floor = 0;
  let previous = -1;
  return positions.map(({ runtimeStageId: id, kind }) => {
    const closing = kind === 'group-end';
    if (id.startsWith('__root__')) {
      if (!closing) return -1;
      previous = log[log.length - 1]!.seq;
      return previous;
    }
    if (floor === log.length) return previous;
    const base = baseOf(id);
    if (scopes === undefined) {
      const increment = closing ? -1 : 1;
      let at = closing ? log.length - 1 : floor;
      while (at >= floor && at < log.length && scanBudget > 0) {
        const stage = commentaryStage(log[at]!);
        scanBudget--;
        if (stage && (stage === id || stage === base || stage.startsWith(base + '/'))) {
          floor = at + 1;
          previous = log[at]!.seq;
          return previous;
        }
        at += increment;
      }
      if (at < floor || at >= log.length) return previous;
      scopes = indexScopes(positions, log, floor);
    }
    const exact = nextIndex(scopes.get(id), floor, closing);
    const nested = id === base ? undefined : nextIndex(scopes.get(base), floor, closing);
    const pick = closing ? Math.max : Math.min;
    const found = exact !== undefined && nested !== undefined ? pick(exact, nested) : exact ?? nested;
    if (found !== undefined) {
      floor = found + 1;
      previous = log[found]!.seq;
    }
    return previous;
  });
}
