/**
 * Tests — routing commentary (agentfootprint 9.16.0 / 9.17.0 skill-graph
 * routing events), through `defaultHumanizer` end-to-end.
 *
 * Patterns:
 *   R1  turn_routed by=entry — "a rule matched (tier 1)"
 *   R2  turn_routed by='rule' (design-era alias) — tolerated as entry
 *   R3  turn_routed by=intent — winner vs runner-up scores + scorer name
 *   R4  turn_routed by=intent, no scores — clause omitted, never guessed
 *   R5  turn_routed by=continuity — plain continuation
 *   R6  turn_routed by=continuity near-tie — relevance shares as percents
 *   R7  turn_routed by=menu — offered list + 'stay' flag
 *   R8  turn_routed by=none (rails) — posture-only / near-tie / unmatched,
 *       branched ONLY on evidence the event carries (decisive, scores, floor)
 *   R9  turn_routed by=none + droppedResume — saved place gone
 *   R10 droppedResume decorating a routed verdict — appended note
 *   R11 unknown `by` vocabulary — honest raw fallback, nothing invented
 *   R12 unknown extra payload fields — tolerated (future-era recordings)
 *   R13 route_conflict, one loser — winner won, loser on the record
 *   R14 route_conflict, two losers — plural agreement
 *   R15 route_conflict, missing losers — tolerated (absent ⇒ omitted)
 *   R16 skill.rejected, no posture — today's reachability refusal (old era)
 *   R17 skill.rejected posture=guard — off-menu pick refused; `allowed` is
 *       the REACHABILITY set (it contains the refused pick), labeled as such
 *   R18 skill.rejected posture=rails — routing picks refused outright
 *   R19 skill.rejected cold start — "from the start"
 *   R20 cursorMove model-pick + offered — menu sentence
 *   R21 cursorMove model-pick + declinedOffer — divergence on the record;
 *       the menu clause stays silent (the pick was NOT on that menu)
 *   R22 cursorMove model-pick WITHOUT decorations — stays silent (old era)
 *   R23 context.evaluated without cursorMove — stays silent
 *   R24 teachingHumanizer / turn_routed precedence — teaching voice wins
 *       when agentfootprint ships a commentary key for the event (9.16.0+
 *       bundles one for `turn_routed by='entry'`); this package's sentence
 *       is the FALLBACK for events agentfootprint has no teaching template
 *       for (route_conflict has none as of 9.17.0). Both are era-dependent
 *       facts about agentfootprint's bundled template set, not about this
 *       package — so R24 asserts the precedence RULE (non-empty, names the
 *       skill) rather than one era's exact wording; R24b pins the exact
 *       default-humanizer sentence, which this package fully owns.
 *
 * House law under test: render ONLY what the event carries — absent field ⇒
 * the clause is omitted; unknown vocabulary ⇒ honest raw line, never a guess.
 */

import { describe, it, expect } from 'vitest';
import { defaultHumanizer, teachingHumanizer } from './humanizer.js';
import type { AgentfootprintEvent } from 'agentfootprint/events';

function evt(type: string, payload: Record<string, unknown>): AgentfootprintEvent {
  return {
    type,
    payload,
    meta: {
      wallClockMs: 1000,
      runOffsetMs: 0,
      runtimeStageId: 'test#0',
      subflowPath: [],
      compositionPath: [],
      runId: 'test',
    },
  } as unknown as AgentfootprintEvent;
}

const TURN_ROUTED = 'agentfootprint.skill.turn_routed';
const ROUTE_CONFLICT = 'agentfootprint.skill.route_conflict';
const REJECTED = 'agentfootprint.skill.rejected';
const EVALUATED = 'agentfootprint.context.evaluated';

// ─── turn_routed ─────────────────────────────────────────────────────────

describe('routing — R1: turn_routed by=entry', () => {
  it('names the start and credits the tier-1 rule', () => {
    const out = defaultHumanizer(
      evt(TURN_ROUTED, { by: 'entry', to: 'billing', policy: { nearTieMargin: 0.15, menuSize: 3 } }),
    );
    expect(out).toBe('Turn started in "billing" — a rule matched (tier 1).');
  });
});

