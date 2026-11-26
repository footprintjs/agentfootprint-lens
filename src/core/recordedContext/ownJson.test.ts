import { describe, expect, it } from 'vitest';
import { MAX_DEPTH, MAX_STAGE_CHAIN, presentationBudget, stageTreesAt } from './ownJson.js';

type Json = Record<string, any>;
const TREE = stageTreesAt(['recording', 'snapshot', 'executionTree']);
/** A `next` chain of `stages` stage nodes, built with a loop. */
function chain(stages: number, stage: (index: number) => Json = index => ({ id: `s${index}`, stageWrites: { index } })): Json {
  let next: Json | undefined;
  for (let i = stages - 1; i >= 0; i--) next = { ...stage(i), ...(next === undefined ? {} : { next }) };
  return next!;
}
const nested = (levels: number, key = 'next'): Json => {
  let value: unknown = 'leaf';
  for (let i = 0; i < levels; i++) value = { [key]: value };
  return value as Json;
};
/** The DTO shape the codec owns: the tree sits at depth 3. */
const dto = (tree: unknown, extra: Json = {}) => ({ recording: { snapshot: { executionTree: tree }, ...extra } });
const own = (value: unknown, places = TREE) => presentationBudget().own(value, places);
const refusal = (run: () => unknown) => {
  try { run(); } catch (error) { return (error as { reason?: string }).reason; }
  return 'admitted';
};

