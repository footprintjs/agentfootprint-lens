/**
 * cursorPositionsAtDrill — Layer 1 / Tier B tests (Convention 3).
 */

import { describe, it, expect } from 'vitest';
import type { Group } from './Group.js';
import type { CommitSyncEntry } from './buildCommitSyncMap.js';
import { cursorPositionsAtDrill, type MilestoneClassifier } from './cursorPositionsAtDrill.js';

function group(
  runtimeGroupId: string,
  name: string,
  depth: number,
  parentGroupId: string | undefined,
  opensAt: number,
  closesAt?: number,
  isRoot = false,
  extras: Partial<Pick<Group, 'compositionKind' | 'slotKind' | 'primitiveKind'>> = {},
): Group {
  return {
    runtimeGroupId, name, parentGroupId,
    subflowPath: runtimeGroupId.split('#')[0]!.split('/'),
    depth,
    opensAtCommitIdx: opensAt,
    ...(closesAt !== undefined ? { closesAtCommitIdx: closesAt } : { closesAtCommitIdx: undefined }),
    isRoot,
    ...extras,
  };
}

function commit(
  commitIdx: number,
  runtimeStageId: string,
  runtimeGroupId: string,
  depth: number,
  label: string,
): CommitSyncEntry {
  return {
    runtimeStageId, commitIdx, runtimeGroupId,
    subflowPath: [], depth, label,
  };
}

// Standard fixture: Parallel-of-2-LLMCalls
// Committee is tagged as a Parallel composition so the selector emits
// BOTH start and end positions (the "merge" moment).
const root = group('__root__#0', 'Run', 0, undefined, 0, 9, true);
const parallel = group('sf-Committee#1', 'Committee', 1, '__root__#0', 1, 8,
  false, { compositionKind: 'Parallel' });
const legal = group('legal#1', 'legal', 2, 'sf-Committee#1', 2, 4);
const ethics = group('ethics#3', 'ethics', 2, 'sf-Committee#1', 3, 5);
const merge = group('merge#5', 'merge', 2, 'sf-Committee#1', 6, 6);
const groups: readonly Group[] = [root, parallel, legal, ethics, merge];

const commits: readonly CommitSyncEntry[] = [
  commit(0, '__root__#0', '__root__#0', 0, 'seed'),
  commit(1, 'sf-Committee/fork#1', 'sf-Committee#1', 1, 'Committee · fork'),
  commit(2, 'legal/setup#2', 'legal#1', 2, 'legal · setup'),
  commit(3, 'legal/call-llm#3', 'legal#1', 2, 'legal · call-llm'),
  commit(4, 'ethics/setup#4', 'ethics#3', 2, 'ethics · setup'),
  commit(5, 'ethics/call-llm#5', 'ethics#3', 2, 'ethics · call-llm'),
  commit(6, 'merge/exec#6', 'merge#5', 2, 'merge · exec'),
  commit(7, 'sf-Committee/exit#7', 'sf-Committee#1', 1, 'Committee · exit'),
];

// ─── MILESTONES — domain-declared stage-by-stage scrub stops ─────────
//
// A single-agent flat ReAct run over 2 iterations: the injection-engine subflow
// is the per-iteration loop boundary (an `iteration` milestone, a CHILD GROUP);
// call-llm / route / tool-calls are top-level COMMITS classified as
// llm-turn / decision / tool-call. The milestone path should produce one stop
// per stage, in commit order, with ordinals for repeated kinds.

const mRoot = group('__root__#0', 'Run', 0, undefined, 0, 11, true);
const mInj1 = group('sf-injection-engine#1', 'Injection Engine', 1, '__root__#0', 1, 1);
const mInj2 = group('sf-injection-engine#6', 'Injection Engine', 1, '__root__#0', 6, 6);
const mGroups: readonly Group[] = [mRoot, mInj1, mInj2];

const mCommits: readonly CommitSyncEntry[] = [
  commit(0, 'seed#0', '__root__#0', 0, 'seed'), // plumbing → null
  commit(1, 'sf-injection-engine/eval#1', 'sf-injection-engine#1', 1, 'inj internal'), // inside inj → excluded
  commit(2, 'call-llm#2', '__root__#0', 0, 'call-llm'), // llm-turn 1
  commit(3, 'sf-route#3', '__root__#0', 0, 'route'), // decision 1
  commit(4, 'tool-calls#4', '__root__#0', 0, 'tool-calls'), // tool-call
  commit(5, 'sf-injection-engine/eval#6', 'sf-injection-engine#6', 1, 'inj internal'), // inside inj → excluded
  commit(7, 'call-llm#7', '__root__#0', 0, 'call-llm'), // llm-turn 2
  commit(8, 'sf-route#8', '__root__#0', 0, 'route'), // decision 2
];