describe("routing — R2: turn_routed by='rule' (design-era alias)", () => {
  it('renders as an entry verdict, with movement when from differs', () => {
    const out = defaultHumanizer(evt(TURN_ROUTED, { by: 'rule', from: 'triage', to: 'billing' }));
    expect(out).toBe('Moved from "triage" to "billing" — a rule matched (tier 1).');
  });
});

describe('routing — R3: turn_routed by=intent', () => {
  it('cites winner + runner-up raw scores and the scorer name', () => {
    const out = defaultHumanizer(
      evt(TURN_ROUTED, {
        by: 'intent',
        from: 'billing',
        to: 'shipping',
        scorer: 'keyword',
        decisive: true,
        scores: [
          { id: 'shipping', score: 0.87, relevance: 0.62 },
          { id: 'billing', score: 0.21, relevance: 0.18 },
        ],
        runnerUp: { id: 'billing', gap: 0.66 },
        policy: { nearTieMargin: 0.15, menuSize: 3 },
      }),
    );
    expect(out).toBe(
      'Moved from "billing" to "shipping" — intent scored 0.87 vs 0.21 for runner-up "billing" (keyword scorer).',
    );
  });
});

describe('routing — R4: turn_routed by=intent with no scores', () => {
  it('omits the numbers clause instead of guessing', () => {
    const out = defaultHumanizer(evt(TURN_ROUTED, { by: 'intent', to: 'shipping' }));
    expect(out).toBe('Turn started in "shipping" — intent matched.');
  });
});

describe('routing — R5: turn_routed by=continuity', () => {
  it('renders the plain continuation sentence', () => {
    const out = defaultHumanizer(evt(TURN_ROUTED, { by: 'continuity', from: 'billing', to: 'billing' }));
    expect(out).toBe('Stayed in "billing" — treated as a continuation of the conversation.');
  });
});

describe('routing — R6: turn_routed by=continuity near-tie', () => {
  it('shows the tied relevance shares as whole percents', () => {
    const out = defaultHumanizer(
      evt(TURN_ROUTED, {
        by: 'continuity',
        from: 'billing',
        to: 'billing',
        decisive: false,
        scores: [
          { id: 'billing', score: 0.5, relevance: 0.44 },
          { id: 'shipping', score: 0.47, relevance: 0.41 },
        ],
      }),
    );
    expect(out).toBe(
      'Stayed — near-tie between "billing" (44%) and "shipping" (41%); continuing in "billing".',
    );
  });
});

describe('routing — R7: turn_routed by=menu', () => {
  it("lists the offered menu and flags 'stay'", () => {
    const out = defaultHumanizer(
      evt(TURN_ROUTED, {
        by: 'menu',
        offered: ['help-desk', 'billing', 'shipping'],
        stayOffered: true,
      }),
    );
    expect(out).toBe(
      "No single skill won — the model was offered a menu of 3: help-desk, billing, shipping; 'stay' was on the menu.",
    );
  });
});

