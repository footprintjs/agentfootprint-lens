/** The optional sourcePosition wire carried by a version-1 TrustBoundaries fact. */
export interface SourcePosition {
  readonly engineRunId: string;
  readonly logRunId: string;
  readonly drillPath: readonly string[];
  /** Inclusive local log index; -1 means the recorded base, never the first commit. */
  readonly committedThroughIdx: number;
}


export function object(value: unknown): object {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('shape');
  return value;
}

/** Metadata is read only from own data properties; accessors and proxy failures are refusals. */
export function own(value: object, key: PropertyKey): unknown {
  const property = Object.getOwnPropertyDescriptor(value, key);
  if (property !== undefined && !('value' in property)) throw new Error('accessor');
  return property?.value;
}

export function id(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) throw new Error('id');
  return value;
}

export function path(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new Error('path');
  const length = own(value, 'length');
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 || length > 32) throw new Error('path');
  const result: string[] = [];
  for (let i = 0; i < length; i++) result.push(id(own(value, String(i))));
  return Object.freeze(result);
}

export function samePath(a: readonly string[], b: readonly string[]): boolean {
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