describe('the JSON owner: a sequence of stages is not depth', () => {
  it('keeps depth 100 for every ordinary value, including a value with a key named next', () => {
    expect(refusal(() => presentationBudget().own(nested(MAX_DEPTH)))).toBe('admitted');
    expect(refusal(() => presentationBudget().own(nested(MAX_DEPTH + 1)))).toBe('presentation-limit');
    // The same hostile value beside a tree place, and with the tree's own key names elsewhere.
    expect(refusal(() => own({ recording: { events: nested(MAX_DEPTH - 2) } }))).toBe('admitted');
    expect(refusal(() => own({ recording: { events: nested(MAX_DEPTH - 1) } }))).toBe('presentation-limit');
    expect(refusal(() => own({ executionTree: chain(MAX_DEPTH + 1) }))).toBe('presentation-limit');
    expect(refusal(() => own({ recording: { executionTree: chain(MAX_DEPTH + 1) } }))).toBe('presentation-limit');
    expect(refusal(() => own({ other: { snapshot: { executionTree: chain(MAX_DEPTH + 1) } } }))).toBe('presentation-limit');
    // Without places the walk is today's walk, tree or not.
    expect(refusal(() => presentationBudget().own(dto(chain(MAX_DEPTH))))).toBe('presentation-limit');
  });

  it('admits a chain of exactly MAX_STAGE_CHAIN stages at a tree place and refuses one more', () => {
    expect(MAX_STAGE_CHAIN).toBe(1_000);
    const input = dto(chain(MAX_STAGE_CHAIN));
    const owned = own(input) as Json;
    expect(JSON.stringify(owned)).toBe(JSON.stringify(input));
    expect(owned.recording.snapshot.executionTree).not.toBe(input.recording.snapshot.executionTree);
    let stage = owned.recording.snapshot.executionTree;
    while (stage) { expect(Object.isFrozen(stage)).toBe(true); expect(Object.isFrozen(stage.stageWrites)).toBe(true); stage = stage.next; }
    expect(refusal(() => own(dto(chain(MAX_STAGE_CHAIN + 1))))).toBe('presentation-limit');
  });

  it('counts depth inside one stage, at every position of the chain', () => {
    // The tree's root stage sits at depth 3, so a value inside any stage may nest MAX_DEPTH - 4 more levels.
    const fits = MAX_DEPTH - 4, deep = (at: number, levels: number) =>
      dto(chain(500, index => ({ id: `s${index}`, ...(index === at ? { stageWrites: nested(levels, 'cursor') } : {}) })));
    for (const at of [0, 250, 499]) {
      expect(refusal(() => own(deep(at, fits)))).toBe('admitted');
      expect(refusal(() => own(deep(at, fits + 1)))).toBe('presentation-limit');
    }
    // A key named next inside a stage's value is a value, never a stage.
    expect(refusal(() => own(dto(chain(3, index => ({ id: `s${index}`, stageWrites: nested(MAX_DEPTH - 3) })))))).toBe('presentation-limit');
  });

  it('counts one level per children step and one stage per step on the path', () => {
    const branches = (levels: number): Json => {
      let tree: Json = { id: 'leaf' };
      for (let i = 0; i < levels; i++) tree = { id: `fork${i}`, children: [tree] };
      return tree;
    };
    // Root stage at depth 3 and a leaf stage's `id` one level below it: MAX_DEPTH - 4 steps fit.
    expect(refusal(() => own(dto(branches(MAX_DEPTH - 4))))).toBe('admitted');
    expect(refusal(() => own(dto(branches(MAX_DEPTH - 3))))).toBe('presentation-limit');
    // A branch's sequence continues the path it hangs from.
    const forked = (tail: number) => dto({ ...chain(1), children: [chain(tail)], next: chain(MAX_STAGE_CHAIN - 1) });
    expect(refusal(() => own(forked(MAX_STAGE_CHAIN - 1)))).toBe('admitted');
    expect(refusal(() => own(forked(MAX_STAGE_CHAIN)))).toBe('presentation-limit');
    const owned = own(forked(3)) as Json;
    expect(owned.recording.snapshot.executionTree.children[0].next.next.id).toBe('s2');
    expect(Object.isFrozen(owned.recording.snapshot.executionTree.children)).toBe(true);
  });

  it('spends the one node budget on every stage, link and value of the tree', () => {
    const wide = (keys: number) => chain(MAX_STAGE_CHAIN, index => Object.fromEntries(Array.from({ length: keys }, (_, k) => [`k${k}`, index])));
    // 1,000 × (1 stage + 198 values) + 3 containers = 199,003 fits 200,000; with 199
    // values it is 200,003, over only because each stage node is counted too.
    expect(refusal(() => own(dto(wide(198))))).toBe('admitted');
    expect(refusal(() => own(dto(wide(199))))).toBe('presentation-limit');
    const budget = presentationBudget();
    budget.own(dto(wide(150)), TREE);
    expect(refusal(() => budget.own(dto(wide(100)), TREE))).toBe('presentation-limit');
  });

  it('keeps the owner closed at tree places: cycles, shared stages, getters, classes and holes', () => {
    const looped = chain(3); looped.next.next.next = looped;
    expect(refusal(() => own(dto(looped)))).toBe('invalid-context');
    const shared = chain(2); const forked = { id: 'fork', children: [shared, shared] };
    expect(refusal(() => own(dto(forked)))).toBe('invalid-context');
    const backReference = chain(3); backReference.next.next.stageWrites = { earlier: backReference.next };
    expect(refusal(() => own(dto(backReference)))).toBe('invalid-context');
    let calls = 0;
    const getter = chain(2); Object.defineProperty(getter.next, 'stageWrites', { enumerable: true, get() { calls++; return {}; } });
    expect(refusal(() => own(dto(getter)))).toBe('invalid-context');
    expect(refusal(() => own(dto({ id: 'root', next: new Date() })))).toBe('invalid-context');
    expect(refusal(() => own(dto({ id: 'root', children: new Array(1) })))).toBe('invalid-context');
    expect(refusal(() => own(dto(Object.assign(Object.create({ inherited: true }), chain(2)))))).toBe('invalid-context');
    expect(calls).toBe(0);
    // A value at a tree place that is not a stage node is owned as any value is.
    expect(own(dto(null))).toEqual(dto(null));
    expect(refusal(() => own(dto([chain(2)])))).toBe('admitted');
    expect(refusal(() => own(dto({ id: 'root', next: 'not a stage', children: null })))).toBe('admitted');
  });

  it('walks a tree only at the exact path: a key off the trie leaves it for good', () => {
    const CHILD = stageTreesAt(['treeContext', 'stageContexts']);
    const deep = chain(500, index => ({ id: `s${index}` }));
    expect(refusal(() => own(dto(deep)))).toBe('admitted');
    expect(refusal(() => own({ treeContext: { stageContexts: deep } }, CHILD))).toBe('admitted');
    // Look-alikes: a key that is not on the trie, then the place's own keys below it.
    expect(refusal(() => own({ recording: { snapshot: { sharedState: { executionTree: deep } } } }))).toBe('presentation-limit');
    expect(refusal(() => own({ recording: { events: { snapshot: { executionTree: deep } } } }))).toBe('presentation-limit');
    expect(refusal(() => own({ treeContext: { globalContext: { stageContexts: deep } } }, CHILD))).toBe('presentation-limit');
  });

  it('owns a stage’s non-stage children elements and an array-valued next as ordinary values, one level deeper', () => {
    const arrays = (levels: number): unknown => {
      let value: unknown = 'leaf';
      for (let i = 0; i < levels; i++) value = [value];
      return value;
    };
    // Root stage at depth 3, its children array at 4, each element at 5: 95 nested arrays fit, 96 do not.
    expect(refusal(() => own(dto({ id: 'root', children: [arrays(95)] })))).toBe('admitted');
    expect(refusal(() => own(dto({ id: 'root', children: [arrays(96)] })))).toBe('presentation-limit');
    // An array `next` is a value at depth 4, never a stage: 96 nested arrays fit, 97 do not.
    const listed = dto({ id: 'root', next: [chain(2)] });
    expect(JSON.stringify(own(listed))).toBe(JSON.stringify(listed));
    expect(refusal(() => own(dto({ id: 'root', next: arrays(96) })))).toBe('admitted');
    expect(refusal(() => own(dto({ id: 'root', next: arrays(97) })))).toBe('presentation-limit');
  });

  it('charges key bytes to the one string budget, at a tree place as everywhere', () => {
    const key = 'k'.repeat(64 * 1024 * 1024 + 1);
    expect(refusal(() => presentationBudget().own({ [key]: 1 }))).toBe('presentation-limit');
    expect(refusal(() => own(dto({ id: 'root', [key]: 1 })))).toBe('presentation-limit');
  });

  it('builds places by exact path and refuses a place inside another', () => {
    expect(() => stageTreesAt([])).toThrow();
    expect(() => stageTreesAt(['a'], ['a', 'b'])).toThrow();
    expect(() => stageTreesAt(['a', 'b'], ['a'])).toThrow();
    const both = stageTreesAt(['a', 'tree'], ['b', 'tree']);
    expect(refusal(() => presentationBudget().own({ a: { tree: chain(200) }, b: { tree: chain(200) } }, both))).toBe('admitted');
    // An inherited name on the place map cannot match.
    expect(refusal(() => presentationBudget().own({ constructor: { tree: chain(200) } }, both))).toBe('presentation-limit');
  });
});
