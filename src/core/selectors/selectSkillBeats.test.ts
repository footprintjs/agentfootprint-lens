/**
 * `selectSkillBeats` — the routing record on the time axis, over a REAL
 * recording plus the arms one happy run cannot contain.
 *
 * The centrepiece replays `__fixtures__/skill-route-refusal.json` — the same
 * frozen run `selectSkillRoute.test.ts` pins, produced by running the real
 * library (see that folder's README). One turn, four iterations, four of the
 * nine cursor causes, and a refused pick whose consequence lands one
 * iteration later. What the beats must add on top of the fold:
 *
 *   • the cursor CARRIED FORWARD, so every beat knows the skill in play;
 *   • `visited` ACCUMULATED in run order (a set that grows, never shrinks);
 *   • the library's own sentence per beat — never prose written here;
 *   • a reachable set only where a TYPED one exists, tagged with its source.
 *
 * The mutation arm is the one that would catch the accumulation bug this
 * design exists to prevent: mutating a returned `visited` array must not
 * change the next call's answer.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import { observeRecording, type Recording } from '../observeRecording.js';
import { selectSkillRoute, type SkillHop, type SkillRoute } from './selectSkillRoute.js';
import { selectSkillBeats, selectSkillBeatAt, type SkillBeat } from './selectSkillBeats.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');

function realRoute(): SkillRoute {
  const recording = JSON.parse(
    readFileSync(join(FIXTURES, 'skill-route-refusal.json'), 'utf8'),
  ) as Recording;
  return selectSkillRoute({ log: observeRecording(recording).recorder.selectEventLog() });
}

/** A hop with only the fields a test cares about — the rest at their empty. */
function hop(partial: Partial<SkillHop> & Pick<SkillHop, 'iteration'>): SkillHop {
  return {
    turnIndex: 0,
    moved: false,
    activeIds: [],
    supersededIds: [],
    refusals: [],
    conflicts: [],
    superseded: [],
    toolsAsSent: [],
    skillInjections: [],
    ...partial,
  };
}

function route(partial: Partial<SkillRoute>): SkillRoute {
  return {
    hasRouting: true,
    nodes: [],
    hops: [],
    observedEdges: [],
    declaredEdges: [],
    turns: [],
    ...partial,
  };
}

// ─── B1 — the real recording ─────────────────────────────────────────────

describe('selectSkillBeats — over the recording the library produced', () => {
  it('projects one beat per iteration, in run order', () => {
    const beats = selectSkillBeats({ route: realRoute() });
    expect(beats.map((b) => b.iteration)).toEqual([1, 2, 3, 4]);
    expect(beats.map((b) => b.index)).toEqual([0, 1, 2, 3]);
    expect(beats.map((b) => b.cause)).toEqual(['entry', 'stay', 'model-pick', 'route']);
  });

  it('carries the cursor forward and accumulates what has been visited', () => {
    const beats = selectSkillBeats({ route: realRoute() });
    expect(beats.map((b) => b.cursorSkillId)).toEqual([
      'triage',
      'triage',
      'volume-lookup',
      'audit-log',
    ]);
    expect(beats.map((b) => b.visited)).toEqual([
      ['triage'],
      ['triage'],
      ['triage', 'volume-lookup'],
      ['triage', 'volume-lookup', 'audit-log'],
    ]);
  });

  it('narrates every beat with the library sentence, refusal included', () => {
    const beats = selectSkillBeats({ route: realRoute() });
    // `humanizeCursorMove`'s own words — asserted as the library writes them,
    // so a rewording there is a decision made once, in one place.
    expect(beats[0]!.headline).toContain('Started in "triage"');
    expect(beats[1]!.headline).toBe('Nothing moved — it stayed in "triage".');
    // An UNDECORATED model pick: the humanizer stays silent (commentary rule),
    // and the beat renders the movement clause rather than nothing.
    expect(beats[2]!.headline).toBe('The model chose "volume-lookup", moving from "triage".');
    expect(beats[3]!.headline).toContain('the author drew this path');

    // The refusal rides the beat the model ASKED on — the library's sentence.
    expect(beats[0]!.refusedIds).toEqual(['audit-log']);
    expect(beats[0]!.notes).toHaveLength(1);
    expect(beats[0]!.notes[0]).toContain('"audit-log"');
    expect(beats[0]!.notes[0]).toContain('not reachable from "triage"');
    expect(beats[1]!.notes).toEqual([]);
  });

  it('names a reachable set ONLY from a typed field, and says which one', () => {
    const beats = selectSkillBeats({ route: realRoute() });
    // Iteration 1 was refused, so the gate's own reachability set is on the record.
    expect(beats[0]!.reachable).toEqual({ ids: ['volume-lookup'], source: 'refusal' });
    // Iteration 2 has no refusal and no declared edge out of `triage` —
    // absent, not empty. (The `read_skill` menu says it in PROSE; parsing
    // prose back into ids is what this selector refuses to do.)
    expect(beats[1]!.reachable).toBeUndefined();
    // Iteration 4 hopped along the one declared edge, whose source is named.
    expect(beats[3]!.reachable).toEqual({ ids: ['audit-log'], source: 'declared-edges' });
  });

  it('keeps the whole hop on the beat — nothing is summarized away', () => {
    const beats = selectSkillBeats({ route: realRoute() });
    expect(beats[0]!.hop.readSkillDescription).toContain('Reachable from here');
    expect(beats[0]!.hop.refusals[0]!.refusalText).toContain('not reachable');
    expect(beats[0]!.runtimeStageId).toBe('sf-injection-engine/evaluate#3');
  });
});

