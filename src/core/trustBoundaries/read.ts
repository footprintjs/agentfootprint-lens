import type {
  TrustBoundaryCapture,
  TrustBoundaryCounters,
  TrustBoundaryFact,
  TrustBoundariesRead,
} from './types.js';
import { readSourcePosition } from '../cursor/sourcePrefix.js';

const BAD = Symbol('invalid trust bundle');
const FUTURE = Symbol('unsupported trust bundle');

function object(value: unknown): object {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw BAD;
  return value;
}

/** No source spreading or accessor invocation, including unrelated content fields. */
function own(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor && !('value' in descriptor)) throw BAD;
  return descriptor?.value;
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) throw BAD;
  return value;
}

function int(value: unknown, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw BAD;
  return value;
}

function list(value: unknown, limit: number): readonly unknown[] {
  if (!Array.isArray(value)) throw BAD;
  const length = int(own(value, 'length'));
  if (length > limit) throw BAD;
  return Array.from({ length }, (_, index) => own(value, String(index)));
}

function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  const result = text(value);
  if (!choices.includes(result as T)) throw BAD;
  return result as T;
}

function fact(value: unknown): TrustBoundaryFact {
  const row = object(value);
  const stamp = own(row, 'wallClockMs');
  if (typeof stamp !== 'number' || !Number.isFinite(stamp)) throw BAD;
  const eventType = text(own(row, 'eventType'));
  const out: Record<string, unknown> = {
    seq: int(own(row, 'seq'), 1),
    eventType,
    runId: text(own(row, 'runId')),
    runtimeStageId: text(own(row, 'runtimeStageId')),
    wallClockMs: stamp,
  };
  const optionalText = (key: string): void => {
    const value = own(row, key);
    if (value !== undefined) out[key] = text(value);
  };
  optionalText('toolCallId');
  const iteration = own(row, 'iteration');
  if (iteration !== undefined) out.iteration = int(iteration);
  const source = own(row, 'sourcePosition');
  if (source !== undefined) {
    const position = readSourcePosition(source);
    if (position === undefined) throw BAD;
    out.sourcePosition = position;
  }
  switch (eventType) {
    case 'agentfootprint.middleware.decision': {
      out.middleware = text(own(row, 'middleware'));
      out.moment = choice(own(row, 'moment'), [
        'input',
        'window',
        'before-tool',
        'after-tool',
        'output',
      ]);
      out.outcome = choice(own(row, 'outcome'), ['allow', 'deny', 'ask']);
      const changed = own(row, 'changed');
      if (typeof changed !== 'boolean') throw BAD;
      out.changed = changed;
      out.iteration = int(iteration);
      break;
    }
    case 'agentfootprint.permission.check':
      out.capability = choice(own(row, 'capability'), [
        'tool_call',
        'skill_read',
        'memory_read',
        'memory_write',
        'external_net',
        'user_data',
      ]);
      out.result = choice(own(row, 'result'), ['allow', 'deny', 'halt', 'gate_open']);
      optionalText('target');
      optionalText('policyRuleId');
      break;
    case 'agentfootprint.permission.halt':
      out.target = text(own(row, 'target'));
      out.iteration = int(iteration);
      optionalText('checkerId');
      break;
    case 'agentfootprint.credential.requested': {
      out.service = text(own(row, 'service'));
      const mode = own(row, 'mode');
      if (mode !== undefined) out.mode = choice(mode, ['machine', 'user']);
      break;
    }
    case 'agentfootprint.credential.acquired':
      out.service = text(own(row, 'service'));
      out.kind = text(own(row, 'kind'));
      break;
    case 'agentfootprint.credential.authorization_required':
      out.service = text(own(row, 'service'));
      break;
    case 'agentfootprint.credential.failed':
      out.service = text(own(row, 'service'));
      optionalText('errorClass');
      break;
    default:
      throw BAD;
  }
  if (new TextEncoder().encode(JSON.stringify(out)).length > 8192) throw BAD;
  return Object.freeze(out) as unknown as TrustBoundaryFact;
}

function capture(row: object): TrustBoundaryCapture {
  const version = own(object(own(row, 'meta')), 'version');
  if (version !== 1) throw FUTURE;
  const data = object(own(row, 'data'));
  const counts = object(own(data, 'counters'));
  const counters: TrustBoundaryCounters = Object.freeze({
    observed: int(own(counts, 'observed')),
    retained: int(own(counts, 'retained')),
    evicted: int(own(counts, 'evicted')),
    invalid: int(own(counts, 'invalid')),
    oversized: int(own(counts, 'oversized')),
    pending: int(own(counts, 'pending')),
  });
  const facts = Object.freeze(list(own(data, 'facts'), 10000).map(fact));
  if (
    counters.retained !== facts.length ||
    counters.observed !==
      counters.retained +
        counters.evicted +
        counters.invalid +
        counters.oversized +
        counters.pending
  )
    throw BAD;
  let previous = 0;
  for (const row of facts) {
    if (row.seq <= previous || row.seq > counters.observed) throw BAD;
    previous = row.seq;
  }
  const expected = {
    firstObservedSeq: counters.observed ? 1 : null,
    lastObservedSeq: counters.observed || null,
    firstRetainedSeq: facts[0]?.seq ?? null,
    lastRetainedSeq: facts[facts.length - 1]?.seq ?? null,
  };
  for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
    if (own(data, key) !== expected[key]) throw BAD;
  }
  return Object.freeze({
    id: text(own(row, 'id')),
    captureId: text(own(data, 'captureId')),
    facts,
    counters,
    ...expected,
  });
}

/** Strict, detached metadata-only v1 reader. It never scans events or execution trees. */
export function readTrustBoundaries(snapshot: unknown): TrustBoundariesRead {
  try {
    if (snapshot === undefined || snapshot === null)
      return Object.freeze({
        status: 'missing',
        message: 'No trust boundary capture was retained.',
      });
    const rows = own(object(snapshot), 'recorders');
    if (rows === undefined)
      return Object.freeze({
        status: 'missing',
        message: 'No trust boundary capture was retained.',
      });
    const captures: TrustBoundaryCapture[] = [];
    const ids = new Set<string>();
    for (const value of list(rows, 10000)) {
      const row = object(value);
      if (own(row, 'name') !== 'TrustBoundaries') continue;
      const parsed = capture(row);
      if (ids.has(parsed.id)) throw BAD;
      ids.add(parsed.id);
      captures.push(parsed);
    }
    return captures.length
      ? Object.freeze({ status: 'available', captures: Object.freeze(captures) })
      : Object.freeze({ status: 'missing', message: 'No trust boundary capture was retained.' });
  } catch (error) {
    return Object.freeze(
      error === FUTURE
        ? {
            status: 'unsupported',
            message:
              'This trust boundary capture has an unsupported version; only version 1 can be read.',
          }
        : {
            status: 'invalid',
            message:
              'This trust boundary capture is invalid; its facts cannot be displayed reliably.',
          },
    );
  }
}
