/**
 * The time rows as the lens reads them — MIRRORS of agentfootprint 9.129.0's
 * `core/time/rows.ts` types (`ClockRow`, `ClockOnResumeRow`, `CallRow`,
 * `CallWindowRow`, `TimeReadingRow`) and `TimeRange`, holding only the fields
 * the time views print.
 *
 * WHY MIRRORS, not `import type` from the library: the lens's peer floor is
 * agentfootprint ^9.116.0, which exports none of these names, and the lens's
 * published `.d.ts` must type-check against its floor (the
 * `core/artifacts/types.ts` precedent: "Mirrors `ArtifactMeta`"). The mirror
 * is not a second owner: `test/time/shapes.types.test.ts` assigns every
 * library type to its mirror, so `npm run typecheck` fails the day the
 * library renames or retypes a field the lens prints.
 */

/** Half-open `[from, to)`, instants with offsets (`TimeRange`). */
export interface TimeRangeShape {
  readonly from: string;
  readonly to: string;
}

/** `ClockRow` — the turn's clock stamp. */
export interface ClockRowShape {
  readonly kind: 'clock';
  readonly turn: number;
  readonly iteration: number;
  readonly now: string;
  readonly nowSource: string;
  readonly zone: string;
  readonly zoneSource: string;
  readonly window?: TimeRangeShape & { readonly source: string };
}

/** The clock values a resume passed, or the frozen clock kept. */
export interface ClockValuesShape {
  readonly now?: string;
  readonly zone?: string;
  readonly window?: TimeRangeShape;
}

/** `ClockOnResumeRow` — a resume's different `time`, recorded not applied. */
export interface ClockOnResumeRowShape {
  readonly kind: 'clock-on-resume';
  readonly turn: number;
  readonly iteration: number;
  readonly passed: ClockValuesShape;
  readonly kept: ClockValuesShape;
}

/** `CallDrift` — a look-back call's dispatch drift. */
export type CallDriftShape =
  | { readonly byMs: number; readonly outcome: 'redrawn'; readonly form: number }
  | { readonly byMs: number; readonly outcome: 'shifted' };

/** `CallRow` — one dispatched call's wall-clock moment. */
export interface CallRowShape {
  readonly kind: 'call';
  readonly turn: number;
  readonly iteration: number;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly dispatchedAt: string;
  readonly drift?: CallDriftShape;
}

/** `PersonWindow` — the person's window a call-window row names. */
export interface PersonWindowShape extends TimeRangeShape {
  readonly source: string;
  readonly mention?: number;
}

/** `CallWindowRow` — which window one call carries, and how. */
export interface CallWindowRowShape {
  readonly kind: 'call-window';
  readonly turn: number;
  readonly iteration: number;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly how: string;
  readonly form?: number;
  readonly asked?: TimeRangeShape;
  readonly person?: PersonWindowShape;
  readonly by?: string;
  readonly rounded?: true;
  readonly why?: string;
  readonly sent?: TimeRangeShape;
  readonly differs?: { readonly extra: readonly TimeRangeShape[] };
  readonly trimmedByTool?: true;
  readonly partlyBeyondRetention?: true;
  readonly refused?: string;
  readonly argument?: string;
}

/** `TimeCandidate` — one window the resolver made of a mention's parts (the printed fields). */
export interface TimeCandidateShape {
  readonly range: TimeRangeShape;
  readonly zone: string;
  readonly grain: string;
  readonly said: readonly string[];
  readonly implied: readonly string[];
  readonly notes: readonly { readonly kind: string }[];
}

/** `ReadingChoice` — how a mention's reading settled. */
export type ReadingChoiceShape =
  | { readonly by: 'only'; readonly candidate: number }
  | { readonly by: 'policy'; readonly candidate: number; readonly policy: object }
  | {
      readonly by: 'open';
      readonly remaining: readonly number[];
      readonly open: readonly string[];
      readonly policy?: object;
    }
  | { readonly by: 'none'; readonly why: string };

/** `TimeReadingRow` — one mention the armed reader found (or `mentions: 0`). */
export interface TimeReadingRowShape {
  readonly kind: 'time-reading';
  readonly turn: number;
  readonly iteration: number;
  readonly reader: {
    readonly id: string;
    readonly version: string;
    readonly kind: string;
    readonly locale: string;
  };
  readonly tzdata: string;
  readonly mentions: number;
  readonly mention?: number;
  readonly quote?: string;
  readonly problem?: string;
  readonly refused?: string;
  readonly candidates?: readonly TimeCandidateShape[];
  readonly choice?: ReadingChoiceShape;
}
