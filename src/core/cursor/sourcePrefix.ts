import { stateAt, type FoldSource, type FoldedState } from 'foottrace';

/** The optional sourcePosition wire carried by a version-1 TrustBoundaries fact. */
export interface SourcePosition {
  readonly engineRunId: string;
  readonly logRunId: string;
  readonly drillPath: readonly string[];
  /** Inclusive local log index; -1 means the recorded base, never the first commit. */
  readonly committedThroughIdx: number;
}

export type SourcePrefixState =
  | { readonly status: 'available'; readonly source: FoldSource; readonly folded: FoldedState }
  | {
      readonly status: 'unavailable';
      readonly reason: 'withheld' | 'missing-base' | 'damaged-values' | 'fold-failed';
    };

export type SourcePrefixResolution =
  | { readonly status: 'available'; readonly position: SourcePosition; readonly state: SourcePrefixState }
  | {
      readonly status: 'unavailable';
      readonly position?: SourcePosition;
      readonly reason: 'missing-position' | 'invalid-position' | 'missing-log' | 'log-mismatch' | 'prefix-unavailable' | 'invalid-log';
    };

function object(value: unknown): object {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('shape');
  return value;
}

/** Metadata is read only from own data properties; accessors and proxy failures are refusals. */
function own(value: object, key: PropertyKey): unknown {
  const property = Object.getOwnPropertyDescriptor(value, key);
  if (property !== undefined && !('value' in property)) throw new Error('accessor');
  return property?.value;
}

function id(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) throw new Error('id');
  return value;
}

function path(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new Error('path');
  const length = own(value, 'length');
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 || length > 32) throw new Error('path');
  const result: string[] = [];
  for (let i = 0; i < length; i++) result.push(id(own(value, String(i))));
  return Object.freeze(result);
}

function samePath(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((part, i) => part === b[i]);
}

/** Validate/copy only the four declared fields. No coercion, inferred IDs, or prototype reads. */
export function readSourcePosition(value: unknown): SourcePosition | undefined {
  try {
    const input = object(value);
    const committedThroughIdx = own(input, 'committedThroughIdx');
    if (typeof committedThroughIdx !== 'number' || !Number.isSafeInteger(committedThroughIdx) || committedThroughIdx < -1) return undefined;
    return Object.freeze({
      engineRunId: id(own(input, 'engineRunId')),
      logRunId: id(own(input, 'logRunId')),
      drillPath: path(own(input, 'drillPath')),
      committedThroughIdx,
    });
  } catch {
    return undefined;
  }
}

function unavailable(
  reason: Extract<SourcePrefixResolution, { status: 'unavailable' }>['reason'],
  position?: SourcePosition,
): SourcePrefixResolution {
  return Object.freeze({ status: 'unavailable', reason, ...(position === undefined ? {} : { position }) });
}

function stateUnavailable(
  reason: Extract<SourcePrefixState, { status: 'unavailable' }>['reason'],
): SourcePrefixState {
  return Object.freeze({ status: 'unavailable', reason });
}

/**
 * Resolve one emitting frame's local prefix against the log that actually owns it.
 * The emitting leg need not equal the snapshot's current runId (same-executor resume).
 * Only logRunId + the full runtime mount path bind the log. Never uses globalContext,
 * emitter-stage lookup, an enclosing mount's commit index, or a current-log fallback.
 */
export function resolveSourcePrefix(snapshot: unknown, value: unknown): SourcePrefixResolution {
  const position = readSourcePosition(value);
  if (position === undefined) return unavailable(value === undefined ? 'missing-position' : 'invalid-position');
  try {
    if (snapshot === undefined || snapshot === null) return unavailable('missing-log', position);
    const root = object(snapshot);
    let selected = root;
    if (position.drillPath.length > 0) {
      const results = own(root, 'subflowResults');
      if (results === undefined) return unavailable('missing-log', position);
      const mount = own(object(results), position.drillPath[position.drillPath.length - 1]!);
      if (mount === undefined) return unavailable('missing-log', position);
      selected = object(own(object(mount), 'treeContext'));
    }
    const rawAddress = own(selected, 'logAddress');
    if (rawAddress === undefined) return unavailable('missing-log', position);
    const address = object(rawAddress);
    if (id(own(address, 'logRunId')) !== position.logRunId || !samePath(path(own(address, 'drillPath')), position.drillPath)) {
      return unavailable('log-mismatch', position);
    }
    const rawLog = own(selected, selected === root ? 'commitLog' : 'history');
    if (!Array.isArray(rawLog)) return unavailable('missing-log', position);
    const length = own(rawLog, 'length');
    if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 || position.committedThroughIdx >= length) {
      return unavailable('prefix-unavailable', position);
    }
    const prefix: unknown[] = [];
    for (let i = 0; i <= position.committedThroughIdx; i++) {
      const row = object(own(rawLog, String(i)));
      if (own(row, 'idx') !== i || typeof own(row, 'runtimeStageId') !== 'string') {
        return unavailable('prefix-unavailable', position);
      }
      prefix.push(row);
    }
    let state: SourcePrefixState;
    if (own(root, 'stateValuesWithheld') === true || own(selected, 'stateValuesWithheld') === true) {
      state = stateUnavailable('withheld');
    } else {
      const initialState = own(selected, 'initialState');
      if (initialState === undefined || initialState === null || typeof initialState !== 'object' || Array.isArray(initialState)) {
        state = stateUnavailable('missing-base');
      } else {
        // Prefix validation happens before the engine fold: stateAt legitimately
        // clamps other callers, but this source address is exact and must not.
        const source: FoldSource = Object.freeze({ commitLog: Object.freeze(prefix), initialState: initialState as Record<string, unknown> });
        try {
          const folded = stateAt(source, position.committedThroughIdx);
          state = folded.throughCommitIdx !== position.committedThroughIdx || (folded.skipped?.length ?? 0) > 0
            ? stateUnavailable('damaged-values')
            : Object.freeze({ status: 'available', source, folded });
        } catch {
          state = stateUnavailable('fold-failed');
        }
      }
    }
    return Object.freeze({ status: 'available', position, state });
  } catch {
    return unavailable('invalid-log', position);
  }
}
