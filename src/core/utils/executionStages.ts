/**
 * `executionStages` / `stageBranches` — the ONE place Lens reads the SHAPE of
 * a footprintjs execution tree (`snapshot.executionTree`).
 *
 * WHY TWO SHAPES. footprintjs 13 serves the tree in LIST form: an array of the
 * run's stages in the order they ran, and a fork's children as
 * `branches: StageSnapshot[][]` (one list per child). footprintjs 12 and older,
 * and every run saved by them, use the LINKED form: one stage object whose
 * `next` holds the following stage and whose `children` hold a fork's children
 * (each the head of its own `next` chain). Lens reads saved runs and supports
 * footprintjs 12, so it reads both. Every reader goes through these two
 * functions; nothing else in Lens checks `next`, `children` or `branches`.
 *
 * Trees handed to Foottrace (`keysReadFromExecutionTree`, `tagStops`) are passed
 * as they are: Foottrace 1.15.0 and newer reads both forms itself.
 *
 * The linked form is walked with a loop, never recursion: a long run links one
 * level per stage, and a recursive walk overflowed the stack at ~10 000 stages.
 *
 * @example
 * ```ts
 * const stages = executionStages<{ id?: string }>(snapshot.executionTree);
 * stages.map((s) => s.id);                 // ['seed', 'fork', 'merge'] in run order
 * stageBranches<{ id?: string }>(stages[1]!); // [[legal…], [ethics…]] — one list per child
 * ```
 */

function isStage(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The stages of one chain in the order they ran: the list as given (list form),
 * or the `next` links followed from the head (linked form). Anything that is not
 * a tree — `undefined` before a run, `null`, a primitive — is an empty list.
 */
export function executionStages<S extends object = Record<string, unknown>>(tree: unknown): readonly S[] {
  if (Array.isArray(tree)) return tree.filter(isStage) as S[];
  const stages: S[] = [];
  const seen = new Set<object>();
  for (let stage: unknown = tree; isStage(stage) && !seen.has(stage); stage = (stage as { next?: unknown }).next) {
    seen.add(stage);
    stages.push(stage as S);
  }
  return stages;
}

/**
 * A stage's child branches, one list of stages per child, each in run order:
 * `branches` (list form), or each of `children` followed along its `next` links
 * (linked form). A stage without children has none.
 */
export function stageBranches<S extends object = Record<string, unknown>>(stage: object): readonly (readonly S[])[] {
  const { branches, children } = stage as { branches?: unknown; children?: unknown };
  if (Array.isArray(branches)) return branches.map((branch) => executionStages<S>(Array.isArray(branch) ? branch : []));
  if (Array.isArray(children)) return children.filter(isStage).map((child) => executionStages<S>(child));
  return [];
}