/** Mirrors agentfootprint's `milestoneFor` for the stages this fixture uses. */
const classify: MilestoneClassifier = (id) => {
  const local = id.split('#')[0]!.split('/').pop()!;
  if (local === 'sf-injection-engine') return { kind: 'iteration', label: 'Iteration' };
  if (local === 'call-llm') return { kind: 'llm-turn', label: 'LLM turn' };
  if (local === 'tool-calls') return { kind: 'tool-call', label: 'Tool call' };
  if (local === 'sf-route') return { kind: 'decision', label: 'Route' };
  return null;
};

describe('cursorPositionsAtDrill — milestones', () => {
  it('builds one stage-by-stage stop per milestone, in commit order, with ordinals', () => {
    const positions = cursorPositionsAtDrill(mGroups, mCommits, [], classify);
    expect(positions.map((p) => p.label)).toEqual([
      'Run · start',
      'Iteration 1', // inj group #1 (opens at 1)
      'LLM turn 1', // call-llm#2
      'Route 1', // sf-route#3
      'Tool call', // tool-calls#4 (only one → no ordinal)
      'Iteration 2', // inj group #6 (opens at 6)
      'LLM turn 2', // call-llm#7
      'Route 2', // sf-route#8
      'Run · end',
    ]);
  });

  it('milestone stops carry the real commit runtimeStageId (one-cursor invariant)', () => {
    const positions = cursorPositionsAtDrill(mGroups, mCommits, [], classify);
    const llm1 = positions.find((p) => p.label === 'LLM turn 1')!;
    expect(llm1.runtimeStageId).toBe('call-llm#2');
    expect(llm1.commitIdx).toBe(2);
    const tool = positions.find((p) => p.label === 'Tool call')!;
    expect(tool.runtimeStageId).toBe('tool-calls#4');
  });

  it('excludes commits inside a deeper child group (scoped to the current level)', () => {
    const positions = cursorPositionsAtDrill(mGroups, mCommits, [], classify);
    // the injection-engine INTERNAL commits must NOT appear as their own stops
    expect(positions.some((p) => p.runtimeStageId.includes('/eval'))).toBe(false);
  });

  it('falls back to structural child-group stops when the classifier finds nothing', () => {
    // A classifier that never matches → milestone path is empty → old behaviour.
    const none: MilestoneClassifier = () => null;
    const withClassifier = cursorPositionsAtDrill(groups, commits, [], none);
    const withoutClassifier = cursorPositionsAtDrill(groups, commits, []);
    expect(withClassifier).toEqual(withoutClassifier);
  });
});

// ─── MILESTONES — parallel slot cohort collapses to ONE "Context" stop ──────
// The 3 context slots run concurrently; a faithful time-travel lights them all
// at ONE stop rather than stepping through them. A run of ONE slot (classic
// mode, only Messages re-ran) stays individual so "which slot got updated" reads.

describe('cursorPositionsAtDrill — parallel slot collapse', () => {
  const pRoot = group('__root__#0', 'Run', 0, undefined, 0, 6, true);
  const sp = group('sf-system-prompt#1', 'System Prompt', 1, '__root__#0', 1, 1, false, { slotKind: 'system-prompt' });
  const msg = group('sf-messages#2', 'Messages', 1, '__root__#0', 2, 2, false, { slotKind: 'messages' });
  const tools = group('sf-tools#3', 'Tools', 1, '__root__#0', 3, 3, false, { slotKind: 'tools' });
  const pCommits: readonly CommitSyncEntry[] = [
    commit(0, 'seed#0', '__root__#0', 0, 'seed'),
    commit(4, 'call-llm#4', '__root__#0', 0, 'call-llm'),
  ];
  const classifySlots: MilestoneClassifier = (id) => {
    const local = id.split('#')[0]!.split('/').pop()!;
    if (local === 'sf-system-prompt') return { kind: 'slot', label: 'System prompt' };
    if (local === 'sf-messages') return { kind: 'slot', label: 'Messages' };
    if (local === 'sf-tools') return { kind: 'slot', label: 'Tools' };
    if (local === 'call-llm') return { kind: 'llm-turn', label: 'LLM turn' };
    return null;
  };

  it('collapses the 3 parallel slots into ONE Context stop carrying all branch ids', () => {
    const positions = cursorPositionsAtDrill([pRoot, sp, msg, tools], pCommits, [], classifySlots);
    expect(positions.map((p) => p.label)).toEqual(['Run · start', 'Context', 'LLM turn', 'Run · end']);
    const ctx = positions.find((p) => p.label === 'Context')!;
    expect(ctx.kind).toBe('parallel');
    expect([...(ctx.coActiveGroupIds ?? [])].sort()).toEqual([
      'sf-messages#2', 'sf-system-prompt#1', 'sf-tools#3',
    ]);
    // canonical cursor = earliest-opening branch (one-cursor invariant)
    expect(ctx.runtimeStageId).toBe('sf-system-prompt#1');
    expect(ctx.commitIdx).toBe(1);
  });

  it('a single running slot (classic mode) stays an individual stop, NOT collapsed', () => {
    // Only Messages re-ran this turn.
    const positions = cursorPositionsAtDrill([pRoot, msg], pCommits, [], classifySlots);
    expect(positions.some((p) => p.label === 'Context')).toBe(false);
    const m = positions.find((p) => p.label === 'Messages')!;
    expect(m).toBeDefined();
    expect(m.coActiveGroupIds).toBeUndefined();
    expect(m.kind).toBe('commit');
  });
});