describe('routing — R8: turn_routed by=none (rails)', () => {
  it('no numbers on the event → posture-only prose, no claimed reason', () => {
    const out = defaultHumanizer(
      evt(TURN_ROUTED, { by: 'none', offered: ['billing', 'shipping'] }),
    );
    expect(out).toBe(
      'Routing ended in a menu, but rails mode does not let the model route — the turn ran on the base prompt. On the record: billing, shipping.',
    );
  });

  it('near-tie evidence (decisive=false, top score clears the floor) → intent DID match, too closely to call', () => {
    const out = defaultHumanizer(
      evt(TURN_ROUTED, {
        by: 'none',
        offered: ['billing', 'shipping'],
        decisive: false,
        scores: [
          { id: 'billing', score: 0.44, relevance: 0.44 },
          { id: 'shipping', score: 0.41, relevance: 0.41 },
        ],
        policy: { nearTieMargin: 0.15, menuSize: 3, floor: 0.3 },
      }),
    );
    expect(out).toBe(
      'This message matched billing, shipping too closely to call, and rails mode does not let the model break the tie — the turn ran on the base prompt.',
    );
  });

  it('unmatched evidence (top score at/below the floor) → the offered set is the FULL menu, never "close candidates"', () => {
    const out = defaultHumanizer(
      evt(TURN_ROUTED, {
        by: 'none',
        offered: ['billing', 'shipping', 'help-desk'],
        decisive: false,
        scores: [
          { id: 'billing', score: 0.2, relevance: 0.55 },
          { id: 'shipping', score: 0.1, relevance: 0.45 },
        ],
        policy: { nearTieMargin: 0.15, menuSize: 3, floor: 0.3 },
      }),
    );
    expect(out).toBe(
      'No rule or intent matched this message strongly enough, and rails mode does not let the model route — the turn ran on the base prompt. The full menu stayed on the record: billing, shipping, help-desk.',
    );
  });
});

describe('routing — R9: turn_routed by=none with droppedResume', () => {
  it("explains the conversation's saved place is gone", () => {
    const out = defaultHumanizer(
      evt(TURN_ROUTED, {
        by: 'none',
        droppedResume: { id: 'billing', reason: 'unknown-skill' },
      }),
    );
    expect(out).toBe(
      'The conversation\'s saved place ("billing") no longer exists in this deployment — the turn started fresh.',
    );
  });
});

describe('routing — R10: droppedResume decorating a routed verdict', () => {
  it('appends the saved-place note after the verdict sentence', () => {
    const out = defaultHumanizer(
      evt(TURN_ROUTED, {
        by: 'entry',
        to: 'triage',
        droppedResume: { id: 'billing', reason: 'unknown-skill' },
      }),
    );
    expect(out).toBe(
      'Turn started in "triage" — a rule matched (tier 1). The conversation\'s saved place ("billing") no longer exists in this deployment.',
    );
  });
});

describe('routing — R11: turn_routed unknown `by` vocabulary', () => {
  it('renders an honest raw line, inventing nothing', () => {
    const out = defaultHumanizer(evt(TURN_ROUTED, { by: 'teleport', to: 'x' }));
    expect(out).toBe('Turn routing: teleport → "x".');
  });
});

describe('routing — R12: turn_routed tolerates unknown extra fields', () => {
  it('renders the known clauses and ignores fields it does not know', () => {
    const out = defaultHumanizer(
      evt(TURN_ROUTED, {
        by: 'entry',
        to: 'billing',
        futureField: { deeply: 'nested' },
        anotherOne: 42,
      }),
    );
    expect(out).toBe('Turn started in "billing" — a rule matched (tier 1).');
  });
});

// ─── route_conflict ──────────────────────────────────────────────────────

describe('routing — R13: route_conflict with one loser', () => {
  it('names the winner (first in the batch) and the suppressed hop', () => {
    const out = defaultHumanizer(
      evt(ROUTE_CONFLICT, {
        iteration: 2,
        fromSkillId: 'triage',
        winner: { toolCallId: 'tc_1', toolName: 'get_order', target: 'shipping' },
        losers: [{ toolCallId: 'tc_2', toolName: 'check_charge', target: 'billing' }],
      }),
    );
    expect(out).toBe(
      'Two tool results wanted different next skills — get_order → "shipping" won (first in the batch); check_charge → "billing" was suppressed and is on the record.',
    );
  });
});

describe('routing — R14: route_conflict with two losers', () => {
  it('counts three results and agrees the verbs', () => {
    const out = defaultHumanizer(
      evt(ROUTE_CONFLICT, {
        iteration: 1,
        winner: { toolName: 'get_order', target: 'shipping' },
        losers: [
          { toolName: 'check_charge', target: 'billing' },
          { toolName: 'find_faq', target: 'help-desk' },
        ],
      }),
    );
    expect(out).toBe(
      'Three tool results wanted different next skills — get_order → "shipping" won (first in the batch); check_charge → "billing", find_faq → "help-desk" were suppressed and are on the record.',
    );
  });
});

