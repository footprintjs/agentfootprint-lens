import type { StepGraph, StepNode } from 'agentfootprint/observe';
import type { ToolArgumentDisplay } from './toolArgumentDisplay.js';

// FlowchartRecorder uses this identity even for concurrent calls from one stage.
export function toolStepId(stage: string, call: string): string {
  return `step-tool-start-${stage}-${call}`;
}

type StepArgumentDisplay = ToolArgumentDisplay & {
  /** Carries incomplete or ambiguous identity through a bounded event log. */
  readonly toolArgumentBinding?: 'ambiguous' | 'unmatched';
};
export type DisplayStep = StepNode & Omit<StepArgumentDisplay, 'toolArgs'>;
const ambiguous: StepArgumentDisplay = { toolArgumentBinding: 'ambiguous' };
const unmatched: StepArgumentDisplay = { toolArgumentBinding: 'unmatched' };

/** An overlay on native graphs. Stored events and the producer's graph stay intact. */
export class ToolStepDisplays {
  private readonly byStage = new Map<string, Map<string, StepArgumentDisplay | false>>();
  private readonly guardedStages = new Set<string>();
  private cache = new WeakMap<StepGraph, StepGraph>();

  remember(stage: string, call: string, display: ToolArgumentDisplay | undefined): void {
    let calls = this.byStage.get(stage);
    if (!calls) {
      calls = new Map();
      this.byStage.set(stage, calls);
    }
    const id = toolStepId(stage, call);
    // An id repeated in a retained graph no longer names a unique proposal.
    const repeated = calls.has(id);
    calls.set(id, repeated ? ambiguous : display ?? false);
    if (display || repeated) this.guardedStages.add(stage);
    if (this.guardedStages.has(stage)) this.cache = new WeakMap();
  }

  graph(original: StepGraph): StepGraph {
    if (!this.guardedStages.size) return original;
    const known = this.cache.get(original);
    if (known) return known;
    let changed = false;
    const nodes = original.nodes.map(node => {
      if (node.kind !== 'llm->tool') return node;
      const stage = node.runtimeStageId;
      if (stage !== undefined && !this.guardedStages.has(stage)) return node;
      const display = stage === undefined ? undefined : this.byStage.get(stage)?.get(node.id);
      if (display === false) return node;
      // A legacy node without an exact call ID needs the full log to identify its proposal.
      const properties = Object.getOwnPropertyDescriptors(node as DisplayStep);
      Reflect.deleteProperty(properties, 'toolArgs');
      Reflect.deleteProperty(properties, 'hiddenArgs');
      Reflect.deleteProperty(properties, 'toolArgumentBinding');
      changed = true;
      return Object.assign(Object.defineProperties({}, properties), display ?? unmatched) as DisplayStep;
    });
    const projected = changed ? { ...original, nodes } : original;
    this.cache.set(original, projected);
    this.cache.set(projected, projected);
    return projected;
  }
}