// ─── B2 — the cursor resolver (the one-cursor law) ───────────────────────

describe('selectSkillBeatAt — resolving the ONE cursor', () => {
  const beats = (): readonly SkillBeat[] => selectSkillBeats({ route: realRoute() });

  it('lands exactly on the evaluate stage the cursor names', () => {
    expect(selectSkillBeatAt(beats(), 'sf-injection-engine/evaluate#49')?.iteration).toBe(3);
  });

  it('resolves a cursor between stops to the routing state in effect there', () => {
    // #60 is past iteration 3's evaluate (#49) and before iteration 4's (#72).
    expect(selectSkillBeatAt(beats(), 'other-stage#60')?.iteration).toBe(3);
  });

  it('resolves a cursor on the enclosing subflow root to the beat inside it', () => {
    // The subflow root at #2 encloses the evaluate at #3 (rule 2, within).
    expect(selectSkillBeatAt(beats(), 'sf-injection-engine#2')?.iteration).toBe(1);
  });

  it('answers undefined before the first routing stop, and the last beat at the end', () => {
    expect(selectSkillBeatAt(beats(), 'stage#0')).toBeUndefined();
    expect(selectSkillBeatAt(beats(), '__root__#0', 'group-start')).toBeUndefined();
    expect(selectSkillBeatAt(beats(), '__root__#0', 'group-end')?.iteration).toBe(4);
    expect(selectSkillBeatAt(beats(), '', undefined)?.iteration).toBe(4); // live edge
    expect(selectSkillBeatAt([], 'anything')).toBeUndefined();
  });

  it('never throws on an id it cannot parse', () => {
    expect(selectSkillBeatAt(beats(), 'no-index-here')).toBeUndefined();
  });
});

// ─── B3 — arms the happy run cannot contain ──────────────────────────────

describe('selectSkillBeats — the shapes one run does not have', () => {
  it('states the ABSENCE when an iteration recorded no cursor resolution', () => {
    const beats = selectSkillBeats({
      route: route({ hops: [hop({ iteration: 1 })] }),
    });
    expect(beats[0]!.headline).toBe('This iteration recorded no cursor resolution.');
    expect(beats[0]!.cause).toBeUndefined();
    expect(beats[0]!.cursorSkillId).toBeUndefined();
    expect(beats[0]!.visited).toEqual([]);
  });

  it('mentions the refusal when that is all the iteration carried', () => {
    const beats = selectSkillBeats({
      route: route({
        hops: [
          hop({
            iteration: 1,
            refusals: [
              { requestedId: 'audit-log', allowed: ['triage'], turnIndex: 0, iteration: 1 },
            ],
          }),
        ],
      }),
    });
    expect(beats[0]!.headline).toContain('only the refusal below');
    expect(beats[0]!.notes[0]).toContain('"audit-log"');
  });

  it('opens each turn with its turn-start verdict, once', () => {
    const beats = selectSkillBeats({
      route: route({
        hops: [
          hop({ iteration: 1, turnIndex: 0, to: 'a', by: 'entry', moved: true }),
          hop({ iteration: 2, turnIndex: 0, from: 'a', to: 'a', by: 'stay' }),
          hop({ iteration: 1, turnIndex: 1, from: 'a', to: 'b', by: 'intent', moved: true }),
        ],
        turns: [
          { turnIndex: 0, by: 'entry', to: 'a', scores: [] },
          { turnIndex: 1, by: 'intent', from: 'a', to: 'b', scores: [] },
        ],
      }),
    });
    expect(beats[0]!.notes[0]).toContain('a rule matched (tier 1)');
    expect(beats[1]!.notes).toEqual([]); // same turn — the verdict is not repeated
    expect(beats[2]!.notes[0]).toContain('intent');
  });

  it('renders a conflict and a superseded pick as their own notes', () => {
    const beats = selectSkillBeats({
      route: route({
        hops: [
          hop({
            iteration: 1,
            to: 'refunds',
            by: 'route',
            moved: true,
            conflicts: [
              {
                fromSkillId: 'billing',
                winner: { toolName: 'inspect_charge', target: 'refunds' },
                losers: [{ toolName: 'lookup_invoice', target: 'disputes' }],
              },
            ],
            superseded: [
              { volunteeredId: 'disputes', wonId: 'refunds', fromSkillId: 'billing' },
            ],
          }),
        ],
      }),
    });
    expect(beats[0]!.notes[0]).toContain('wanted different next skills');
    expect(beats[0]!.notes[1]).toBe(
      'The model volunteered "disputes", but the author\'s edge from "billing" to "refunds" outranked it.',
    );
  });

  it('flags the model\'s own pick separately from where the cursor now stands', () => {
    const beats = selectSkillBeats({
      route: route({
        hops: [
          hop({ iteration: 1, from: 'a', to: 'b', by: 'model-pick', moved: true }),
          hop({ iteration: 2, from: 'b', to: 'c', by: 'route', moved: true }),
        ],
      }),
    });
    expect(beats[0]!.modelPickedId).toBe('b');
    expect(beats[1]!.modelPickedId).toBeUndefined();
    expect(beats[1]!.cursorSkillId).toBe('c');
  });

  it('projects an empty route to no beats', () => {
    expect(selectSkillBeats({ route: route({}) })).toEqual([]);
  });
});

