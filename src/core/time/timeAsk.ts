/**
 * timeAskOf — the time half of a paused `requestInput` ask (agentfootprint
 * 9.129.0, time design § 6, step T4).
 *
 * WHY. A `requestInput` field may carry `format: 'instant' | 'time-range' |
 * 'zone'`; the library judges the person's answer at the resume door and,
 * when it refuses one, asks the SAME ask again (same `requestId`) with
 * `refused: { answer, reason }` — `reason` a sentence from the library's
 * catalog (`defaultTimeAskMessages`, overridable by the app) — and
 * `repeat: { count }`. A viewer that shows only the question hides that the
 * person already answered and was refused, and why.
 *
 * Reads the pause wherever it travels: the `AwaitingInput` itself, a pause
 * outcome or `pauseData` (`{ awaitingInput }`), or the lens's
 * `PendingAskView` (`{ pauseData: { awaitingInput } }`). Narrowed by shape,
 * never trusted whole; `undefined` when no field carries a `format` — an ask
 * with no time field has no time rows (omit, never deny).
 */

/** A field value on the wire (`InputValue`). */
export type InputValue = string | number | boolean;

/** One time field of the ask, as read. */
export interface TimeAskField {
  readonly id: string;
  readonly format: string;
  readonly required: boolean;
  /** In the ask's `missing` list — still to be answered. */
  readonly missing: boolean;
  readonly description?: string;
  /** The choices, each with its library-rendered label when the field carries `labels`. */
  readonly choices: readonly { readonly value: InputValue; readonly label?: string }[];
  readonly strict: boolean;
}

/** The ask's time half. */
export interface TimeAsk {
  readonly requestId?: string;
  readonly question?: string;
  readonly fields: readonly TimeAskField[];
  /** The refused answer — only the refused fields' values — and the catalog's reason, verbatim. */
  readonly refused?: {
    readonly answer?: Readonly<Record<string, InputValue>>;
    readonly reason: string;
  };
  /** How many times the person already answered this ask. */
  readonly repeat?: number;
}

type Rec = Readonly<Record<string, unknown>>;
const isRec = (v: unknown): v is Rec => v !== null && typeof v === 'object' && !Array.isArray(v);
const isValue = (v: unknown): v is InputValue =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

/** The `AwaitingInput` inside any of the three homes a pause travels in. */
function awaitingOf(value: unknown): Rec | undefined {
  if (!isRec(value)) return undefined;
  if (Array.isArray(value.fields)) return value;
  if (isRec(value.awaitingInput)) return awaitingOf(value.awaitingInput);
  if (isRec(value.pauseData)) return awaitingOf(value.pauseData);
  return undefined;
}

function fieldOf(raw: unknown, missing: ReadonlySet<string>): TimeAskField | undefined {
  if (!isRec(raw) || typeof raw.id !== 'string' || typeof raw.format !== 'string') return undefined;
  const values = Array.isArray(raw.enum) ? raw.enum.filter(isValue) : [];
  const labels = Array.isArray(raw.labels) ? raw.labels : [];
  return {
    id: raw.id,
    format: raw.format,
    required: raw.required !== false,
    missing: missing.has(raw.id),
    ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
    choices: values.map((value, i) => {
      const label = labels[i];
      return typeof label === 'string' ? { value, label } : { value };
    }),
    strict: raw.strict === true,
  };
}

function answerOf(raw: unknown): Readonly<Record<string, InputValue>> | undefined {
  if (!isRec(raw)) return undefined;
  const out: Record<string, InputValue> = {};
  for (const [k, v] of Object.entries(raw)) if (isValue(v)) out[k] = v;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function timeAskOf(value: unknown): TimeAsk | undefined {
  const awaiting = awaitingOf(value);
  if (awaiting === undefined) return undefined;
  const missing = new Set(
    Array.isArray(awaiting.missing) ? awaiting.missing.filter((m): m is string => typeof m === 'string') : [],
  );
  const fields = (awaiting.fields as readonly unknown[])
    .map((f) => fieldOf(f, missing))
    .filter((f): f is TimeAskField => f !== undefined);
  if (fields.length === 0) return undefined;
  const refused = awaiting.refused;
  const repeat = awaiting.repeat;
  const answer = isRec(refused) ? answerOf(refused.answer) : undefined;
  return {
    ...(typeof awaiting.requestId === 'string' ? { requestId: awaiting.requestId } : {}),
    ...(typeof awaiting.question === 'string' ? { question: awaiting.question } : {}),
    fields,
    ...(isRec(refused) && typeof refused.reason === 'string'
      ? { refused: { reason: refused.reason, ...(answer !== undefined ? { answer } : {}) } }
      : {}),
    ...(isRec(repeat) && typeof repeat.count === 'number' ? { repeat: repeat.count } : {}),
  };
}