// ─── PARALLEL composition — branches light together at the composition stop ──
// A parallel-AGENT fork (Committee: legal ‖ ethics + merge). The branches are
// subflow GROUPS one level under the Parallel composition, but their NODES
// render at the composition's level — so the composition's stop carries the
// concurrent branches as coActiveGroupIds (chart lights them together). The
// trailing merge (opens after the branches close) is excluded.

describe('cursorPositionsAtDrill — parallel composition branch highlight', () => {
  it('the Parallel composition stop carries its concurrent branches as coActive (merge excluded)', () => {
    // Reuse the module fixture: root → sf-Committee(Parallel) → legal, ethics, merge.
    const pos = cursorPositionsAtDrill(groups, commits, []);
    const committee = pos.find((p) => p.runtimeGroupId === 'sf-Committee#1' && p.kind === 'group-start')!;
    expect(committee).toBeDefined();
    expect([...(committee.coActiveGroupIds ?? [])].sort()).toEqual(['ethics#3', 'legal#1']);
    // merge opens AFTER both branches close → not concurrent → excluded.
    expect(committee.coActiveGroupIds).not.toContain('merge#5');
  });
});

// ─── COMPOSITION DESCENT — plain control flows scrub their steps ────────────
// A top-level Sequence / Conditional / Loop wraps everything in ONE composition
// group whose MEMBERS (steps / chosen branch / iterations) live one level down.
// The structural fallback must descend through the composition TRANSPARENTLY so
// the cursor stops at — and the chart lights — each step, not just the wrapper.
// (Before the fix these flows showed only 2 stops and only the seed node lit.)

