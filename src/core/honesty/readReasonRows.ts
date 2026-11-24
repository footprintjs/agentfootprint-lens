import { assessAnswer } from 'agentfootprint/observe';
import { object, own } from '../cursor/sourcePosition.js';
import { recordedReasonSentence, type StandingRead } from './readStanding.js';
import type { HonestyEventAddress, RecordedTurnEvent } from './readTurnEvents.js';

type Witness = ReturnType<typeof assessAnswer>['reasons'][number]['witness'][number];
type AssessmentReason = ReturnType<typeof assessAnswer>['reasons'][number];

export interface HonestyReasonEvidence {
  readonly address: HonestyEventAddress;
  /** Index into the assessment at this event, in the producer's order. */
  readonly reasonIndex: number;
  readonly witnesses?: readonly Witness[];
}

export interface HonestyReasonRow {
  readonly text: string;
  readonly tools?: readonly string[];
  readonly details?: readonly string[];
  readonly evidence: HonestyReasonEvidence;
}

const failureKinds: ReadonlyMap<string, string> = new Map([
  ['timeout', 'The tool timed out.'],
  ['rate-limited', 'The tool was rate limited.'],
  ['server', 'The tool reported a server failure.'],
  ['network', 'The tool reported a network failure.'],
  ['auth', 'The tool reported an authentication failure.'],
  ['permanent', 'The tool reported a permanent failure.'],
]);

const foldLists = [
  'history', 'enteredToolCalls', 'settledToolCalls', 'libraryResultLimits',
  'findingsLedger', 'coverageDeclared',
];

function boundedWord(value: unknown, max = 512): string | undefined {
  return typeof value === 'string' && value.trim() !== '' && value.length <= max &&
    value !== 'REDACTED' && value !== '[REDACTED]' ? value : undefined;
}

function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function boundedFold(
  state: Record<string, unknown>,
  snapshot: object,
  standing: Extract<StandingRead, { status: 'recorded' }>,
): ReadonlyMap<string, AssessmentReason> {
  const recorders = own(snapshot, 'recorders');
  if (recorders !== undefined && (!Array.isArray(recorders) || recorders.length > 64)) {
    return new Map();
  }
  // Preserve the producer's served-record policy input without passing through
  // foreign values or invoking a recorder getter.
  const markerRows = (recorders ?? []).flatMap((row: unknown) =>
    row !== null && typeof row === 'object' ? [{ id: own(row, 'id') }] : [],
  );
  for (const key of foldLists) {
    const list = own(state, key);
    if (Array.isArray(list) && list.length > 1_024) return new Map();
  }
  const assessment = assessAnswer({ snapshot: { sharedState: state, recorders: markerRows } });
  if (assessment.standing !== standing.standing || assessment.keptOut !== undefined) return new Map();
  return new Map(assessment.reasons.filter(reason => reason.witness.length > 0).map(reason => [reason.reason, reason]));
}

function retainedLimitDetails(state: object, reason: AssessmentReason): string[] {
  // A recording can come from a newer producer than the development peer.
  const code: string = reason.reason;
  if (code !== 'result-cut' && code !== 'times-without-zone') return [];
  const rows = own(state, 'libraryResultLimits');
  if (!Array.isArray(rows)) return [];
  const details: string[] = [];
  for (const witness of reason.witness.slice(0, 5)) {
    if (witness.kind !== 'state' || witness.key !== 'libraryResultLimits') continue;
    const index = /^\/(\d+)\/(?:keptChars|naiveCount)$/.exec(witness.path)?.[1];
    if (index === undefined) continue;
    const row = object(own(rows, index));
    if (own(row, 'kind') !== code) continue;
    if (code === 'result-cut') {
      const kept = own(row, 'keptChars');
      const total = own(row, 'totalChars');
      if (count(kept) && count(total) && kept < total) details.push(`${kept} of ${total} characters kept.`);
    } else {
      const missing = own(row, 'naiveCount');
      if (count(missing) && missing > 0) details.push(`${missing} without a timezone.`);
    }
  }
  return details;
}

function richerRow(
  row: HonestyReasonRow,
  reason: AssessmentReason,
  state: object,
  names: object | undefined,
): HonestyReasonRow {
  const tools = new Set<string>();
  if (names !== undefined && reason.source.kind === 'calls') {
    for (const { toolName } of reason.source.calls.slice(0, 5)) {
      const name = boundedWord(own(names, toolName), 120);
      if (name !== undefined) tools.add(name);
    }
  }
  // Detail arrived after the minimum peer. Read only the admitted fields and
  // keep the recorded reason if the installed producer cannot supply them.
  const rawDetail = own(reason, 'detail');
  const detail = rawDetail === undefined ? undefined : object(rawDetail);
  const details = retainedLimitDetails(state, reason);
  if (detail !== undefined) {
    const words = own(detail, 'toolSays');
    if (words !== undefined) {
      const entries = own(object(words), 'entries');
      if (Array.isArray(entries)) {
        for (const value of entries.slice(0, 5)) {
          const entry = object(value);
          const text = boundedWord(own(entry, 'text'));
          if (text === undefined) continue;
          const why = boundedWord(own(entry, 'why'));
          details.push(why === undefined ? text : `${text} · ${why}`);
        }
      }
    }
    const category = own(detail, 'category');
    const failure = typeof category === 'string' ? failureKinds.get(category) : undefined;
    if (failure !== undefined) details.push(failure);
    const rawCounts = own(detail, 'counts');
    if (rawCounts !== undefined) {
      const counts = object(rawCounts);
      const kept = own(counts, 'kept');
      const total = own(counts, 'total');
      const unit = boundedWord(own(counts, 'unit'), 32);
      const missing = own(counts, 'missing');
      const of = own(counts, 'of');
      if (count(kept) && unit !== undefined) {
        details.push(count(total) && total >= kept ? `${kept} of ${total} ${unit} kept.` : `${kept} ${unit} kept.`);
      } else if (count(missing) && count(of) && missing <= of) {
        details.push(`${missing} of ${of} missing.`);
      }
    }
  }
  return {
    ...row,
    ...(tools.size > 0 && { tools: [...tools] }),
    ...(details.length > 0 && { details }),
    evidence: { ...row.evidence, witnesses: reason.witness.slice(0, 5) },
  };
}

/** Read named details only from the exact terminal state already selected for this turn. */
export function readReasonRows(
  standing: StandingRead,
  terminal: RecordedTurnEvent | undefined,
  recording: unknown,
  state: Record<string, unknown> | undefined,
): readonly HonestyReasonRow[] {
  if (standing.status !== 'recorded') return [];
  const rows = standing.reasonCodes.map((code, reasonIndex) => ({
    text: recordedReasonSentence(code) ?? 'The assessment recorded another reason.',
    evidence: { address: standing.address, reasonIndex },
  }));
  if (rows.length === 0 || terminal?.address !== standing.address || state === undefined) return rows;
  try {
    const snapshot = object(own(object(recording), 'snapshot'));
    const reasons = boundedFold(state, snapshot, standing);
    const rawNames = own(terminal.payload, 'standingLineNames');
    const names = rawNames === undefined ? undefined : object(rawNames);
    return rows.map((row, index) => {
      const code = standing.reasonCodes[index];
      const reason = code === undefined ? undefined : reasons.get(code);
      return reason === undefined ? row : richerRow(row, reason, state, names);
    });
  } catch {
    return rows;
  }
}