describe('routing — R15: route_conflict with missing losers', () => {
  it('still renders the winner without inventing losers', () => {
    const out = defaultHumanizer(
      evt(ROUTE_CONFLICT, { iteration: 1, winner: { toolName: 'get_order', target: 'shipping' } }),
    );
    expect(out).toBe(
      'Tool results conflicted on the next skill — get_order → "shipping" won (first in the batch).',
    );
  });
});

// ─── skill.rejected (posture, both eras) ─────────────────────────────────

describe('routing — R16: skill.rejected without posture (old era)', () => {
  it('renders the reachability refusal with the allowed set', () => {
    const out = defaultHumanizer(
      evt(REJECTED, {
        requestedId: 'shipping',
        currentSkillId: 'billing',
        allowed: ['billing', 'help-desk'],
        iteration: 3,
      }),
    );
    expect(out).toBe(
      'The model tried to switch to "shipping", but it is not reachable from "billing" — refused. Reachable: billing, help-desk.',
    );
  });
});

describe('routing — R17: skill.rejected posture=guard', () => {
  it('labels `allowed` as the reachable set — under guard it contains the refused pick, so it is never "the menu"', () => {
    // Emitter-real shape: a guard refusal fires AFTER reachability passed,
    // so `allowed` (the reachability set) always contains the refused pick.
    const out = defaultHumanizer(
      evt(REJECTED, {
        requestedId: 'shipping',
        currentSkillId: 'billing',
        allowed: ['billing', 'help-desk', 'shipping'],
        iteration: 3,
        posture: 'guard',
      }),
    );
    expect(out).toBe(
      'The model tried to switch to "shipping", but that pick was off the menu it was given — refused (guard). Reachable: billing, help-desk, shipping.',
    );
  });
});

describe('routing — R18: skill.rejected posture=rails', () => {
  it('says rails mode does not let the model route', () => {
    const out = defaultHumanizer(
      evt(REJECTED, {
        requestedId: 'shipping',
        currentSkillId: 'billing',
        allowed: [],
        iteration: 3,
        posture: 'rails',
      }),
    );
    expect(out).toBe(
      'The model tried to switch to "shipping", but rails mode does not let the model route — refused.',
    );
  });
});

describe('routing — R19: skill.rejected at cold start', () => {
  it('says "the start" when there is no current cursor', () => {
    const out = defaultHumanizer(
      evt(REJECTED, { requestedId: 'shipping', allowed: ['triage'], iteration: 1 }),
    );
    expect(out).toBe(
      'The model tried to switch to "shipping", but it is not reachable from the start — refused. Reachable: triage.',
    );
  });
});

// ─── cursorMove model-pick decorations (context.evaluated) ───────────────

describe('routing — R20: cursorMove model-pick with an offered menu', () => {
  it('says what the model chose and what else was on the menu', () => {
    const out = defaultHumanizer(
      evt(EVALUATED, {
        iteration: 1,
        cursorMove: {
          by: 'model-pick',
          to: 'help-desk',
          offered: ['help-desk', 'billing', 'stay'],
        },
      }),
    );
    expect(out).toBe(
      'The model chose "help-desk" from a 3-item menu (billing, stay were offered too).',
    );
  });
});

