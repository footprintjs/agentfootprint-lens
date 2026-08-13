/**
 * The headless HITL half, pinned.
 *
 *   • readAwaitingComponent finds the typed half in all FOUR homes — the
 *     9.24 lift (`awaiting.component`) and the three pauseData homes older
 *     hosts forward — and reports absence rather than guessing.
 *   • approve/decline build the consent record byte-compatible with
 *     agentfootprint's vocabulary, and refuse an actor-less decision.
 *   • decisionRequestBody speaks the wire shape `{ input, sessionId?,
 *     decision }` and refuses `decision: undefined` — JSON would drop the
 *     key and the wire would read a NEW MESSAGE (the silently-wrong outcome).
 *   • decisionSentence is display: consent → "Approved by …", strings quoted,
 *     structures summarized — never the record.
 */
import { describe, expect, it } from 'vitest';
import {
  approveDecision,
  declineDecision,
  decisionRequestBody,
  decisionSentence,
  isConsentAsk,
  isConsentDecision,
  readAwaitingComponent,
} from './decision.js';

const COMPONENT = { componentId: 'option-picker', propsRef: 'art_abc123' };

describe('readAwaitingComponent — the era-robust reader', () => {
  it('reads the 9.24 lift: awaiting.component', () => {
    expect(readAwaitingComponent({ question: 'Which?', component: COMPONENT })).toEqual(
      COMPONENT,
    );
  });

  it('falls back to the three pauseData homes (plain | checkIn | ask)', () => {
    expect(readAwaitingComponent({ pauseData: { component: COMPONENT } })).toEqual(COMPONENT);
    expect(
      readAwaitingComponent({ pauseData: { checkIn: { component: COMPONENT } } }),
    ).toEqual(COMPONENT);
    expect(readAwaitingComponent({ pauseData: { ask: { component: COMPONENT } } })).toEqual(
      COMPONENT,
    );
  });

  it('prefers the lifted component over a pauseData home', () => {
    const lifted = { componentId: 'lifted' };
    expect(
      readAwaitingComponent({ component: lifted, pauseData: { component: COMPONENT } }),
    ).toEqual(lifted);
  });

  it('reports absence for prose-only pauses and implausible shapes — never a guess', () => {
    expect(readAwaitingComponent({ question: 'Approve?' })).toBeUndefined();
    expect(readAwaitingComponent(undefined)).toBeUndefined();
    expect(readAwaitingComponent(null)).toBeUndefined();
    expect(readAwaitingComponent('awaiting')).toBeUndefined();
    expect(readAwaitingComponent({ component: { componentId: '' } })).toBeUndefined();
    expect(readAwaitingComponent({ component: { componentId: 42 } })).toBeUndefined();
    expect(readAwaitingComponent({ pauseData: { checkIn: 'not-an-object' } })).toBeUndefined();
  });
});

describe('isConsentAsk — which vocabulary answers this pause', () => {
  it('true for a tool checkIn and a middleware ask; false for a plain askHuman', () => {
    expect(isConsentAsk({ checkIn: { tool: 'transfer' } })).toBe(true);
    expect(isConsentAsk({ ask: { question: 'Proceed?', middleware: 'guard' } })).toBe(true);
    expect(isConsentAsk({ question: 'Pick one' })).toBe(false);
    expect(isConsentAsk(undefined)).toBe(false);
  });
});

describe('approveDecision / declineDecision — the consent record', () => {
  it('builds the approve/decline vocabulary with actor and timestamp', () => {
    const before = Date.now();
    const yes = approveDecision({ by: 'alice@ops', note: 'verified' });
    expect(yes).toMatchObject({ approved: true, by: 'alice@ops', note: 'verified' });
    expect(yes.at).toBeGreaterThanOrEqual(before);
    const no = declineDecision({ by: 'alice@ops' });
    expect(no).toMatchObject({ approved: false, by: 'alice@ops' });
    expect('note' in no).toBe(false);
    expect(isConsentDecision(yes)).toBe(true);
    expect(isConsentDecision(no)).toBe(true);
    expect(isConsentDecision('option-42')).toBe(false);
  });

  it('refuses an actor-less decision, teaching why', () => {
    expect(() => approveDecision({ by: '' })).toThrow(/needs `by`/);
    expect(() => declineDecision({ by: '   ' })).toThrow(/no actor/);
  });
});

describe('decisionRequestBody — the wire shape', () => {
  it('formats { input, sessionId?, decision } exactly as the JSON wire reads it', () => {
    expect(decisionRequestBody({ decision: 'option-42', sessionId: 's-1' })).toEqual({
      input: '',
      sessionId: 's-1',
      decision: 'option-42',
    });
    // No sessionId key when none given (a host may bind the session another way).
    expect(decisionRequestBody({ decision: null })).toEqual({ input: '', decision: null });
  });

  it('refuses decision: undefined — JSON drops the key and the wire reads a NEW MESSAGE', () => {
    expect(() => decisionRequestBody({ decision: undefined })).toThrow(/undefined/);
    expect(() => decisionRequestBody({} as never)).toThrow(/needs `decision`/);
  });
});

describe('decisionSentence — display only, never the record', () => {
  it('renders consent decisions, strings, and structures as one sentence', () => {
    expect(decisionSentence(approveDecision({ by: 'alice@ops', note: 'verified' }))).toBe(
      'Approved by alice@ops — "verified".',
    );
    expect(decisionSentence(declineDecision({ by: 'bob' }))).toBe('Declined by bob.');
    expect(decisionSentence('option-42')).toBe('Answered: "option-42".');
    expect(decisionSentence({ tier: 'gold' })).toBe(
      'Answered with a structured decision: {"tier":"gold"}.',
    );
    expect(decisionSentence(null)).toBe('Answered: null.');
  });

  it('elides a long structured decision instead of dumping it', () => {
    const big = { list: Array.from({ length: 50 }, (_, i) => `item-${i}`) };
    const sentence = decisionSentence(big);
    expect(sentence.length).toBeLessThan(200);
    expect(sentence).toContain('…');
  });
});
