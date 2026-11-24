/// <reference lib="es2022.intl" />

import { object, own } from '../cursor/sourcePosition.js';
import { readResponse } from './readResponse.js';
import { readStanding, type HonestyStanding } from './readStanding.js';
import { readToolActivity, type HonestyToolActivity } from './readToolActivity.js';
import { readToolLedger } from './readToolLedger.js';
import { readTurnEvents, type HonestyEventAddress, type RecordedTurnEvent } from './readTurnEvents.js';

const turnEnd = 'agentfootprint.agent.turn_end';
const retryEvent = 'agentfootprint.agent.output_schema_retry';
const maxEvents = 50_000;
const maxAnswerCodeUnits = 131_072;
const maxSentences = 4_096;
const maxRows = 5;

export interface HonestyTurnSelection {
  /** Original ordinal of this invocation’s turn_start event. */
  readonly startEventIndex: number;
  /** Inclusive event ordinal. Omit to read the complete recorded turn. */
  readonly throughEventIndex?: number;
}

export interface HonestySentence {
  readonly text: string;
  readonly mark: 'unlinked';
  readonly evidenceNote: string;
}

export interface HonestyStepRow {
  readonly text: string;
  readonly address?: HonestyEventAddress;
  readonly tool?: HonestyToolActivity;
}

export interface HonestyStep {
  readonly id: 'D' | 'N' | 'A' | 'T' | 'S';
  readonly headline: string;
  readonly rows: readonly HonestyStepRow[];
  readonly remaining: number;
}

type TrustState = HonestyStanding | 'not-yet-recorded' | 'not-collected' | 'unreadable' | 'withheld' | 'too-long';
export interface HonestyTrustLine {
  readonly state: TrustState;
  readonly title: string;
  readonly sentence: string;
}

export interface HonestyTurn {
  readonly trust: HonestyTrustLine;
  readonly sentences: readonly HonestySentence[];
  readonly steps: readonly HonestyStep[];
}

const empty: Readonly<Record<HonestyStep['id'], string>> = {
  D: 'The recording has no response outcome at this point.',
  N: 'The recording has no answer standing at this point.',
  A: 'The recording does not say what was checked here.',
  T: 'The recording has no tool or retry activity at this point.',
  S: 'The recording does not say what context was supplied here.',
};
const stepNames: Readonly<Record<HonestyStep['id'], string>> = {
  D: 'What happened next',
  N: 'How far to trust it',
  A: 'What was checked',
  T: 'What actually happened',
  S: 'What the agent knew',
};
const order = ['D', 'N', 'A', 'T', 'S'] as const;

const unavailable: Readonly<Record<Exclude<TrustState, HonestyStanding>, HonestyTrustLine>> = {
  'not-yet-recorded': { state: 'not-yet-recorded', title: 'Still writing', sentence: 'No assessment recorded yet.' },
  'not-collected': { state: 'not-collected', title: 'Not collected', sentence: 'Not collected for this run.' },
  unreadable: { state: 'unreadable', title: 'Unreadable', sentence: 'The selected turn could not be read.' },
  withheld: { state: 'withheld', title: 'Kept out', sentence: 'The recording says this response was refused.' },
  'too-long': { state: 'too-long', title: 'Too long to read', sentence: 'This run is too long to read here.' },
};

function step(id: HonestyStep['id'], rows: readonly HonestyStepRow[] = [], fallback = empty[id]): HonestyStep {
  return {
    id,
    headline: stepNames[id],
    rows: rows.length ? rows.slice(0, maxRows) : [{ text: fallback }],
    remaining: Math.max(rows.length - maxRows, 0),
  };
}

function unavailableTurn(trust: HonestyTrustLine): HonestyTurn {
  return { trust, sentences: [], steps: order.map(id => step(id, [], trust.sentence)) };
}

function sentencesOf(answer: string, checked: boolean): HonestySentence[] | undefined {
  if (answer.length > maxAnswerCodeUnits) return undefined;
  const note = checked ? 'The answer was checked. No evidence link was recorded for this sentence.' :
    'No evidence link recorded.';
  const sentences: HonestySentence[] = [];
  const segments = typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('en', { granularity: 'sentence' }).segment(answer)
    : [{ segment: answer }];
  let leadingSpace = '';
  for (const { segment } of segments) {
    if (!segment.trim()) {
      const previous = sentences[sentences.length - 1];
      if (previous === undefined) leadingSpace += segment;
      else sentences[sentences.length - 1] = { ...previous, text: previous.text + segment };
      continue;
    }
    if (sentences.length === maxSentences) return undefined;
    // The producer currently supplies answer-level evidence. Sentence
    // boundaries are display only and never stand in for source spans.
    sentences.push({ text: leadingSpace + segment, mark: 'unlinked', evidenceNote: note });
    leadingSpace = '';
  }
  return sentences;
}

