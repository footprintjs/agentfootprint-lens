import { object, own } from '../cursor/sourcePosition.js';
import type { HonestyEventAddress, RecordedTurnEvent } from './readTurnEvents.js';

const standings = {
  known: { title: 'Known', sentence: 'The record supports the answer.' },
  consistent: { title: 'Consistent', sentence: 'The recorded assessment describes the answer as consistent.' },
  'not-sure': { title: 'Not sure', sentence: 'The recorded assessment names a limit to this answer.' },
  ask: { title: 'Ask', sentence: 'The recorded assessment asks for input.' },
  'not-assessed': { title: 'Not assessed', sentence: 'The record states that no answer assessment applied.' },
} as const;

const reasonSentences = new Map([
  ['coverage-gap', 'A tool recorded a gap in what it checked.'],
  ['declared-absent', 'A tool recorded a missing match within its search.'],
  ['sources-conflict', 'The recorded assessment found a conflict between sources.'],
  ['value-unsupported', 'The recorded assessment found a value without supporting evidence.'],
  ['answer-check-failed', 'A recorded check found a problem with the answer.'],
  ['check-unreachable', 'A recorded check could not finish.'],
  ['stopped-early', 'The recording says the turn stopped early.'],
  ['steps-unfinished', 'The recording shows unfinished steps.'],
]);

const checkNames = new Map([
  ['argument-rules', 'Argument rules'],
  ['argument-sources', 'Argument sources'],
  ['result-period', 'Periods covered by results'],
  ['tool-coverage', 'Tool coverage'],
  ['result-shape', 'Result shape'],
  ['names-and-numbers', 'Names and numbers'],
  ['answer-checks', 'Answer checks'],
]);

export type HonestyStanding = keyof typeof standings;

interface RecordedCheck {
  readonly label: string;
  readonly ran: number;
  readonly of: number;
}

export type StandingRead =
  | {
    readonly status: 'recorded';
    readonly standing: HonestyStanding;
    readonly title: string;
    readonly sentence: string;
    readonly checks: readonly RecordedCheck[];
    readonly address: HonestyEventAddress;
  }
  | { readonly status: 'not-yet-recorded' | 'not-collected' | 'unreadable' };

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('list');
  const length = own(value, 'length');
  // The producer has a small vocabulary of reasons and checks. Avoid taking
  // an unbounded foreign array just to render five rows.
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 || length > 64) {
    throw new Error('length');
  }
  return Array.from({ length }, (_, index) => own(value, String(index)));
}

function readChecks(value: unknown): readonly RecordedCheck[] {
  return list(value).map(entry => {
    const row = object(entry);
    const check = own(row, 'check');
    const ran = own(row, 'ran');
    const of = own(row, 'of');
    if (typeof check !== 'string' || check === '' ||
        typeof ran !== 'number' || !Number.isSafeInteger(ran) || ran < 0 ||
        typeof of !== 'number' || !Number.isSafeInteger(of) || of < ran) {
      throw new Error('count');
    }
    return { label: checkNames.get(check) ?? 'Recorded check', ran, of };
  });
}

/** Read the assessment the producer recorded, at the selected turn prefix. */
export function readStanding(events: readonly RecordedTurnEvent[]): StandingRead {
  let finished = false;
  try {
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i]!;
      let assessment: unknown;
      if (event.type === 'agentfootprint.agent.turn_end') {
        finished = true;
        assessment = own(event.payload, 'answerAssessment');
      } else if (event.type === 'agentfootprint.answer.assessed') {
        assessment = event.payload;
      }
      if (assessment === undefined) continue;
      const row = object(assessment);
      const value = own(row, 'standing');
      if (typeof value !== 'string' || !Object.prototype.hasOwnProperty.call(standings, value)) {
        return { status: 'unreadable' };
      }
      const standing = value as HonestyStanding;
      const reasons = list(own(row, 'reasons'));
      const first = reasons[0];
      return {
        status: 'recorded',
        standing,
        title: standings[standing].title,
        sentence: (typeof first === 'string' ? reasonSentences.get(first) : undefined) ??
          standings[standing].sentence,
        checks: readChecks(own(row, 'checked')),
        address: event.address,
      };
    }
    return { status: finished ? 'not-collected' : 'not-yet-recorded' };
  } catch {
    return { status: 'unreadable' };
  }
}