describe('routing — R21: cursorMove model-pick with declinedOffer', () => {
  it('puts the divergence on the record and suppresses the menu clause — the pick was NOT on that menu', () => {
    // Emitter-real shape: `offered` is ALWAYS stamped alongside
    // `declinedOffer` (one resolved-menu object) — the sentence must not
    // claim the pick came "from" the menu it then says the pick was not on.
    const out = defaultHumanizer(
      evt(EVALUATED, {
        iteration: 2,
        cursorMove: {
          by: 'model-pick',
          from: 'billing',
          to: 'refunds',
          offered: ['billing', 'shipping'],
          declinedOffer: true,
        },
      }),
    );
    expect(out).toBe(
      'The model chose "refunds", moving from "billing". Its pick was not on the offered menu — the divergence is on the record.',
    );
  });

  it('tolerates an older-era event that carries declinedOffer without offered', () => {
    const out = defaultHumanizer(
      evt(EVALUATED, {
        iteration: 2,
        cursorMove: { by: 'model-pick', from: 'billing', to: 'refunds', declinedOffer: true },
      }),
    );
    expect(out).toBe(
      'The model chose "refunds", moving from "billing". Its pick was not on the offered menu — the divergence is on the record.',
    );
  });
});

describe('routing — R22: cursorMove model-pick WITHOUT decorations', () => {
  it('stays silent — an old-era recording renders exactly as before', () => {
    const out = defaultHumanizer(
      evt(EVALUATED, { iteration: 1, cursorMove: { by: 'model-pick', to: 'help-desk' } }),
    );
    expect(out).toBeNull();
  });
});

describe('routing — R23: context.evaluated without cursorMove', () => {
  it('stays silent (the low-signal internal tick)', () => {
    expect(defaultHumanizer(evt(EVALUATED, { iteration: 1 }))).toBeNull();
    expect(
      defaultHumanizer(evt(EVALUATED, { iteration: 1, cursorMove: { by: 'route', to: 'x' } })),
    ).toBeNull();
  });
});

// ─── teaching voice falls through ────────────────────────────────────────

describe('routing — R24: teachingHumanizer / turn_routed precedence', () => {
  it('teaching voice wins when agentfootprint ships a key; we are the fallback', () => {
    // agentfootprint 9.16.0+ bundles its own teaching-voice commentary
    // template for turn_routed by='entry' (selectCommentaryKey returns a
    // real key), so teachingHumanizer renders AGENTFOOTPRINT's sentence,
    // not this package's. Pre-9.16 agentfootprint has no such key, so
    // selectCommentaryKey returns undefined and teachingHumanizer falls
    // through to defaultHumanizer's sentence instead. Both are honest;
    // assert the invariant that holds across both eras — a non-empty
    // sentence that names the routed-to skill — not one era's exact text.
    const out = teachingHumanizer(evt(TURN_ROUTED, { by: 'entry', to: 'billing' }));
    expect(out).toBeTruthy();
    expect(out).toContain('billing');
  });
  it('renders route_conflict via whichever era agentfootprint ships (teaching key added in 9.23.0)', () => {
    // Pre-9.23 agentfootprint had no teaching-voice key for route_conflict,
    // so selectCommentaryKey returned undefined and teachingHumanizer fell
    // through to defaultHumanizer's sentence (identifiers in straight
    // quotes: `"shipping"`). 9.23.0 added agentfootprint's own
    // `skill.route_conflict` commentary template (identifiers in
    // backticks: `` `shipping` ``). Both are honest; assert the invariant
    // that holds across both eras, same precedent as the turn_routed test
    // above.
    const out = teachingHumanizer(
      evt(ROUTE_CONFLICT, {
        iteration: 1,
        winner: { toolName: 'get_order', target: 'shipping' },
        losers: [{ toolName: 'check_charge', target: 'billing' }],
      }),
    );
    expect(out).toBeTruthy();
    expect(out).toContain('get_order');
    expect(out).toContain('shipping');
    expect(out).toContain('won');
    expect(out).toContain('check_charge');
    expect(out).toContain('billing');
    expect(out).toContain('suppressed');
  });
});

describe('routing — R24b: defaultHumanizer turn_routed by=entry (era-independent, this package owns it)', () => {
  it('renders the exact default sentence regardless of what agentfootprint bundles for teaching voice', () => {
    const out = defaultHumanizer(evt(TURN_ROUTED, { by: 'entry', to: 'billing' }));
    expect(out).toBe('Turn started in "billing" — a rule matched (tier 1).');
  });
});
