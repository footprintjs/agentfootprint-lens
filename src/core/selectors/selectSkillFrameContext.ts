/**
 * `selectSkillFrameContext` — what reached the model on ONE routing beat.
 *
 * Pattern: pure function over the StepGraph + a {@link SkillBeat}. No
 *          framework, no state.
 * Role:    the developer lens's right panel asks a question the routing fold
 *          alone cannot answer. `SkillHop.skillInjections` carries what the
 *          SKILLS put in the prompt; the prompt also carried RAG passages,
 *          memory, instructions — everything
 *          {@link selectContextEngineeringInjections} calls engineered. Those
 *          live on the StepGraph's LLM-call step, not on the routing events.
 *
 * THE PAIRING (why it is index arithmetic and not a join):
 * a beat is stamped at the Evaluate stage that resolved the cursor; the call
 * it prepared is the NEXT LLM step. footprintjs's `executionIndex` is globally
 * monotonic within a run, so "the first LLM step after this beat's evaluate,
 * and before the next beat's" identifies it exactly, with no id convention to
 * break. A beat with no LLM step after it (the run ended at the evaluate)
 * pairs with nothing, and says so — `stepRuntimeStageId` absent, `injections`
 * empty, {@link SkillFrameContext.paired} `false`. Absent is not empty here:
 * `paired: false` means "no call was recorded for this beat", while `paired:
 * true` with no engineered injections means "the call carried none".
 */

import type { ContextInjection, StepGraph, StepNode } from 'agentfootprint/observe';
import { selectContextEngineeringInjections } from './selectContextEngineeringInjections.js';
import type { SkillBeat } from './selectSkillBeats.js';

/** What the model was handed on one beat, as the recording carried it. */
export interface SkillFrameContext {
  /** An LLM call was found for this beat. `false` ⇒ nothing to report, not
   *  "the call was empty". */
  readonly paired: boolean;
  /** The paired call's address, so a view can jump the ONE cursor to it. */
  readonly stepRuntimeStageId?: string;
  /** The ENGINEERED injections on that call — baseline user / tool-result /
   *  assistant / base prompt / static tool registry filtered out. */
  readonly injections: readonly ContextInjection[];
  /** How many injections the call carried in total, engineered or not. Lets a
   *  panel say "4 of 11 were engineered" instead of implying 4 was all. */
  readonly totalInjections: number;
}

export interface SelectSkillFrameContextArgs {
  /** The recording's step graph (`recorder.getStepGraph()`). */
  readonly graph: Pick<StepGraph, 'nodes'>;
  /** The beat being shown. */
  readonly beat: SkillBeat;
  /** The beat AFTER it, when there is one — the upper bound of the window. */
  readonly nextBeat?: SkillBeat;
}

/** Parse the `#N` executionIndex suffix off a runtimeStageId. */
function execIndex(runtimeStageId: string | undefined): number | undefined {
  if (runtimeStageId === undefined) return undefined;
  const hash = runtimeStageId.lastIndexOf('#');
  if (hash < 0) return undefined;
  const n = Number(runtimeStageId.slice(hash + 1));
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

/** An LLM-facing step — the kinds whose node carries the call's injections. */
function isLLMStep(node: StepNode): boolean {
  return node.kind === 'user->llm' || node.kind === 'tool->llm';
}

/**
 * Resolve the beat to the call it prepared, and report that call's engineered
 * context. Never throws; a graph with no steps pairs with nothing.
 *
 * @example
 * ```ts
 * const ctx = selectSkillFrameContext({ graph: recorder.getStepGraph(), beat, nextBeat });
 * ctx.paired;                                   // true
 * ctx.injections.map((i) => i.source);          // ['skill', 'rag']
 * `${ctx.injections.length} of ${ctx.totalInjections} engineered`;
 * ```
 */
export function selectSkillFrameContext({
  graph,
  beat,
  nextBeat,
}: SelectSkillFrameContextArgs): SkillFrameContext {
  const from = execIndex(beat.runtimeStageId);
  const to = execIndex(nextBeat?.runtimeStageId);

  let best: StepNode | undefined;
  let bestIdx = Infinity;
  for (const node of graph.nodes ?? []) {
    if (!isLLMStep(node)) continue;
    const idx = execIndex(node.runtimeStageId);
    if (idx === undefined) continue;
    if (from !== undefined && idx <= from) continue;
    if (to !== undefined && idx >= to) continue;
    if (idx < bestIdx) {
      best = node;
      bestIdx = idx;
    }
  }

  if (best === undefined) return { paired: false, injections: [], totalInjections: 0 };
  const all = best.injections ?? [];
  return {
    paired: true,
    ...(best.runtimeStageId !== undefined ? { stepRuntimeStageId: best.runtimeStageId } : {}),
    injections: selectContextEngineeringInjections(all),
    totalInjections: all.length,
  };
}