describe('cursorPositionsAtDrill — composition descent', () => {
  // SEQUENCE: root → seed#0(Sequence) → step-classify#1, step-respond#14
  const seqRoot = group('__root__#0', 'Run', 0, undefined, 0, 6, true);
  const seq = group('seed#0', 'IntakePipeline', 0, '__root__#0', 0, 5, false, { compositionKind: 'Sequence' });
  const sClassify = group('step-classify#1', 'classify', 1, 'seed#0', 1, 2);
  const sRespond = group('step-respond#14', 'respond', 1, 'seed#0', 3, 4);
  const seqGroups: readonly Group[] = [seqRoot, seq, sClassify, sRespond];

  it('Sequence: each step becomes its own stop, in order (unit)', () => {
    const pos = cursorPositionsAtDrill(seqGroups, [], []);
    expect(pos.map((p) => p.label)).toEqual([
      'Run · start', 'IntakePipeline', 'classify', 'respond', 'Run · end',
    ]);
  });

  it('Sequence: step stops carry the real step group id so the chart node lights (functional)', () => {
    const pos = cursorPositionsAtDrill(seqGroups, [], []);
    const classify = pos.find((p) => p.label === 'classify')!;
    // `#`-stripped id must match the rendered chart node id (`step-classify`).
    expect(classify.runtimeStageId).toBe('step-classify#1');
    expect(classify.runtimeStageId.split('#')[0]).toBe('step-classify');
    expect(classify.coActiveGroupIds).toBeUndefined(); // sequential, not concurrent
    expect(pos.find((p) => p.label === 'respond')!.runtimeStageId).toBe('step-respond#14');
  });

  // CONDITIONAL: root → seed#0(Conditional) → normal#2 (only the CHOSEN branch ran)
  const condRoot = group('__root__#0', 'Run', 0, undefined, 0, 5, true);
  const cond = group('seed#0', 'Triage', 0, '__root__#0', 0, 4, false, { compositionKind: 'Conditional' });
  const chosen = group('normal#2', 'normal', 1, 'seed#0', 2, 3);
  const condGroups: readonly Group[] = [condRoot, cond, chosen];

  it('Conditional: only the chosen branch (the one that ran) becomes a stop (unit)', () => {
    const pos = cursorPositionsAtDrill(condGroups, [], []);
    expect(pos.map((p) => p.label)).toEqual([
      'Run · start', 'Triage', 'normal', 'Run · end',
    ]);
    expect(pos.find((p) => p.label === 'normal')!.runtimeStageId).toBe('normal#2');
  });

  // LOOP: root → seed#0(Loop) → body#2, body#17, body#32 (same body, 3 iterations)
  const loopRoot = group('__root__#0', 'Run', 0, undefined, 0, 13, true);
  const loop = group('seed#0', 'Refine', 0, '__root__#0', 0, 12, false, { compositionKind: 'Loop' });
  const b1 = group('body#2', 'body', 1, 'seed#0', 2, 3);
  const b2 = group('body#17', 'body', 1, 'seed#0', 6, 7);
  const b3 = group('body#32', 'body', 1, 'seed#0', 10, 11);
  const loopGroups: readonly Group[] = [loopRoot, loop, b1, b2, b3];

  it('Loop: one stop per iteration with ordinals, then an exit stop (unit)', () => {
    const pos = cursorPositionsAtDrill(loopGroups, [], []);
    expect(pos.map((p) => p.label)).toEqual([
      'Run · start', 'Refine', 'body 1', 'body 2', 'body 3', 'Refine · exit', 'Run · end',
    ]);
  });

  it('Loop: each iteration stop points at its OWN execution group (distinct cursors)', () => {
    const pos = cursorPositionsAtDrill(loopGroups, [], []);
    expect(pos.find((p) => p.label === 'body 1')!.runtimeStageId).toBe('body#2');
    expect(pos.find((p) => p.label === 'body 2')!.runtimeStageId).toBe('body#17');
    expect(pos.find((p) => p.label === 'body 3')!.runtimeStageId).toBe('body#32');
    // all three light the SAME chart node 'body' (the loop body) as you scrub
    expect(new Set(pos.filter((p) => p.label.startsWith('body')).map((p) => p.runtimeStageId.split('#')[0])))
      .toEqual(new Set(['body']));
  });

  it('descent recurses: a Parallel nested in a Sequence collapses to ONE coActive stop (integration)', () => {
    // root → seed#0(Sequence) → stepA#1 (leaf), sf-P#3(Parallel) → pa#4 ‖ pb#6
    const r = group('__root__#0', 'Run', 0, undefined, 0, 10, true);
    const s = group('seed#0', 'Pipeline', 0, '__root__#0', 0, 9, false, { compositionKind: 'Sequence' });
    const a = group('stepA#1', 'stepA', 1, 'seed#0', 1, 2);
    const p = group('sf-P#3', 'Vote', 1, 'seed#0', 3, 8, false, { compositionKind: 'Parallel' });
    const pa = group('pa#4', 'pa', 2, 'sf-P#3', 4, 6);
    const pb = group('pb#6', 'pb', 2, 'sf-P#3', 4, 7);
    const pos = cursorPositionsAtDrill([r, s, a, p, pa, pb], [], []);
    expect(pos.map((x) => x.label)).toEqual([
      'Run · start', 'Pipeline', 'stepA', 'Vote', 'Vote · merged', 'Run · end',
    ]);
    const vote = pos.find((x) => x.label === 'Vote')!;
    expect([...(vote.coActiveGroupIds ?? [])].sort()).toEqual(['pa#4', 'pb#6']);
  });

  it('does NOT descend into a plain (non-composition) subflow — drill-in territory (property)', () => {
    // step-classify is a plain subflow whose OWN children (slots) must NOT surface
    // as top-level stops. Add nested slot groups and assert they are absent.
    const sp = group('step-classify/sf-llm-call/sf-system-prompt#5', 'System Prompt', 3, 'step-classify#1', 1, 1, false, { slotKind: 'system-prompt' });
    const llm = group('step-classify/sf-llm-call#3', 'LLM', 2, 'step-classify#1', 1, 1);
    const pos = cursorPositionsAtDrill([...seqGroups, llm, sp], [], []);
    expect(pos.map((p) => p.label)).toEqual([
      'Run · start', 'IntakePipeline', 'classify', 'respond', 'Run · end',
    ]);
    expect(pos.some((p) => p.runtimeStageId.includes('sf-llm-call'))).toBe(false);
  });

  it('every descended stop carries a valid commitIdx and is a known group (property)', () => {
    const all = [seqGroups, condGroups, loopGroups];
    for (const gs of all) {
      const ids = new Set(gs.map((g) => g.runtimeGroupId));
      const pos = cursorPositionsAtDrill(gs, [], []);
      for (const p of pos) {
        expect(ids.has(p.runtimeStageId)).toBe(true);
        expect(p.commitIdx).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('commitIdx stays monotonically non-decreasing through descent (property)', () => {
    const pos = cursorPositionsAtDrill(loopGroups, [], []);
    for (let i = 1; i < pos.length; i++) {
      expect(pos[i]!.commitIdx).toBeGreaterThanOrEqual(pos[i - 1]!.commitIdx);
    }
  });

  it('does not mutate inputs during descent (security)', () => {
    const before = JSON.stringify(loopGroups);
    cursorPositionsAtDrill(loopGroups, [], []);
    expect(JSON.stringify(loopGroups)).toBe(before);
  });

  it('deep nested-composition chain stays within budget (performance)', () => {
    // A Sequence of 50 sub-Sequences, each with 2 steps → exercises recursion.
    const many: Group[] = [group('__root__#0', 'Run', 0, undefined, 0, 1000, true)];
    many.push(group('seed#0', 'Outer', 0, '__root__#0', 0, 999, false, { compositionKind: 'Sequence' }));
    let idx = 1;
    for (let i = 0; i < 50; i++) {
      const open = idx;
      const subId = `sub-${i}#${idx++}`;
      const s1 = `s1-${i}#${idx++}`;
      const s2 = `s2-${i}#${idx++}`;
      many.push(group(subId, `Sub${i}`, 1, 'seed#0', open, open + 3, false, { compositionKind: 'Sequence' }));
      many.push(group(s1, `a${i}`, 2, subId, open + 1, open + 1));
      many.push(group(s2, `b${i}`, 2, subId, open + 2, open + 2));
      idx = open + 4;
    }
    const start = performance.now();
    const pos = cursorPositionsAtDrill(many, [], []);
    expect(performance.now() - start).toBeLessThan(200);
    // 50 sub-sequences × (1 start + 2 steps) + outer start + Run start/end
    expect(pos.length).toBeGreaterThan(150);
  });
});

// ─── COMPOSITION DESCENT — robustness (adversarial-review hardening) ────────
// The descent finds members by PARENT pointer (directChildren), not commit
// containment, so the root and same-level siblings can never be captured as
// phantom members — the failure modes an earlier commit-containment scan had.

describe('cursorPositionsAtDrill — composition descent robustness', () => {
  it('in-flight composition (root + composition close UNDEFINED) does NOT capture the root as a member', () => {
    // Live mode: nothing has closed yet. A commit-containment scan would treat
    // the still-open root (open 0, close ∞) as enclosed by the still-open Loop
    // (open 0, close ∞) and emit a phantom "Run" stop between Refine and body.
    const root = group('__root__#0', 'Run', 0, undefined, 0, undefined, true);
    const loop = group('seed#0', 'Refine', 0, '__root__#0', 0, undefined, false, { compositionKind: 'Loop' });
    const body = group('body#2', 'body', 1, 'seed#0', 2, 3);
    const pos = cursorPositionsAtDrill([root, loop, body], [], []);
    expect(pos.map((p) => p.label)).toEqual(['Run · start', 'Refine', 'body']);
    // the root id must NEVER appear as a mid-list member stop
    const mid = pos.slice(1);
    expect(mid.some((p) => p.runtimeGroupId === '__root__#0')).toBe(false);
  });

  it('composition whose close EQUALS the root close does NOT capture the root', () => {
    const root = group('__root__#0', 'Run', 0, undefined, 0, 12, true);
    const loop = group('seed#0', 'Refine', 0, '__root__#0', 0, 12, false, { compositionKind: 'Loop' });
    const body = group('body#2', 'body', 1, 'seed#0', 2, 3);
    const pos = cursorPositionsAtDrill([root, loop, body], [], []);
    expect(pos.map((p) => p.label)).toEqual(['Run · start', 'Refine', 'body', 'Refine · exit', 'Run · end']);
    expect(pos.filter((p) => p.runtimeGroupId === '__root__#0')).toHaveLength(2); // start + end only
  });

  it('in-flight composition does NOT swallow a later top-level sibling parented to root', () => {
    const root = group('__root__#0', 'Run', 0, undefined, 0, undefined, true);
    const loop = group('seed#0', 'Refine', 0, '__root__#0', 0, undefined, false, { compositionKind: 'Loop' });
    const body = group('body#2', 'body', 1, 'seed#0', 2, 3);
    const other = group('other#3', 'Other', 1, '__root__#0', 4, 5); // sibling of the loop, NOT a member
    const pos = cursorPositionsAtDrill([root, loop, body, other], [], []);
    // 'Other' is a sibling of the Loop (both parent root) — it must appear AFTER
    // the loop as a peer, never nested as a loop iteration.
    expect(pos.map((p) => p.label)).toEqual(['Run · start', 'Refine', 'body', 'Other']);
  });

  it('two compositions sharing a commit range do NOT recurse infinitely (cycle-safe)', () => {
    // A & B same range, both parent root. A commit-containment scan would make
    // each a "member" of the other → stack overflow. Parent-based descent treats
    // them as independent siblings of root; the visited guard is the backstop.
    const root = group('__root__#0', 'Run', 0, undefined, 0, 10, true);
    const a = group('A#1', 'Alpha', 0, '__root__#0', 1, 8, false, { compositionKind: 'Sequence' });
    const b = group('B#2', 'Beta', 0, '__root__#0', 1, 8, false, { compositionKind: 'Sequence' });
    expect(() => cursorPositionsAtDrill([root, a, b], [], [])).not.toThrow();
    const pos = cursorPositionsAtDrill([root, a, b], [], []);
    // Both compositions render as peers (no members → just their start anchors).
    expect(pos.map((p) => p.label)).toEqual(['Run · start', 'Alpha', 'Beta', 'Run · end']);
  });

  it('malformed parentGroupId cycle (A↔B) is emitted as leaves, never crashes', () => {
    const root = group('__root__#0', 'Run', 0, undefined, 0, 10, true);
    const a = group('A#1', 'Alpha', 1, 'B#2', 1, 8, false, { compositionKind: 'Sequence' });
    const b = group('B#2', 'Beta', 1, 'A#1', 1, 8, false, { compositionKind: 'Sequence' });
    // A's parent is B and B's parent is A — neither is a child of root, so the
    // top level shows only the bookends; the guard prevents infinite recursion if
    // such a cycle is ever reached via descent.
    expect(() => cursorPositionsAtDrill([root, a, b], [], [])).not.toThrow();
  });

  it('ordinals are SCOPED per composition — a second loop restarts at "body 1"', () => {
    // Sequence 'Outer' → Loop1[body,body], Loop2[body,body]. Each loop's bodies
    // must count independently (NOT a global body 1/2/3/4).
    const root = group('__root__#0', 'Run', 0, undefined, 0, 30, true);
    const outer = group('seed#0', 'Outer', 0, '__root__#0', 0, 29, false, { compositionKind: 'Sequence' });
    const loop1 = group('loop1#1', 'Loop', 1, 'seed#0', 1, 10, false, { compositionKind: 'Loop' });
    const l1b1 = group('body#2', 'body', 2, 'loop1#1', 2, 3);
    const l1b2 = group('body#5', 'body', 2, 'loop1#1', 5, 6);
    const loop2 = group('loop2#11', 'Loop', 1, 'seed#0', 11, 20, false, { compositionKind: 'Loop' });
    const l2b1 = group('body#12', 'body', 2, 'loop2#11', 12, 13);
    const l2b2 = group('body#15', 'body', 2, 'loop2#11', 15, 16);
    const pos = cursorPositionsAtDrill([root, outer, loop1, l1b1, l1b2, loop2, l2b1, l2b2], [], []);
    const labels = pos.map((p) => p.label);
    // Two distinct loops → 'Loop 1' / 'Loop 2'; bodies restart per loop.
    expect(labels).toContain('Loop 1');
    expect(labels).toContain('Loop 2');
    expect(labels.filter((l) => l === 'body 1')).toHaveLength(2); // one per loop
    expect(labels.filter((l) => l === 'body 2')).toHaveLength(2);
    expect(labels).not.toContain('body 3'); // NOT globally numbered
  });

  it('property: no duplicate (runtimeStageId, kind, commitIdx) triples; root id only as bookends', () => {
    const fixtures: ReadonlyArray<readonly Group[]> = [
      // single loop (closed)
      [group('__root__#0', 'Run', 0, undefined, 0, 13, true),
       group('seed#0', 'Refine', 0, '__root__#0', 0, 12, false, { compositionKind: 'Loop' }),
       group('body#2', 'body', 1, 'seed#0', 2, 3),
       group('body#6', 'body', 1, 'seed#0', 6, 7)],
      // in-flight loop
      [group('__root__#0', 'Run', 0, undefined, 0, undefined, true),
       group('seed#0', 'Refine', 0, '__root__#0', 0, undefined, false, { compositionKind: 'Loop' }),
       group('body#2', 'body', 1, 'seed#0', 2, 3)],
    ];
    for (const gs of fixtures) {
      const pos = cursorPositionsAtDrill(gs, [], []);
      const triples = pos.map((p) => `${p.runtimeStageId}|${p.kind}|${p.commitIdx}`);
      expect(new Set(triples).size).toBe(triples.length); // no duplicates
      const rootHits = pos
        .map((p, i) => ({ p, i }))
        .filter((x) => x.p.runtimeGroupId === '__root__#0');
      for (const { i } of rootHits) {
        expect(i === 0 || i === pos.length - 1).toBe(true); // root only at the ends
      }
    }
  });
});

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('cursorPositionsAtDrill — unit', () => {
  it('empty groups returns []', () => {
    expect(cursorPositionsAtDrill([], [], [])).toEqual([]);
  });

  it('drillPath=[] yields outline: Run.start + Committee.start + Committee.end + Run.end', () => {
    const positions = cursorPositionsAtDrill(groups, commits, []);
    expect(positions).toHaveLength(4);
    expect(positions[0]!.runtimeGroupId).toBe('__root__#0');
    expect(positions[0]!.kind).toBe('group-start');
    expect(positions[1]!.runtimeGroupId).toBe('sf-Committee#1');
    expect(positions[1]!.kind).toBe('group-start');
    expect(positions[2]!.runtimeGroupId).toBe('sf-Committee#1');
    expect(positions[2]!.kind).toBe('group-end');
    expect(positions[3]!.runtimeGroupId).toBe('__root__#0');
    expect(positions[3]!.kind).toBe('group-end');
  });

  it('drillPath=[Parallel] yields Parallel\'s direct children (each as group-start)', () => {
    const positions = cursorPositionsAtDrill(groups, commits, ['sf-Committee#1']);
    // Committee.start + legal + ethics + merge + Committee.end (Parallel emits end)
    expect(positions).toHaveLength(5);
    const groupIds = positions.map((p) => p.runtimeGroupId);
    expect(groupIds[0]).toBe('sf-Committee#1');
    expect(groupIds[positions.length - 1]).toBe('sf-Committee#1');
    expect(groupIds.slice(1, -1)).toEqual(['legal#1', 'ethics#3', 'merge#5']);
  });

  it('drillPath=[Parallel, legal] yields legal\'s outline (no children → just legal start + end based on compositionKind)', () => {
    const positions = cursorPositionsAtDrill(groups, commits, ['sf-Committee#1', 'legal#1']);
    // legal is a leaf subflow (no compositionKind, no children) → just start
    expect(positions).toHaveLength(1);
    expect(positions[0]!.runtimeGroupId).toBe('legal#1');
    expect(positions[0]!.kind).toBe('group-start');
  });

  it('unknown drilled group returns []', () => {
    expect(cursorPositionsAtDrill(groups, commits, ['nope#0'])).toEqual([]);
  });

  it('every position carries a commitIdx for jumpTo', () => {
    const positions = cursorPositionsAtDrill(groups, commits, []);
    for (const p of positions) {
      expect(typeof p.commitIdx).toBe('number');
      expect(p.commitIdx).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('cursorPositionsAtDrill — functional', () => {
  it('children appear in commit-opening order (chronological)', () => {
    const positions = cursorPositionsAtDrill(groups, commits, ['sf-Committee#1']);
    // Strip outer Committee start/end; check middle order.
    const middle = positions.slice(1, -1).map((p) => p.runtimeGroupId);
    expect(middle).toEqual(['legal#1', 'ethics#3', 'merge#5']);
  });

  it('Parallel composition emits BOTH start and end positions', () => {
    const positions = cursorPositionsAtDrill(groups, commits, []);
    const committeeStart = positions.find(
      (p) => p.runtimeGroupId === 'sf-Committee#1' && p.kind === 'group-start',
    );
    const committeeEnd = positions.find(
      (p) => p.runtimeGroupId === 'sf-Committee#1' && p.kind === 'group-end',
    );
    expect(committeeStart).toBeDefined();
    expect(committeeEnd).toBeDefined();
    expect(committeeEnd!.label).toContain('merged');
  });

  it('non-Parallel subflows (leaf) emit start only', () => {
    const positions = cursorPositionsAtDrill(groups, commits, ['sf-Committee#1', 'legal#1']);
    // legal is a leaf subflow — single position
    expect(positions).toHaveLength(1);
    expect(positions[0]!.kind).toBe('group-start');
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('cursorPositionsAtDrill — integration', () => {
  it('outline view at top level matches user mental model (4 positions for Parallel run)', () => {
    const positions = cursorPositionsAtDrill(groups, commits, []);
    expect(positions).toHaveLength(4);
    expect(positions.map((p) => p.kind)).toEqual([
      'group-start', 'group-start', 'group-end', 'group-end',
    ]);
  });

  it('drilling into Parallel reveals children inline + Parallel start/end as bookends', () => {
    const positions = cursorPositionsAtDrill(groups, commits, ['sf-Committee#1']);
    // Committee.start + legal + ethics + merge + Committee.end = 5
    expect(positions).toHaveLength(5);
  });

  it('drilling into a leaf subflow shows just its start position', () => {
    const positions = cursorPositionsAtDrill(groups, commits, ['sf-Committee#1', 'legal#1']);
    expect(positions).toHaveLength(1);
    expect(positions[0]!.runtimeGroupId).toBe('legal#1');
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('cursorPositionsAtDrill — property', () => {
  it('every position\'s runtimeStageId is a known group', () => {
    const positions = cursorPositionsAtDrill(groups, commits, ['sf-Committee#1']);
    const groupIds = new Set(groups.map((g) => g.runtimeGroupId));
    for (const p of positions) {
      expect(groupIds.has(p.runtimeStageId)).toBe(true);
    }
  });

  it('Parallel always contributes 2 positions; non-Parallel only 1', () => {
    const positions = cursorPositionsAtDrill(groups, commits, []);
    const parallelHits = positions.filter((p) => p.runtimeGroupId === 'sf-Committee#1');
    expect(parallelHits).toHaveLength(2);
    const rootHits = positions.filter((p) => p.runtimeGroupId === '__root__#0');
    expect(rootHits).toHaveLength(2); // root.start + root.end
  });

  it('commitIdx is monotonically non-decreasing along the positions list', () => {
    const positions = cursorPositionsAtDrill(groups, commits, []);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]!.commitIdx).toBeGreaterThanOrEqual(positions[i - 1]!.commitIdx);
    }
  });

  it('never throws for any reasonable drillPath', () => {
    const cases: ReadonlyArray<readonly string[]> = [
      [], ['__root__#0'], ['sf-Committee#1'], ['sf-Committee#1', 'legal#1'],
      ['totally/unknown#42'],
    ];
    for (const dp of cases) {
      expect(() => cursorPositionsAtDrill(groups, commits, dp)).not.toThrow();
    }
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('cursorPositionsAtDrill — security', () => {
  it('does not mutate inputs', () => {
    const before = JSON.stringify({ groups, commits });
    cursorPositionsAtDrill(groups, commits, ['sf-Committee#1']);
    expect(JSON.stringify({ groups, commits })).toBe(before);
  });

  it('positions expose only documented fields (incl. the parallel stop with coActiveGroupIds)', () => {
    const allowed = new Set([
      'runtimeStageId', 'runtimeGroupId', 'label', 'kind', 'depth', 'commitIdx', 'coActiveGroupIds',
    ]);
    // Check EVERY position, including the Parallel composition stop that actually
    // carries coActiveGroupIds (the most complex stop kind) — not just stop[0].
    const positions = cursorPositionsAtDrill(groups, commits, []);
    for (const p of positions) {
      for (const k of Object.keys(p)) expect(allowed.has(k)).toBe(true);
    }
    const parallelStop = positions.find((p) => p.coActiveGroupIds !== undefined);
    expect(parallelStop).toBeDefined(); // the Committee stop carries it
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('cursorPositionsAtDrill — performance', () => {
  it('100-group fixture × 100 lookups in under 50ms', () => {
    const many: Group[] = [root];
    for (let i = 0; i < 100; i++) {
      many.push(group(`sf-${i}#${i}`, `s${i}`, 1, '__root__#0', i));
    }
    const start = performance.now();
    for (let i = 0; i < 100; i++) cursorPositionsAtDrill(many, [], []);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(100);
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('cursorPositionsAtDrill — load', () => {
  it('1000-group fixture × 100 lookups in under 500ms', () => {
    const many: Group[] = [root];
    for (let i = 0; i < 1000; i++) {
      many.push(group(`sf-${i}#${i}`, `s${i}`, 1, '__root__#0', i));
    }
    const start = performance.now();
    for (let i = 0; i < 100; i++) cursorPositionsAtDrill(many, [], []);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(1000);
  });
});