function retryRow(events: readonly RecordedTurnEvent[], terminal: RecordedTurnEvent | undefined): HonestyStepRow[] {
  const retries = events.filter(event => event.type === retryEvent);
  const last = retries[retries.length - 1];
  if (last === undefined) return [];
  const attempt = own(last.payload, 'attempt');
  if (typeof attempt !== 'number' || !Number.isSafeInteger(attempt) || attempt < 1) return [];
  const retryLabel = retries.length === 1 ? 'retry' : 'retries';
  const retryIteration = own(last.payload, 'iteration');
  const completedIteration = terminal === undefined ? undefined : own(terminal.payload, 'iterationCount');
  const responseAfterRetry = typeof retryIteration === 'number' && typeof completedIteration === 'number' &&
    completedIteration > retryIteration && attempt < Number.MAX_SAFE_INTEGER;
  return [{
    text: `The recording shows ${retries.length} schema ${retryLabel}.` +
      (responseAfterRetry ? ` The recorded response followed attempt ${attempt + 1}.` : ''),
    address: last.address,
  }];
}

const slots = new Map([
  ['system-prompt', 'system prompt'],
  ['messages', 'messages'],
  ['tools', 'tool descriptions'],
]);

function contextRows(events: readonly RecordedTurnEvent[]): HonestyStepRow[] {
  const counts = new Map<string, { count: number; address: HonestyEventAddress }>();
  for (const event of events) {
    if (event.type !== 'agentfootprint.context.injected') continue;
    const slot = own(event.payload, 'slot');
    const label = typeof slot === 'string' ? slots.get(slot) : undefined;
    if (label === undefined) continue;
    counts.set(label, { count: (counts.get(label)?.count ?? 0) + 1, address: event.address });
  }
  return Array.from(counts, ([label, { count, address }]) => ({
    text: `${count} recorded context ${count === 1 ? 'entry' : 'entries'} for ${label}.`,
    address,
  }));
}

/** What a recording says about one answer. No replay execution or model calls. */
export function projectHonestyTurn(recording: unknown, selection: HonestyTurnSelection): HonestyTurn {
  const read = readTurnEvents(recording, selection.startEventIndex, selection.throughEventIndex, maxEvents);
  if (read.status !== 'ready') {
    return unavailableTurn(unavailable[read.status === 'before-turn' ? 'not-yet-recorded' : read.status]);
  }
  const { events, runId } = read;
  try {
    const last = events[events.length - 1];
    const terminal = last?.type === turnEnd ? last : undefined;
    const refused = terminal !== undefined && own(terminal.payload, 'refused') !== undefined;
    const standing = readStanding(events);
    const trust: HonestyTrustLine = refused ? unavailable.withheld : standing.status !== 'recorded' ?
      unavailable[standing.status] : { state: standing.standing, title: standing.title, sentence: standing.sentence };
    const checked = standing.status === 'recorded' && standing.checks.some(check => check.ran > 0);
    const rawAnswer = terminal !== undefined && !refused ? own(terminal.payload, 'finalContent') : undefined;
    const answer = readResponse(recording, runId, rawAnswer);
    const sentences = sentencesOf(answer.kind === 'text' ? answer.text : '', checked);
    if (sentences === undefined) return unavailableTurn(unavailable['too-long']);

    const activity = readToolActivity(events, readToolLedger(recording, last?.address));
    const tools = activity.map(row => ({
      text: row.name === undefined ? row.sentence : `${row.name}. ${row.sentence}`,
      address: row.proof ?? row.end ?? row.request,
      tool: row,
    }));
    const checks = standing.status !== 'recorded' ? [] : standing.checks.map(check => ({
      text: `${check.label}: ${check.ran} of ${check.of} recorded.`,
      address: standing.address,
    }));
    const decision = terminal === undefined ? [] : [{
      text: refused ? unavailable.withheld.sentence : answer.kind === 'text'
        ? 'The response was recorded. Delivery was not confirmed.'
        : answer.kind === 'ambiguous-marker'
        ? 'The record cannot distinguish this response from a redaction marker.'
        : 'The response text is unavailable in this record.',
      address: terminal.address,
    }];
    return {
      trust,
      sentences,
      steps: [
        step('D', decision),
        step('N', [{ text: trust.sentence, ...(standing.status === 'recorded' && { address: standing.address }) }]),
        step('A', checks, standing.status === 'not-collected' ? unavailable['not-collected'].sentence : empty.A),
        step('T', [...retryRow(events, refused ? undefined : terminal), ...tools]),
        step('S', contextRows(events)),
      ],
    };
  } catch {
    return unavailableTurn(unavailable.unreadable);
  }
}
