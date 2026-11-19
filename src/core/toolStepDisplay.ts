import type { StepGraph, StepNode } from 'agentfootprint/observe';
import type { ToolArgumentDisplay } from './toolArgumentDisplay.js';

// FlowchartRecorder uses this identity even for concurrent calls from one stage.
export function toolStepId(stage: string, call: string): string {
  return `step-tool-start-${stage}-${call}`;
}

export type DisplayStep = StepNode & { readonly hiddenArgs?: readonly string[] };

/** An overlay on native graphs. Stored events and the producer's graph stay intact. */
export class ToolStepDisplays {
  private readonly byStage = new Map<string, Map<string, ToolArgumentDisplay | false>>();
  private readonly protectedStages = new Set<string>();
  private cache = new WeakMap<StepGraph, StepGraph>();

  remember(stage: string, call: string, display: ToolArgumentDisplay | undefined): void {
    let calls = this.byStage.get(stage);
    if (!calls) {
      calls = new Map();
      this.byStage.set(stage, calls);
    }
    const id = toolStepId(stage, call);
    // An id repeated in a retained graph no longer names a unique proposal.
    const prior = calls.get(id);
    if (display) this.protectedStages.add(stage);
    if (prior === undefined) calls.set(id, display ?? false);
    else if (prior !== false || display !== undefined) calls.set(id, {});
    if (this.protectedStages.has(stage)) this.cache = new WeakMap();
  }

  graph(original: StepGraph): StepGraph {
    if (!this.protectedStages.size) return original;
    const known = this.cache.get(original);
    if (known) return known;
    let changed = false;
    const nodes = original.nodes.map(node => {
      if (node.kind !== 'llm->tool') return node;
      if (node.runtimeStageId !== undefined && !this.protectedStages.has(node.runtimeStageId)) return node;
      const display = node.runtimeStageId === undefined ? undefined : this.byStage.get(node.runtimeStageId)?.get(node.id);
      // A separately recorded unprotected call keeps its own arguments.
      if (display === false) return node;
      // A legacy node without an exact call id cannot claim a proposal from this stage.
      const properties = Object.getOwnPropertyDescriptors(node as DisplayStep);
      Reflect.deleteProperty(properties, 'toolArgs');
      Reflect.deleteProperty(properties, 'hiddenArgs');
      changed = true;
      return Object.assign(Object.defineProperties({}, properties), display) as DisplayStep;
    });
    const projected = changed ? { ...original, nodes } : original;
    this.cache.set(original, projected);
    this.cache.set(projected, projected);
    return projected;
  }
}