// ─── B4 — mutation safety ────────────────────────────────────────────────

describe('selectSkillBeats — a caller cannot corrupt the next answer', () => {
  it('hands out a fresh visited list per beat and per call', () => {
    const r = realRoute();
    const first = selectSkillBeats({ route: r });
    // Same array identity is never shared between two beats…
    expect(first[2]!.visited).not.toBe(first[3]!.visited);
    // …and mutating one does not reach the next call's answer.
    (first[3]!.visited as string[]).push('injected');
    (first[3]!.refusedIds as string[]).push('injected');
    const second = selectSkillBeats({ route: r });
    expect(second[3]!.visited).toEqual(['triage', 'volume-lookup', 'audit-log']);
    expect(second[3]!.refusedIds).toEqual([]);
  });

  it('does not mutate the route it was given', () => {
    const r = realRoute();
    const before = JSON.stringify(r);
    selectSkillBeats({ route: r });
    expect(JSON.stringify(r)).toBe(before);
  });
});

// ─── The 9.50.0 reachable source — priority and the dead-end fact ─────────

describe('selectSkillBeats — cursorMove.reachable (9.50.0)', () => {
  it('the move\'s own set OUTRANKS the refusal list and the declared-edge fold', () => {
    // One hop carrying all three candidate sources at once: the exact
    // per-move set must win, and the tag must say which field supplied it.
    const r = route({
      hops: [
        hop({
          iteration: 1,
          from: 'triage',
          to: 'triage',
          by: 'stay',
          reachable: ['volume-lookup', 'export'],
          refusals: [
            {
              requestedId: 'audit-log',
              allowed: ['volume-lookup'],
              turnIndex: 0,
              iteration: 1,
            },
          ],
        }),
      ],
      declaredEdges: [{ from: 'triage', to: 'inventory' }],
    });
    expect(selectSkillBeats({ route: r })[0]!.reachable).toEqual({
      ids: ['volume-lookup', 'export'],
      source: 'cursor-move',
    });
  });

  it('an EMPTY reachable set is a dead end — a fact, never rendered as absence', () => {
    const r = route({
      hops: [hop({ iteration: 1, from: 'end-skill', to: 'end-skill', by: 'stay', reachable: [] })],
    });
    const beat = selectSkillBeats({ route: r })[0]!;
    // Present with zero ids — the gate admitted NOTHING from this cursor.
    expect(beat.reachable).toEqual({ ids: [], source: 'cursor-move' });
  });

  it('without the field, the older sources still answer — in their old order', () => {
    const r = route({
      hops: [
        hop({
          iteration: 1,
          from: 'triage',
          to: 'triage',
          by: 'stay',
          refusals: [
            { requestedId: 'audit-log', allowed: ['volume-lookup'], turnIndex: 0, iteration: 1 },
          ],
        }),
      ],
      declaredEdges: [{ from: 'triage', to: 'inventory' }],
    });
    expect(selectSkillBeats({ route: r })[0]!.reachable).toEqual({
      ids: ['volume-lookup'],
      source: 'refusal',
    });
  });
});
